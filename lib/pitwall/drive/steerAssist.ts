/**
 * ตัวช่วยพวงมาลัยสำหรับคีย์บอร์ดและจอย (แนวคิดแบบเกมจำลองการแข่ง — ปุ่ม/สติ๊กบังคับเหมือนพวงมาลัยจริงไม่ได้)
 * — ปุ่ม: กดค้าง = พวงมาลัยหมุนเข้าตามเส้นโค้งรูปตัว S (แตะสั้น ๆ = ขยับนิดเดียว) · ปล่อย = คืนกลางเร็วกว่าตอนหมุนเข้า
 *   ช้า ๆ หมุนเข้าเร็ว · เร็ว ๆ หมุนเข้านุ่มขึ้น
 * — ขีดเกาะ: หมุนสุด = ล้อหน้าทำมุมลื่นพอดีจุดเกาะสูงสุด เทียบกับทิศที่เพลาหน้าวิ่งจริง → เลี้ยวสุดได้แรงเลี้ยวมากสุดทุกความเร็ว ไม่ถูยางทิ้ง
 * — คืนพวงมาลัยเอง: ปล่อยมือ = ล้อหันตามทิศที่เพลาหลังวิ่ง (+ หน่วงการหมุน) เหมือนพวงมาลัยจริงที่คืนตัว → รถตรงเอง และแก้ท้ายปัดให้
 * — แก้ท้ายปัด: หมุนสวนทางที่ท้ายไถล = ขีดเปลี่ยนเป็นทิศเพลาหลัง + เผื่อนิดหน่อย (สวนได้พอดี ไม่สุดล็อก)
 * — กันหมุนเกิน: รถหันเร็วกว่าที่ยางพาเลี้ยวได้ → ลดขีดลง (กันรถสะบัดกลับตอนท้ายเกาะคืน)
 * — คีย์บอร์ดรับท้ายปัด: ปุ่มค่อย ๆ ผ่อนไม่ได้ เมื่อท้ายไถลเกินจุดเกาะขณะยังกดเลี้ยวเข้า → ส่งพวงมาลัยให้การคืนตัวช่วยสวนแทนจนท้ายเกาะคืน
 * ทั้งหมดเขียนใหม่เองจากแนวคิดของ AC Advanced Gamepad Assist (MIT) ที่เกมจำลองหลายเกมใช้
 *
 * ทิศ: บวก = ขวา ทั้งพวงมาลัย มุมล้อ ความเร็วด้านข้าง (vy) และอัตราหัน (r)
 */

/** ค่าปรับของตัวช่วย: แรงคืนตัว/แก้ท้ายปัด · หน่วงการหมุน · เผื่อมุมลื่น (ลบ = เผื่อหน้าดื้อไว้ ปลอดภัยขึ้น) · มุมสวนได้มากสุด (เรเดียน) */
export type SteerTune = { selfSteer: number; damping: number; margin: number; maxSelf: number };

const DEG = Math.PI / 180;
/** ชุดค่าสำเร็จรูป: นิ่ง (มือใหม่) · สมดุล · หลวม (ท้ายปัดง่าย แก้เองมากขึ้น) */
export const STEER_TUNE = {
  stable: { selfSteer: 0.85, damping: 0.9, margin: -0.04, maxSelf: 30 * DEG },
  balanced: { selfSteer: 0.5, damping: 0.5, margin: 0, maxSelf: 25 * DEG },
  loose: { selfSteer: 0.3, damping: 0.3, margin: 0.05, maxSelf: 8 * DEG },
} satisfies Record<string, SteerTune>;

/** หน่วยความจำของตัวช่วย (เก็บในรถ) */
export type SteerMem = {
  /** ทางลาดของปุ่ม −1..1 · คำสั่งพวงมาลัยหลังเกลี่ย −1..1 · คืนตัวเอง (เรเดียน) · ขีดเลี้ยว (เรเดียน) · รับท้ายปัด/สวนอยู่ 0..1 */
  kb: number;
  cmd: number;
  self: number;
  lim: number;
  slide: number;
  counter: number;
};
export const newSteerMem = (lock: number): SteerMem => ({ kb: 0, cmd: 0, self: 0, lim: lock, slide: 0, counter: 0 });

/** สภาพรถที่ตัวช่วยต้องรู้ */
export type SteerCar = {
  /** ความเร็วตามยาว/ด้านข้างของตัวรถ (ม./วิ) · อัตราหัน (เรเดียน/วิ) */
  v: number;
  vy: number;
  r: number;
  /** ระยะจุดศูนย์ถ่วงถึงเพลาหน้า/หลัง · ฐานล้อ (ม.) · มุมล้อสุดล็อก · มุมลื่นที่ยางหน้าเกาะสูงสุด (เรเดียน) · แรงเหวี่ยงที่ยางรับได้ (ม./วิ²) */
  a: number;
  b: number;
  L: number;
  lock: number;
  peak: number;
  aMax: number;
};

/** เวลาหมุนปุ่มจากกลางถึงขีด / คืนกลาง (วินาที) */
export const KEY_RISE_S = 0.22;
export const KEY_RETURN_S = 0.14;
/** ปุ่ม: ช้า ๆ หมุนเข้าเร็วกว่าปกติ · เร็ว ๆ ช้ากว่า (รถล้อเปิด) — ไล่ระหว่าง 60 กับ 200 กม./ชม. */
const KEY_LOW = { v: 60 / 3.6, rate: 1.3 };
const KEY_HIGH = { v: 200 / 3.6, rate: 0.8 };
/** ความไวของขั้นเกลี่ย (ต่อวินาที): ปุ่ม · สติ๊ก */
const SMOOTH_KEY = 16;
const SMOOTH_PAD = 12;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toward = (x: number, target: number, rate: number, dt: number) => x + (target - x) * Math.min(1, rate * dt);
const ease = (x: number) => x * x * (3 - 2 * x);

/** ปุ่มหมุนเข้าเร็วแค่ไหนที่ความเร็วนี้ (คูณกับอัตราปกติ) */
export function keyRate(speed: number) {
  const t = clamp01((speed - KEY_LOW.v) / (KEY_HIGH.v - KEY_LOW.v));
  return KEY_LOW.rate * (KEY_HIGH.rate / KEY_LOW.rate) ** t;
}

/** เส้นโค้งคืนตัว: มุมล้อตามมุมที่เพลาหลังวิ่ง — มุมน้อยตอบเบา มุมมากตอบเต็ม · ไม่เกินมุมสวนสูงสุด */
export function selfSteerAngle(rear: number, tune: SteerTune, lock: number) {
  const resp = tune.selfSteer * 0.5 + 0.12;
  const exp = 2 - Math.log10(10 * (resp * 0.9 + 0.1));
  const R = 72 * DEG;
  const raw = Math.sign(rear) * Math.min(1, Math.abs(rear) / R) ** exp * R;
  const cap = Math.min(lock, tune.maxSelf);
  return clamp(raw, -cap, cap);
}

/**
 * แกนพวงมาลัยจากผู้เล่น (ปุ่ม −1/0/1 หรือสติ๊ก −1..1) → มุมล้อหน้า (เรเดียน) หนึ่งขั้นเวลา
 */
export function assistSteer(m: SteerMem, raw: number, device: "key" | "pad", car: SteerCar, tune: SteerTune, dt: number): number {
  const speed = Math.hypot(car.v, car.vy);
  const key = device === "key";

  // 1) ปุ่ม: ทางลาดเส้นตรง (คืนกลางเร็วกว่า) · สติ๊ก: ใช้ค่าตรง ๆ
  let target = raw;
  if (key) {
    const dir = Math.sign(raw);
    const centring = Math.abs(m.kb) - Math.sign(m.kb) * dir > 0;
    const rate = centring ? 1.5 / KEY_RETURN_S : keyRate(speed) / KEY_RISE_S;
    m.kb += clamp(dir - m.kb, -rate * dt, rate * dt);
    target = m.kb;
  } else m.kb = 0;
  // 2) เกลี่ยอีกชั้น (ปุ่ม: ต่อจากทางลาด = โค้งตัว S) · คืนกลางเร็วกว่าหมุนเข้า
  const back = Math.sign(target) !== Math.sign(m.cmd) || Math.abs(target) < Math.abs(m.cmd);
  m.cmd = toward(m.cmd, clamp(target, -1, 1), (key ? SMOOTH_KEY : SMOOTH_PAD) * (back ? 1.5 : 1), dt);
  const cmd = m.cmd;
  const s = Math.sign(cmd);

  // ทิศที่เพลาหน้า/หลังวิ่งจริงเทียบหัวรถ
  const u = Math.max(Math.abs(car.v), 1);
  const vFront = car.vy + car.a * car.r;
  const vRear = car.vy - car.b * car.r;
  const front = Math.atan2(vFront, u);
  const rear = Math.atan2(vRear, u);
  // ความเร็วต่ำ: พวงมาลัยตรงถึงล้อ (จอด/ออกตัว)
  const k = car.L / 2.5;
  const fade = clamp01((Math.hypot(car.v, vFront) - 2 * k) / (4 * k));
  const mid = clamp01((speed - 10 * k) / (10 * k));

  // 3) คืนตัวเอง: ล้อหันตามทิศเพลาหลัง + หน่วงการหมุน
  const damp = -car.r * (tune.damping * 0.5 + 0.12) * 0.15 * 30 * DEG;
  m.self = toward(m.self, selfSteerAngle(rear, tune, car.lock) + damp, 7, dt);
  const self = clamp(m.self, -car.lock, car.lock) * fade;

  // 4) ขีดเลี้ยว: ยางหน้าที่มุมลื่น ~95% ของจุดเกาะสุด เทียบทิศเพลาหน้า
  const slip = car.peak * (0.95 - (tune.selfSteer - 0.5) * 0.04 + tune.margin);
  // กันหมุนเกิน: หันเข้าเร็วกว่าที่ยางพาไปได้ → ลดขีด
  const yawMax = (1.1 * car.aMax) / Math.max(5, speed);
  const yawExcess = (Math.max(0, s * car.r - yawMax) * car.L) / Math.max(5, speed);
  const inward = slip + s * front - 2.5 * yawExcess;
  // สวนท้ายปัด (เลี้ยวไปทางที่ท้ายไถลไป): ขีด = ทิศเพลาหลัง + เผื่อ (แต่ไม่เกินขีดปกติ)
  const counterNow = cmd !== 0 && s === Math.sign(vRear) ? ease(clamp01((Math.abs(rear) - 4.5 * DEG) / (5.5 * DEG))) : 0;
  m.counter = toward(m.counter, counterNow, counterNow < m.counter ? 4 : 12, dt);
  const counterLim = Math.min(slip * ((1 - tune.selfSteer) * 0.14 + 0.17) + s * rear, inward);
  const want = lerp(clamp(inward, 0, car.lock), clamp(counterLim, 0, car.lock), m.counter * mid);
  m.lim = toward(m.lim, want, 11, dt);
  // วิ่งขวาง/ถอยหลัง: ไม่จำกัด
  const sideways = Math.sin(clamp((Math.atan2(Math.abs(car.vy), car.v) * 2) / 3, 0, Math.PI / 2)) ** 16;
  const lim = lerp(m.lim, car.lock, sideways);

  // 5) คีย์บอร์ดรับท้ายปัด: ท้ายไถลออกเกินจุดเกาะขณะยังกดเลี้ยวเข้า → ส่งให้การคืนตัวสวนแทน
  const out = key && cmd !== 0 && s !== Math.sign(vRear) ? ease(clamp01((Math.abs(rear) - car.peak) / (0.5 * car.peak))) : 0;
  m.slide = toward(m.slide, out, out < m.slide ? 6 : 12, dt);
  const slide = m.slide * mid;

  const assisted = cmd * lim * (1 - slide) + self - Math.abs(cmd) * self * (1 - slide);
  return clamp(lerp(cmd * car.lock, assisted, fade), -car.lock, car.lock);
}
