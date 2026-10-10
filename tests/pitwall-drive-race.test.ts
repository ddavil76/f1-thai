import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, DS, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { idealInput, newCar, perfOf, stepCar } from "@/lib/pitwall/drive/car";
import { advanceRemote, CAR_LEN, createRace, HOLD_GAP, OFF_PENALTY, TRACK_LIMITS, type Race, type RaceCar, type RaceInput, packState, setRemote, stepRace, type Entrant, type NetState, type RaceEvent } from "@/lib/pitwall/drive/race";
import { DRIVE_START_DELAY, DriveRoom } from "@/lib/pitwall/drive/room";
import { brakePoint, cornerMap, GUIDE_RED, guideColor, guideFade, guideNeeded, guideRisk, learnCorner, projectedSpeed, type Mastery } from "@/lib/pitwall/drive/guide";
import { TEAMS } from "@/lib/pitwall/teams";

let monza: DriveTrack;
beforeAll(async () => {
  monza = buildDriveTrack("monza", await loadRawTrack("monza"))!;
});

const field = (n: number, playerAt = -1): Entrant[] =>
  TEAMS.flatMap((t) => t.drivers.map((d, k) => ({ id: `${t.id}-${k}`, name: d.name, team: t.id, num: d.num, colour: t.color, ink: t.ink, pace: t.pace, skill: d.skill })))
    .slice(0, n)
    .map((e, i) => ({ ...e, player: i === playerAt }));

/** วิ่งการแข่งจนจบ (ผู้เล่น = ขับตามเส้นช่วย ถ้ามี) */
function run(race: ReturnType<typeof createRace>, pick?: (s: number) => { pass?: boolean; ot?: boolean }) {
  const ev: RaceEvent[] = [];
  const all: RaceEvent[] = [];
  const pi = race.cars.findIndex((c) => c.player);
  for (let k = 0; k < 120 * 60 * 12 && !race.cars.every((c) => c.finish !== null); k++) {
    ev.length = 0;
    const me = pi >= 0 ? race.cars[pi].car : null;
    const p = me ? { ...idealInput(race.track, me), ...(pick?.(me.s) ?? {}) } : { throttle: false, brake: false };
    stepRace(race, p, ev);
    all.push(...ev);
  }
  return all;
}

describe("โหมดนักขับ: เลน", () => {
  it("มีสามเลน อยู่ในถนน เลนข้างห่างจาก racing line และรอบอ้างอิงช้ากว่า racing line", () => {
    const t = monza;
    expect(t.lanes).toHaveLength(3);
    let apart = 0;
    for (let i = 0; i < t.n; i++) {
      for (const l of t.lanes) {
        expect(l.offset[i]).toBeLessThanOrEqual(t.wr[i]);
        expect(l.offset[i]).toBeGreaterThanOrEqual(-t.wl[i]);
      }
      apart = Math.max(apart, t.lanes[2].offset[i] - t.lanes[0].offset[i]);
    }
    expect(apart).toBeGreaterThan(4);
    expect(t.lanes[0].refLap).toBeGreaterThan(t.lanes[1].refLap);
    expect(t.lanes[2].refLap).toBeGreaterThan(t.lanes[1].refLap);
  });

  it("เปลี่ยนเลนค่อย ๆ เลื่อน (ไม่กระโดด)", () => {
    const c = newCar(monza, { s: 100, v: 60, lat: 0 });
    stepCar(monza, c, { throttle: true, brake: false, lane: 1 }, perfOf(0));
    expect(c.lat).toBeGreaterThan(0);
    expect(c.lat).toBeLessThan(0.05);
  });
});

describe("โหมดนักขับ: ลมดูด / แบตเตอรี่", () => {
  const topSpeed = (mods?: { tow: number; dirty: number }, ot = false) => {
    const c = newCar(monza, { s: 0, v: 80, lat: 0 });
    let top = 0;
    // ทางตรงยาวของมอนซาหลังเส้นสตาร์ท ~ 800 ม. (ไม่ใช้ Straight Mode เพื่อแยกผล)
    for (let k = 0; k < 120 * 6; k++) {
      stepCar(monza, c, { throttle: true, brake: false, ot }, perfOf(0), [], mods);
      top = Math.max(top, c.v);
    }
    return { top, energy: c.energy };
  };
  it("ลมดูดทำให้เร็วขึ้นบนทางตรง", () => {
    expect(topSpeed({ tow: 1, dirty: 0 }).top).toBeGreaterThan(topSpeed().top + 1.5);
  });
  it("Overtake เร็วขึ้นแต่แบตลด · เบรกแล้วชาร์จคืน", () => {
    const a = topSpeed(undefined, true);
    const b = topSpeed();
    expect(a.top).toBeGreaterThan(b.top);
    expect(a.energy).toBeLessThan(0.6);
    const c = newCar(monza, { s: 0, v: 80, lat: 0 });
    c.energy = 0.2;
    for (let k = 0; k < 120; k++) stepCar(monza, c, { throttle: false, brake: true }, perfOf(0));
    expect(c.energy).toBeGreaterThan(0.2);
  });
});

describe("โหมดนักขับ: แข่งกับ AI", () => {
  it("การแข่งจบครบ ทุกคันมีเวลาจบ ไม่มีรถซ้อนกัน และลำดับสอดคล้องกับเวลา", () => {
    const race = createRace(monza, field(10), { laps: 2, difficulty: "normal", seed: 3 });
    run(race);
    expect(race.cars.every((c) => c.finish !== null)).toBe(true);
    const times = race.order.map((i) => race.cars[i].finish! + race.cars[i].penalty);
    for (let k = 1; k < times.length; k++) expect(times[k]).toBeGreaterThanOrEqual(times[k - 1]);
    // ผู้ชนะใช้เวลาใกล้ ๆ 2 รอบอ้างอิง (+ออกตัวจากหยุดนิ่ง และเสียเวลาดวลกันรอบแรก)
    expect(times[0]).toBeGreaterThan(monza.refLap * 2);
    expect(times[0]).toBeLessThan(monza.refLap * 2 + 18);
  });

  it("AI แซงกันได้จริง (ลำดับเปลี่ยนจากกริด) และทีมเร็วไปข้างหน้า", () => {
    // กริดกลับด้าน: ทีมช้าอยู่หน้า
    const race = createRace(monza, field(10).reverse(), { laps: 3, difficulty: "hard", seed: 5 });
    run(race);
    const finalIds = race.order.map((i) => race.cars[i].id);
    const gridIds = race.cars.map((c) => c.id);
    expect(finalIds).not.toEqual(gridIds);
    // ทีมเร็วสุด (papaya) อย่างน้อยหนึ่งคันจบดีกว่าตำแหน่งออกตัว (แซงยากขึ้นเพราะไม่มีแรงเสริมฟรี)
    const gained = race.cars.some((c, i) => c.team === "papaya" && race.order.indexOf(i) < i);
    expect(gained).toBe(true);
  });

  it("ผู้เล่นขับตามเส้นช่วย แซงจากท้ายกริดได้", () => {
    const n = 8;
    const race = createRace(monza, field(n, n - 1), { laps: 3, difficulty: "easy", seed: 9 });
    // กดแซงทุกครั้งที่ปุ่มพร้อม แล้วกด OT ระหว่างแซง (แบบที่ผู้เล่นจะทำ)
    const me = race.cars.find((c) => c.player)!;
    const ev = run(race, () => ({ pass: me.passState === "ready", ot: me.pass !== null }));
    const pi = race.cars.findIndex((c) => c.player);
    expect(race.order.indexOf(pi)).toBeLessThan(n - 1);
    expect(ev.some((e) => e.kind === "overtake" && e.by === race.cars[pi].id)).toBe(true);
  });

  it("ไม่มีรถสองคันทับกัน (ระยะห่างตามยาวในแนวเดียวกันไม่น้อยกว่าความยาวรถ)", () => {
    const race = createRace(monza, field(12), { laps: 1, difficulty: "normal", seed: 11 });
    const ev: RaceEvent[] = [];
    let worst = Infinity;
    for (let k = 0; k < 120 * 70; k++) {
      ev.length = 0;
      stepRace(race, { throttle: false, brake: false }, ev);
      if (race.lights > 0) continue;
      for (const a of race.cars)
        for (const b of race.cars) {
          if (a === b) continue;
          const d = b.car.s - a.car.s;
          const lat = Math.abs(a.car.lat - b.car.lat);
          if (d >= 0 && lat < 0.2) worst = Math.min(worst, d);
        }
    }
    expect(worst).toBeGreaterThanOrEqual(CAR_LEN - 0.05);
  });

  /** ผู้เล่นตามหลังรถ AI ที่ช้ากว่ามาก (เลนเดียวกัน) บนทางตรงยาวหลังเส้นสตาร์ทมอนซา */
  const chase = () => {
    const race = createRace(monza, field(2, 1), { laps: 3, difficulty: "normal", seed: 1 });
    race.lights = 0;
    const [slow, me] = race.cars;
    slow.slack = 0.25;
    slow.car.s = 140;
    slow.car.v = 50;
    slow.car.lat = 0;
    me.car.s = 60;
    me.car.v = 70;
    me.car.lat = 0;
    return { race, slow, me };
  };
  /** ขับตามเส้นช่วย (เบรกเอง) */
  const drive = (race: Race, me: RaceCar, extra: Partial<RaceInput> = {}) => stepRace(race, { ...idealInput(monza, me.car), ...extra });

  it("ตามติด: ความเร็วถูกจำกัดให้ค้างห่าง ~0.2 วิ ไม่ชน และปุ่มแซงขึ้น", () => {
    const { race, slow, me } = chase();
    let closest = Infinity;
    let ready = false;
    let heldGap: number | null = null;
    for (let k = 0; k < 120 * 6; k++) {
      drive(race, me);
      closest = Math.min(closest, slow.car.s - me.car.s);
      if (me.passState === "ready") ready = true;
      if (me.held) heldGap = (slow.car.s - me.car.s - CAR_LEN) / me.car.v;
    }
    expect(closest).toBeGreaterThan(CAR_LEN + 1);
    expect(heldGap).not.toBeNull();
    expect(heldGap!).toBeGreaterThan(HOLD_GAP - 0.07);
    expect(heldGap!).toBeLessThan(HOLD_GAP + 0.08);
    expect(me.car.s).toBeLessThan(slow.car.s);
    expect(ready).toBe(true);
  });

  it("ตามติดแล้วไม่เบรกเองเข้าโค้ง = ชนท้าย เสียความเร็วมาก", () => {
    const { race, slow, me } = chase();
    const ev: RaceEvent[] = [];
    for (let k = 0; k < 120 * 30 && !ev.some((e) => e.kind === "bump"); k++) stepRace(race, { throttle: true, brake: false }, ev);
    expect(ev.some((e) => e.kind === "bump" && e.id === me.id)).toBe(true);
    expect(me.car.v).toBeLessThan(slow.car.v);
  });

  it("ปุ่มแซง: กดตอนพร้อม รถเปลี่ยนเลนเอง (ไม่มีแรงเสริมฟรี ใช้แบตที่กดเอง) แซงผ่าน แล้วกลับ racing line", () => {
    const { race, slow, me } = chase();
    me.car.energy = 1;
    for (let k = 0; k < 120 * 6 && me.passState !== "ready"; k++) drive(race, me);
    expect(me.passState).toBe("ready");
    const ev: RaceEvent[] = [];
    // กดครั้งเดียว: เริ่มแซงภายในเสี้ยววินาที
    drive(race, me, { pass: true });
    for (let k = 0; k < 48 && !me.pass; k++) drive(race, me);
    expect(me.pass).not.toBeNull();
    let wide = 0;
    for (let k = 0; k < 120 * 15; k++) {
      ev.length = 0;
      stepRace(race, { ...idealInput(monza, me.car), ot: true }, ev);
      wide = Math.max(wide, Math.abs(me.car.lat));
      expect(ev.some((e) => e.kind === "passEnd" && e.id === me.id && e.why !== "done")).toBe(false);
    }
    expect(wide).toBeGreaterThan(0.9);
    expect(me.car.s).toBeGreaterThan(slow.car.s + CAR_LEN);
    expect(me.pass).toBeNull();
    expect(Math.abs(me.car.lat)).toBeLessThan(0.05);
  });

  it("ปุ่มแซงกดไม่ได้ใกล้โค้ง (ทางตรงเหลือไม่พอ)", () => {
    const { race, slow, me } = chase();
    // ไปตามติดกันก่อนถึงจุดเบรกของชิเคนแรกนิดเดียว
    const brakeAt = (() => {
      for (let s = 200; s < 2000; s += DS) if (monza.zone[Math.floor(s / DS)] === "brake") return s;
      return 800;
    })();
    slow.car.s = brakeAt - 100;
    me.car.s = brakeAt - 100 - CAR_LEN - 0.2 * 50;
    me.car.v = 50;
    drive(race, me);
    expect(me.passState).toBe("wait");
    stepRace(race, { ...idealInput(monza, me.car), pass: true });
    expect(me.pass).toBeNull();
  });

  it("หลุดโค้ง: กดคันเร่งค้างอย่างเดียวช้ากว่าขับตามเส้นมาก และหลุดเกิน 3 ครั้งโดนโทษ", () => {
    const solo = (full: boolean) => {
      const race = createRace(monza, field(1, 0), { laps: 2, difficulty: "normal", seed: 1 });
      const me = race.cars[0];
      const ev: RaceEvent[] = [];
      const all: RaceEvent[] = [];
      for (let k = 0; k < 120 * 60 * 6 && me.finish === null; k++) {
        ev.length = 0;
        stepRace(race, full ? { throttle: true, brake: false } : idealInput(monza, me.car), ev);
        all.push(...ev);
      }
      return { time: me.finish! + me.penalty, offs: all.filter((e) => e.kind === "offtrack").length, pen: me.penalty };
    };
    const good = solo(false);
    const bad = solo(true);
    expect(good.offs).toBe(0);
    expect(bad.offs).toBeGreaterThan(TRACK_LIMITS);
    expect(bad.pen).toBe((bad.offs - TRACK_LIMITS) * OFF_PENALTY);
    expect(bad.time).toBeGreaterThan(good.time + 20);
  });

  it("AI ไม่ชนกัน: ไม่ชนท้าย ไม่เบรกกระชาก และแซงกันสำเร็จได้", () => {
    const race = createRace(monza, field(10), { laps: 3, difficulty: "normal", seed: 4 });
    const ev: RaceEvent[] = [];
    let jolts = 0;
    let done = 0;
    let bumps = 0;
    for (let k = 0; k < 120 * 60 * 10 && !race.cars.every((c) => c.finish !== null); k++) {
      ev.length = 0;
      const before = race.cars.map((c) => c.car.v);
      stepRace(race, { throttle: false, brake: false }, ev);
      race.cars.forEach((c, i) => {
        // ลดความเร็วเกิน 1 ม./วิ ในขั้นเดียว (120 ม./วิ²) = กระชาก (รถเบรกเองได้ไม่ถึงนั้น)
        if (before[i] - c.car.v > 1) jolts++;
      });
      done += ev.filter((e) => e.kind === "passEnd" && e.why === "done").length;
      bumps += ev.filter((e) => e.kind === "bump").length;
    }
    expect(bumps).toBeLessThanOrEqual(1);
    expect(jolts).toBeLessThanOrEqual(6);
    expect(done).toBeGreaterThan(0);
  });
});

describe("โหมดนักขับ: แข่งออนไลน์", () => {
  it("ห้อง: เข้าห้อง เลือกรถไม่ซ้ำ หัวห้องตั้งค่าและเริ่ม ผลเรียงตามเวลารวมโทษ", () => {
    const room = new DriveRoom();
    expect(room.join("a", "เอ")).toBeNull();
    expect(room.join("b", "บี")).toBeNull();
    const [a, b] = room.players;
    expect(a.host).toBe(true);
    expect(b.host).toBe(false);
    expect([a.team, a.driver]).not.toEqual([b.team, b.driver]);
    expect(room.handle("b", { t: "pick", team: a.team, driver: a.driver }, 0)).not.toBeNull();
    // คนที่ไม่ใช่หัวห้องตั้งค่า/เริ่มไม่ได้
    room.handle("b", { t: "config", config: { laps: 10 } }, 0);
    expect(room.config.laps).toBe(5);
    expect(room.handle("b", { t: "start" }, 0)).not.toBeNull();
    room.handle("a", { t: "config", config: { circuit: "spa", laps: 3 } }, 0);
    expect(room.config).toEqual({ circuit: "spa", laps: 3 });
    room.handle("a", { t: "start" }, 1000);
    expect(room.phase).toBe("race");
    expect(room.startAt).toBe(1000 + DRIVE_START_DELAY);
    expect([...room.grid].sort()).toEqual(["a", "b"]);
    // เข้าห้องระหว่างแข่งไม่ได้ · ข้อมูลเสียถูกทิ้ง
    expect(room.join("c", "ซี")).not.toBeNull();
    room.handle("a", { t: "state", st: [1, 2, 3] as unknown as NetState }, 2000);
    expect(room.states.a).toBeUndefined();
    // a จบเร็วกว่าแต่โดนโทษ 5 วิ → b ชนะ
    room.handle("a", { t: "state", st: [0, 0, 0, 0, 0, 0, 3, 5, 100] }, 20000);
    room.tick(20100);
    expect(room.phase).toBe("race");
    room.handle("b", { t: "state", st: [0, 0, 0, 0, 0, 0, 3, 0, 102] }, 21000);
    room.tick(21100);
    expect(room.phase).toBe("results");
    expect(room.results!.map((r) => r.id)).toEqual(["b", "a"]);
    room.handle("a", { t: "lobby" }, 22000);
    expect(room.phase).toBe("lobby");
  });

  it("หัวห้องออก → คนถัดไปเป็นหัวห้อง · คนหลุดระหว่างแข่งไม่ต้องรอ", () => {
    const room = new DriveRoom();
    room.join("a", "เอ");
    room.join("b", "บี");
    room.handle("a", { t: "start" }, 0);
    room.leave("a");
    expect(room.players.find((p) => p.id === "b")!.host).toBe(true);
    room.handle("b", { t: "state", st: [0, 0, 0, 0, 0, 0, 5, 0, 90] }, 1000);
    room.tick(1100);
    expect(room.phase).toBe("results");
    expect(room.results!.map((r) => r.time)).toEqual([90, null]);
  });

  it("รถเพื่อน: ตั้งจากข้อมูลเครือข่าย ไม่ถูกจำลองในเครื่อง และวิ่งต่อระหว่างรอข้อมูล", () => {
    const es = field(2, 0).map((e, k) => ({ ...e, remote: k === 1 }));
    const race = createRace(monza, es, { laps: 1, difficulty: "normal" });
    race.lights = 0;
    const [me, friend] = race.cars;
    const st = packState(me);
    st[0] = 300;
    st[1] = 50;
    setRemote(race, friend.id, st, 0);
    expect(friend.car.s).toBe(300);
    stepRace(race, { throttle: true, brake: false });
    expect(friend.car.s).toBe(300);
    advanceRemote(race, 0.1);
    expect(friend.car.s).toBeCloseTo(305, 5);
    // ข้อมูลใหม่ใกล้ ๆ = ค่อย ๆ ดึงเข้าหา ไม่กระโดด
    setRemote(race, friend.id, [310, 50, 0, 0, 0, 0, 0, 0, -1], 0);
    expect(friend.car.s).toBeGreaterThan(305);
    expect(friend.car.s).toBeLessThan(310);
  });
});

describe("โหมดนักขับ: เส้นช่วยไดนามิก", () => {
  it("สีไล่ เขียว → เหลือง → แดง", () => {
    expect(guideColor(0)).toBe(0x22c55e);
    expect(guideColor(0.5)).toBe(0xfacc15);
    expect(guideColor(1)).toBe(0xef4444);
  });

  it("สีตามความเร็วตอนนี้: เร็วเกินโค้ง = แดง · ความเร็วที่โค้งรับได้ = เขียว · ทางตรงไกลโค้ง = เขียว", () => {
    // จุดที่ช้าที่สุดของชิเคนแรกมอนซา
    let apex = 0;
    for (let i = 0; i < monza.n * 0.2; i++) if (monza.vref[i] < monza.vref[apex]) apex = i;
    const s = apex * DS;
    const vApex = monza.vref[apex];
    expect(guideRisk(monza, s, 0, 85)).toBe(1);
    expect(guideRisk(monza, s, 0, vApex)).toBe(0);
    const mid = guideRisk(monza, s, 0, vApex * (1 + GUIDE_RED / 2));
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    // ทางตรงหลังเส้นสตาร์ท ที่ความเร็วสูงสุดยังเป็นเขียว และโหมดเฉพาะโค้งซ่อนไว้
    expect(guideRisk(monza, 100, 0, 85)).toBe(0);
    expect(guideNeeded(monza, 100, 0, 0)).toBe(false);
    // อากาศเสีย (เกาะถนนน้อยลง) ทำให้แดงเร็วขึ้น
    expect(guideRisk(monza, s, 0, vApex, 0.94)).toBeGreaterThan(0);
  });
});

describe("โหมดนักขับ: จุดเบรก / คาดความเร็ว / โหมดฝึก", () => {
  it("คาดความเร็ว: เร่ง = เร็วขึ้น (ไม่เกิน vtop) · เบรก = ช้าลง (ไม่ติดลบ)", () => {
    expect(projectedSpeed(50, 10, 100, 95)).toBeCloseTo(Math.sqrt(50 * 50 + 2000), 5);
    expect(projectedSpeed(90, 10, 500, 95)).toBe(95);
    expect(projectedSpeed(50, -40, 100, 95)).toBe(0);
  });

  it("จุดเบรก: เร็วเข้าหาชิเคนแรกต้องเบรกก่อนถึงโค้ง · กำลังเร่ง = จุดเบรกมาเร็วกว่า · ช้าพอแล้วไม่ต้องเบรก", () => {
    let apex = 0;
    for (let i = 0; i < monza.n * 0.2; i++) if (monza.vref[i] < monza.vref[apex]) apex = i;
    const s = apex * DS - 300;
    const coast = brakePoint(monza, s, 0, 85, 0, 1, 97, 300);
    const push = brakePoint(monza, s, 0, 85, 5, 1, 97, 300);
    expect(coast).not.toBeNull();
    expect(coast!).toBeLessThan(300);
    expect(push!).toBeLessThan(coast!);
    expect(brakePoint(monza, s, 0, monza.vref[apex] * 0.95, 0, 1, 97, 300)).toBeNull();
  });

  it("แบ่งโค้ง: ทุกจุดมีเลขโค้ง เลขต่อเนื่อง และสนามมีหลายโค้ง", () => {
    const m = cornerMap(monza);
    const ids = new Set(m);
    expect(ids.has(-1)).toBe(false);
    expect(ids.size).toBeGreaterThan(4);
    let changes = 0;
    for (let i = 0; i < monza.n; i++) if (m[i] !== m[(i + 1) % monza.n]) changes++;
    expect(changes).toBe(ids.size);
  });

  it("โหมดฝึก: ผ่านดี 3 ครั้ง = จำได้เต็ม (เส้นจาง) · หลุด = เริ่มใหม่ · เร็วเกินมากแสดงเต็มเสมอ", () => {
    let m: Mastery = {};
    for (let k = 0; k < 3; k++) m = learnCorner(m, 2, true);
    expect(m[2]).toBeCloseTo(1, 5);
    expect(guideFade(m[2], 0)).toBeGreaterThan(0.8);
    expect(guideFade(m[2], 0.9)).toBe(0);
    m = learnCorner(m, 2, false);
    expect(m[2]).toBe(0);
  });
});
