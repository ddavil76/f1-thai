import { describe, expect, it } from "vitest";
import { ASSIST_STAB, ASSIST_STEER, steerAxis } from "@/lib/pitwall/drive/steer";

describe("การเลี้ยว", () => {
  it("แกนเลี้ยวจากปุ่ม/แกนอนาล็อก", () => {
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

  it("ตัวช่วยทรงตัว: ง่ายเต็ม · ปกติบางส่วน · โปรเหลือน้อย", () => {
    expect(ASSIST_STAB[2]).toBe(1);
    expect(ASSIST_STAB[1]).toBeLessThan(1);
    expect(ASSIST_STAB[0]).toBeLessThan(ASSIST_STAB[1]);
  });
});
