/**
 * รถของผู้เล่นในโหมดนักขับ: กดคันเร่ง/เบรกเอง รถวิ่งตาม racing line
 * — เร็วเกินที่โค้งรับไหว = ไถลออกนอกไลน์ เสียความเร็ว และถ้าเกินมากรอบนั้นไม่นับ
 * จำลองแบบขั้นเวลาคงที่ (ผลเหมือนเดิมทุกเครื่อง ไม่ขึ้นกับเฟรมเรต)
 */
import { accelAt, brakeAt, coastAt, DS, sample, VMAX, type DriveTrack } from "./line";

export const STEP = 1 / 120;
/** ระยะเริ่มก่อนเส้นสตาร์ท (เมตร) — วิ่งเข้าเส้นแบบมีความเร็วแล้ว */
export const RUN_UP = 350;
/** เร็วเกินโค้งกี่ % ถึงเริ่มไถล */
const SLIDE_AT = 0.03;
/** เร็วเกินกี่ % ถึงนับว่าหลุดโค้ง (รอบไม่นับ) */
const OFF_AT = 0.1;
/** ระยะบันทึกรถเงา (เมตร) */
export const GHOST_DS = 10;

export type Input = { throttle: boolean; brake: boolean };
export type Perf = { accel: number; grip: number; top: number };

export type CarState = {
  /** ระยะสะสม (เมตร) — ติดลบช่วงวิ่งเข้าเส้นครั้งแรก */
  s: number;
  v: number;
  /** เยื้องออกจาก racing line เพราะไถล (เมตร, บวก = ขวา) */
  slide: number;
  /** เวลาทั้งหมดที่ขับ */
  t: number;
  /** เวลาที่เริ่มรอบปัจจุบัน (null = ยังไม่ข้ามเส้น) */
  lapStart: number | null;
  /** รอบปัจจุบันหลุดโค้งแล้ว */
  invalid: boolean;
  /** เวลาสะสมของรอบนี้ที่จุดทุก GHOST_DS เมตร (ไว้ทำรถเงา/ดูเร็วช้ากว่ารอบดีสุด) */
  trace: number[];
  lap: number;
};

export type LapResult = { lap: number; time: number; valid: boolean; trace: number[] };
export type StepEvent = { kind: "slide"; amount: number } | { kind: "off" } | { kind: "lap"; result: LapResult };

export function newCar(t: DriveTrack): CarState {
  const s = -RUN_UP;
  return { s, v: sample(t, t.vref, s) * 0.9, slide: 0, t: 0, lapStart: null, invalid: false, trace: [], lap: 0 };
}

/** เดินหน้าหนึ่งขั้น STEP · คืนเหตุการณ์ที่เกิด (ไถล, หลุดโค้ง, จบรอบ) */
export function stepCar(t: DriveTrack, c: CarState, input: Input, perf: Perf, events: StepEvent[] = []): StepEvent[] {
  const dt = STEP;
  const v = c.v;
  const a = input.brake ? -brakeAt(v) : input.throttle ? accelAt(v) * perf.accel : -coastAt(v);
  c.v = Math.max(0, Math.min(VMAX * perf.top, v + a * dt));

  // เร็วเกินโค้ง → ไถลออกนอกไลน์และเสียความเร็ว
  const limit = sample(t, t.vlat, c.s) * perf.grip;
  const over = c.v / limit - 1;
  if (over > SLIDE_AT) {
    const curve = sample(t, t.curve, c.s);
    // ไถลออกด้านนอกโค้ง (ตรงข้ามกับทิศเลี้ยว)
    c.slide = Math.max(-9, Math.min(9, c.slide - Math.sign(curve) * over * 60 * dt));
    c.v = Math.max(limit * 0.8, c.v - over * 140 * dt);
    if (over > OFF_AT && c.lapStart !== null && !c.invalid) {
      c.invalid = true;
      events.push({ kind: "off" });
    }
    events.push({ kind: "slide", amount: over });
  } else {
    // ค่อย ๆ กลับเข้าไลน์
    c.slide -= Math.sign(c.slide) * Math.min(Math.abs(c.slide), 3 * dt);
  }

  const before = c.s;
  c.s += c.v * dt;
  c.t += dt;

  // บันทึกเวลาที่ผ่านทุก GHOST_DS เมตรในรอบนี้
  if (c.lapStart !== null) {
    const lapS = c.s - c.lap * t.length;
    while (c.trace.length * GHOST_DS <= lapS && c.trace.length * GHOST_DS < t.length) c.trace.push(c.t - c.lapStart);
  }

  // ข้ามเส้นสตาร์ท/เส้นชัย
  const crossed = Math.floor(c.s / t.length) > Math.floor(before / t.length) || (before < 0 && c.s >= 0);
  if (crossed) {
    // เวลาที่ข้ามจริงระหว่างขั้น (เชิงเส้น) ให้ละเอียดกว่า 1/120 วิ
    const line = Math.floor(c.s / t.length) * t.length;
    const frac = (c.s - line) / Math.max(1e-6, c.s - before);
    const at = c.t - frac * dt;
    if (c.lapStart !== null) {
      events.push({ kind: "lap", result: { lap: c.lap + 1, time: at - c.lapStart, valid: !c.invalid, trace: c.trace } });
      c.lap++;
    }
    c.lapStart = at;
    c.invalid = false;
    c.trace = [0];
  }
  return events;
}

/** ระยะในรอบปัจจุบัน (0..length) */
export const lapDistance = (t: DriveTrack, c: CarState) => (c.s < 0 ? c.s : c.s - c.lap * t.length);

/** เร็ว/ช้ากว่ารอบอ้างอิง (trace ของรอบดีสุด) ที่ระยะนี้ — บวก = ช้ากว่า */
export function deltaTo(best: number[] | null, c: CarState, d: number): number | null {
  if (!best || c.lapStart === null || d < 0) return null;
  const k = d / GHOST_DS;
  const i = Math.floor(k);
  if (i + 1 >= best.length) return null;
  const ref = best[i] + (best[i + 1] - best[i]) * (k - i);
  return c.t - c.lapStart - ref;
}

/** ตำแหน่งของรถเงา (ระยะในรอบ) ณ เวลาของรอบ tLap */
export function ghostDistance(best: number[], tLap: number): number {
  if (best.length < 2) return 0;
  let lo = 0;
  let hi = best.length - 1;
  if (tLap >= best[hi]) return hi * GHOST_DS;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (best[m] <= tLap) lo = m;
    else hi = m;
  }
  const f = (tLap - best[lo]) / Math.max(1e-6, best[hi] - best[lo]);
  return (lo + f) * GHOST_DS;
}

/**
 * ผู้ช่วยขับ: ปุ่มที่ควรกดตามเส้นช่วย (ใช้ทำเบรกอัตโนมัติ และทดสอบ)
 * — เบรกเฉพาะตอนยังเร็วกว่าความเร็วอ้างอิง ไม่เบรกจนรถหยุดกลางโซนแดง
 */
export function idealInput(t: DriveTrack, c: CarState): Input {
  const z = t.zone[Math.floor((((c.s / DS) % t.n) + t.n) % t.n)];
  const ref = sample(t, t.vref, c.s);
  if (c.v > ref + 0.3) return { throttle: false, brake: z === "brake" || c.v > ref + 3 };
  return { throttle: z === "throttle" || c.v < ref - 1, brake: false };
}

/** สมรรถนะรถตามทีม: ทีมเร็วสุด pace 0 → 1.0 · ทีมช้า ๆ ลดลงเล็กน้อย */
export const perfOf = (pace: number): Perf => ({
  accel: 1 - pace * 0.03,
  grip: 1 - pace * 0.015,
  top: 1 - pace * 0.01,
});
