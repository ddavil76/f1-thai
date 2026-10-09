import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, DS, VSM, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack, hasRealTrack } from "@/lib/pitwall/drive/tracks";
import { cornersOf } from "@/lib/pitwall/drive/corners";
import { CIRCUITS as ALL } from "@/lib/pitwall/teams";
import { deltaTo, ghostDistance, idealInput, newCar, perfOf, stepCar, type LapResult, type StepEvent } from "@/lib/pitwall/drive/car";

const CIRCUITS = ALL.map((c) => c.id);
/** สนามที่สร้างจากข้อมูลจริง (สร้างครั้งเดียว) */
const TRACKS: Record<string, DriveTrack> = {};
beforeAll(async () => {
  for (const id of CIRCUITS) TRACKS[id] = buildDriveTrack(id, await loadRawTrack(id))!;
});

/** ขับ n รอบด้วยฟังก์ชันเลือกปุ่ม คืนผลรอบ + จำนวนครั้งที่หลุดโค้ง */
function drive(id: string, laps: number, pick: (c: ReturnType<typeof newCar>, t: DriveTrack) => { throttle: boolean; brake: boolean }) {
  const t = TRACKS[id];
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
      const t = TRACKS[id];
      expect(t).toBeTruthy();
      expect(t.n * DS).toBe(t.length);
      expect(t.refLap).toBeGreaterThan(55);
      expect(t.refLap).toBeLessThan(140);
      expect(Math.max(...t.vref)).toBeLessThanOrEqual(VSM + 1e-9);
      for (const z of ["throttle", "lift", "brake"] as const) expect(t.zone.includes(z)).toBe(true);
    }
  });

  it("สนามมีเนิน: สปาสูงต่ำต่างกันมาก มอนซาเกือบราบ ความชันไม่เกิน 18%", () => {
    const range = (id: string) => Math.max(...TRACKS[id].y) - Math.min(...TRACKS[id].y);
    expect(range("spa")).toBeGreaterThan(70);
    expect(range("monza")).toBeLessThan(8);
    for (const id of CIRCUITS) expect(Math.max(...TRACKS[id].grade.map(Math.abs))).toBeLessThanOrEqual(0.18);
  });

  it("ใช้ผังสนามจริง: ความยาวใกล้ของจริง และความกว้างถนนต่างกันตามจุด", () => {
    const real: Record<string, number> = { spa: 7004, monza: 5793, silverstone: 5891, suzuka: 5807, americas: 5513 };
    for (const [id, len] of Object.entries(real)) {
      expect(hasRealTrack(id)).toBe(true);
      expect(Math.abs(TRACKS[id].length - len) / len).toBeLessThan(0.01);
    }
    const w = TRACKS.spa.wl.map((v, i) => v + TRACKS.spa.wr[i]);
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(3);
  });

  it("โค้งดังอยู่ในสนาม · Eau Rouge/Raidillon กดเต็ม · La Source ต้องเบรกหนัก · ซานด์วูร์ตมีโค้งเอียง", () => {
    for (const id of CIRCUITS) for (const c of cornersOf(id)) expect(c.from < c.to && c.to <= TRACKS[id].length).toBe(true);
    const t = TRACKS.spa;
    const minIn = (from: number, to: number) => {
      let m = Infinity;
      for (let s = from; s <= to; s += DS) m = Math.min(m, t.vref[Math.floor(s / DS)]);
      return m * 3.6;
    };
    const er = cornersOf("spa").find((c) => c.name === "Eau Rouge")!;
    const rd = cornersOf("spa").find((c) => c.name === "Raidillon")!;
    expect(minIn(er.from, rd.to)).toBeGreaterThan(280);
    const ls = cornersOf("spa").find((c) => c.name === "La Source")!;
    expect(minIn(ls.from, ls.to)).toBeLessThan(110);
    expect(Math.max(...TRACKS.zandvoort.bank.map(Math.abs))).toBeGreaterThan(0.25);
  });

  it("racing line อยู่ในถนน ใช้ความกว้างถนน (นอก-ใน-นอก) และไม่หักเลี้ยวกะทันหัน", () => {
    for (const id of CIRCUITS) {
      const t = TRACKS[id];
      let slope = 0;
      let jump = 0;
      for (let i = 0; i < t.n; i++) {
        const j = (i + 1) % t.n;
        slope = Math.max(slope, Math.abs(t.lineOffset[j] - t.lineOffset[i]) / DS);
        jump = Math.max(jump, Math.abs(t.curve[j] - t.curve[i]));
      }
      let nearR = Infinity;
      let nearL = Infinity;
      for (let i = 0; i < t.n; i++) {
        expect(t.lineOffset[i]).toBeLessThanOrEqual(t.wr[i]);
        expect(t.lineOffset[i]).toBeGreaterThanOrEqual(-t.wl[i]);
        nearR = Math.min(nearR, t.wr[i] - t.lineOffset[i]);
        nearL = Math.min(nearL, t.wl[i] + t.lineOffset[i]);
      }
      // ชิดขอบทั้งสองฝั่ง (เข้าจากด้านนอก แตะ apex ด้านใน)
      expect(nearR).toBeLessThan(2);
      expect(nearL).toBeLessThan(2);
      // เดิมเส้นเยื้องข้าง ~1.5–2 ม. ต่อ 1 ม. ที่วิ่ง (เลี้ยวหักเกือบ 60°) — ตอนนี้มากสุดคือข้ามถนนในชิเคน (~30°)
      expect(slope).toBeLessThan(0.6);
      // ความโค้งเปลี่ยนต่อเนื่อง ไม่กระโดด
      expect(jump).toBeLessThan(0.02);
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
    const fake = { ...newCar(TRACKS.bahrain), lapStart: 0, t: trace[50] };
    expect(deltaTo(trace, fake, 500)).toBeCloseTo(0, 3);
  });
});

describe("โหมดนักขับ: Straight Mode", () => {
  const zones = (t: DriveTrack) => {
    let k = 0;
    for (let i = 0; i < t.n; i++) if (t.smZone[i] === 1 && t.smZone[(i - 1 + t.n) % t.n] !== 1) k++;
    return k;
  };
  it("มีโซนทางตรงในทุกสนาม (มอนซาหลายโซน · โมนาโกไม่มีทางตรงยาวพอ) และไม่อยู่ในโค้ง", () => {
    for (const id of CIRCUITS) if (id !== "monaco") expect(zones(TRACKS[id])).toBeGreaterThan(0);
    expect(zones(TRACKS.monza)).toBeGreaterThanOrEqual(3);
    for (const id of CIRCUITS) {
      const t = TRACKS[id];
      for (let i = 0; i < t.n; i++) if (t.smZone[i]) expect(Math.abs(t.curve[i])).toBeLessThan(0.0025);
    }
  });

  it("ใช้ Straight Mode แล้วรอบเร็วกว่า และความเร็วสูงสุดสูงกว่าเดิม", () => {
    let top = { on: 0, off: 0 };
    const lap = (sm: boolean) => {
      const { results, c } = drive("monza", 2, (car, tr) => {
        top = sm ? { ...top, on: Math.max(top.on, car.v) } : { ...top, off: Math.max(top.off, car.v) };
        return { ...idealInput(tr, car), sm };
      });
      void c;
      return results[1].time;
    };
    const withSm = lap(true);
    const without = lap(false);
    expect(withSm).toBeLessThan(without - 0.5);
    expect(top.on).toBeGreaterThan(top.off + 2);
  });

  it("เบรกแล้ว Straight Mode ปิดทันที · นอกโซนเปิดไม่ได้", () => {
    const t = TRACKS.monza;
    const i = t.smZone.findIndex((z) => z === 1);
    const c = { ...newCar(t), s: i * DS + 20, v: 80 };
    stepCar(t, c, { throttle: true, brake: false, sm: true }, perfOf(0));
    expect(c.sm).toBe(true);
    stepCar(t, c, { throttle: false, brake: true, sm: true }, perfOf(0));
    expect(c.sm).toBe(false);
    const out = t.smZone.findIndex((z) => z === 0);
    const c2 = { ...newCar(t), s: out * DS, v: 50 };
    stepCar(t, c2, { throttle: true, brake: false, sm: true }, perfOf(0));
    expect(c2.sm).toBe(false);
  });
});

