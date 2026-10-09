import { describe, expect, it } from "vitest";
import { buildDriveTrack, DS, VMAX } from "@/lib/pitwall/drive/line";
import { deltaTo, ghostDistance, idealInput, newCar, perfOf, stepCar, type LapResult, type StepEvent } from "@/lib/pitwall/drive/car";

const CIRCUITS = ["monza", "spa", "monaco", "silverstone", "suzuka", "bahrain"];

/** ขับ n รอบด้วยฟังก์ชันเลือกปุ่ม คืนผลรอบ + จำนวนครั้งที่หลุดโค้ง */
function drive(id: string, laps: number, pick: (c: ReturnType<typeof newCar>, t: NonNullable<ReturnType<typeof buildDriveTrack>>) => { throttle: boolean; brake: boolean }) {
  const t = buildDriveTrack(id)!;
  const c = newCar(t);
  const results: LapResult[] = [];
  let off = 0;
  const ev: StepEvent[] = [];
  for (let i = 0; i < 120 * 60 * 6 && results.length < laps; i++) {
    ev.length = 0;
    stepCar(t, c, pick(c, t), perfOf(0), ev);
    for (const e of ev) {
      if (e.kind === "lap") results.push(e.result);
      if (e.kind === "off") off++;
    }
  }
  return { t, c, results, off };
}

describe("โหมดนักขับ: สนาม", () => {
  it("ทุกสนามสร้างได้ ความยาวใกล้ของจริง และมีครบสามโซน", () => {
    for (const id of CIRCUITS) {
      const t = buildDriveTrack(id)!;
      expect(t).not.toBeNull();
      expect(t.n * DS).toBe(t.length);
      expect(t.refLap).toBeGreaterThan(55);
      expect(t.refLap).toBeLessThan(140);
      expect(Math.max(...t.vref)).toBeLessThanOrEqual(VMAX);
      for (const z of ["throttle", "lift", "brake"] as const) expect(t.zone.includes(z)).toBe(true);
    }
  });
});

describe("โหมดนักขับ: รถ", () => {
  it("ขับตามเส้นช่วยเป๊ะ = รอบนับ ไม่หลุดโค้ง และเวลาใกล้เวลาอ้างอิง", () => {
    for (const id of CIRCUITS) {
      const { t, results, off } = drive(id, 2, (c, tr) => idealInput(tr, c));
      expect(off).toBe(0);
      expect(results).toHaveLength(2);
      expect(results[1].valid).toBe(true);
      expect(Math.abs(results[1].time - t.refLap) / t.refLap).toBeLessThan(0.04);
    }
  });

  it("ไม่เบรกเลย = หลุดโค้ง รอบไม่นับ", () => {
    const { results, off } = drive("monza", 1, () => ({ throttle: true, brake: false }));
    expect(off).toBeGreaterThan(0);
    expect(results[0].valid).toBe(false);
  });

  it("เบรกนานเกิน (ช้าลง) แต่ไม่หลุด = เวลาแย่กว่าขับตามเส้น", () => {
    const ideal = drive("monza", 2, (c, tr) => idealInput(tr, c)).results[1].time;
    // เบรกก่อนจุดเบรก 40 เมตร
    const early = drive("monza", 2, (c, tr) => {
      const ahead = idealInput(tr, { ...c, s: c.s + 40 });
      const now = idealInput(tr, c);
      return { throttle: now.throttle && !ahead.brake, brake: now.brake || ahead.brake };
    });
    expect(early.off).toBe(0);
    expect(early.results[1].time).toBeGreaterThan(ideal + 0.3);
  });

  it("รถเงากับเวลาเร็ว/ช้ากว่าใช้ข้อมูลรอบเดียวกันได้ถูก", () => {
    const { results } = drive("bahrain", 1, (c, tr) => idealInput(tr, c));
    const trace = results[0].trace;
    expect(ghostDistance(trace, 0)).toBe(0);
    expect(ghostDistance(trace, trace[50])).toBeCloseTo(500, 0);
    // รถอยู่ที่ระยะ 500 ม. ณ เวลาเดียวกับรอบดีสุด → เร็ว/ช้ากว่า = 0
    const fake = { ...newCar(buildDriveTrack("bahrain")!), lapStart: 0, t: trace[50] };
    expect(deltaTo(trace, fake, 500)).toBeCloseTo(0, 3);
  });
});
