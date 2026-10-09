import { describe, expect, it } from "vitest";
import { newQuali, sendOut, stepQuali, segments, type QualiCtx } from "@/lib/pitwall/quali";
import { NO_STOP_PENALTY, classify, newRace, stepRace, type RaceCtx, type RaceState } from "@/lib/pitwall/race";
import { Room } from "@/lib/pitwall/room";
import { TEAMS } from "@/lib/pitwall/teams";
import { buildTrack, lapOf, type TrackModel } from "@/lib/pitwall/track";
import type { Car, Compound, TyreSet } from "@/lib/pitwall/types";

const track = buildTrack("spa")!;
const sets = (): TyreSet[] =>
  (["soft", "soft", "soft", "soft", "medium", "medium", "medium", "hard", "hard"] as Compound[]).map((c) => ({ compound: c, wear: 0, used: false }));
const makeCars = (t: TrackModel): Car[] =>
  TEAMS.flatMap((team, ti) => team.drivers.map((d) => ({ id: 0, num: d.num, name: d.name, team: ti, skill: d.skill, downforce: t.idealDownforce, sets: sets() }))).map((c, i) => ({ ...c, id: i }));
const ctxOf = (seed = 1, human: (id: number) => boolean = () => false): RaceCtx & QualiCtx & { log: string[] } => {
  const log: string[] = [];
  return { track, cars: makeCars(track), teams: TEAMS, ai: "normal", human, seed: { s: seed }, say: (_t, _c, text) => log.push(text), log };
};
const runRace = (ctx: RaceCtx, st: RaceState, max = 300000) => {
  st.started = true;
  for (let i = 0; i < max && !st.done; i++) stepRace(ctx, st);
};

describe("Pit Wall: สนาม", () => {
  it("ทุกสนามในรายการสร้างได้ และสัดส่วนเวลารวมเป็น 1 รอบ", () => {
    for (const id of ["spa", "monza", "monaco", "suzuka", "silverstone", "interlagos"]) {
      const t = buildTrack(id)!;
      expect(t).not.toBeNull();
      expect(t.share.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(t.baseLap).toBeGreaterThan(60);
      expect(t.idealDownforce).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe("Pit Wall: เรซ", () => {
  it("แข่งจนจบ ทุกคันเข้าเส้นชัยหรือออกจากเรซ และผลเรียงถูก", () => {
    const ctx = ctxOf(3);
    const st = newRace(ctx, ctx.cars.map((c) => c.id), 6, {});
    runRace(ctx, st);
    expect(st.done).toBe(true);
    const res = classify(st, track.lapCells);
    expect(res).toHaveLength(ctx.cars.length);
    expect(res[0].points).toBe(25);
    // ผลบอกตำแหน่งออกสตาร์ท ไว้โชว์ขึ้น/ลงอันดับ
    expect(res.map((r) => r.grid).sort((x, y) => x - y)).toEqual(ctx.cars.map((_, i) => i + 1));
    const finished = res.filter((r) => r.time !== null);
    for (let i = 1; i < finished.length; i++)
      if (finished[i].laps === finished[i - 1].laps) expect(finished[i].time!).toBeGreaterThanOrEqual(finished[i - 1].time!);
  });

  it("ผลเหมือนเดิมถ้าใช้เมล็ดสุ่มเดียวกัน", () => {
    const a = ctxOf(11);
    const b = ctxOf(11);
    const sa = newRace(a, a.cars.map((c) => c.id), 5, {});
    const sb = newRace(b, b.cars.map((c) => c.id), 5, {});
    runRace(a, sa);
    runRace(b, sb);
    expect(classify(sa, track.lapCells).map((r) => r.id)).toEqual(classify(sb, track.lapCells).map((r) => r.id));
  });

  it("เข้าพิทแล้วเปลี่ยนยาง เสียเวลาราว 20 วิ", () => {
    const ctx = ctxOf(5);
    const solo = { ...ctx, cars: [ctx.cars[0]] };
    const plain = newRace(solo, [0], 3, { 0: "medium" });
    const pit = newRace(solo, [0], 3, { 0: "medium" });
    plain.cars[0].auto = pit.cars[0].auto = false;
    pit.cars[0].pitReq = "hard";
    plain.started = pit.started = true;
    for (let i = 0; i < 100000 && !plain.done; i++) stepRace(solo, plain);
    for (let i = 0; i < 100000 && !pit.done; i++) stepRace(solo, pit);
    expect(pit.cars[0].stops).toBe(1);
    expect(pit.cars[0].compound).toBe("hard");
    const lost = pit.cars[0].finished! - plain.cars[0].finished!;
    expect(lost).toBeGreaterThan(15);
    expect(lost).toBeLessThan(28);
  });

  it("เปลี่ยนเป็นยางชนิดเดิมได้ ไม่มีบวกเวลา และผลบอกยางแต่ละช่วง", () => {
    const ctx = ctxOf(8);
    const solo = { ...ctx, cars: [ctx.cars[0]] };
    const same = newRace(solo, [0], 3, { 0: "medium" });
    const diff = newRace(solo, [0], 3, { 0: "medium" });
    same.cars[0].auto = diff.cars[0].auto = false;
    same.cars[0].pitReq = "medium";
    diff.cars[0].pitReq = "hard";
    runRace(solo, same);
    runRace(solo, diff);
    expect(same.cars[0].stops).toBe(1);
    expect(classify(same, track.lapCells)[0].time).toBe(same.cars[0].finished);
    expect(classify(same, track.lapCells)[0].stints).toEqual(["medium", "medium"]);
    expect(classify(diff, track.lapCells)[0].stints).toEqual(["medium", "hard"]);
  });

  it("ไม่เข้าพิทเลย = บวกเวลา · เข้าพิทใส่ชนิดเดิมไม่โดน", () => {
    const ctx = ctxOf(8);
    const solo = { ...ctx, cars: [ctx.cars[0]] };
    const none = newRace(solo, [0], 3, { 0: "hard" });
    const same = newRace(solo, [0], 3, { 0: "hard" });
    none.cars[0].auto = same.cars[0].auto = false;
    same.cars[0].pitReq = "hard";
    runRace(solo, none);
    runRace(solo, same);
    expect(none.cars[0].penalty).toBe(NO_STOP_PENALTY);
    expect(same.cars[0].penalty).toBe(0);
  });

  it("เรซสั้นยางสึกเร็วกว่า และ AI เข้าพิทอย่างน้อย 1 ครั้ง", () => {
    const wearAt = (laps: number) => {
      const ctx = ctxOf(6);
      const solo = { ...ctx, cars: [ctx.cars[0]] };
      const st = newRace(solo, [0], laps, { 0: "medium" });
      st.cars[0].auto = false;
      st.started = true;
      while (lapOf(track, st.cars[0].pos) < 2) stepRace(solo, st);
      return st.cars[0].wear;
    };
    expect(wearAt(6)).toBeGreaterThan(wearAt(14) * 1.7);
    const ctx = ctxOf(12);
    const st = newRace(ctx, ctx.cars.map((c) => c.id), 6, {});
    runRace(ctx, st);
    for (const c of st.cars) if (!c.out) expect(c.stops).toBeGreaterThanOrEqual(1);
  });

  it("ช่วงเซฟตี้คาร์ไม่มีการแซง", () => {
    const ctx = ctxOf(2);
    const st = newRace(ctx, ctx.cars.map((c) => c.id), 8, {});
    st.started = true;
    for (let i = 0; i < 3000; i++) stepRace(ctx, st);
    st.neutral = { kind: "sc", laps: 99, ending: false };
    const before = st.overtakes;
    for (let i = 0; i < 4000; i++) stepRace(ctx, st);
    expect(st.overtakes).toBe(before);
  });

  it("รถที่ช้ากว่าหนึ่งรอบไม่ขวางรถที่กำลังน็อครอบ", () => {
    const ctx = ctxOf(4);
    const two = { ...ctx, cars: [ctx.cars[0], ctx.cars[13]] };
    const st = newRace(two, [0, 1], 10, {});
    // คันนำ (รอบ 3) อยู่หลังรถคันช้า (รอบ 2) บนสนามแค่ 0.05 ช่อง
    st.cars[0].pos = track.lapCells * 3 + 5;
    st.cars[1].pos = track.lapCells * 2 + 5.05;
    st.started = true;
    for (let i = 0; i < 200; i++) stepRace(two, st);
    expect(st.cars[0].pos - (track.lapCells * 3 + 5)).toBeGreaterThan(st.cars[1].pos - (track.lapCells * 2 + 5.05));
    expect(st.overtakes).toBe(0);
  });

  it("ยางสึกเพิ่มขึ้นตามระยะ และดันสุดสึกเร็วกว่าถนอม", () => {
    const ctx = ctxOf(6);
    const solo = { ...ctx, cars: [ctx.cars[0]] };
    const wearAfter = (mode: "save" | "push") => {
      const st = newRace(solo, [0], 10, { 0: "soft" });
      st.cars[0].mode = mode;
      st.cars[0].auto = false;
      st.started = true;
      while (lapOf(track, st.cars[0].pos) < 3) stepRace(solo, st);
      return st.cars[0].wear;
    };
    expect(wearAfter("push")).toBeGreaterThan(wearAfter("save") * 2);
  });
});

describe("Pit Wall: ควอลิฟาย", () => {
  it("Q1 Q2 Q3 คัดออกช่วงละ 4 คัน แล้วได้กริดครบ", () => {
    const ctx = ctxOf(9);
    const st = newQuali(ctx, "knockout");
    for (let i = 0; i < 20000 && !st.done; i++) stepQuali(ctx, st, 0.5, 0.1);
    expect(st.done).toBe(true);
    expect(st.grid).toHaveLength(14);
    expect(new Set(st.grid).size).toBe(14);
    expect(st.results.map((r) => r.length)).toEqual([14, 10, 6]);
    expect(segments("knockout", 14, 100).map((s) => s.out)).toEqual([4, 4, 0]);
  });

  it("ส่งรถออกได้เฉพาะตอนอยู่ในพิท และใช้ยางชุดใหม่", () => {
    const ctx = ctxOf(10, (id) => id < 2);
    const st = newQuali(ctx, "single");
    st.pause = 0;
    expect(sendOut(ctx, st, 0, { compound: "soft", laps: 1, risk: "normal", tow: false, drive: false })).toBeNull();
    expect(st.cars[0].status).toBe("out");
    expect(sendOut(ctx, st, 0, { compound: "soft", laps: 1, risk: "normal", tow: false, drive: false })).not.toBeNull();
    expect(ctx.cars[0].sets.filter((s) => s.compound === "soft" && s.used)).toHaveLength(1);
  });
});

describe("Pit Wall: ช่วยผู้เล่นในควอลิฟาย", () => {
  it("รถผู้เล่นยังไม่มีเวลาตอนใกล้หมดเวลา = วิทยุเตือนครั้งเดียว", () => {
    const ctx = ctxOf(10, (id) => id < 2);
    const st = newQuali(ctx, "single");
    for (let i = 0; i < 20000 && st.clock > 0; i++) stepQuali(ctx, st, 0.5, 0.1);
    const warns = ctx.log.filter((x) => x.includes("ยังไม่มีเวลา"));
    expect(warns).toHaveLength(2);
  });

  it("เปิดให้ AI ส่งรถออกแทน แล้วรถผู้เล่นได้เวลา", () => {
    const r = new Room({ online: false, seed: 4 });
    r.join("me", "ทดสอบ");
    r.handle("me", { t: "start" });
    r.handle("me", { t: "ready", v: true });
    expect(r.phase).toBe("quali");
    const mine = r.cars.filter((c) => c.team === r.players[0].team).map((c) => c.id);
    for (const id of mine) expect(r.handle("me", { t: "auto", car: id, v: true })).toBeNull();
    // วิ่งจนนาฬิกาช่วงแรกเกือบหมด (ก่อนช่วงถัดไปล้างเวลา)
    for (let i = 0; i < 20000 && r.quali!.seg === 0 && r.quali!.clock > 1; i++) r.tick(200);
    for (const id of mine) expect(r.quali!.cars[id].best).not.toBeNull();
  });
});

describe("Pit Wall: ห้องแข่ง", () => {
  it("สั่งรถทีมอื่นไม่ได้ และเริ่มได้เฉพาะเจ้าของห้อง", () => {
    const r = new Room({ online: true, seed: 1 });
    r.join("a", "เอ");
    r.join("b", "บี");
    expect(r.players.map((p) => p.team)).toEqual([0, 1]);
    expect(r.handle("b", { t: "start" })).not.toBeNull();
    expect(r.handle("a", { t: "start" })).toBeNull();
    expect(r.phase).toBe("prep");
    expect(r.handle("a", { t: "setup", car: 2, downforce: 0.1 })).not.toBeNull();
    expect(r.handle("a", { t: "setup", car: 0, downforce: 0.1 })).toBeNull();
    expect(r.cars[0].downforce).toBeCloseTo(0.1);
  });

  it("เล่นคนเดียว: ผ่านทุกช่วงจนจบลีก 2 สนาม", () => {
    const r = new Room({ online: false, seed: 2 });
    r.join("me", "ทดสอบ");
    r.handle("me", { t: "config", config: { circuits: ["monza", "suzuka"], length: "short" } });
    r.handle("me", { t: "start" });
    for (let round = 0; round < 2; round++) {
      expect(r.phase).toBe("prep");
      r.handle("me", { t: "ready", v: true });
      r.handle("me", { t: "skip" });
      expect(r.phase).toBe("grid");
      r.handle("me", { t: "ready", v: true });
      expect(r.phase).toBe("race");
      r.handle("me", { t: "skip" });
      expect(r.phase).toBe("results");
      r.handle("me", { t: "next" });
    }
    expect(r.phase).toBe("final");
    const total = Object.values(r.standings.drivers).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(2 * (25 + 18 + 15 + 12 + 10 + 8 + 6 + 4 + 2 + 1) - 2 * 40);
  });

  it("ผู้เล่นหลุดระหว่างเรซ: AI คุมรถแทน", () => {
    const r = new Room({ online: true, seed: 3 });
    r.join("a", "เอ");
    r.handle("a", { t: "start" });
    r.handle("a", { t: "ready", v: true });
    // ข้ามควอลิฟายด้วยเวลา
    for (let i = 0; i < 20000 && r.phase === "quali"; i++) r.tick(200);
    expect(r.phase).toBe("grid");
    r.handle("a", { t: "ready", v: true });
    expect(r.race!.cars[0].auto).toBe(false);
    r.leave("a");
    expect(r.race!.cars[0].auto).toBe(true);
  });
});
