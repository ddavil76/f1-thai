/**
 * รถของผู้เล่นในโหมดนักขับ: กดคันเร่ง/เบรกเอง รถวิ่งตาม racing line
 * — เร็วเกินที่โค้งรับไหว = ไถลออกนอกไลน์ เสียความเร็ว และถ้าเกินมากรอบนั้นไม่นับ
 * จำลองแบบขั้นเวลาคงที่ (ผลเหมือนเดิมทุกเครื่อง ไม่ขึ้นกับเฟรมเรต)
 */
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
/**
 * สมรรถนะรถ: accel/grip/top = ตัวคูณแรงเร่ง/การเกาะถนน/ความเร็วสูงสุด
 * ส่วนที่เหลือ (ไม่ใส่ = 1) ใช้กับการ์ดอัปเกรดของโหมดกลยุทธ์: brake = แรงเบรก · regen = ชาร์จแบต · cap = ความจุแบต
 * ot = แรงของ Overtake · tow = แรงลมดูด · otGrip = เกาะถนนเพิ่มตอนใช้ Overtake
 */
export type Perf = { accel: number; grip: number; top: number; brake?: number; regen?: number; cap?: number; ot?: number; tow?: number; otGrip?: number };

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
};

export type LapResult = { lap: number; time: number; valid: boolean; trace: number[] };
/** off = รอบนี้ไม่นับ (Time Trial) · excursion = หลุดโค้งลงหญ้าหนึ่งครั้ง (ความเร็วตก) */
export type StepEvent = { kind: "slide"; amount: number } | { kind: "off" } | { kind: "excursion" } | { kind: "wall" } | { kind: "lap"; result: LapResult };

export function newCar(t: DriveTrack, at?: { s: number; v: number; lat: number }): CarState {
  const s = at?.s ?? -RUN_UP;
  const c: CarState = { s, v: at?.v ?? sample(t, t.vref, s) * 0.9, slide: 0, t: 0, lapStart: null, invalid: false, trace: [], lap: 0, sm: false, lat: at?.lat ?? 0, energy: 0.6, ot: false, offT: 0, d: 0, psi: 0, steer: 0, slip: 0, out: false };
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
  const limit = laneValue(t, "vlat", c.s, c.lat) * perf.grip * (c.ot ? (perf.otGrip ?? 1) : 1) * (1 - DIRTY_GRIP * (mods?.dirty ?? 0));
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
const WHEELBASE = 3.4;
/** พวงมาลัยหมุนเร็วสุดกี่หน่วยต่อวินาที (ไปทางที่กด · คืนกลาง) — กดปุ่มแล้วล้อค่อย ๆ หัน ไม่กระตุก */
const STEER_IN = 3.2;
const STEER_OUT = 6;
/** หญ้า: เริ่มเมื่อกึ่งกลางรถเลยขอบถนนเท่านี้ (ล้อข้างหนึ่งออก) · ล้อทั้งสี่ออก = รอบไม่นับ/หลุดโค้ง */
const GRASS_AT = 0.3;
const OUT_AT = 1.0;
/** บนหญ้าเกาะได้กี่ส่วน · ชนกำแพงเหลือความเร็วกี่ส่วน */
const GRASS_GRIP = 0.5;
const WALL_KEEP = 0.5;
/** หันออกจากทิศถนนได้มากสุด (กันรถหมุนกลับหลัง) */
const PSI_MAX = 1.2;
/** ครึ่งความกว้างรถ (ม.) — ไว้หยุดที่กำแพง */
const HALF_CAR = 0.95;

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

/** พวงมาลัยที่ผู้ช่วยอยากหมุน: เล็งจุดบนเส้นเป้าหมายข้างหน้า (pure pursuit) · aim = ระยะเยื้องเป้าหมาย (ไม่ใส่ = racing line) */
export function pursuitSteer(t: DriveTrack, c: CarState, grip: number, aim?: number) {
  const look = 5 + c.v * 0.2;
  const target = aim ?? sample(t, t.lineOffset, c.s + look);
  const kc = sample(t, centreKappa(t), c.s);
  const want = Math.atan2(target - c.d, look);
  const kappa = kc / Math.max(0.3, 1 - kc * c.d) + (2 * Math.sin(want - c.psi)) / look;
  return Math.max(-1, Math.min(1, kappa / maxCurvature(c.v, grip, sample(t, t.bank, c.s))));
}

/**
 * ขับอิสระหนึ่งขั้น STEP: เลี้ยวด้วยพวงมาลัยจริง วิ่งได้ทั้งความกว้างถนน — racing line เป็นแค่เส้นแนะนำ
 * — เลี้ยวได้แคบสุดตามแรงเกาะ (เร็วเกินโค้ง = เลี้ยวไม่พอ ออกกว้างลงหญ้าเอง) · หญ้า = ฝืด เกาะน้อย · ล้อทั้งสี่ออก = รอบไม่นับ · สุดที่กำแพง
 * — อัปเดต lat/slide ให้ตรงกับตำแหน่งจริงด้วย (ระบบแข่ง/AI/ออนไลน์อ่านตำแหน่งจาก lat + slide)
 */
export function stepFree(t: DriveTrack, c: CarState, input: Input, perf: Perf, events: StepEvent[] = [], mods?: Mods): StepEvent[] {
  const dt = STEP;
  const wl = sample(t, t.wl, c.s);
  const wr = sample(t, t.wr, c.s);
  const beyond = Math.max(-wl - c.d, c.d - wr);
  const grass = Math.max(0, Math.min(1, (beyond - GRASS_AT) / 0.6));
  const grip = perf.grip * (1 - DIRTY_GRIP * (mods?.dirty ?? 0)) * (1 - (1 - GRASS_GRIP) * grass);

  // พวงมาลัย: ผู้เล่น + ผู้ช่วย (ยิ่งผู้เล่นหมุนเยอะ ผู้ช่วยยิ่งปล่อย) · aim = รถเลี้ยวเองทั้งหมด
  const own = Math.max(-1, Math.min(1, input.steer ?? 0));
  let want = own;
  if (input.aim !== undefined) want = pursuitSteer(t, c, grip, input.aim);
  else if (input.assist) want = Math.max(-1, Math.min(1, own + input.assist * (1 - Math.abs(own)) * pursuitSteer(t, c, grip)));
  const rate = Math.abs(want) > Math.abs(c.steer) && Math.sign(want) === Math.sign(c.steer || want) ? STEER_IN : STEER_OUT;
  c.steer += Math.sign(want - c.steer) * Math.min(Math.abs(want - c.steer), rate * dt);

  // ความโค้งที่ล้อพาไป (จำกัดด้วยแรงเกาะ) · ยิ่งใช้แรงเกาะเต็ม ยางยิ่งถูเสียความเร็ว
  const bank = sample(t, t.bank, c.s);
  const kmax = maxCurvature(c.v, grip, bank);
  const kappa = c.steer * kmax;
  const use = (Math.abs(kappa) * c.v * c.v) / Math.max(1, gripAccel(c.v, grip, bank));
  c.slip = Math.max(0, Math.min(1, (use - 0.85) / 0.15)) * Math.min(1, c.v / 25);
  longitudinal(t, c, input, perf, mods, grass, 1.6 * use * use);
  if (c.slip > 0) events.push({ kind: "slide", amount: c.slip * 0.1 });

  // เดินรถในพิกัดถนน: s ตามเส้นกลาง · d เยื้องข้าง · psi ทิศเทียบถนน
  const kc = sample(t, centreKappa(t), c.s);
  const sDot = (c.v * Math.cos(c.psi)) / Math.max(0.3, 1 - kc * c.d);
  c.psi += (kappa * c.v - kc * sDot) * dt;
  c.psi = Math.max(-PSI_MAX, Math.min(PSI_MAX, c.psi));
  c.d += c.v * Math.sin(c.psi) * dt;

  // กำแพง: หยุดที่ขอบ runoff · ความเร็วหาย · หัวรถดีดกลับเข้าหาถนน
  const wallL = -wl - t.runoff + HALF_CAR;
  const wallR = wr + t.runoff - HALF_CAR;
  if (c.d < wallL || c.d > wallR) {
    const side = c.d > wallR ? 1 : -1;
    c.d = side > 0 ? wallR : wallL;
    if (Math.sign(c.psi) === side) {
      c.v *= 1 - (1 - WALL_KEEP) * Math.min(1, Math.abs(Math.sin(c.psi)) * 4);
      c.psi = -c.psi * 0.3;
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

  advanceCar(t, c, sDot * dt, events);
  syncLat(t, c);
  return events;
}

/** ตำแหน่งในหน่วยเลน (ไว้ให้ระบบแข่ง: ลมดูด การบัง กันชนท้าย) + ส่วนที่เหลือเป็น slide → lat/slide ชี้ตำแหน่งจริง (d) เป๊ะ */
export function syncLat(t: DriveTrack, c: CarState) {
  c.lat = Math.max(-1, Math.min(1, (c.d - sample(t, t.lineOffset, c.s)) / LANE_GAP));
  c.slide = c.d - laneValue(t, "offset", c.s, c.lat);
}

/** คันเร่ง/เบรก หนึ่งขั้น: Straight Mode · แบตเตอรี่ · ความเร็วสูงสุด · ความชัน → คืนแรงเร่งของเครื่องตอนนี้
 *  grass = ส่วนของรถที่อยู่บนหญ้า (0..1: เร่งได้น้อย ฝืดมาก) · scrub = ยางถูกเบียดตอนเลี้ยว (ม./วิ²) */
function longitudinal(t: DriveTrack, c: CarState, input: Input, perf: Perf, mods?: Mods, grass = 0, scrub = 0): number {
  const dt = STEP;
  const v = c.v;
  // Straight Mode: เปิดได้เฉพาะในโซน ปิดเองเมื่อเบรกหรือพ้นโซน
  c.sm = !!input.sm && !input.brake && t.smZone[Math.floor((((c.s / DS) % t.n) + t.n) % t.n)] === 1;
  // Overtake: แบตเตอรี่เสริมตอนกดคันเร่ง · ชาร์จคืนตอนเบรก/ปล่อยคันเร่ง
  c.ot = !!input.ot && input.throttle && !input.brake && c.energy > 0;
  // ความจุแบตมากขึ้น = ใช้ได้นานขึ้น (แบตยังนับ 0..1)
  if (c.ot) c.energy = Math.max(0, c.energy - (OT_DRAIN / (perf.cap ?? 1)) * dt);
  else if (input.brake) c.energy = Math.min(1, c.energy + ((REGEN_BRAKE * (perf.regen ?? 1)) / (perf.cap ?? 1)) * dt);
  else if (!input.throttle) c.energy = Math.min(1, c.energy + ((REGEN_LIFT * (perf.regen ?? 1)) / (perf.cap ?? 1)) * dt);
  // ความเร็วสูงสุดตามแรงต้าน: ปีกพับ · ลมดูด · แบตเตอรี่เสริม
  const otPow = perf.ot ?? 1;
  const vtop = (c.sm ? VSM : VMAX) * (1 + TOW_TOP * (perf.tow ?? 1) * (mods?.tow ?? 0) + (c.ot ? OT_TOP * otPow : 0) + (mods?.boost ?? 0));
  // ขึ้นเนิน = แรงโน้มถ่วงดึงถอยหลัง · ลงเนิน = ไหลเร็วขึ้น
  const drive = accelFor(v, vtop) * perf.accel + (c.ot ? OT_ACCEL * otPow : 0) + (mods?.boost ?? 0) * 30;
  const a = -scrub - grass * (3 + 0.1 * v) + (input.brake ? -brakeAt(v) * (perf.brake ?? 1) : input.throttle ? drive * (1 - 0.55 * grass) : -(c.sm ? coastSM(v) : coastAt(v))) - G * sample(t, t.grade, c.s);
  // ความเร็วสูงสุด: พับปีกกลับ/หมดลมดูดขณะเร็วกว่า → ลดลงเองทีละน้อย (ไม่ชนกำแพงความเร็ว)
  const top = vtop * perf.top;
  const next = v + a * dt;
  c.v = Math.max(0, next > top ? Math.max(top, Math.min(next, v - SM_BLEED * dt)) : next);
  return drive;
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
