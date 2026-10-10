import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, DS, laneValue, poseAt, sample, type DriveTrack } from "@/lib/pitwall/drive/line";
import { hasRealTrack, loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { idealInput } from "@/lib/pitwall/drive/car";
import { createRace, packState, setRemote, stepRace, stopError, type Entrant, type Race, type RaceCar, type RaceEvent, type RaceInput } from "@/lib/pitwall/drive/race";
import { BOX_GAP, pitLateral, PIT_MISS_PENALTY, PIT_QUEUE, pitLane, STOP_BASE, STOP_MISS, stopExtra, stopGrade } from "@/lib/pitwall/drive/pit";
import { lapsLeft, newTyre, suggestCompound, TYRE_LIFE, tyreGrip, wearPerMeter, wearTyre } from "@/lib/pitwall/drive/tyres";
import { CIRCUITS, TEAMS } from "@/lib/pitwall/teams";

let monza: DriveTrack;
beforeAll(async () => {
  monza = buildDriveTrack("monza", await loadRawTrack("monza"))!;
});

const field = (n: number, playerAt = -1): Entrant[] =>
  TEAMS.flatMap((t) => t.drivers.map((d, k) => ({ id: `${t.id}-${k}`, name: d.name, team: t.id, num: d.num, colour: t.color, ink: t.ink, pace: t.pace, skill: d.skill })))
    .slice(0, n)
    .map((e, i) => ({ ...e, player: i === playerAt }));

describe("ยาง", () => {
  it("Soft เกาะดีสุดแต่หมดเร็วสุด · Hard ทนสุด · สึกแล้วเกาะลดลง (ช่วงท้ายลดเร็ว) · ยางเย็นเกาะน้อยกว่า", () => {
    expect(tyreGrip(newTyre("soft"))).toBeGreaterThan(tyreGrip(newTyre("medium")));
    expect(tyreGrip(newTyre("medium"))).toBeGreaterThan(tyreGrip(newTyre("hard")));
    expect(TYRE_LIFE.soft).toBeLessThan(TYRE_LIFE.medium);
    expect(TYRE_LIFE.medium).toBeLessThan(TYRE_LIFE.hard);
    const at = (w: number) => tyreGrip({ c: "medium", wear: w, cold: 0 });
    expect(at(0.5)).toBeLessThan(at(0));
    // ช่วงท้าย (cliff) ลดเร็วกว่าช่วงแรก
    expect(at(0.75) - at(1)).toBeGreaterThan((at(0) - at(0.25)) * 2);
    expect(tyreGrip(newTyre("medium", 1))).toBeLessThan(tyreGrip(newTyre("medium", 0)));
  });

  it("สึกตามระยะ (ผูกกับจำนวนรอบแข่ง) · ไถลกินยางเพิ่ม · อุ่นยางตามระยะ", () => {
    const L = 5000;
    const a = newTyre("medium", 1);
    wearTyre(a, L, wearPerMeter("medium", 5, L));
    // วิ่ง 1 ใน 5 รอบ = ใช้ไป 1/(0.66·5) ของอายุ
    expect(a.wear).toBeCloseTo(1 / (TYRE_LIFE.medium * 5), 3);
    expect(a.cold).toBe(0);
    const b = newTyre("medium");
    wearTyre(b, 100, wearPerMeter("medium", 5, L), 0.1, 1);
    const c = newTyre("medium");
    wearTyre(c, 100, wearPerMeter("medium", 5, L));
    expect(b.wear).toBeGreaterThan(c.wear);
    // แข่งยาวขึ้น = สึกช้าลงต่อเมตร (เข้าพิทราว 1 ครั้งเท่ากัน)
    expect(wearPerMeter("soft", 10, L)).toBeLessThan(wearPerMeter("soft", 3, L));
  });

  it("ยางแนะนำ: เหลือน้อยรอบ = Soft · เหลือเยอะ = Hard", () => {
    expect(suggestCompound(1, 10)).toBe("soft");
    expect(suggestCompound(9, 10)).toBe("hard");
    expect(lapsLeft(newTyre("hard"), 10)).toBeGreaterThan(lapsLeft(newTyre("soft"), 10));
  });
});

describe("พิทเลน", () => {
  it("ทุกสนามวางพิทเลนได้ · อู่เรียงตามลำดับทีม ห่างเท่ากัน · กรอบจอดอยู่ในช่วงพิทเลน", async () => {
    for (const c of CIRCUITS) {
      const t = buildDriveTrack(c.id, hasRealTrack(c.id) ? await loadRawTrack(c.id) : null);
      if (!t) continue;
      const p = pitLane(t, TEAMS.length);
      expect(Math.abs(p.side)).toBe(1);
      expect(Math.abs(p.offset)).toBeGreaterThan(p.inner);
      for (let k = 1; k < p.boxes.length; k++) expect(p.boxes[k] - p.boxes[k - 1]).toBeCloseTo(BOX_GAP);
      expect(p.boxes[0]).toBeGreaterThan(p.entry + p.taper);
      expect(p.boxes[p.boxes.length - 1]).toBeLessThan(p.exit - p.taper);
      // พิทเลนไม่ทับโค้งแคบ (ความโค้ง × ระยะเยื้อง ไม่ถึงระดับที่เส้นทางจะพันเป็นวง)
      let worst = 0;
      for (let r = p.entry; r <= p.exit; r += DS) worst = Math.max(worst, Math.abs(sample(t, t.curve, r)) * (Math.abs(p.offset) + 20));
      if (c.id !== "monaco") expect(worst).toBeLessThan(0.45);
      else expect(worst).toBeLessThan(0.9);
    }
  });

  it("ทุกสนาม: เส้นทางในพิท (เลี้ยวเข้า → พิทเลน → เลี้ยวออก) ไม่หักกลับ/ไม่พันเป็นวง (รถไม่หมุน)", async () => {
    for (const c of CIRCUITS) {
      const t = buildDriveTrack(c.id, hasRealTrack(c.id) ? await loadRawTrack(c.id) : null);
      if (!t) continue;
      const p = pitLane(t, TEAMS.length);
      const from = laneValue(t, "offset", p.entry, p.side);
      const to = laneValue(t, "offset", p.exit, p.side);
      let prev: { x: number; z: number } | null = null;
      let dir: { x: number; z: number } | null = null;
      let worst = 1;
      for (let r = p.entry; r <= p.exit; r += 2) {
        const q = poseAt(t, r, pitLateral(p, r, from, to));
        if (prev) {
          const d = { x: q.x - prev.x, z: q.z - prev.z };
          const L = Math.hypot(d.x, d.z);
          expect(L).toBeGreaterThan(0.5);
          const u = { x: d.x / L, z: d.z / L };
          if (dir) worst = Math.min(worst, u.x * dir.x + u.z * dir.z);
          dir = u;
        }
        prev = q;
      }
      // ทิศเปลี่ยนไม่เกิน ~25° ต่อ 2 ม.
      expect(worst, c.id).toBeGreaterThan(0.9);
    }
  });

  it("จอดตรงกรอบ = เปลี่ยนยางไว · พลาดมาก = ช้าลง (ไม่เกินเพดาน)", () => {
    expect(stopExtra(0)).toBe(0);
    expect(stopExtra(2)).toBeGreaterThan(0);
    expect(stopExtra(8)).toBeGreaterThan(stopExtra(3));
    expect(stopExtra(100)).toBeLessThanOrEqual(4.5);
    expect(stopGrade(0.3)).toBe("perfect");
    expect(stopGrade(-6)).toBe("early");
    expect(stopGrade(6)).toBe("late");
  });
});

/** ผู้เล่นคนเดียว (กับ AI 1 คัน) ขับตามเส้นช่วย · ขอเข้าพิทรอบแรก · กดจอดเมื่อ stopError ≥ at (null = ไม่กด) */
function soloPit(at: number | null, laps = 2) {
  const race = createRace(monza, field(2, 0), { laps, difficulty: "normal", seed: 2 });
  const me = race.cars[0];
  const ev: RaceEvent[] = [];
  const all: RaceEvent[] = [];
  for (let k = 0; k < 120 * 60 * 8 && me.finish === null; k++) {
    ev.length = 0;
    const input: RaceInput = {
      ...idealInput(monza, me.car, 1, tyreGrip(me.tyre)),
      pitReq: k === 0 ? "soft" : undefined,
      pitStop: at !== null && me.pit?.phase === "lane" && stopError(me) >= at,
      pitGo: !!me.pit?.ready,
    };
    stepRace(race, input, ev);
    all.push(...ev);
  }
  return { race, me, all };
}

describe("เข้าพิท", { timeout: 30000 }, () => {
  it("ขอเข้าพิท → วิ่งเองในพิทเลน → จอดตรงกรอบ ~2.3 วิ → ได้ยางใหม่ชนิดที่เลือก · ไม่โดนโทษ", () => {
    const { me, all } = soloPit(-0.2);
    const stop = all.find((e) => e.kind === "pitStop" && e.id === me.id);
    expect(stop?.kind).toBe("pitStop");
    if (stop?.kind !== "pitStop") return;
    expect(stop.grade).toBe("perfect");
    expect(stop.time).toBeLessThan(STOP_BASE + 0.3);
    expect(me.pits).toBe(1);
    expect(me.stints.map((x) => x.c)).toEqual(["medium", "soft"]);
    expect(me.penalty).toBe(0);
    expect(me.pit).toBeNull();
    expect(me.pitOff).toBeNull();
  });

  it("ขอเข้าพิทไว้: ก่อนถึงทางเข้ารถชิดเลนฝั่งพิทเอง แล้วเลี้ยวเข้าพิทเลนต่อเนื่อง (ระยะเยื้องไม่กระโดด)", () => {
    const race = createRace(monza, field(1, 0), { laps: 2, difficulty: "normal", seed: 2 });
    const me = race.cars[0];
    let atEntry: number | null = null;
    let lastLat: number | null = null;
    let jump = 0;
    for (let k = 0; k < 120 * 60 * 3 && me.pits === 0; k++) {
      stepRace(race, { ...idealInput(monza, me.car, 1, tyreGrip(me.tyre)), pitReq: me.pitWant === null && !me.pit ? "hard" : undefined, pitStop: me.pit?.phase === "lane" && stopError(me) >= 0, pitGo: !!me.pit?.ready });
      if (me.pit && atEntry === null) atEntry = me.car.lat;
      const lat = me.pitOff ?? null;
      if (lat !== null && lastLat !== null) jump = Math.max(jump, Math.abs(lat - lastLat));
      lastLat = lat;
    }
    expect(me.pits).toBe(1);
    expect(atEntry).toBeCloseTo(race.pitLane.side, 1);
    expect(jump).toBeLessThan(0.2);
  });

  it("กดจอดเร็วไป/ไม่กดเลย = จอดนานกว่า", () => {
    const mine = (r: ReturnType<typeof soloPit>) => r.all.find((e) => e.kind === "pitStop" && e.id === r.me.id);
    const perfect = mine(soloPit(-0.2));
    const early = mine(soloPit(-8));
    const never = mine(soloPit(null));
    if (perfect?.kind !== "pitStop" || early?.kind !== "pitStop" || never?.kind !== "pitStop") throw new Error("ไม่มีการจอด");
    expect(early.grade).toBe("early");
    expect(early.time).toBeGreaterThan(perfect.time + 1.5);
    expect(never.err).toBeCloseTo(STOP_MISS, 0);
    expect(never.time).toBeGreaterThan(perfect.time + 3);
  });

  it("ไม่เข้าพิทเลย = โทษ PIT_MISS_PENALTY วินาที", () => {
    const race = createRace(monza, field(1, 0), { laps: 1, difficulty: "normal", seed: 2 });
    const me = race.cars[0];
    for (let k = 0; k < 120 * 60 * 4 && me.finish === null; k++) stepRace(race, idealInput(monza, me.car, 1, tyreGrip(me.tyre)));
    expect(me.pits).toBe(0);
    expect(me.penalty).toBe(PIT_MISS_PENALTY);
  });

  it("รถในพิทเลนไม่ชน/ไม่บังรถบนสนาม · เพื่อนร่วมทีมเข้าพร้อมกันต้องต่อคิว ไม่จอดซ้อนกัน", () => {
    const race: Race = createRace(monza, field(4), { laps: 3, difficulty: "normal", seed: 6 });
    // บังคับให้เพื่อนร่วมทีม (papaya-0/1) เข้าพิทรอบแรกพร้อมกัน
    const [a, b] = race.cars as RaceCar[];
    a.plan = { lap: 1, next: "hard" };
    b.plan = { lap: 1, next: "hard" };
    let both = 0;
    let closest = Infinity;
    for (let k = 0; k < 120 * 60 * 6 && race.cars.some((c) => c.finish === null); k++) {
      stepRace(race, { throttle: false, brake: false });
      if (a.pit && b.pit && a.pit.base === b.pit.base) {
        both++;
        closest = Math.min(closest, Math.abs(a.car.s - b.car.s));
      }
    }
    expect(both).toBeGreaterThan(0);
    expect(closest).toBeGreaterThan(PIT_QUEUE - 1.5);
    expect(race.cars.every((c) => c.pits === 1)).toBe(true);
  });

  it("ออนไลน์: ส่งสถานะพิท/ยางผ่านเครือข่ายได้ (และรับสถานะแบบเก่า 9 ช่องได้)", () => {
    const race = createRace(monza, [...field(1, 0), { ...field(2)[1], remote: true }], { laps: 3, difficulty: "normal" });
    const [me, other] = race.cars;
    me.pitOff = 14.5;
    me.tyre = { c: "hard", wear: 0.42, cold: 0 };
    me.pits = 1;
    const st = packState(me);
    setRemote(race, other.id, st, 0);
    expect(other.pitOff).toBeCloseTo(14.5);
    expect(other.tyre.c).toBe("hard");
    expect(other.tyre.wear).toBeCloseTo(0.42);
    expect(other.pits).toBe(1);
    setRemote(race, other.id, st.slice(0, 9) as typeof st, 0);
    expect(other.pitOff).toBeNull();
  });

  it("AI ทุกคันเข้าพิท 1 ครั้งตามแผน และยางไม่หมดจนหลุด (เปลี่ยนเป็นยางที่วิ่งจนจบได้)", () => {
    const race = createRace(monza, field(10), { laps: 5, difficulty: "normal", seed: 8 });
    for (let k = 0; k < 120 * 60 * 12 && race.cars.some((c) => c.finish === null); k++) stepRace(race, { throttle: false, brake: false });
    expect(race.cars.every((c) => c.finish !== null)).toBe(true);
    expect(race.cars.every((c) => c.pits >= 1)).toBe(true);
    expect(race.cars.every((c) => c.tyre.wear < 1)).toBe(true);
    expect(race.cars.every((c) => c.penalty === 0)).toBe(true);
    // มีกลยุทธ์มากกว่าแบบเดียว
    expect(new Set(race.cars.map((c) => c.stints.map((x) => x.c).join(">"))).size).toBeGreaterThan(1);
    expect(DS).toBeGreaterThan(0);
  });
});
