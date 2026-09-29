import { describe, expect, it } from "vitest";
import {
  buildTrace, fastestLaps, fmtLap, fracAtTime, indexOfFrac, matchSession, miniSectors, posAtFrac, timeDelta, toLaps,
  type Of1Car, type Of1Loc,
} from "@/lib/telemetry";

const START = "2025-08-30T14:10:00.000Z";
const at = (sec: number) => new Date(Date.parse(START) + sec * 1000).toISOString();

/**
 * รอบสมมติ: ความเร็วคงที่ v (km/h) ทั้งรอบ ยกเว้นช่วงเบรกกลางรอบ
 * ตัวอย่างทุก ~0.27 วิ เหมือน openf1 (~3.7 Hz)
 */
function lap(v: number, lapTime: number, { slowFrom = 0.4, slowTo = 0.5, slowV = v } = {}): Of1Car[] {
  const out: Of1Car[] = [];
  for (let s = -0.1; s <= lapTime + 0.1; s += 0.27) {
    const k = s / lapTime;
    const slow = k >= slowFrom && k < slowTo;
    out.push({
      date: at(s),
      speed: slow ? slowV : v,
      throttle: slow ? 0 : 100,
      brake: slow ? 100 : 0,
      n_gear: slow ? 3 : 8,
      rpm: 11000,
    });
  }
  return out;
}

/** วิ่งเป็นวงกลมรัศมี r รอบละ lapTime วินาที */
function circle(lapTime: number, r = 1000): Of1Loc[] {
  const out: Of1Loc[] = [];
  for (let s = -0.5; s <= lapTime + 0.5; s += 0.27) {
    const a = (s / lapTime) * Math.PI * 2;
    out.push({ date: at(s), x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return out;
}

describe("buildTrace", () => {
  it("ระยะทางจากความเร็ว × เวลา และจุดเท่ากันทุก array", () => {
    // 180 km/h = 50 m/s × 80 วิ = 4000 ม.
    const t = buildTrace(lap(180, 80), [], START, 80, 101)!;
    expect(t.length).toBeGreaterThan(3950);
    expect(t.length).toBeLessThan(4050);
    for (const arr of [t.frac, t.t, t.speed, t.throttle, t.brake, t.gear]) expect(arr).toHaveLength(101);
    expect(t.t[0]).toBe(0);
    expect(t.t[100]).toBeCloseTo(80, 5);
    // ความเร็วคงที่ → ครึ่งทาง = ครึ่งเวลา
    expect(t.t[50]).toBeCloseTo(40, 0);
    expect(t.x).toBeNull();
  });

  it("เบรก 0/1 เกียร์เป็นขั้น คันเร่งไม่เกิน 100", () => {
    const car = lap(200, 90, { slowFrom: 0.3, slowTo: 0.4, slowV: 90 });
    car[3].throttle = 104; // openf1 มีค่าเพี้ยนเกิน 100 บ้าง
    const t = buildTrace(car, [], START, 90)!;
    expect(new Set(t.brake)).toEqual(new Set([0, 1]));
    expect(t.gear.every((g) => g === 3 || g === 8)).toBe(true);
    expect(Math.max(...t.throttle)).toBeLessThanOrEqual(100);
  });

  it("ตำแหน่งบนสนามจาก location ที่อยู่คนละชุดเวลา", () => {
    const t = buildTrace(lap(180, 80), circle(80), START, 80, 201)!;
    expect(t.x).toHaveLength(201);
    // เริ่มที่มุม 0 → (1000, 0) · ครึ่งรอบ → (-1000, 0)
    expect(t.x![0]).toBeCloseTo(1000, -1);
    expect(t.x![100]).toBeCloseTo(-1000, -1);
    expect(Math.abs(t.y![100])).toBeLessThan(30);
  });

  it("ข้อมูลน้อยเกิน / นอกช่วงรอบ → null", () => {
    expect(buildTrace(lap(180, 80).slice(0, 5), [], START, 80)).toBeNull();
    const shifted = lap(180, 80).map((c) => ({ ...c, date: at(500) }));
    expect(buildTrace(shifted, [], START, 80)).toBeNull();
  });
});

describe("เทียบสองคน", () => {
  // A เร็วกว่าเฉพาะช่วงเบรกกลางรอบ (ผ่านโค้งเร็วกว่า)
  const mk = (slowV: number, lapTime: number) =>
    buildTrace(lap(200, lapTime, { slowFrom: 0.4, slowTo: 0.5, slowV }), [], START, lapTime)!;
  const a = mk(120, 80);
  const b = mk(100, 81);

  it("ส่วนต่างเวลา: บวก = A นำ · จุดสุดท้าย = ส่วนต่างเวลาต่อรอบ", () => {
    const d = timeDelta(a, b);
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBeCloseTo(1, 5);
    expect(d.every((x) => x > -0.2)).toBe(true);
  });

  it("มินิเซกเตอร์: A ชนะช่วงที่ผ่านโค้งเร็วกว่า", () => {
    const ms = miniSectors(a, b, 10);
    expect(ms).toHaveLength(10);
    expect(ms[0].from).toBe(0);
    expect(ms[9].to).toBe(a.t.length - 1);
    // ช่วงที่ 5 (40-50% ของรอบ) คือช่วงเบรก
    expect(ms[4].winner).toBe("a");
    expect(ms[4].gain).toBeGreaterThan(0.1);
  });
});

describe("รอบและ session", () => {
  const raw = [
    { driver_number: 1, lap_number: 1, date_start: START, lap_duration: 90.1, duration_sector_1: 30, duration_sector_2: 30, duration_sector_3: 30.1, st_speed: 320, is_pit_out_lap: true },
    { driver_number: 1, lap_number: 2, date_start: START, lap_duration: 88.2, duration_sector_1: 29, duration_sector_2: 29.5, duration_sector_3: 29.7, st_speed: 325, is_pit_out_lap: false },
    { driver_number: 4, lap_number: 2, date_start: START, lap_duration: 87.9, duration_sector_1: 29, duration_sector_2: 29.2, duration_sector_3: 29.7, st_speed: 318, is_pit_out_lap: false },
    { driver_number: 4, lap_number: 3, date_start: null, lap_duration: 70, duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, is_pit_out_lap: false },
    { driver_number: 16, lap_number: 3, date_start: START, lap_duration: null, duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, is_pit_out_lap: false },
  ];

  it("ตัดรอบออกพิท / ไม่มีเวลา / ไม่มีเวลาเริ่ม", () => {
    const laps = toLaps(raw);
    expect(laps.map((l) => `${l.num}-${l.lap}`)).toEqual(["1-2", "4-2"]);
    expect(laps[0].trap).toBe(325);
  });

  it("รอบเร็วสุดของแต่ละคน เรียงเร็ว → ช้า", () => {
    expect(fastestLaps(toLaps(raw)).map((l) => l.num)).toEqual([4, 1]);
  });

  it("เลือก session ตามชื่อ + เวลาใกล้กำหนดการ (sprint quali ปี 2023 ชื่อ Sprint Shootout)", () => {
    const list = [
      { session_key: 1, session_name: "Qualifying", date_start: "2025-08-30T14:00:00+00:00" },
      { session_key: 2, session_name: "Race", date_start: "2025-08-31T13:00:00+00:00" },
      { session_key: 3, session_name: "Qualifying", date_start: "2025-09-06T14:00:00+00:00" },
      { session_key: 4, session_name: "Sprint Shootout", date_start: "2023-07-29T10:30:00+00:00" },
    ];
    expect(matchSession(list, "Q", Date.parse("2025-08-30T14:00:00Z"))).toBe(1);
    expect(matchSession(list, "RACE", Date.parse("2025-08-31T13:00:00Z"))).toBe(2);
    expect(matchSession(list, "SQ", Date.parse("2023-07-29T10:30:00Z"))).toBe(4);
    expect(matchSession(list, "SPRINT", Date.parse("2025-08-30T10:00:00Z"))).toBeNull();
  });

  it("เวลาต่อรอบแบบ F1", () => {
    expect(fmtLap(89.456)).toBe("1:29.456");
    expect(fmtLap(61.05)).toBe("1:01.050");
    expect(fmtLap(59.9)).toBe("59.900");
  });
});

describe("ตำแหน่ง ณ เวลาเดียวกัน (จุดสองคนบนผัง / เล่นแข่งกัน)", () => {
  const a = buildTrace(lap(180, 80), circle(80), START, 80, 201)!;
  const b = buildTrace(lap(180, 82), circle(82), START, 82, 201)!;

  it("ครึ่งเวลา = ครึ่งรอบ · ก่อนเริ่ม/หลังจบยึดขอบ", () => {
    expect(fracAtTime(a, 40)).toBeCloseTo(0.5, 2);
    expect(fracAtTime(a, -5)).toBe(0);
    expect(fracAtTime(a, 999)).toBe(1);
  });

  it("คนที่ช้ากว่าอยู่ข้างหลัง ณ เวลาเดียวกัน", () => {
    const t = 40;
    expect(fracAtTime(b, t)).toBeLessThan(fracAtTime(a, t));
    // B ใช้ 82 วิ → ที่ 40 วิ อยู่ ~48.8% ของรอบ
    expect(fracAtTime(b, t)).toBeCloseTo(40 / 82, 2);
  });

  it("พิกัดตามตำแหน่งในรอบ + index ที่ใกล้สุด", () => {
    const p = posAtFrac(a, 0.5)!;
    expect(p.x).toBeCloseTo(-1000, -1);
    expect(p.z).toBe(0);
    expect(indexOfFrac(a, 0.5)).toBe(100);
    expect(indexOfFrac(a, 2)).toBe(200);
    expect(posAtFrac(buildTrace(lap(180, 80), [], START, 80)!, 0.5)).toBeNull();
  });
});
