import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, DS, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { idealInput, newCar, perfOf, stepCar } from "@/lib/pitwall/drive/car";
import { CAR_LEN, createRace, stepRace, type Entrant, type RaceEvent } from "@/lib/pitwall/drive/race";
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
function run(race: ReturnType<typeof createRace>, pick?: (s: number) => { lane?: number; ot?: boolean }) {
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
    // ผู้ชนะใช้เวลาใกล้ ๆ 2 รอบอ้างอิง (+ออกตัวจากหยุดนิ่ง)
    expect(times[0]).toBeGreaterThan(monza.refLap * 2);
    expect(times[0]).toBeLessThan(monza.refLap * 2 + 12);
  });

  it("AI แซงกันได้จริง (ลำดับเปลี่ยนจากกริด) และทีมเร็วไปข้างหน้า", () => {
    // กริดกลับด้าน: ทีมช้าอยู่หน้า
    const race = createRace(monza, field(10).reverse(), { laps: 3, difficulty: "hard", seed: 5 });
    run(race);
    const finalIds = race.order.map((i) => race.cars[i].id);
    const gridIds = race.cars.map((c) => c.id);
    expect(finalIds).not.toEqual(gridIds);
    // ทีมเร็วสุด (papaya) จบดีกว่าตำแหน่งออกตัว
    const pap = race.cars.findIndex((c) => c.team === "papaya");
    expect(race.order.indexOf(pap)).toBeLessThan(pap);
  });

  it("ผู้เล่นขับตามเส้นช่วย แซงจากท้ายกริดได้", () => {
    const n = 8;
    const race = createRace(monza, field(n, n - 1), { laps: 3, difficulty: "easy", seed: 9 });
    const ev = run(race, (s) => {
      // ไปเลนในก่อนโค้ง (แบบที่ผู้เล่นจะทำ)
      const ahead = race.cars.filter((c) => !c.player && c.car.s > s && c.car.s - s < 30).length;
      return { lane: ahead ? 1 : 0, ot: ahead > 0 };
    });
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

  it("ชนท้ายแรง = โดนโทษ +5 วินาที", () => {
    const race = createRace(monza, field(2, 1), { laps: 1, difficulty: "normal", seed: 1 });
    race.lights = 0;
    const [a, me] = race.cars;
    a.car.s = 400;
    a.car.v = 20;
    a.car.lat = 0;
    me.car.s = 400 - CAR_LEN - 0.05;
    me.car.v = 60;
    me.car.lat = 0;
    const ev: RaceEvent[] = [];
    stepRace(race, { throttle: true, brake: false, lane: 0 }, ev);
    expect(me.penalty).toBe(5);
    expect(ev.some((e) => e.kind === "contact")).toBe(true);
    expect(DS).toBeGreaterThan(0);
  });
});
