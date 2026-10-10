/**
 * แข่งกับ AI ในโหมดนักขับ — รถหลายคันบนสนามเดียวกัน ใช้ฟิสิกส์เดียวกับผู้เล่น (car.ts)
 * การแซง:
 *  1) เลน: racing line + เลนซ้าย/ขวา (เลนในโค้ง = ทางสั้นแต่ช้ากว่า) · เปลี่ยนเลนไม่ได้ถ้ามีรถอยู่ข้าง ๆ
 *  2) ลมดูด: ตามหลังใกล้ ๆ บนทางตรง แรงต้านน้อยลง · อากาศเสีย: ตามติดในโค้ง เกาะถนนน้อยลง
 *  3) Overtake: แบตเตอรี่เสริม · ตามหลังไม่เกิน 1 วิ ตอนผ่านจุดวัด (ต้นโซน Straight Mode) ได้พลังงานเพิ่ม
 *  4) ดวลในโค้ง: เคียงกันเข้าโค้ง คันด้านนอกที่ไม่นำครึ่งคันต้องค่อย ๆ ยอม
 * กันชนท้าย: ตามทันคันหน้าในแนวเดียวกัน ความเร็วถูกจำกัดให้ค้างห่าง ~0.2 วินาที — จะผ่านต้อง "แซง"
 *  (ไม่ได้ช่วยเบรกเข้าโค้ง: ตามติดแล้วไม่เบรกเอง = เบรกช้า ชนท้าย เสียความเร็ว)
 * แซง (กติกาเดียวกันทั้งผู้เล่นและ AI): ค้างอยู่ที่ ~0.2 วิ + ทางตรงเหลือพอ + ฝั่งข้างว่างและถนนกว้างพอวิ่งเคียงกัน
 *  → เปลี่ยนเลนขึ้นไปเคียง (ไม่มีแรงเสริมฟรี: ใช้ลมดูดที่พาออกมา + แบต Overtake ที่กดเอง) → พ้นแล้วกลับ racing line
 *  — ถึงจุดเบรกแล้วยังขึ้นไม่ถึงครึ่งคัน = ถอยกลับไปต่อท้าย · AI ป้องกันได้ครั้งเดียวต่อทางตรง
 * หลุดโค้ง (ลงหญ้า ความเร็วตก): เตือน 3 ครั้ง ครั้งต่อไปโดน +5 วินาทีทุกครั้ง
 */
import { idealInput, newCar, perfOf, STEP, stepCar, type CarState, type Input, type Mods, type Perf, type StepEvent } from "./car";
import { DS, laneValue, laneZone, sample, type DriveTrack } from "./line";

/** ความยาวรถ (เมตร) และความกว้างที่ถือว่าชนกัน */
export const CAR_LEN = 5.4;
const CAR_W = 1.9; // ความกว้างรถ (เมตร) — ไว้เทียบรถเคียงข้าง
/** ระยะลมดูด/อากาศเสีย (เมตร) */
const TOW_RANGE = 70;
const DIRTY_RANGE = 22;
/** ได้พลังงานเพิ่มเมื่อผ่านจุดวัดโดยตามหลังไม่เกิน 1 วินาที */
const DETECT_GAP = 1.0;
const DETECT_BONUS = 0.3;
/** กันชนท้าย: ค้างห่างคันหน้า HOLD_GAP วินาที (ไม่ต่ำกว่า HOLD_MIN เมตรระหว่างกึ่งกลางรถ) · HOLD_K = ความแรงของการปรับความเร็ว */
export const HOLD_GAP = 0.2;
const HOLD_MIN = CAR_LEN + 1.5;
const HOLD_K = 2.5;
/** กันชนท้ายลดความเร็วได้ไม่เกินนี้ (ม./วิ²) — มีคันตัดเข้ามาข้างหน้าก็ค่อย ๆ ถอย ไม่เบรกกระชาก */
const HOLD_DECEL = 30;
/** แซงได้เมื่อห่างคันหน้าไม่เกินกี่วินาที · ต้องเหลือทางตรงก่อนจุดเบรกอย่างน้อยกี่เมตร · แซงนานเกินนี้ (วินาที) = ยกเลิก */
const PASS_WINDOW = HOLD_GAP + 0.08;
const PASS_STRAIGHT = 250;
const PASS_TIMEOUT = 12;
/** ลมดูดที่พาออกมาตอนออกแซง หายไปกี่ส่วนต่อวินาที */
const CARRY_FADE = 0.3;
/** หลุดโค้ง: เตือนได้กี่ครั้งก่อนโดนโทษ · โทษครั้งละกี่วินาที · นับซ้ำได้อีกหลังกี่วินาที */
export const TRACK_LIMITS = 3;
export const OFF_PENALTY = 5;
const OFF_COOL = 3;
/** เบรกช้าจนชนท้าย (กันชนท้ายรั้งไม่ทัน): เหลือความเร็วกี่ส่วนของคันหน้า */
const BUMP_KEEP = 0.6;
/** AI: ค้างหลังคันหน้านานเท่านี้ (วินาที) ถึงจะออกแซง */
const AI_PATIENCE = 1.2;

export type Difficulty = "easy" | "normal" | "hard";

/** remote = รถของผู้เล่นคนอื่นในห้องออนไลน์ (ตำแหน่งมาจากเครือข่าย ไม่จำลองในเครื่องนี้) */
export type Entrant = { id: string; name: string; team: string; num: number; colour: string; ink: string; pace: number; skill: number; player?: boolean; remote?: boolean };

export type RaceCar = Entrant & {
  car: CarState;
  perf: Perf;
  /** AI: ขับช้ากว่าความเร็วอ้างอิงกี่ส่วน (0 = เป๊ะ) */
  slack: number;
  /** เลนที่ตั้งใจ (AI/ผู้เล่น) */
  lane: number;
  penalty: number;
  /** เวลาจบการแข่ง (null = ยังไม่จบ) */
  finish: number | null;
  /** สถานะล่าสุด (ไว้แสดงบนจอ) */
  tow: number;
  dirty: number;
  blocked: boolean;
  /** กำลังแซง: คันเป้าหมาย เลนที่ใช้ และเวลาที่แซงมาแล้ว */
  pass: { target: string; lane: number; t: number } | null;
  /** ฝั่งที่แซงได้ตอนนี้ (เลน) · null = ยังแซงไม่ได้ */
  passLane: number | null;
  /** สถานะปุ่มแซง: none = ไม่ได้ตามติด · wait = ตามติดแต่ยังแซงไม่ได้ (ใกล้โค้ง/ถนนแคบ/ข้างไม่ว่าง) · ready = กดได้ */
  passState: "none" | "wait" | "ready";
  /** ลมดูดที่พาออกมาตอนออกแซง (0..1 ค่อย ๆ หาย) */
  carry: number;
  /** หลุดโค้งไปกี่ครั้ง · กันนับซ้ำ */
  offs: number;
  offCool: number;
  /** ปุ่มเบรกล่าสุด และคันที่ตามอยู่ในแนวเดียวกันก่อนขยับ (ไว้ตัดสินว่าเบรกช้าจนชนท้าย ไม่ใช่โดนตัดหน้า) */
  braking: boolean;
  following: string | null;
  /** ผู้เล่นเพิ่งกดแซง (วินาทีที่เหลือ) — จังหวะกดกับจังหวะที่แซงได้ไม่ต้องตรงกันเป๊ะ */
  passWant: number;
  /** กันชนท้ายกำลังทำงาน (ค้างอยู่หลังคันหน้า) และค้างมานานเท่าไร (วินาที) */
  held: boolean;
  heldT: number;
  /** AI: ป้องกันไปแล้วในทางตรงนี้ */
  defended: boolean;
  /** AI: เวลาที่เหลือของความผิดพลาดครั้งนี้ */
  mistake: number;
};

export type RaceEvent =
  | { kind: "overtake"; by: string; on: string }
  | { kind: "pass"; id: string; on: string }
  | { kind: "passEnd"; id: string; why: "done" | "late" | "closed" | "timeout" }
  | { kind: "detect"; id: string }
  | { kind: "offtrack"; id: string; n: number; penalty: number }
  | { kind: "bump"; id: string }
  | { kind: "yield"; id: string }
  | { kind: "lap"; id: string; lap: number; time: number }
  | { kind: "finish"; id: string; pos: number };

export type Race = {
  track: DriveTrack;
  laps: number;
  cars: RaceCar[];
  /** เวลาการแข่ง (วินาที, เริ่มนับเมื่อไฟดับ) */
  t: number;
  /** นับถอยหลังไฟสตาร์ท (วินาที) · ≤ 0 = ปล่อยตัวแล้ว */
  lights: number;
  /** ลำดับปัจจุบัน (index ใน cars) */
  order: number[];
  finished: boolean;
  rng: () => number;
};

const SLACK: Record<Difficulty, number> = { easy: 0.045, normal: 0.022, hard: 0.008 };

function mulberry(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ตั้งกริดสตาร์ท: เรียงตามลำดับ entrants (คันแรก = โพล) สลับเลนซ้าย/ขวา ห่างกันคันละ 8 ม. หลังเส้นสตาร์ท
 */
export function createRace(track: DriveTrack, entrants: Entrant[], opts: { laps: number; difficulty: Difficulty; seed?: number }): Race {
  const rng = mulberry(opts.seed ?? 7);
  const cars = entrants.map((e, k): RaceCar => {
    const lat = k % 2 === 0 ? -0.8 : 0.8;
    const car = newCar(track, { s: -12 - k * 8, v: 0, lat });
    return {
      ...e,
      car,
      perf: perfOf(e.pace),
      // ฝีมือนักขับ (skill ลบ = เก่ง) + ระดับความยาก + สุ่มเล็กน้อย
      slack: e.player ? 0 : Math.max(0, SLACK[opts.difficulty] + e.skill * 0.04 + (rng() - 0.5) * 0.006),
      lane: lat,
      penalty: 0,
      finish: null,
      tow: 0,
      dirty: 0,
      blocked: false,
      pass: null,
      passLane: null,
      passState: "none",
      carry: 0,
      offs: 0,
      offCool: 0,
      braking: false,
      following: null,
      passWant: 0,
      held: false,
      heldT: 0,
      defended: false,
      mistake: 0,
    };
  });
  return { track, laps: opts.laps, cars, t: 0, lights: 4.2 + rng() * 1.2, order: cars.map((_, i) => i), finished: false, rng };
}

const latM = (t: DriveTrack, c: CarState) => laneValue(t, "offset", c.s, c.lat) + c.slide;
/** ทับแนวกัน = ระยะด้านข้างจริงน้อยกว่าความกว้างรถ (ช่วงถนนแคบเลนถูกบีบ → วิ่งเคียงกันไม่ได้ ต้องต่อแถว) */
const sameBand = (t: DriveTrack, a: CarState, b: CarState) => Math.abs(latM(t, a) - latM(t, b)) < CAR_W;
/** จะทับแนวกันในช่วง look เมตรข้างหน้าไหม (เลนถูกบีบเข้าหากันตรงถนนแคบ) — เทียบที่ตำแหน่งเดียวกันของสนาม */
function bandAhead(t: DriveTrack, a: CarState, b: CarState, look: number) {
  const s0 = Math.max(a.s, b.s);
  for (let d = 0; d <= look; d += DS * 2) {
    const s = s0 + d;
    if (Math.abs(laneValue(t, "offset", s, a.lat) + a.slide - laneValue(t, "offset", s, b.lat) - b.slide) < CAR_W) return true;
  }
  return false;
}
/** มองไปข้างหน้าอย่างน้อยกี่เมตร (หรือ 1.2 วินาทีของความเร็ว) เพื่อให้คันหลังค่อย ๆ ถอยไปต่อแถวก่อนถนนแคบ */
const SQUEEZE_LOOK = 40;
/** ระยะห่างเป็นวินาที (ท้ายคันหน้าถึงหัวเรา) */
const gapSec = (d: number, v: number) => (d - CAR_LEN) / Math.max(15, v);

/** รถคันหน้าที่ใกล้ที่สุด (ระยะตามสนาม) — คืน index และระยะห่าง */
function ahead(race: Race, i: number) {
  const me = race.cars[i].car;
  let best = -1;
  let gap = Infinity;
  race.cars.forEach((o, j) => {
    if (j === i || o.finish !== null) return;
    const d = o.car.s - me.s;
    if (d > 0 && d < gap) {
      gap = d;
      best = j;
    }
  });
  return { j: best, gap };
}

/** ความโค้งรวมช่วงข้างหน้า (บอกว่าโค้งถัดไปเลี้ยวซ้ายหรือขวา) */
function turnAhead(t: DriveTrack, s: number, from: number, to: number) {
  let sum = 0;
  for (let d = from; d <= to; d += DS * 2) sum += sample(t, t.curve, s + d);
  return sum;
}

/** ระยะถึงโซนเบรกถัดไปของ racing line (เมตร, ไม่เจอใน 400 ม. = Infinity) */
function brakeAhead(t: DriveTrack, s: number) {
  for (let d = 0; d <= 400; d += DS) if (t.zone[Math.floor(((((s + d) / DS) % t.n) + t.n) % t.n)] === "brake") return d;
  return Infinity;
}

/** ระยะถึงโซนเบรกของเลนที่รถอยู่ (เลนข้างเบรกเร็วกว่า racing line) */
function brakeAheadAt(t: DriveTrack, s: number, lat: number) {
  for (let d = 0; d <= 400; d += DS) if (laneZone(t, s + d, lat) === "brake") return d;
  return Infinity;
}

/** รถคันหน้าที่ใกล้ที่สุดในแนวเดียวกัน (ทับกันด้านข้าง) — คันที่กันชนท้ายต้องค้างไว้ */
function frontInBand(race: Race, i: number, look = 0) {
  const t = race.track;
  const me = race.cars[i].car;
  let best = -1;
  let gap = Infinity;
  race.cars.forEach((o, j) => {
    if (j === i) return;
    const d = o.car.s - me.s;
    // คันที่เรากำลังแซงอยู่: นับแค่ทับแนวจริง (ไม่มองข้างหน้า ไม่งั้นจะโดนรั้งไว้ตลอดการแซง)
    const squeeze = look > 0 && o.id !== race.cars[i].pass?.target && d < CAR_LEN * 3 && bandAhead(t, o.car, me, look);
    if (d > 0 && d < gap && (sameBand(t, o.car, me) || squeeze)) {
      gap = d;
      best = j;
    }
  });
  return { j: best, gap };
}

/** เลนนี้ว่างไหม ตั้งแต่ท้ายรถเราไปจนถึงหน้ารถเป้าหมาย (ไม่มีรถคันอื่นทับแนว) */
function laneClear(race: Race, i: number, lane: number, until: number) {
  const t = race.track;
  const me = race.cars[i].car;
  return race.cars.every((o, j) => {
    if (j === i) return true;
    const d = o.car.s - me.s;
    if (d <= -CAR_LEN - 2.5 || d > until) return true;
    return Math.abs(latM(t, o.car) - laneValue(t, "offset", o.car.s, lane)) >= CAR_W;
  });
}

/** ถนนกว้างพอให้วิ่งเคียงคันหน้าในเลนนี้ไปจนถึงจุดเบรกไหม (เลนถูกบีบ = ไม่พอ) */
function roomToRun(t: DriveTrack, s: number, lane: number, other: number, dist: number) {
  for (let d = 0; d <= dist; d += DS * 2) if (Math.abs(laneValue(t, "offset", s + d, lane) - laneValue(t, "offset", s + d, other)) < CAR_W + 0.3) return false;
  return true;
}

/**
 * แซงได้ไหม (กติกาเดียวกันทั้งผู้เล่นและ AI)
 * — none: ไม่ได้ตามติดคันไหน · wait: ตามติดแต่ทางตรงเหลือไม่พอ / ถนนแคบ / ข้างไม่ว่าง · ready: แซงได้ (ฝั่งที่จะไป · เลนในของโค้งถัดไปก่อน)
 */
function passCheck(race: Race, i: number): { state: "none" | "wait" } | { state: "ready"; lane: number; target: number } {
  const t = race.track;
  const rc = race.cars[i];
  const c = rc.car;
  const f = frontInBand(race, i);
  if (f.j < 0 || gapSec(f.gap, c.v) > PASS_WINDOW || c.v < 25) return { state: "none" };
  const toBrake = brakeAhead(t, c.s);
  if (toBrake < PASS_STRAIGHT) return { state: "wait" };
  const T = race.cars[f.j].car;
  const cur = Math.round(c.lat);
  const inside = turnAhead(t, c.s, 40, 300) > 0 ? 1 : -1;
  const lanes = cur === 0 ? [inside, -inside] : [0, -cur];
  const dist = Math.min(400, toBrake);
  for (const lane of lanes)
    if (lane !== cur && laneClear(race, i, lane, f.gap + CAR_LEN * 2) && roomToRun(t, T.s, lane, T.lat, dist)) return { state: "ready", lane, target: f.j };
  return { state: "wait" };
}

function startPass(race: Race, i: number, opt: { lane: number; target: number }, events: RaceEvent[]) {
  const rc = race.cars[i];
  rc.pass = { target: race.cars[opt.target].id, lane: opt.lane, t: 0 };
  // ออกจากท้ายคันหน้า: ลมดูดยังพาไปอีกครู่หนึ่ง
  rc.carry = 1;
  events.push({ kind: "pass", id: rc.id, on: race.cars[opt.target].id });
}

/**
 * เดินการแซงหนึ่งขั้น: คืนเลนที่ต้องการ
 * — พ้นคันเป้าหมายแล้ว = จบ (กลับ racing line เมื่อว่าง) · นานเกิน / AI ถึงจุดเบรกแล้วยังไม่ถึงครึ่งคัน = ยกเลิก
 */
function passLane(race: Race, i: number, events: RaceEvent[]): number {
  const rc = race.cars[i];
  const c = rc.car;
  if (!rc.pass) return 0;
  rc.pass.t += STEP;
  const T = race.cars.find((o) => o.id === rc.pass!.target);
  const lead = T ? c.s - T.car.s : Infinity;
  if (lead > CAR_LEN + 4) {
    rc.pass = null;
    events.push({ kind: "passEnd", id: rc.id, why: "done" });
    return 0;
  }
  const late = brakeAheadAt(race.track, c.s, c.lat) < 40 && lead < -CAR_LEN / 2;
  // คันเป้าหมายมาอยู่แนวเดียวกับเราแล้ว (เลนนั้นปิด / ถนนแคบลง) → เลิก
  const closed =
    (T && lead < 0 && Math.abs(c.lat - rc.pass.lane) < 0.1 && sameBand(race.track, T.car, c)) ||
    // ขยับออกไม่ได้เลย (มีรถอยู่ข้าง ๆ) นานเกิน 1.5 วิ
    (rc.pass.t > 1.5 && Math.abs(c.lat - rc.pass.lane) > 0.9);
  if (rc.pass.t > PASS_TIMEOUT || late || closed) {
    rc.pass = null;
    events.push({ kind: "passEnd", id: rc.id, why: late ? "late" : closed ? "closed" : "timeout" });
    // ยกเลิก: อยู่เลนเดิมไปก่อน แล้วค่อยกลับ racing line เมื่อว่าง
    return Math.round(c.lat);
  }
  return rc.pass.lane;
}

/** มีคนกำลังแซงคันนี้อยู่ไหม */
const passedBy = (race: Race, id: string) => race.cars.find((o) => o.pass?.target === id) ?? null;

/** สมองของ AI: ขับตามความเร็วอ้างอิง (ช้ากว่าเล็กน้อยตามฝีมือ) · ค้างหลังคันหน้านาน → แซง · โดนไล่ → ป้องกันครั้งเดียว */
function aiInput(race: Race, i: number, events: RaceEvent[]): Input {
  const t = race.track;
  const rc = race.cars[i];
  const c = rc.car;
  const toBrake = brakeAhead(t, c.s);
  const bend = Math.abs(sample(t, t.curve, c.s));
  // ความผิดพลาด: บางโค้งเบรกเร็ว/ช้าไปนิด
  if (rc.mistake > 0) rc.mistake -= STEP;
  else if (toBrake < 8 && race.rng() < 0.0025 * (1 + rc.slack * 40)) rc.mistake = 1.2;

  // ในโค้ง = จบทางตรงนี้แล้ว ป้องกันใหม่ได้ในทางตรงถัดไป
  if (bend > 0.012) rc.defended = false;
  let lane: number;
  if (rc.pass) lane = passLane(race, i, events);
  else if (passedBy(race, rc.id)) lane = c.lat; // โดนแซงอยู่: อยู่ตรงนั้น ไม่ขยับปิดทาง
  else {
    // ออกแซง: ค้างหลังคันหน้ามานานพอ และยังมีทางตรงให้แซงก่อนถึงจุดเบรก
    const chk = rc.heldT > AI_PATIENCE && c.v > 40 && toBrake > 400 && bend < 0.006 && c.v >= 0 ? passCheck(race, i) : null;
    const opt = chk?.state === "ready" ? chk : null;
    if (opt) {
      startPass(race, i, opt, events);
      lane = opt.lane;
    } else {
      lane = 0;
      // ป้องกัน: คันหลังตามติด (ยังไม่ออกแซง) ก่อนถึงโค้ง → ไปเลนในครั้งเดียว ไม่ส่ายตาม
      const turn = turnAhead(t, c.s, 40, 260);
      const chaser = race.cars.some((o, j) => j !== i && !o.pass && c.s - o.car.s > 0 && (c.s - o.car.s - CAR_LEN) / Math.max(15, o.car.v) < 0.5);
      // ป้องกันแล้ว: อยู่เลนในจนถึงโค้ง แล้วกลับ racing line (ไม่ค้างเลนช้าทั้งชิเคน)
      if (rc.defended && rc.lane !== 0) lane = rc.lane;
      else if (!rc.defended && chaser && toBrake < 300 && Math.abs(turn) > 0.02 && rc.slack < 0.03) {
        lane = turn > 0 ? 1 : -1;
        rc.defended = true;
      }
    }
  }
  rc.lane = lane;
  // อยากกลับเข้าเลนแต่มีรถเคียงอยู่: ถ้าเขาอยู่หน้า/เสมอ เรายกเท้าแล้วเข้าไปต่อท้าย · ถ้าเขาอยู่หลัง เราเร่งหนีให้พ้นก่อนเข้า
  let merge = 0;
  if (!rc.pass && rc.blocked) {
    const side = race.cars.find((o, j) => j !== i && Math.abs(latM(t, o.car) - laneValue(t, "offset", o.car.s, lane)) < CAR_W && Math.abs(o.car.s - c.s) < CAR_LEN * 3);
    if (side) merge = side.car.s - c.s > -1.5 ? -0.04 : 0.02;
  }
  // ความเร็วเป้าหมาย: ตามฝีมือ · แซงอยู่บนทางตรง = เหยียบเต็ม (ไม่มีแรงเสริมฟรี ใช้ลมดูด + แบต)
  const scale = 1 - rc.slack - (rc.mistake > 0 ? 0.03 : 0) + merge;
  let pedals: Input = rc.pass && brakeAheadAt(t, c.s, c.lat) > 60 ? { throttle: true, brake: false, sm: true } : idealInput(t, c, scale);
  // ตามติดคันหน้าแล้วกำลังไล่ทัน (เช่นคันหน้าเบรกก่อน) → เบรกตาม ไม่ชนท้าย
  // (รวมคันข้าง ๆ ที่ถนนกำลังจะแคบจนต้องต่อแถว: ถอยไปอยู่ข้างหลังแต่เนิ่น ๆ)
  const fb = frontInBand(race, i, Math.max(SQUEEZE_LOOK, c.v * 1.2));
  if (fb.j >= 0 && c.v > race.cars[fb.j].car.v + 0.5 && gapSec(fb.gap, c.v) < HOLD_GAP + 0.15) pedals = { throttle: false, brake: true, sm: true };

  // Overtake: เก็บแบตไว้ใช้ตอนแซงบนทางตรงเท่านั้น
  const ot = rc.pass !== null && bend < 0.003 && toBrake > 60 && c.energy > 0;
  return { ...pedals, lane, ot };
}

/** ปุ่มของผู้เล่น · pass = กดแซง (เปลี่ยนเลนขึ้นไปเคียง) · ot = กดค้างใช้แบต */
export type RaceInput = Input & { pass?: boolean };

/**
 * เดินหน้าการแข่งหนึ่งขั้น STEP · player = ปุ่มของผู้เล่น (lane = เลนที่เลือก)
 */
export function stepRace(race: Race, player: RaceInput, events: RaceEvent[] = []): RaceEvent[] {
  const t = race.track;
  if (race.lights > 0) {
    race.lights -= STEP;
    return events;
  }
  race.t += STEP;
  const cars = race.cars;

  // ผลจากคันหน้า: ลมดูด (ตรงแนวกัน บนทางตรง) และอากาศเสีย (ในโค้ง)
  cars.forEach((rc, i) => {
    const f = ahead(race, i);
    rc.tow = 0;
    rc.dirty = 0;
    if (f.j < 0) return;
    const o = cars[f.j].car;
    const inLine = Math.abs(latM(t, o) - latM(t, rc.car)) < 1.6;
    const bend = Math.abs(sample(t, t.curve, rc.car.s));
    if (inLine && f.gap < TOW_RANGE && bend < 0.004) rc.tow = 1 - f.gap / TOW_RANGE;
    if (inLine && f.gap < DIRTY_RANGE && bend > 0.006) rc.dirty = 1 - f.gap / DIRTY_RANGE;
  });

  const stepEv: StepEvent[] = [];
  cars.forEach((rc, i) => {
    // รถผู้เล่นคนอื่น (ออนไลน์): ตำแหน่งตั้งจากเครือข่ายด้วย setRemote
    if (rc.remote) return;
    if (rc.finish !== null && !rc.player) {
      // จบแล้ว: ค่อย ๆ ผ่อนลงไปวิ่งช้า ๆ (cool-down lap)
      if (rc.car.v > 45) rc.car.v = Math.max(45, rc.car.v - 8 * STEP);
    }
    let input: Input;
    let mods: Mods = { tow: rc.tow, dirty: rc.dirty };
    if (rc.player) {
      // ผู้เล่น: ไม่มีปุ่มเปลี่ยนเลน — กดแซงแล้วรถเปลี่ยนเลนขึ้นไปเคียง และกลับ racing line ให้เอง
      if (player.pass) rc.passWant = 0.4;
      if (rc.passWant > 0) {
        rc.passWant -= STEP;
        const chk = !rc.pass && rc.finish === null ? passCheck(race, i) : null;
        if (chk?.state === "ready") {
          startPass(race, i, chk, events);
          rc.passWant = 0;
        }
      }
      const lane = rc.pass ? passLane(race, i, events) : player.lane ?? 0;
      input = { ...player, lane };
    } else input = aiInput(race, i, events);
    rc.braking = input.brake;
    // เพิ่งออกจากท้ายคันหน้า: ลมดูดยังพาไปอีกครู่ (ค่อย ๆ หาย)
    if (rc.carry > 0) {
      rc.carry = rc.pass ? Math.max(0, rc.carry - CARRY_FADE * STEP) : 0;
      mods = { tow: Math.max(rc.tow, rc.carry), dirty: rc.dirty };
    }
    const want = input.lane ?? rc.lane;
    // กันชนท้าย: ความเร็วสูงสุดที่ยังค้างระยะ HOLD_GAP วินาทีหลังคันหน้าได้ (คำนวณก่อนขยับ)
    // มองข้างหน้าด้วย: ถนนแคบลงตอนวิ่งเคียงกัน คันหลังค่อย ๆ ถอยไปต่อแถว
    // ผู้เล่นที่ตามคันหน้าอยู่แล้ว: ในโซนเบรกไม่ช่วย ต้องเบรกเอง ไม่งั้นชนท้าย (เสียความเร็ว)
    const fb = frontInBand(race, i, Math.max(SQUEEZE_LOOK, rc.car.v * 1.2));
    const wasFollowing = fb.j >= 0 && rc.following === cars[fb.j].id;
    const selfBrake = rc.player && wasFollowing && laneZone(t, rc.car.s, rc.car.lat) === "brake";
    rc.following = fb.j >= 0 ? cars[fb.j].id : null;
    const vHold = fb.j < 0 || selfBrake ? Infinity : cars[fb.j].car.v + (fb.gap - Math.max(HOLD_MIN, CAR_LEN + HOLD_GAP * rc.car.v)) * HOLD_K;
    // เปลี่ยนเลนไม่ได้ถ้ามีรถเคียงข้างในเลนนั้น (ขยับเข้าหารถที่อยู่ข้าง ๆ = ย้อนกลับ)
    const before = rc.car.lat;
    stepEv.length = 0;
    const smBefore = t.smZone[Math.floor((((rc.car.s / DS) % t.n) + t.n) % t.n)];
    stepCar(t, rc.car, { ...input, lane: want }, rc.perf, stepEv, mods);
    rc.held = rc.car.v > vHold;
    if (rc.held) rc.car.v = Math.max(0, vHold, rc.car.v - HOLD_DECEL * STEP);
    rc.heldT = rc.held || (fb.j >= 0 && (fb.gap - CAR_LEN) / Math.max(15, rc.car.v) < HOLD_GAP + 0.15) ? rc.heldT + STEP : 0;
    rc.blocked = false;
    if (rc.car.lat !== before) {
      const now = rc.car.lat;
      // ห้ามตัดเข้าเลนที่มีรถเคียงอยู่ หรือมีรถอยู่ข้างหน้าใกล้เกินระยะกันชนท้าย
      const room = CAR_LEN + HOLD_GAP * rc.car.v * 0.6;
      const hit = cars.some((o, j) => {
        const d = o.car.s - rc.car.s;
        if (j === i || d <= -CAR_LEN - 2 || d >= room) return false;
        const om = latM(t, o.car);
        const dl = Math.abs(om - laneValue(t, "offset", o.car.s, now));
        return dl < CAR_W && dl < Math.abs(om - laneValue(t, "offset", o.car.s, before));
      });
      if (hit) {
        rc.car.lat = before;
        rc.blocked = true;
      }
    }
    // จุดวัด (ต้นโซน Straight Mode): ตามหลังไม่เกิน 1 วินาที → ได้พลังงาน Overtake เพิ่ม
    const smNow = t.smZone[Math.floor((((rc.car.s / DS) % t.n) + t.n) % t.n)];
    if (!smBefore && smNow) {
      const f = ahead(race, i);
      if (f.j >= 0 && f.gap / Math.max(20, rc.car.v) < DETECT_GAP) {
        rc.car.energy = Math.min(1, rc.car.energy + DETECT_BONUS);
        events.push({ kind: "detect", id: rc.id });
      }
    }
    // หลุดโค้ง: นับครั้ง (โค้งเดียวนับครั้งเดียว) · เกินที่เตือนไว้ = โทษ
    if (rc.offCool > 0) rc.offCool -= STEP;
    if (stepEv.some((e) => e.kind === "excursion") && rc.offCool <= 0 && rc.finish === null) {
      rc.offCool = OFF_COOL;
      rc.offs++;
      if (rc.offs > TRACK_LIMITS) rc.penalty += OFF_PENALTY;
      events.push({ kind: "offtrack", id: rc.id, n: rc.offs, penalty: rc.penalty });
    }
    for (const e of stepEv) {
      if (e.kind !== "lap") continue;
      events.push({ kind: "lap", id: rc.id, lap: rc.car.lap, time: e.result.time });
      if (rc.finish === null && rc.car.lap >= race.laps && (race.finished || isLeader(race, i))) {
        rc.finish = race.t;
        race.finished = true;
      } else if (rc.finish === null && race.finished) {
        rc.finish = race.t;
      }
      if (rc.finish !== null && rc.finish === race.t) events.push({ kind: "finish", id: rc.id, pos: cars.filter((o) => o.finish !== null).length });
    }
  });
  // ปุ่มแซงของผู้เล่น: สถานะและฝั่งที่แซงได้ตอนนี้
  for (let i = 0; i < cars.length; i++) {
    const rc = cars[i];
    if (!rc.player) continue;
    const chk = rc.pass || rc.finish !== null ? ({ state: "none" } as const) : passCheck(race, i);
    rc.passState = chk.state;
    rc.passLane = chk.state === "ready" ? chk.lane : null;
  }

  // กันทับกัน: กันชนท้ายรั้งไม่ทัน (ไม่เบรกเองเข้าโค้ง) หรือถนนแคบลงตอนวิ่งเคียงกัน → ดันคันหลังไปอยู่ท้ายคันหน้า
  // เบรกช้าจนชนท้าย = เสียความเร็วมาก (ไม่มีโทษเวลา)
  for (let a = 0; a < cars.length; a++)
    for (let b = 0; b < cars.length; b++) {
      if (a === b) continue;
      const back = cars[a];
      const front = cars[b];
      // ออนไลน์: รถผ่านกันได้ (กันแลค) — ผลักเฉพาะรถที่จำลองในเครื่องนี้
      if (back.remote || front.remote) continue;
      const d = front.car.s - back.car.s;
      if (d <= 0 || d >= CAR_LEN) continue;
      if (!sameBand(t, front.car, back.car)) continue;
      back.car.s = front.car.s - CAR_LEN;
      // ชนท้ายคันที่ตามมาตลอด = เบรกช้า · ถ้าคันหน้าเพิ่งตัดเข้ามา ไม่ใช่ความผิดคันหลัง
      if (back.car.v > front.car.v + 2 && !back.braking && back.following === front.id) {
        back.car.v = front.car.v * BUMP_KEEP;
        events.push({ kind: "bump", id: back.id });
      } else back.car.v = Math.min(back.car.v, front.car.v);
    }

  // ดวลในโค้ง: เคียงกัน คันด้านนอกที่ไม่นำเกินครึ่งคันต้องยอม (ยกเท้า)
  for (let a = 0; a < cars.length; a++)
    for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a];
      const B = cars[b];
      const ds = A.car.s - B.car.s;
      if (Math.abs(ds) >= CAR_LEN) continue;
      const curve = sample(t, t.curve, (A.car.s + B.car.s) / 2);
      if (Math.abs(curve) < 0.012) continue;
      // บวก = เลี้ยวขวา → ด้านในอยู่ขวา (lat มาก)
      const aInside = (latM(t, A.car) - latM(t, B.car)) * Math.sign(curve) > 0;
      const outer = aInside ? B : A;
      const inner = aInside ? A : B;
      if (outer.car.s - inner.car.s >= CAR_LEN / 2) continue;
      if (outer.remote) continue;
      // ค่อย ๆ ยกเท้า (ไม่เบรกกะทันหัน) จนตกไปอยู่ข้างหลัง
      if (outer.car.v > inner.car.v - 0.5) {
        outer.car.v = Math.max(inner.car.v - 0.5, outer.car.v - 14 * STEP);
        events.push({ kind: "yield", id: outer.id });
      }
    }

  // ลำดับ: จบแล้วเรียงตามเวลาจบ (รวมโทษ) · ยังไม่จบเรียงตามระยะ
  const prev = race.order;
  race.order = cars
    .map((_, i) => i)
    .sort((x, y) => {
      const X = cars[x];
      const Y = cars[y];
      if (X.finish !== null && Y.finish !== null) return X.finish + X.penalty - (Y.finish + Y.penalty);
      if (X.finish !== null) return -1;
      if (Y.finish !== null) return 1;
      return Y.car.s - X.car.s;
    });
  // แจ้งการแซง (เฉพาะที่เกี่ยวกับผู้เล่น — ไว้ทำข้อความบนจอ)
  const pi = cars.findIndex((c) => c.player);
  if (pi >= 0 && !race.finished) {
    const was = prev.indexOf(pi);
    const now = race.order.indexOf(pi);
    if (now < was) events.push({ kind: "overtake", by: cars[pi].id, on: cars[prev[now]].id });
    else if (now > was) events.push({ kind: "overtake", by: cars[race.order[was]].id, on: cars[pi].id });
  }
  return events;
}

function isLeader(race: Race, i: number) {
  return race.cars.every((o, j) => j === i || o.car.s <= race.cars[i].car.s);
}

/** ช่องว่างเป็นวินาทีถึงคันข้างหน้าในลำดับ (ประมาณจากระยะ ÷ ความเร็ว) */
export function gapAhead(race: Race, idx: number) {
  const pos = race.order.indexOf(idx);
  if (pos <= 0) return null;
  const me = race.cars[idx];
  const front = race.cars[race.order[pos - 1]];
  if (me.finish !== null && front.finish !== null) return me.finish + me.penalty - (front.finish + front.penalty);
  return (front.car.s - me.car.s) / Math.max(15, me.car.v);
}

/** ระยะที่ผู้เล่นอยู่ข้าง ๆ รถคันอื่น (ไว้แสดงเตือน "มีรถข้าง ๆ") */
export function sideBySide(race: Race, idx: number) {
  const me = race.cars[idx].car;
  const t = race.track;
  let left = false;
  let right = false;
  race.cars.forEach((o, j) => {
    if (j === idx || Math.abs(o.car.s - me.s) > CAR_LEN + 2) return;
    const d = latM(t, o.car) - latM(t, me);
    if (Math.abs(d) < CAR_W * 2) {
      if (d < 0) left = true;
      else right = true;
    }
  });
  return { left, right };
}

export { STEP };

/** สถานะรถที่ส่งผ่านเครือข่าย: [ระยะ, ความเร็ว, เลน, ไถล, ปีกพับ, Overtake, รอบที่จบ, โทษ, เวลาจบ (−1 = ยังไม่จบ)] */
export type NetState = [s: number, v: number, lat: number, slide: number, sm: 0 | 1, ot: 0 | 1, lap: number, pen: number, fin: number];

export const packState = (rc: RaceCar): NetState => [
  Math.round(rc.car.s * 100) / 100,
  Math.round(rc.car.v * 100) / 100,
  Math.round(rc.car.lat * 100) / 100,
  Math.round(rc.car.slide * 100) / 100,
  rc.car.sm ? 1 : 0,
  rc.car.ot ? 1 : 0,
  rc.car.lap,
  rc.penalty,
  rc.finish ?? -1,
];

/** ตั้งตำแหน่งรถผู้เล่นคนอื่นจากเครือข่าย (ประมาณล่วงหน้าตามเวลาที่ข้อมูลเดินทางมา ageSec) */
export function setRemote(race: Race, id: string, st: NetState, ageSec: number) {
  const rc = race.cars.find((c) => c.id === id);
  if (!rc || !rc.remote) return;
  const [s, v, lat, slide, sm, ot, lap, pen, fin] = st;
  const ahead = s + v * Math.min(0.4, Math.max(0, ageSec));
  // เกลี่ยตำแหน่ง: ต่างมาก = กระโดดไปเลย · ต่างน้อย = ค่อย ๆ ดึงเข้าหา
  rc.car.s = Math.abs(ahead - rc.car.s) > 25 ? ahead : rc.car.s + (ahead - rc.car.s) * 0.35;
  rc.car.v = v;
  rc.car.lat = lat;
  rc.car.slide = slide;
  rc.car.sm = sm === 1;
  rc.car.ot = ot === 1;
  rc.car.lap = lap;
  rc.penalty = pen;
  if (fin >= 0 && rc.finish === null) {
    rc.finish = fin;
    race.finished = true;
  }
}

/** ระหว่างเฟรม: รถผู้เล่นคนอื่นวิ่งต่อด้วยความเร็วล่าสุด (ไม่ให้กระตุกระหว่างรอข้อมูล) */
export function advanceRemote(race: Race, dt: number) {
  for (const rc of race.cars) if (rc.remote && rc.finish === null && race.lights <= 0) rc.car.s += rc.car.v * dt;
}

