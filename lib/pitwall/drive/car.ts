/**
 * รถของผู้เล่นในโหมดนักขับ: กดคันเร่ง/เบรกเอง รถวิ่งตาม racing line
 * — เร็วเกินที่โค้งรับไหว = ไถลออกนอกไลน์ เสียความเร็ว และถ้าเกินมากรอบนั้นไม่นับ
 * จำลองแบบขั้นเวลาคงที่ (ผลเหมือนเดิมทุกเครื่อง ไม่ขึ้นกับเฟรมเรต)
 */
import { assistSteer, newSteerMem, STEER_TUNE, type SteerMem, type SteerTune } from "./steerAssist";
import { SURFACES, surfaceOf } from "./surface";
import { accelFor, ALAT, brakeAt, coastAt, coastSM, DOWNFORCE, DS, G, LANE_GAP, laneValue, laneZone, sample, SM_BLEED, VMAX, VSM, type DriveTrack } from "./line";

export const STEP = 1 / 120;
/** ระยะเริ่มก่อนเส้นสตาร์ท (เมตร) — วิ่งเข้าเส้นแบบมีความเร็วแล้ว */
export const RUN_UP = 350;
/** เร็วเกินโค้งกี่ % ถึงเริ่มไถล */
const SLIDE_AT = 0.03;
/** เร็วเกินกี่ % ถึงนับว่าหลุดโค้ง (รอบไม่นับ) */
const OFF_AT = 0.1;
/** หลุดโค้ง: เหลือความเร็วกี่ส่วน · กี่วินาทีกว่าจะกลับเข้าถนน */
const OFF_KEEP = 0.55;
const OFF_TIME = 1.5;
/** ระยะบันทึกรถเงา (เมตร) */
export const GHOST_DS = 10;

/**
 * sm = ขอเปิด Straight Mode (เปิดจริงเฉพาะในโซนและไม่ได้เบรก)
 * lane = เลนที่อยากไป (−1 ซ้าย · 0 racing line · 1 ขวา) · ot = กดใช้พลังงานแบตเตอรี่เสริม (Overtake)
 */
export type Input = {
  throttle: boolean;
  brake: boolean;
  sm?: boolean;
  lane?: number;
  ot?: boolean;
  /** ขับอิสระ (stepFree): พวงมาลัย −1 ซ้ายสุด … 1 ขวาสุด · assist = ผู้ช่วยเลี้ยวตาม racing line (0..1) · aim = ระยะเยื้องที่รถเลี้ยวไปเอง (เช่นชิดฝั่งพิท) */
  steer?: number;
  assist?: number;
  aim?: number;
  /** ตัวช่วยการทรงตัว 0..1 (กันล้อฟรี/ล็อก · กันท้ายปัด) — ไม่ใส่ = เท่ากับ assist */
  stab?: number;
  /** ค่าปรับตัวช่วยพวงมาลัย (ไม่ใส่ = สมดุล) */
  tune?: SteerTune;
  /** จอย/พวงมาลัยแบบอนาล็อก: แรงกดคันเร่ง/เบรก 0..1 (ใส่แล้วใช้แทน throttle/brake ในฟิสิกส์) · พวงมาลัยตามมือทันที ไม่ต้องค่อย ๆ หมุนแบบปุ่ม */
  thrA?: number;
  brkA?: number;
  analog?: boolean;
};
/** ผลจากรถคันอื่น: tow = ลมดูดจากคันหน้า (0..1) · dirty = อากาศเสียในโค้ง (0..1) · boost = แรงเสริมตอนแซง (ส่วนของความเร็วสูงสุด) */
export type Mods = { tow: number; dirty: number; boost?: number };

/** เปลี่ยนเลนได้เร็วสุดกี่เลนต่อวินาที (1 เลน = LANE_GAP ม.) */
export const LANE_RATE = 1.1;
/** แบตเตอรี่: ใช้ Overtake หมดถังในกี่วินาที · แรงเร่งเพิ่ม (ม./วิ²) · ความเร็วสูงสุดเพิ่ม */
const OT_DRAIN = 1 / 4.5;
export const OT_ACCEL = 3.6;
const OT_TOP = 0.05;
/** ชาร์จคืนตอนเบรก/ปล่อยคันเร่ง (ต่อวินาที) */
const REGEN_BRAKE = 0.2;
const REGEN_LIFT = 0.035;
/** ลมดูดเพิ่มความเร็วสูงสุดได้ · อากาศเสียลดการเกาะถนน */
const TOW_TOP = 0.035;
export const DIRTY_GRIP = 0.06;
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
  /** Straight Mode เปิดอยู่ (ปีกพับราบ) */
  sm: boolean;
  /** ตำแหน่งข้าง (เลน −1..1) */
  lat: number;
  /** แบตเตอรี่ 0..1 · ot = กำลังใช้ Overtake */
  energy: number;
  ot: boolean;
  /** เวลาที่เหลือของการหลุดโค้งครั้งล่าสุด (ล้อลงหญ้า กำลังกลับเข้าถนน) */
  offT: number;
  /** ขับอิสระ: ระยะเยื้องจากเส้นกลาง (ม., บวก = ขวา) · ทิศรถเทียบทิศถนน (เรเดียน, บวก = หันขวา) · พวงมาลัยตอนนี้ · ยางใกล้หลุดเกาะ (0..1) · ล้อทั้งสี่ออกนอกถนน */
  d: number;
  psi: number;
  steer: number;
  slip: number;
  out: boolean;
  /** ฟิสิกส์ขับอิสระ: ความเร็วด้านข้างของตัวรถ (ม./วิ, บวก = ไถลไปขวา) · อัตราหันของตัวรถ (เรเดียน/วิ, บวก = หันขวา)
   *  · คันเร่ง/เบรกที่กดจริง (0..1 ค่อย ๆ ขึ้นลง) · ล้อหลังฟรี/ล้อล็อก (0..1 ไว้ทำเสียง/ควัน) · มุมไถลของตัวรถ (เรเดียน) */
  vy: number;
  r: number;
  thr: number;
  brk: number;
  spin: number;
  lock: number;
  beta: number;
  /** มุมล้อหน้าจริง (เรเดียน) · หน่วยความจำตัวช่วยพวงมาลัย (sa.cmd = คำสั่งพวงมาลัยของผู้เล่นหลังเกลี่ย −1..1) */
  delta: number;
  sa: SteerMem;
  /** ล้ออยู่บนขอบทางกี่ส่วน (0 · 0.5 · 1) · ความขรุขระใต้ล้อ 0..1 (สั่น/เสียง) · ยางหน้า/หลังเลยจุดเกาะ 0..1 (ควัน/รอยล้อ) */
  kerb: number;
  rough: number;
  slipF: number;
  slipR: number;
};

export type LapResult = { lap: number; time: number; valid: boolean; trace: number[] };
/** off = รอบนี้ไม่นับ (Time Trial) · excursion = หลุดโค้งลงหญ้าหนึ่งครั้ง (ความเร็วตก) */
export type StepEvent = { kind: "slide"; amount: number } | { kind: "off" } | { kind: "excursion" } | { kind: "wall" } | { kind: "lap"; result: LapResult };

export function newCar(t: DriveTrack, at?: { s: number; v: number; lat: number }): CarState {
  const s = at?.s ?? -RUN_UP;
  const c: CarState = { s, v: at?.v ?? sample(t, t.vref, s) * 0.9, slide: 0, t: 0, lapStart: null, invalid: false, trace: [], lap: 0, sm: false, lat: at?.lat ?? 0, energy: 0.6, ot: false, offT: 0, d: 0, psi: 0, steer: 0, slip: 0, out: false, vy: 0, r: 0, thr: 0, brk: 0, spin: 0, lock: 0, beta: 0, delta: 0, sa: newSteerMem(0.35), kerb: 0, rough: 0, slipF: 0, slipR: 0 };
  c.d = laneValue(t, "offset", s, c.lat);
  return c;
}

/** เดินหน้าหนึ่งขั้น STEP · คืนเหตุการณ์ที่เกิด (ไถล, หลุดโค้ง, จบรอบ) */
export function stepCar(t: DriveTrack, c: CarState, input: Input, perf: Perf, events: StepEvent[] = [], mods?: Mods): StepEvent[] {
  const dt = STEP;
  // เปลี่ยนเลน: เลื่อนไปทางเลนเป้าหมายทีละน้อย
  const want = Math.max(-1, Math.min(1, input.lane ?? c.lat));
  c.lat += Math.sign(want - c.lat) * Math.min(Math.abs(want - c.lat), LANE_RATE * dt);
  const drive = longitudinal(t, c, input, perf, mods);
  // เร็วเกินโค้ง → ไถลออกนอกไลน์และเสียความเร็ว (อากาศเสียจากคันหน้าทำให้เกาะถนนน้อยลง)
  const limit = laneValue(t, "vlat", c.s, c.lat) * perf.grip * (1 - DIRTY_GRIP * (mods?.dirty ?? 0));
  const over = c.v / limit - 1;
  if (over > SLIDE_AT) {
    const curve = laneValue(t, "curve", c.s, c.lat);
    // ไถลออกด้านนอกโค้ง (ตรงข้ามกับทิศเลี้ยว)
    c.slide = Math.max(-9, Math.min(9, c.slide - Math.sign(curve) * over * 60 * dt));
    c.v = Math.max(limit * 0.8, c.v - over * 140 * dt);
    if (over > OFF_AT && c.lapStart !== null && !c.invalid) {
      c.invalid = true;
      events.push({ kind: "off" });
    }
    // เร็วเกินมาก = หลุดโค้งลงหญ้า: ความเร็วหายไปเกือบครึ่ง แล้วค่อย ๆ กลับเข้าถนน (กดคันเร่งค้างเข้าโค้งไม่รอด)
    if (over > OFF_AT && c.offT <= 0) {
      c.v *= OFF_KEEP;
      c.offT = OFF_TIME;
      c.slide = Math.max(-9, Math.min(9, c.slide - Math.sign(curve) * 4));
      events.push({ kind: "excursion" });
    }
    events.push({ kind: "slide", amount: over });
  }
  if (c.offT > 0) {
    c.offT -= dt;
    // บนหญ้า: เร่งได้น้อย
    if (input.throttle) c.v = Math.max(0, c.v - drive * 0.6 * dt);
  } else if (over <= SLIDE_AT) {
    // ค่อย ๆ กลับเข้าไลน์
    c.slide -= Math.sign(c.slide) * Math.min(Math.abs(c.slide), 3 * dt);
  }

  // v = ความเร็วจริงบน racing line · s นับตามเส้นกลาง (ในโค้งด้านใน 1 ม. ของไลน์ = มากกว่า 1 ม. ของเส้นกลาง)
  advanceCar(t, c, (c.v * dt) / Math.max(0.2, laneValue(t, "stretch", c.s, c.lat)), events);
  c.d = laneValue(t, "offset", c.s, c.lat) + c.slide;
  c.psi = 0;
  c.steer = 0;
  return events;
}

/** มุมเลี้ยวล้อหน้าสูงสุด (เรเดียน) · ฐานล้อ (ม.) — ความเร็วต่ำเลี้ยววงแคบสุดได้เท่านี้ */
const MAX_LOCK = 0.35;
export const WHEELBASE = 3.4;
/** แร็กพวงมาลัยหมุนล้อได้เร็วสุด (เรเดียน/วิ) */
const RACK_RATE = 3;
/** ครึ่งระยะล้อซ้าย-ขวา (ม.) · ล้อทั้งสี่ออกนอกถนน (กึ่งกลางรถเลยขอบเท่านี้) = รอบไม่นับ/หลุดโค้ง */
const TRACK_HALF = 0.8;
const OUT_AT = 1.0;
/** ชนกำแพงเหลือความเร็วกี่ส่วน */
const WALL_KEEP = 0.5;
/** หันออกจากทิศถนนได้มากสุด (กันรถหมุนกลับหลัง) */
const PSI_MAX = 1.2;
/** ครึ่งความกว้างรถ (ม.) — ไว้หยุดที่กำแพง */
const HALF_CAR = 0.95;

/*
 * ฟิสิกส์ขับอิสระ (โมเดลรถสองเพลา): ยางหน้า/หลังสร้างแรงข้างตามมุมลื่น (สูตร "magic formula" แบบย่อ)
 * แรงเกาะของแต่ละเพลาตามน้ำหนักที่กด (เบรก = น้ำหนักไปหน้า · เร่ง = ไปหลัง) + แรงกดอากาศ
 * ยางมีแรงรวมจำกัด (วงรีแรงเสียดทาน): เบรก/เร่งหนักขณะเลี้ยว = แรงข้างเหลือน้อย → หน้าดื้อ/ท้ายปัด
 * คิดย่อย SUB ครั้งต่อ STEP (120 × 4 = 480 ครั้งต่อวินาที) ให้ยางตอบสนองไวโดยยังนิ่ง
 */
const SUB = 4;
const H = STEP / SUB;
/** ระยะจุดศูนย์ถ่วงถึงเพลาหน้า/หลัง (ม.) · ความสูงจุดศูนย์ถ่วง · รัศมีไจเรชันกำลังสอง (โมเมนต์ความเฉื่อยหมุนรอบแกนตั้ง ÷ มวล) */
const CG_F = 1.6;
const CG_R = WHEELBASE - CG_F;
const HCG = 0.2;
const YAW_K2 = 1.6;
/** ยาง: มุมลื่นที่ได้แรงสูงสุด (เรเดียน) · รูปโค้ง (C > 1 = เลยจุดสูงสุดแล้วแรงตก ไถลต่อเนื่อง) */
export const ALPHA_PEAK = 0.1;
const MF_C = 1.35;
const MF_B = Math.tan(Math.PI / (2 * MF_C)) / ALPHA_PEAK;
/** แรงเกาะของแต่ละเพลาเทียบกับโมเดล racing line (เผื่อนิดหน่อย ให้ขับตามเส้นอ้างอิงได้จริง · หลังมากกว่าหน้า = หน้าดื้อนิด ๆ นิ่งกว่า) */
const AXLE_F = 1.08;
const AXLE_R = 1.13;
/** ล้อฟรี/ล็อก: แรงข้างเหลือกี่ส่วน */
const SLIDE_KEEP = 0.35;
/** คันเร่ง/เบรกจากปุ่ม: ขึ้น/ลงเร็วแค่ไหน (ต่อวินาที) — คีย์บอร์ดกดแล้วแรงค่อย ๆ มา ไม่กระชาก */
const THR_UP = 4;
const THR_DOWN = 10;
const BRK_UP = 6;
const BRK_DOWN = 12;
/** มุมไถลของตัวรถที่นับว่า "หมุน" (เรเดียน) — เกินนี้รถเสียความเร็วและค่อย ๆ หยุดหมุน */
const BETA_SPIN = 0.5;

const magic = (a: number) => Math.sin(MF_C * Math.atan(MF_B * a));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const centreCurve = new WeakMap<DriveTrack, Float64Array>();
/** ความโค้งของเส้นกลางถนน (1/ม., บวก = เลี้ยวขวา) — t.curve เป็นของ racing line */
function centreKappa(t: DriveTrack) {
  let k = centreCurve.get(t);
  if (k) return k;
  const n = t.n;
  k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = t.heading[(i - 1 + n) % n];
    const b = t.heading[(i + 1) % n];
    k[i] = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / (2 * DS);
  }
  for (let p = 0; p < 3; p++) {
    const m = new Float64Array(n);
    for (let i = 0; i < n; i++) m[i] = 0.25 * k[(i - 1 + n) % n] + 0.5 * k[i] + 0.25 * k[(i + 1) % n];
    k = m;
  }
  centreCurve.set(t, k);
  return k;
}

/** แรงเหวี่ยงที่ยางรับได้ (ม./วิ²) ที่ความเร็ว v — สูตรเดียวกับที่ใช้คิดความเร็วในโค้งของ racing line (โค้งเอียงช่วยเพิ่ม) */
export const gripAccel = (v: number, grip: number, bank = 0) => (ALAT + G * Math.sin(Math.abs(bank)) + DOWNFORCE * (v / VMAX) ** 2) * grip;

/** เลี้ยวได้วงแคบสุดเท่าไร (ความโค้ง 1/ม.) ที่ความเร็วนี้ — จำกัดทั้งมุมล้อและแรงเกาะ */
export function maxCurvature(v: number, grip: number, bank = 0) {
  const geo = Math.tan(MAX_LOCK) / WHEELBASE;
  return Math.min(geo, gripAccel(v, grip, bank) / Math.max(1, v * v));
}

/** มุมล้อที่ผู้ช่วยขับตามเส้นอยากหมุน (เรเดียน): เล็งจุดบนเส้นเป้าหมายข้างหน้า (pure pursuit) · aim = ระยะเยื้องเป้าหมาย (ไม่ใส่ = racing line) */
export function pursuitDelta(t: DriveTrack, c: CarState, aim?: number) {
  const look = 5 + c.v * 0.2;
  const target = aim ?? sample(t, t.lineOffset, c.s + look);
  const kc = sample(t, centreKappa(t), c.s);
  const want = Math.atan2(target - c.d, look);
  // ทิศที่รถวิ่งจริง = ทิศหัวรถ + มุมไถล
  const kappa = kc / Math.max(0.3, 1 - kc * c.d) + (2 * Math.sin(want - c.psi - c.beta)) / look;
  // มุมล้อที่ต้องใช้ = มุมเรขาคณิต + ชดเชยอัตราหันที่ยังไม่ทัน (หน่วงการแกว่ง)
  const yawErr = c.v > 5 ? (kappa * c.v - c.r) * 0.06 : 0;
  return clamp(Math.atan(WHEELBASE * kappa) + yawErr, -MAX_LOCK, MAX_LOCK);
}

/**
 * ขับอิสระหนึ่งขั้น STEP: เลี้ยวด้วยพวงมาลัยจริง วิ่งได้ทั้งความกว้างถนน — racing line เป็นแค่เส้นแนะนำ
 * — ฟิสิกส์ยางหน้า/หลัง (ดูด้านบน): เร็วเกินโค้ง = หน้าดื้อออกกว้าง · เร่งแรงในโค้ง = ท้ายปัด · เบรกขณะเลี้ยว = เลี้ยวได้น้อยลง
 * — stab = ตัวช่วยการทรงตัว (กันล้อฟรี/ล็อก + กันท้ายปัด) 0..1 (ไม่ใส่ = ตาม assist)
 * — หญ้า = ฝืด เกาะน้อย · ล้อทั้งสี่ออก = รอบไม่นับ · สุดที่กำแพง
 * — อัปเดต lat/slide ให้ตรงกับตำแหน่งจริงด้วย (ระบบแข่ง/AI/ออนไลน์อ่านตำแหน่งจาก lat + slide)
 */
export function stepFree(t: DriveTrack, c: CarState, input: Input, perf: Perf, events: StepEvent[] = [], mods?: Mods): StepEvent[] {
  const dt = STEP;
  const wl = sample(t, t.wl, c.s);
  const wr = sample(t, t.wr, c.s);
  const beyond = Math.max(-wl - c.d, c.d - wr);
  // ผิวใต้ล้อซ้าย/ขวา: ถนน · ขอบทาง · หญ้า · กรวด (เฉลี่ยสองฝั่ง)
  const sl = SURFACES[surfaceOf(t, c.s, c.d - TRACK_HALF)];
  const sr = SURFACES[surfaceOf(t, c.s, c.d + TRACK_HALF)];
  const off = ((sl.drag > 0.5 ? 0.5 : 0) + (sr.drag > 0.5 ? 0.5 : 0));
  c.kerb = (sl.rough === 1 ? 0.5 : 0) + (sr.rough === 1 ? 0.5 : 0);
  c.rough = (sl.rough + sr.rough) / 2;
  const grass = off;
  const grip = perf.grip * (1 - DIRTY_GRIP * (mods?.dirty ?? 0)) * ((sl.grip + sr.grip) / 2);
  const surfDrag = (sl.drag + sr.drag) / 2;
  const bank = sample(t, t.bank, c.s);

  // พวงมาลัย: ปุ่ม/สติ๊กผ่านตัวช่วยพวงมาลัย (steerAssist.ts) → มุมล้อ · assist = ผู้ช่วยขับตามเส้น (ยิ่งผู้เล่นหมุนเยอะ ยิ่งปล่อย) · aim = รถเลี้ยวเองทั้งหมด
  const own = clamp(input.steer ?? 0, -1, 1);
  const A = gripAccel(c.v, grip, bank);
  let target: number;
  if (input.aim !== undefined) target = pursuitDelta(t, c, input.aim);
  else {
    const car = { v: c.v, vy: c.vy, r: c.r, a: CG_F, b: CG_R, L: WHEELBASE, lock: MAX_LOCK, peak: ALPHA_PEAK, aMax: A };
    target = assistSteer(c.sa, own, input.analog ? "pad" : "key", car, input.tune ?? STEER_TUNE.balanced, dt);
    if (input.assist) target += (pursuitDelta(t, c) - target) * input.assist * (1 - Math.abs(c.sa.cmd));
  }
  c.delta += clamp(target - c.delta, -RACK_RATE * dt, RACK_RATE * dt);
  const delta = c.delta;
  c.steer = delta / MAX_LOCK;

  // คันเร่ง/เบรก: ปุ่มกด → แรงค่อย ๆ ขึ้นลง
  // แกนอนาล็อก (ไกจอย/แป้นเหยียบ) = แรงตามที่กดจริง ขึ้นลงเร็วกว่าปุ่มมาก
  const quick = input.analog ? 3 : 1;
  c.thr = clamp(c.thr + clamp((input.thrA ?? (input.throttle ? 1 : 0)) - c.thr, -THR_DOWN * quick * dt, THR_UP * quick * dt), 0, 1);
  c.brk = clamp(c.brk + clamp((input.brkA ?? (input.brake ? 1 : 0)) - c.brk, -BRK_DOWN * quick * dt, BRK_UP * quick * dt), 0, 1);
  const stab = input.aim !== undefined ? 1 : clamp(input.stab ?? input.assist ?? 0, 0, 1);
  const plan = longPlan(t, c, input, perf, mods, grass, surfDrag);
  const vBefore = c.v;

  const kc = sample(t, centreKappa(t), c.s);
  // แรงที่กดลงพื้นจริง (ไว้คิดการถ่ายน้ำหนัก)
  const zEff = G * (1 + (DOWNFORCE / ALAT) * (c.v / VMAX) ** 2);
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);
  let ds = 0;
  let maxF = 0;
  let maxR = 0;
  let spin = 0;
  let lock = 0;
  for (let k = 0; k < SUB; k++) {
    const vx = c.v;
    // แรงตามยาวที่ขอจากยาง: เครื่องขับล้อหลัง · เบรกแบ่งตามน้ำหนักแต่ละเพลา
    const ax = c.thr * plan.drive * plan.grassF - c.brk * plan.brake;
    const tr = clamp((ax * HCG) / (WHEELBASE * zEff), -0.22, 0.22);
    const Df = A * (CG_R / WHEELBASE - tr) * AXLE_F;
    const Dr = A * (CG_F / WHEELBASE + tr) * AXLE_R;
    const u = Math.max(vx, 4);
    const af = delta - Math.atan((c.vy + CG_F * c.r) / u);
    const ar = -Math.atan((c.vy - CG_R * c.r) / u);
    const fyf0 = Df * magic(af);
    const fyr0 = Dr * magic(ar);
    const fxf0 = ax < 0 ? (ax * Df) / (Df + Dr) : 0;
    const fxr0 = ax < 0 ? (ax * Dr) / (Df + Dr) : ax;
    // วงรีแรงเสียดทาน: ตัวช่วย (TC/ABS) จำกัดแรงตามยาวให้เหลือแรงข้างไว้เลี้ยว
    const axle = (fx0: number, fy0: number, D: number) => {
      const room = D * Math.sqrt(Math.max(0.2, 1 - ((0.85 * fy0) / D) ** 2));
      const cap = D + (room - D) * stab;
      const fx = clamp(fx0, -cap, cap);
      const used = Math.abs(fx) / D;
      return { fx, fy: fy0 * Math.max(SLIDE_KEEP, Math.sqrt(Math.max(0, 1 - used * used))), over: Math.max(0, Math.abs(fx0) / D - 0.94) / 0.3 };
    };
    const F = axle(fxf0, fyf0, Df);
    const R = axle(fxr0, fyr0, Dr);
    if (ax > 0) spin = Math.max(spin, Math.min(1, R.over));
    else if (ax < 0) lock = Math.max(lock, Math.min(1, Math.max(F.over, R.over)));
    maxF = Math.max(maxF, Math.abs(af));
    maxR = Math.max(maxR, Math.abs(ar));

    const fyB = F.fy * cosD + F.fx * sinD;
    let vxDot = R.fx + F.fx * cosD - F.fy * sinD + c.r * c.vy - plan.drag - (1 - c.thr) * (1 - c.brk) * plan.coast;
    let vyDot = fyB + R.fy - c.r * vx;
    let rDot = (CG_F * fyB - CG_R * R.fy) / YAW_K2;
    // ตัวช่วยกันท้ายปัด: หมุนเกินที่ล้อหน้าสั่ง → ดึงกลับ
    const rRef = (vx * Math.tan(delta)) / WHEELBASE;
    if (stab > 0 && Math.abs(c.r) > Math.abs(rRef) && Math.sign(c.r) === Math.sign(c.r - rRef)) rDot -= stab * 25 * (c.r - rRef);
    // หมุน (มุมไถลเกิน): เสียความเร็วและค่อย ๆ หยุดหมุน
    const beta = Math.atan2(c.vy, Math.max(vx, 1));
    if (Math.abs(beta) > BETA_SPIN) {
      vxDot -= 8;
      vyDot -= 3 * c.vy;
      rDot -= 2 * c.r;
      spin = 1;
    }
    c.v = Math.max(0, c.v + vxDot * H);
    c.vy += vyDot * H;
    c.r += rDot * H;
    // ความเร็วต่ำ: ยางไม่ไถล รถเลี้ยวตามล้อ (กันตัวเลขแกว่งตอนเกือบหยุด)
    const w = clamp((c.v - 3) / 5, 0, 1);
    if (w < 1) {
      c.r = w * c.r + (1 - w) * ((c.v * Math.tan(delta)) / WHEELBASE);
      c.vy *= w;
    }
    c.vy = clamp(c.vy, -(0.9 * c.v + 1), 0.9 * c.v + 1);

    // เดินรถในพิกัดถนน: s ตามเส้นกลาง · d เยื้องข้าง · psi ทิศหัวรถเทียบถนน · beta ทิศที่วิ่งจริงเทียบหัวรถ
    c.beta = Math.atan2(c.vy, Math.max(c.v, 0.1));
    const U = Math.hypot(c.v, c.vy);
    const sDot = (U * Math.cos(c.psi + c.beta)) / Math.max(0.3, 1 - kc * c.d);
    c.psi += (c.r - kc * sDot) * H;
    if (Math.abs(c.psi) > PSI_MAX) {
      c.psi = Math.sign(c.psi) * PSI_MAX;
      if (Math.sign(c.r) === Math.sign(c.psi)) c.r = 0;
    }
    c.d += U * Math.sin(c.psi + c.beta) * H;
    ds += sDot * H;
  }
  // ความเร็วสูงสุด: พับปีกกลับ/หมดลมดูดขณะเร็วกว่า → ลดลงเองทีละน้อย
  if (c.v > plan.top) c.v = Math.max(plan.top, Math.min(c.v, vBefore - SM_BLEED * dt));
  c.spin = spin;
  c.lock = lock;
  const over = (a: number) => clamp((a / ALPHA_PEAK - 0.85) / 0.4, 0, 1) * Math.min(1, c.v / 25);
  c.slipF = over(maxF);
  c.slipR = over(maxR);
  c.slip = Math.max(c.slipF, c.slipR, spin * Math.min(1, c.v / 25), lock * Math.min(1, c.v / 25));
  if (c.slip > 0) events.push({ kind: "slide", amount: c.slip * 0.1 });

  // กำแพง: หยุดที่ขอบ runoff · ความเร็วหาย · หัวรถดีดกลับเข้าหาถนน
  const wallL = -wl - t.runoff + HALF_CAR;
  const wallR = wr + t.runoff - HALF_CAR;
  if (c.d < wallL || c.d > wallR) {
    const side = c.d > wallR ? 1 : -1;
    c.d = side > 0 ? wallR : wallL;
    if (Math.sign(c.psi + c.beta) === side) {
      c.v *= 1 - (1 - WALL_KEEP) * Math.min(1, Math.abs(Math.sin(c.psi + c.beta)) * 4);
      c.psi = -c.psi * 0.3;
      c.vy *= 0.2;
      c.r *= 0.2;
      c.beta = 0;
      events.push({ kind: "wall" });
    }
  }

  // ล้อทั้งสี่ออกนอกถนน: นับหลุดโค้งครั้งเดียวต่อการออก · รอบนี้ไม่นับ
  const out = beyond > OUT_AT;
  if (out && !c.out) {
    events.push({ kind: "excursion" });
    if (c.lapStart !== null && !c.invalid) {
      c.invalid = true;
      events.push({ kind: "off" });
    }
  }
  c.out = out;
  c.offT = grass > 0 ? 0.2 : Math.max(0, c.offT - dt);

  advanceCar(t, c, ds, events);
  syncLat(t, c);
  return events;
}

/** ล้างการเคลื่อนที่ด้านข้าง/การหมุน (เข้าพิท ออกพิท วางรถใหม่) */
export function settleCar(c: CarState) {
  c.psi = 0;
  c.steer = 0;
  c.vy = 0;
  c.r = 0;
  c.beta = 0;
  c.delta = 0;
  c.sa = newSteerMem(MAX_LOCK);
}

/** ตำแหน่งในหน่วยเลน (ไว้ให้ระบบแข่ง: ลมดูด การบัง กันชนท้าย) + ส่วนที่เหลือเป็น slide → lat/slide ชี้ตำแหน่งจริง (d) เป๊ะ */
export function syncLat(t: DriveTrack, c: CarState) {
  c.lat = Math.max(-1, Math.min(1, (c.d - sample(t, t.lineOffset, c.s)) / LANE_GAP));
  c.slide = c.d - laneValue(t, "offset", c.s, c.lat);
}

/** แผนแรงตามยาวหนึ่งขั้น: Straight Mode · แบตเตอรี่ · ความเร็วสูงสุด → แรงเครื่อง/เบรก/ประคอง/ต้าน (ม./วิ²)
 *  grass = ส่วนของรถที่อยู่บนหญ้า (0..1: เร่งได้น้อย ฝืดมาก) */
function longPlan(t: DriveTrack, c: CarState, input: Input, perf: Perf, mods?: Mods, grass = 0, drag = grass) {
  const dt = STEP;
  const v = c.v;
  // Straight Mode: เปิดได้เฉพาะในโซน ปิดเองเมื่อเบรกหรือพ้นโซน
  c.sm = !!input.sm && !input.brake && t.smZone[Math.floor((((c.s / DS) % t.n) + t.n) % t.n)] === 1;
  // Overtake: แบตเตอรี่เสริมตอนกดคันเร่ง · ชาร์จคืนตอนเบรก/ปล่อยคันเร่ง
  c.ot = !!input.ot && input.throttle && !input.brake && c.energy > 0;
  if (c.ot) c.energy = Math.max(0, c.energy - OT_DRAIN * dt);
  else if (input.brake) c.energy = Math.min(1, c.energy + REGEN_BRAKE * dt);
  else if (!input.throttle) c.energy = Math.min(1, c.energy + REGEN_LIFT * dt);
  // ความเร็วสูงสุดตามแรงต้าน: ปีกพับ · ลมดูด · แบตเตอรี่เสริม
  const vtop = (c.sm ? VSM : VMAX) * (1 + TOW_TOP * (mods?.tow ?? 0) + (c.ot ? OT_TOP : 0) + (mods?.boost ?? 0));
  const drive = accelFor(v, vtop) * perf.accel + (c.ot ? OT_ACCEL : 0) + (mods?.boost ?? 0) * 30;
  return {
    drive,
    grassF: 1 - 0.55 * grass,
    brake: brakeAt(v),
    coast: c.sm ? coastSM(v) : coastAt(v),
    // หญ้าฝืด · ขึ้นเนิน = แรงโน้มถ่วงดึงถอยหลัง · ลงเนิน = ไหลเร็วขึ้น
    drag: drag * (3 + 0.1 * v) + G * sample(t, t.grade, c.s),
    top: vtop * perf.top,
  };
}

/** คันเร่ง/เบรก หนึ่งขั้น (โหมดเลน/AI) → คืนแรงเร่งของเครื่องตอนนี้ · scrub = ยางถูเบียดตอนเลี้ยว (ม./วิ²) */
function longitudinal(t: DriveTrack, c: CarState, input: Input, perf: Perf, mods?: Mods, grass = 0, scrub = 0): number {
  const v = c.v;
  const p = longPlan(t, c, input, perf, mods, grass);
  const a = -scrub - p.drag + (input.brake ? -p.brake : input.throttle ? p.drive * p.grassF : -p.coast);
  // ความเร็วสูงสุด: พับปีกกลับ/หมดลมดูดขณะเร็วกว่า → ลดลงเองทีละน้อย (ไม่ชนกำแพงความเร็ว)
  const next = v + a * STEP;
  c.v = Math.max(0, next > p.top ? Math.max(p.top, Math.min(next, v - SM_BLEED * STEP)) : next);
  return p.drive;
}

/** เลื่อนรถไปตามสนาม ds เมตร (เส้นกลาง) หนึ่งขั้นเวลา: บันทึกเวลาทุก GHOST_DS เมตร · ข้ามเส้นชัย = จบรอบ (ใช้กับพิทเลนด้วย) */
export function advanceCar(t: DriveTrack, c: CarState, ds: number, events: StepEvent[] = []): StepEvent[] {
  const dt = STEP;
  const before = c.s;
  c.s += ds;
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
 * — corner = ตัวคูณความเร็วช่วงเบรก/โค้ง (ยางเกาะน้อยลง = เข้าโค้งช้าลง) ไม่กระทบทางตรง
 */
export function idealInput(t: DriveTrack, c: CarState, scale = 1, corner = 1): Input {
  return { ...idealPedals(t, c, scale, corner), sm: true };
}

/** ปุ่มที่ควรกดตามเลนที่อยู่ · scale < 1 = ขับช้ากว่าความเร็วอ้างอิง (AI ฝีมือน้อยกว่า) */
function idealPedals(t: DriveTrack, c: CarState, scale = 1, corner = 1): Input {
  const z = laneZone(t, c.s, c.lat);
  const ref = laneValue(t, "vref", c.s, c.lat) * scale * (z === "throttle" ? 1 : corner);
  if (c.v > ref + 0.3) return { throttle: false, brake: z === "brake" || c.v > ref + 3 };
  return { throttle: z === "throttle" || c.v < ref - 1, brake: false };
}

/** สมรรถนะรถตามทีม: ทีมเร็วสุด pace 0 → 1.0 · ทีมช้า ๆ ลดลงเล็กน้อย */
export const perfOf = (pace: number): Perf => ({
  accel: 1 - pace * 0.03,
  grip: 1 - pace * 0.015,
  top: 1 - pace * 0.01,
});
