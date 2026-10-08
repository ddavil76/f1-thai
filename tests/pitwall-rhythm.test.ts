import { describe, expect, it } from "vitest";
import {
  BASE_LAP, FULL_GAIN, LEAD_BEATS, PENALTY, aiLap, buildChart, fmtLap, judge, judgeCount, noteDelta, sectorColor, WINDOW,
} from "@/lib/pitwall/rhythm";

type Track = Parameters<typeof buildChart>[0];

const track = (patch: Partial<Track> = {}): Track => ({
  lapCells: 36,
  corners: [
    { start: 8, end: 9, slow: true },
    { start: 20, end: 23 },
  ],
  drs: [{ start: 26, end: 32 }],
  ...patch,
});

describe("ควอลิฟายจับจังหวะ: สร้างโน้ตจากสนาม", () => {
  const chart = buildChart(track());
  const at = (lane: string, cell: number) => chart.find((n) => n.lane === lane && n.beat === cell + LEAD_BEATS);

  it("เบรกกดค้าง: เริ่มก่อนโค้ง 1 ช่อง · โค้งเร็วค้าง 1 จังหวะ · โค้งช้าค้างจนออกโค้ง", () => {
    expect(at("brake", 7)).toMatchObject({ slow: true, hold: 3 });
    expect(at("brake", 19)).toMatchObject({ slow: false, hold: 1 });
    expect(chart.filter((n) => n.lane === "brake")).toHaveLength(2);
  });

  it("คันเร่งกดค้างตลอดทางตรง ปล่อยตอนถึงจุดเบรก · ในโค้งไม่มีคันเร่ง", () => {
    // ช่อง 0–6 ทางตรง ปล่อยที่ช่อง 7 (จุดเบรก)
    expect(at("throttle", 0)).toMatchObject({ hold: 7 });
    // ออกโค้งช้าที่ช่อง 10 ค้างถึงจุดเบรกช่อง 19
    expect(at("throttle", 10)).toMatchObject({ hold: 9 });
    // โค้งเร็ว 20–23 ไหลผ่าน แล้วเร่งต่อช่อง 24
    expect(at("throttle", 24)).toMatchObject({ hold: 12 });
    expect(chart.every((n) => n.lane === "drs" || n.hold >= 1)).toBe(true);
  });

  it("DRS ตอนเข้าโซน และแบ่ง 3 เซกเตอร์", () => {
    expect(at("drs", 26)).toBeDefined();
    expect(at("throttle", 0)!.sector).toBe(0);
    expect(at("brake", 19)!.sector).toBe(1);
    expect(at("drs", 26)!.sector).toBe(2);
  });
});

describe("ควอลิฟายจับจังหวะ: ตัดสินและเวลา", () => {
  it("ช่วงตัดสิน PERFECT / GOOD / EARLY / LATE", () => {
    expect(judge(0)).toBe("perfect");
    expect(judge(WINDOW.perfect + 1)).toBe("good");
    expect(judge(-(WINDOW.good + 1))).toBe("early");
    expect(judge(WINDOW.good + 1)).toBe("late");
    expect(judge(WINDOW.late + 1)).toBeNull();
    // ระดับยากช่วงแคบลง
    expect(judge(WINDOW.perfect, 0.8)).toBe("good");
  });

  it("กดเป๊ะทุกโน้ตลดเวลาเต็ม · พลาดเบรกโค้งช้า = ออกนอกโค้ง", () => {
    const chart = buildChart(track());
    const scored = chart.filter((n) => n.lane !== "drs");
    const j = judgeCount(chart);
    expect(j).toBe(scored.length * 2);
    // กดเป๊ะ + ปล่อยเป๊ะทุกโน้ต
    const all = scored.reduce((a, n) => a + noteDelta(n, "perfect", j, "press") + noteDelta(n, "perfect", j, "release"), 0);
    expect(all).toBeCloseTo(-FULL_GAIN, 5);
    const slow = scored.find((n) => n.slow)!;
    expect(noteDelta(slow, "miss", j, "press")).toBeCloseTo(PENALTY.miss + PENALTY.offTrack, 5);
    // ปล่อยพลาดไม่นับออกนอกโค้ง
    expect(noteDelta(slow, "miss", j, "release")).toBeCloseTo(PENALTY.miss, 5);
    const drs = chart.find((n) => n.lane === "drs")!;
    expect(noteDelta(drs, "miss", j)).toBeCloseTo(0, 5);
    expect(noteDelta(drs, "perfect", j)).toBeLessThan(0);
  });

  it("เวลารถ AI แบ่ง 3 เซกเตอร์รวมเท่ารอบ · ระดับยากเร็วกว่า", () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const avg = (lvl: "easy" | "hard") => Array.from({ length: 200 }, () => aiLap(lvl, rng).lap).reduce((a, b) => a + b) / 200;
    const l = aiLap("normal", rng);
    expect(l.sectors[0] + l.sectors[1] + l.sectors[2]).toBeCloseTo(l.lap, 2);
    expect(avg("hard")).toBeLessThan(avg("easy"));
    expect(avg("easy")).toBeLessThan(BASE_LAP);
  });

  it("แสดงเวลา และสีเซกเตอร์", () => {
    expect(fmtLap(104.382)).toBe("1:44.382");
    expect(fmtLap(65.05)).toBe("1:05.050");
    expect(sectorColor(30, [31, 32], 31.5)).toBe("purple");
    expect(sectorColor(31.2, [31, 32], 31.5)).toBe("green");
    expect(sectorColor(31.8, [31, 32], 31.5)).toBe("yellow");
  });
});
