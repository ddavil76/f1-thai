import { describe, expect, it } from "vitest";
import { BTN, justPressed, readPad, stickSteer, trigger } from "@/lib/pitwall/drive/pad";
import { buildDriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { newCar, perfOf, stepFree } from "@/lib/pitwall/drive/car";

const fake = (axes: number[], vals: Record<number, number>) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, k) => ({ value: vals[k] ?? 0, pressed: (vals[k] ?? 0) > 0.5 })),
});

describe("จอยเกม", () => {
  it("สติ๊ก: กลางไม่นับ · ปลายเลี้ยวสุด · กลางละเอียดกว่าเส้นตรง", () => {
    expect(stickSteer(0.05)).toBe(0);
    expect(stickSteer(1)).toBe(1);
    expect(stickSteer(-1)).toBe(-1);
    expect(stickSteer(0.5)).toBeGreaterThan(0);
    expect(stickSteer(0.5)).toBeLessThan(0.5);
  });

  it("ไก: แรงกดครึ่งหนึ่ง = ครึ่งหนึ่ง · สุด = 1", () => {
    expect(trigger(0)).toBe(0);
    expect(trigger(1)).toBe(1);
    expect(trigger(0.5)).toBeCloseTo(0.48, 1);
  });

  it("standard mapping: RT คันเร่ง · LT เบรก · สติ๊กซ้ายเลี้ยว · RB = OT · ปุ่มเพิ่งกด", () => {
    const r = readPad(fake([-1, 0], { [BTN.RT]: 0.7, [BTN.LT]: 0.2, [BTN.RB]: 1 }));
    expect(r.steer).toBe(-1);
    expect(r.thr).toBeGreaterThan(0.6);
    expect(r.brk).toBeGreaterThan(0.1);
    expect(r.ot).toBe(true);
    expect(justPressed(r.pressed, [], BTN.RB)).toBe(true);
    expect(justPressed(r.pressed, r.pressed, BTN.RB)).toBe(false);
  });

  it("ฟิสิกส์: กดคันเร่งครึ่งเดียว = เร่งช้ากว่ากดสุด · แกนอนาล็อกตอบสนองเร็วกว่าปุ่ม", async () => {
    const t = buildDriveTrack("monza", await loadRawTrack("monza"))!;
    const run = (thrA: number, analog: boolean) => {
      const c = newCar(t, { s: 200, v: 30, lat: 0 });
      for (let i = 0; i < 60; i++) stepFree(t, c, { throttle: thrA > 0, brake: false, thrA, analog }, perfOf(0));
      return c;
    };
    expect(run(0.5, true).v).toBeLessThan(run(1, true).v);
    const c = newCar(t, { s: 200, v: 30, lat: 0 });
    const k = newCar(t, { s: 200, v: 30, lat: 0 });
    for (let i = 0; i < 6; i++) {
      stepFree(t, c, { throttle: true, brake: false, thrA: 1, analog: true }, perfOf(0));
      stepFree(t, k, { throttle: true, brake: false }, perfOf(0));
    }
    expect(c.thr).toBeGreaterThan(k.thr);
  });
});
