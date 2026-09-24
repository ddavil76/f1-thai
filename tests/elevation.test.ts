import { describe, expect, it } from "vitest";
import { ELEVATION_MAX_POINTS, locationToTrack, pickSession } from "@/lib/elevation";

/** วงรีมีเนิน: สูงสุดที่ครึ่งรอบ · หน่วยแบบ openf1 (ใหญ่ ๆ) */
const lap = (n = 400) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: 5000 + Math.cos(a) * 4000, y: -2000 + Math.sin(a) * 1500, z: 100 + (1 - Math.cos(a)) * 200 };
  });

describe("locationToTrack", () => {
  it("ย่อให้ด้านยาว = size อยู่กลาง 0,0 และพื้นเริ่มที่ความสูง 0", () => {
    const t = locationToTrack(lap(), 10, 1)!;
    const xs = t.map((p) => p[0]);
    const zs = t.map((p) => p[2]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 0);
    expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(0.1);
    expect(Math.abs(Math.max(...zs) + Math.min(...zs))).toBeLessThan(0.1);
    expect(Math.min(...t.map((p) => p[1]))).toBeGreaterThanOrEqual(0);
  });

  it("ความสูงขยายตามตัวคูณ และจุดสูงสุดอยู่ครึ่งรอบ", () => {
    const flat = locationToTrack(lap(), 10, 1)!;
    const x3 = locationToTrack(lap(), 10, 3)!;
    const hi = (t: number[][]) => Math.max(...t.map((p) => p[1]));
    expect(hi(x3)).toBeCloseTo(hi(flat) * 3, 1);
    // เนินจริง 400 หน่วยในสนามกว้าง 8000 → 0.5 หน่วยในกล่อง 10 (ก่อนขยาย, หลังเฉลี่ยลดลงนิดหน่อย)
    expect(hi(flat)).toBeGreaterThan(0.45);
    expect(hi(flat)).toBeLessThan(0.51);
    const top = flat.findIndex((p) => p[1] === hi(flat));
    expect(top / flat.length).toBeGreaterThan(0.4);
    expect(top / flat.length).toBeLessThan(0.6);
  });

  it("แกน y ของ openf1 ชี้ขึ้น → พื้นของเราชี้ลง (กลับด้าน)", () => {
    // จุดที่ y มากสุดของ openf1 ต้องได้ z น้อยสุด
    const src = lap();
    const t = locationToTrack(src, 10, 1)!;
    const step = Math.ceil(src.length / ELEVATION_MAX_POINTS);
    const iMaxY = src.reduce((m, p, i) => (p.y > src[m].y ? i : m), 0);
    const near = t[Math.round(iMaxY / step)];
    // วงรีสูง 3000 ในกว้าง 8000 → z อยู่ในช่วง ±1.875 จุดนี้ต้องอยู่ขอบล่างสุด
    expect(near[2]).toBeCloseTo(Math.min(...t.map((p) => p[2])), 1);
    expect(near[2]).toBeLessThan(-1.8);
  });

  it("จำกัดจำนวนจุด และข้อมูลน้อยเกินไปคืน null", () => {
    expect(locationToTrack(lap(2000))!.length).toBeLessThanOrEqual(ELEVATION_MAX_POINTS);
    expect(locationToTrack(lap(10))).toBeNull();
    expect(locationToTrack(Array.from({ length: 50 }, () => ({ x: 1, y: 1, z: 1 })))).toBeNull();
  });
});

describe("pickSession", () => {
  const s = (key: number, country_name: string, location: string, circuit_short_name?: string) =>
    ({ session_key: key, country_name, location, circuit_short_name, date_start: "" });
  const list = [
    s(1, "United States", "Miami"), s(2, "United States", "Austin"), s(3, "United States", "Las Vegas"),
    s(4, "Monaco", "Monaco", "Monte Carlo"), s(5, "Azerbaijan", "Baku"),
    s(6, "United Kingdom", "Silverstone"), s(7, "Spain", "Barcelona"),
  ];
  it("ชื่อประเทศ Ergast → openf1 และแยกหลายสนามในประเทศเดียวกันด้วยชื่อเมือง", () => {
    expect(pickSession(list, "USA", "Austin")?.session_key).toBe(2);
    expect(pickSession(list, "USA", "Las Vegas")?.session_key).toBe(3);
    expect(pickSession(list, "UK", "Silverstone")?.session_key).toBe(6);
  });
  it("เทียบ circuit_short_name ได้ และประเทศที่มีสนามเดียวไม่ต้องตรงชื่อเมือง", () => {
    expect(pickSession(list, "Monaco", "Monte Carlo")?.session_key).toBe(4);
    expect(pickSession(list, "Azerbaijan", "Anything")?.session_key).toBe(5);
  });
  it("สนามใหม่ที่ไม่เคยจัด → null", () => {
    expect(pickSession(list, "USA", "New York")).toBeNull();
    expect(pickSession(list, "Thailand", "Bangkok")).toBeNull();
  });
});

describe("LAND_DOTS (ลูกโลกปฏิทิน)", () => {
  it("เป็นคู่ lat/lon ในช่วงที่ถูกต้อง และมีจุดพอให้เห็นทวีป", async () => {
    const { LAND_DOTS } = await import("@/lib/globe-land");
    expect(LAND_DOTS.length % 2).toBe(0);
    expect(LAND_DOTS.length / 2).toBeGreaterThan(1000);
    for (let i = 0; i < LAND_DOTS.length; i += 2) {
      expect(Math.abs(LAND_DOTS[i])).toBeLessThanOrEqual(90);
      expect(Math.abs(LAND_DOTS[i + 1])).toBeLessThanOrEqual(180);
    }
  });
});
