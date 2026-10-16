import { describe, expect, it } from "vitest";
import { dragAxis, DRAG_PX, steerAxis, steerTarget, STEER_RATE } from "@/lib/pitwall/drive/steer";

describe("การเลี้ยว", () => {
  it("แกนเลี้ยวจากปุ่ม/ลากนิ้ว", () => {
    expect(steerAxis(true, false, null)).toBe(-1);
    expect(steerAxis(false, true, null)).toBe(1);
    expect(steerAxis(true, true, null)).toBe(0);
    expect(steerAxis(true, false, 0.4)).toBe(0.4);
    expect(steerAxis(false, false, 3)).toBe(1);
  });

  it("เลี้ยวเต็มแกนเลื่อนเลนตาม STEER_RATE และไม่เกินขอบ", () => {
    let t = 0;
    for (let i = 0; i < 30; i++) t = steerTarget(t, 1, 0, 0.01);
    expect(t).toBeCloseTo(STEER_RATE * 0.3);
    for (let i = 0; i < 500; i++) t = steerTarget(t, 1, 2, 0.01);
    expect(t).toBe(1);
    for (let i = 0; i < 500; i++) t = steerTarget(t, -1, 0, 0.01);
    expect(t).toBe(-1);
  });

  it("ตัวช่วยดึงกลับ racing line เมื่อปล่อยพวงมาลัย (โปร = ไม่ดึง)", () => {
    const after = (assist: 0 | 1 | 2) => {
      let t = 0.8;
      for (let i = 0; i < 100; i++) t = steerTarget(t, 0, assist, 0.01);
      return t;
    };
    expect(after(0)).toBe(0.8);
    expect(after(1)).toBeLessThan(0.8);
    expect(after(2)).toBeLessThan(after(1));
    expect(after(2)).toBeGreaterThanOrEqual(0);
    // ไม่ดึงเลยไปอีกฝั่ง
    let t = 0.05;
    for (let i = 0; i < 100; i++) t = steerTarget(t, 0, 2, 0.01);
    expect(t).toBe(0);
  });

  it("ลากนิ้วเกินขอบ = จุดอ้างอิงเลื่อนตาม กลับทิศได้ทันที", () => {
    expect(dragAxis(100, 135).axis).toBeCloseTo(0.5);
    const far = dragAxis(100, 300);
    expect(far.axis).toBe(1);
    expect(far.x0).toBe(300 - DRAG_PX);
    expect(dragAxis(far.x0, 290).axis).toBeLessThan(1);
  });
});
