import { describe, expect, it } from "vitest";
import { assistSteer, keyRate, newSteerMem, STEER_TUNE, type SteerCar } from "@/lib/pitwall/drive/steerAssist";

const LOCK = 0.35;
const PEAK = 0.1;
const car = (v: number, vy = 0, r = 0): SteerCar => ({ v, vy, r, a: 1.6, b: 1.8, L: 3.4, lock: LOCK, peak: PEAK, aMax: 40 });
/** กดปุ่ม/ปล่อยตามลำดับ (ค่าต่อขั้น 1/120 วิ) คืนมุมล้อทุกขั้น */
function run(keys: number[], c: SteerCar, device: "key" | "pad" = "key") {
  const m = newSteerMem(LOCK);
  return { out: keys.map((k) => assistSteer(m, k, device, c, STEER_TUNE.balanced, 1 / 120)), m };
}

describe("ตัวช่วยพวงมาลัย", () => {
  it("กดค้างที่ความเร็วสูง = ล้อหันแค่พอให้ยางหน้าเกาะสุด (ไม่ถึงล็อก ไม่ถูยางทิ้ง)", () => {
    const { out } = run(Array(120).fill(1), car(70));
    const last = out[out.length - 1];
    expect(last).toBeGreaterThan(PEAK * 0.85);
    expect(last).toBeLessThan(PEAK * 1.05);
  });

  it("ความเร็วต่ำ = หมุนได้เต็มล็อก", () => {
    const { out } = run(Array(120).fill(1), car(2));
    expect(out[out.length - 1]).toBeCloseTo(LOCK, 2);
  });

  it("แตะสั้น ๆ = ขยับนิดเดียว · กดค้าง = หมุนเข้าตามโค้งตัว S", () => {
    // ขับตรงมาก่อนครู่หนึ่ง (ตัวช่วยรู้ขีดของความเร็วนี้แล้ว)
    const warm = Array(60).fill(0);
    const tap = run([...warm, ...Array(6).fill(1), ...Array(30).fill(0)], car(50)).out.slice(60);
    const hold = run([...warm, ...Array(36).fill(1)], car(50)).out.slice(60);
    expect(Math.max(...tap)).toBeLessThan(hold[hold.length - 1] * 0.5);
    // ช่วงแรกขึ้นช้ากว่าช่วงกลาง (ตัว S)
    expect(hold[3] - hold[0]).toBeLessThan(hold[15] - hold[12]);
  });

  it("ปล่อยปุ่ม = คืนกลางเร็วกว่าตอนหมุนเข้า", () => {
    const { m } = run(Array(60).fill(1), car(40));
    const c = car(40);
    let n = 0;
    while (Math.abs(m.cmd) > 0.05 && n < 120) {
      assistSteer(m, 0, "key", c, STEER_TUNE.balanced, 1 / 120);
      n++;
    }
    expect(n / 120).toBeLessThan(0.25);
  });

  it("ปล่อยมือขณะท้ายปัด (เลี้ยวขวาแต่ท้ายไถลไปซ้าย) = ล้อหันซ้ายสวนให้เอง", () => {
    // หันขวาเร็ว + ตัวรถไถลซ้าย = เพลาหลังวิ่งไปทางซ้าย
    const { out } = run(Array(60).fill(0), car(30, -3, 0.8));
    expect(out[out.length - 1]).toBeLessThan(-0.02);
  });

  it("ช้า ๆ ปุ่มหมุนเข้าเร็วกว่าตอนเร็ว", () => {
    expect(keyRate(10)).toBeGreaterThan(keyRate(80));
  });
});
