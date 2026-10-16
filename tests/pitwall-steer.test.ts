import { describe, expect, it } from "vitest";
import { ASSIST_STEER, dragAxis, DRAG_PX, steerAxis } from "@/lib/pitwall/drive/steer";

describe("การเลี้ยว", () => {
  it("แกนเลี้ยวจากปุ่ม/ลากนิ้ว", () => {
    expect(steerAxis(true, false, null)).toBe(-1);
    expect(steerAxis(false, true, null)).toBe(1);
    expect(steerAxis(true, true, null)).toBe(0);
    expect(steerAxis(true, false, 0.4)).toBe(0.4);
    expect(steerAxis(false, false, 3)).toBe(1);
  });

  it("ระดับช่วยขับ: ง่ายช่วยเลี้ยวเต็มที่ · ปกติครึ่งหนึ่ง · โปรไม่ช่วย", () => {
    expect(ASSIST_STEER[2]).toBe(1);
    expect(ASSIST_STEER[1]).toBeGreaterThan(0);
    expect(ASSIST_STEER[1]).toBeLessThan(1);
    expect(ASSIST_STEER[0]).toBe(0);
  });

  it("ลากนิ้วเกินขอบ = จุดอ้างอิงเลื่อนตาม กลับทิศได้ทันที", () => {
    expect(dragAxis(100, 135).axis).toBeCloseTo(0.5);
    const far = dragAxis(100, 300);
    expect(far.axis).toBe(1);
    expect(far.x0).toBe(300 - DRAG_PX);
    expect(dragAxis(far.x0, 290).axis).toBeLessThan(1);
  });
});
