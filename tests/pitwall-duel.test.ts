import { describe, expect, it } from "vitest";
import { ATTACK_COOLDOWN, ATTACK_ERS, DUEL_TIME, SIM_DT, stepRace } from "@/lib/pitwall/race";
import { Room } from "@/lib/pitwall/room";

/** ห้องเล่นคนเดียว ข้ามควอลิฟาย เข้าเรซจนไฟดับ */
function raceRoom(seed: number, circuit = "monza") {
  const r = new Room({ online: false, seed });
  r.join("me", "ทดสอบ");
  r.handle("me", { t: "config", config: { circuits: [circuit], quali: "none", length: "normal" } });
  r.handle("me", { t: "start" });
  r.handle("me", { t: "ready", v: true });
  r.handle("me", { t: "ready", v: true });
  for (const c of r.cars) if (c.team === r.players[0].team) r.handle("me", { t: "launch", car: c.id, kind: "ok" });
  for (let i = 0; i < 400 && !r.race!.started; i++) r.tick(100);
  expect(r.race!.started).toBe(true);
  return r;
}

describe("Pit Wall: การแซงแบบขึ้นเทียบ (ไม่วาบข้ามคัน)", () => {
  it.each([1, 2, 3])("seed %i: รถไม่กระโดด · แซงแต่ละครั้งใช้เวลาราว DUEL_TIME · ไม่ถอยหลัง", (seed) => {
    const r = raceRoom(seed);
    const st = r.race!;
    const ctx = (r as unknown as { ctx: () => Parameters<typeof stepRace>[0] }).ctx();
    let maxStep = 0;
    let duels = 0;
    const started = new Map<number, number>();
    const lengths: number[] = [];
    for (let i = 0; i < 6000 && !st.done; i++) {
      const before = st.cars.map((c) => c.pos);
      stepRace(ctx, st, SIM_DT);
      st.cars.forEach((c, k) => {
        if (c.pit || c.out || c.finished !== null) return;
        const d = c.pos - before[k];
        expect(d).toBeGreaterThanOrEqual(-1e-9);
        maxStep = Math.max(maxStep, d);
        if (c.duel && !started.has(c.id)) {
          started.set(c.id, st.t);
          duels++;
        }
        if (!c.duel && started.has(c.id)) {
          lengths.push(st.t - started.get(c.id)!);
          started.delete(c.id);
        }
      });
    }
    expect(duels).toBeGreaterThan(3);
    // ช่องละราว 2–3 วิ → 0.1 วิ ไม่เกิน ~0.05 ช่อง (+ ส่วนที่เร่งขึ้นตอนแซง)
    expect(maxStep).toBeLessThan(0.08);
    const full = lengths.filter((x) => x > 0.5);
    expect(full.length).toBeGreaterThan(0);
    expect(Math.max(...full)).toBeLessThanOrEqual(DUEL_TIME + SIM_DT * 2);
  });

  it("ปุ่มแซงเลย: ต้องตามทัน · ใช้แบต · ขึ้นเทียบ · รอคูลดาวน์", () => {
    const r = raceRoom(5);
    const st = r.race!;
    const mine = r.cars.filter((c) => c.team === r.players[0].team).map((c) => c.id);
    let ok: number | null = null;
    for (let i = 0; i < 8000 && ok === null; i++) {
      r.tick(100);
      for (const id of mine) {
        const c = st.cars[id];
        if (c.gapAhead !== null && c.gapAhead < 0.8 && !c.duel && c.ers >= ATTACK_ERS && !st.neutral && !st.cars.some((o) => o.duel)) {
          const ers = c.ers;
          if (r.handle("me", { t: "attack", car: id }) === null) {
            expect(c.duel).toBeTruthy();
            expect(c.ers).toBeCloseTo(ers - ATTACK_ERS, 5);
            expect(c.cd).toBe(ATTACK_COOLDOWN);
            ok = id;
            break;
          }
        }
      }
    }
    expect(ok).not.toBeNull();
    expect(r.handle("me", { t: "attack", car: ok! })).not.toBeNull();
    // รถที่ไม่ได้ตามใครอยู่ กดไม่ได้
    const far = st.cars.find((c) => mine.includes(c.id) && (c.gapAhead === null || c.gapAhead > 0.8));
    if (far) expect(r.handle("me", { t: "attack", car: far.id })).not.toBeNull();
    // รถทีมอื่นสั่งไม่ได้
    const other = st.cars.find((c) => !mine.includes(c.id))!;
    expect(r.handle("me", { t: "attack", car: other.id })).not.toBeNull();
  });
});

describe("Pit Wall: ควอลิฟายวิ่งในพิทเลน", () => {
  it("ส่งรถออก: วิ่งในพิทเลนจากอู่ถึงทางออก แล้วรอบอุ่นยาง · กลับพิท: วิ่งเข้าพิทเลนไปจอดที่อู่", () => {
    const r = new Room({ online: false, seed: 9 });
    r.join("me", "ทดสอบ");
    r.handle("me", { t: "config", config: { circuits: ["monza"], quali: "single" } });
    r.handle("me", { t: "start" });
    r.handle("me", { t: "ready", v: true });
    const q = r.quali!;
    for (let i = 0; i < 100 && q.pause > 0; i++) r.tick(100);
    const id = r.cars.find((c) => c.team === r.players[0].team)!.id;
    expect(r.handle("me", { t: "qsend", car: id, compound: "soft", laps: 1, risk: "normal", tow: false, drive: false })).toBeNull();
    const c = q.cars[id];
    const box = c.pos;
    expect(c.lane?.kind).toBe("out");
    let maxStep = 0;
    let sawIn = false;
    let prev = c.pos;
    for (let i = 0; i < 20000 && c.status !== "garage"; i++) {
      r.tick(100);
      if ((c.status as string) === "garage") break;
      maxStep = Math.max(maxStep, c.pos - prev);
      expect(c.pos).toBeGreaterThanOrEqual(prev - 1e-9);
      if (c.lane?.kind === "in") sawIn = true;
      prev = c.pos;
    }
    expect(c.pos - box).toBeLessThan(1e-9);
    expect(c.status).toBe("garage");
    expect(sawIn).toBe(true);
    expect(maxStep).toBeLessThan(0.15);
    expect(c.best).not.toBeNull();
  });
});
