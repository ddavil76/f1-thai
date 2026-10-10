/**
 * แข่งกับ AI ในโหมดนักขับ — รถหลายคันบนสนามเดียวกัน ใช้ฟิสิกส์เดียวกับผู้เล่น (car.ts)
 * การแซง:
 *  1) เลน: racing line + เลนซ้าย/ขวา (เลนในโค้ง = ทางสั้นแต่ช้ากว่า) · เปลี่ยนเลนไม่ได้ถ้ามีรถอยู่ข้าง ๆ
 *  2) ลมดูด: ตามหลังใกล้ ๆ บนทางตรง แรงต้านน้อยลง · อากาศเสีย: ตามติดในโค้ง เกาะถนนน้อยลง
 *  3) Overtake: แบตเตอรี่เสริม · ตามหลังไม่เกิน 1 วิ ตอนผ่านจุดวัด (ต้นโซน Straight Mode) ได้พลังงานเพิ่ม
 *  4) ดวลในโค้ง: เคียงกันเข้าโค้ง คันด้านนอกที่ไม่นำครึ่งคันต้องค่อย ๆ ยอม
 * กันชนท้าย: ตามทันคันหน้าในแนวเดียวกัน ความเร็วถูกจำกัดให้ค้างห่าง ~0.1 วินาที — จะผ่านต้อง "แซง"
 *  (ไม่ได้ช่วยเบรกเข้าโค้ง: ตามติดแล้วไม่เบรกเอง = เบรกช้า ชนท้าย เสียความเร็ว)
 * แซง (กติกาเดียวกันทั้งผู้เล่นและ AI): ห่างไม่เกิน PASS_WINDOW (0.28 วิ) + ทางตรงเหลือพอ + ฝั่งข้างว่างและถนนกว้างพอวิ่งเคียงกัน
 *  → เปลี่ยนเลนขึ้นไปเคียง (ไม่มีแรงเสริมฟรี: ใช้ลมดูดที่พาออกมา + แบต Overtake ที่กดเอง) → พ้นแล้วกลับ racing line
 *  — ถึงจุดเบรกแล้วยังขึ้นไม่ถึงครึ่งคัน = ถอยกลับไปต่อท้าย · AI ป้องกันได้ครั้งเดียวต่อทางตรง
 * หลุดโค้ง (ลงหญ้า ความเร็วตก): เตือน 3 ครั้ง ครั้งต่อไปโดน +5 วินาทีทุกครั้ง
 * ยางสึกตามระยะ/วิธีขับ (tyres.ts) · ต้องเข้าพิทอย่างน้อย 1 ครั้ง (pit.ts):
 *  ขอเข้าพิท → ถึงทางเข้ารถวิ่งเองด้วยความเร็วพิทเลน → กด "จอด" ให้ตรงกรอบอู่ทีม → เปลี่ยนยาง → ไฟเขียวกด "ไป"
 *  รถในพิทเลนไม่ชน/ไม่บัง/ไม่ให้ลมดูดกับรถบนสนาม
 */
import { advanceCar, idealInput, newCar, perfOf, STEP, stepCar, type CarState, type Input, type Mods, type Perf, type StepEvent } from "./car";
import { accelFor, DS, laneValue, laneZone, sample, VMAX, type DriveTrack } from "./line";
import { AUTO_GO, BOX_SHIFT, EARLY_GO, PIT_IN, PIT_MISS_PENALTY, PIT_OUT, PIT_QUEUE, PIT_V, pitLane, pitLateral, STOP_BASE, STOP_DECEL, STOP_MISS, STOP_WINDOW, stopExtra, stopGrade, TAPER, type PitLane, type StopGrade } from "./pit";
import { COMPOUNDS, EXCURSION_WEAR, newTyre, suggestCompound, TYRE_LIFE, tyreGrip, wearPerMeter, wearTyre, type Compound, type Tyre } from "./tyres";
import { TEAMS } from "../teams";

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
export const HOLD_GAP = 0.1;
const HOLD_MIN = CAR_LEN + 1;
/** ถือว่า "ตามติด" เมื่อห่างไม่เกินนี้ (วินาที) — ใช้นับเวลาที่ถูกบล็อกและให้ AI แตะเบรกก่อนชน */
const FOLLOW_NEAR = 0.35;
const HOLD_K = 2.5;
/** กันชนท้ายลดความเร็วได้ไม่เกินนี้ (ม./วิ²) — มีคันตัดเข้ามาข้างหน้าก็ค่อย ๆ ถอย ไม่เบรกกระชาก */
const HOLD_DECEL = 30;
/** …แต่ถ้าเข้ามาอยู่ในระยะกันชนแล้ว ชะลอรวมได้ถึงนี้ (ม./วิ² · ยังต่ำกว่าการกระชาก 120) */
const HOLD_DECEL_CLOSE = 90;
/** แซงได้เมื่อห่างคันหน้าไม่เกินกี่วินาที · ต้องเหลือทางตรงก่อนจุดเบรกอย่างน้อยกี่เมตร · แซงนานเกินนี้ (วินาที) = ยกเลิก */
export const PASS_WINDOW = 0.28;
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
  /** ยางที่ใส่อยู่ · ประวัติยางแต่ละช่วง (ชนิด · เริ่มรอบ · เวลาจอดเปลี่ยนยาง) · เข้าพิทไปแล้วกี่ครั้ง */
  tyre: Tyre;
  stints: { c: Compound; lap: number; stop: number | null }[];
  pits: number;
  /** ขอเข้าพิทรอบนี้ (ยางที่จะเปลี่ยน) · null = ไม่ได้ขอ */
  pitWant: Compound | null;
  /** กำลังอยู่ในพิท */
  pit: PitState | null;
  /** ระยะเยื้อง (เมตร) ตอนอยู่ในพิทเลน — ไว้วาดและให้รถคันอื่นไม่สนใจ · null = อยู่บนสนาม */
  pitOff: number | null;
  /** ตำแหน่งกรอบจอดของทีม (เทียบเส้นชัย) */
  box: number;
  /** AI: แผนเข้าพิท (จบรอบที่เท่าไร · ยางที่จะเปลี่ยน) */
  plan: { lap: number; next: Compound } | null;
};

/**
 * สถานะในพิท: in = เลี้ยวเข้า (ชะลอ) · lane = วิ่งในพิทเลน รอกดจอด · brake = เบรกเข้ากรอบ · stop = จอดเปลี่ยนยาง · go = ออกจากอู่ · out = เลี้ยวกลับเข้าสนาม
 * base = ระยะ (สะสม) ของเส้นชัยที่พิทเลนนี้คร่อม · from/to = ระยะเยื้องตอนเลี้ยวเข้า/เลนที่จะกลับเข้า
 */
export type PitState = {
  phase: "in" | "lane" | "brake" | "stop" | "go" | "out";
  base: number;
  from: number;
  to: number;
  c: Compound;
  /** จุดที่จะหยุด (ระยะสะสม) · หยุดพลาดกรอบกี่เมตร (ลบ = ก่อนกรอบ) */
  stopAt: number;
  err: number;
  /** เวลาที่จอดแล้ว · เวลาที่ต้องใช้เปลี่ยนยาง · ช่างเสร็จแล้ว (ไฟเขียว) · กดไปก่อนไฟเขียวแล้ว */
  t: number;
  need: number;
  ready: boolean;
  early: boolean;
  /** AI: จะกดจอดตอนจุดหยุดพลาดกรอบเท่านี้ · หน่วงก่อนกดไป */
  aiErr: number;
  aiGo: number;
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
  | { kind: "finish"; id: string; pos: number }
  | { kind: "pitIn"; id: string }
  | { kind: "pitStop"; id: string; time: number; err: number; grade: StopGrade; c: Compound }
  | { kind: "pitEarly"; id: string }
  | { kind: "pitOut"; id: string }
  | { kind: "pitMiss"; id: string; penalty: number }
  | { kind: "tyreLow"; id: string };

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
  /** พิทเลนของสนามนี้ */
  pitLane: PitLane;
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
export function createRace(track: DriveTrack, entrants: Entrant[], opts: { laps: number; difficulty: Difficulty; seed?: number; startTyre?: Compound }): Race {
  const rng = mulberry(opts.seed ?? 7);
  const lane = pitLane(track, TEAMS.length);
  const cars = entrants.map((e, k): RaceCar => {
    const lat = k % 2 === 0 ? -0.8 : 0.8;
    const car = newCar(track, { s: -12 - k * 8, v: 0, lat });
    // ยางออกตัว: ผู้เล่นเลือกเอง · AI ส่วนใหญ่ Medium บางคันเสี่ยง Soft หรือยืด Hard
    const u = rng();
    const start: Compound = e.player || e.remote ? (opts.startTyre ?? "medium") : u < 0.25 ? "soft" : u < 0.85 ? "medium" : "hard";
    const team = Math.max(0, TEAMS.findIndex((x) => x.id === e.team));
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
      tyre: newTyre(start),
      stints: [{ c: start, lap: 1, stop: null }],
      pits: 0,
      pitWant: null,
      pit: null,
      pitOff: null,
      box: lane.boxes[team] ?? 0,
      plan: e.player || e.remote ? null : planStop(start, opts.laps, rng),
    };
  });
  return { track, laps: opts.laps, cars, t: 0, lights: 4.2 + rng() * 1.2, order: cars.map((_, i) => i), finished: false, rng, pitLane: lane };
}

/** AI: แผนเข้าพิทครั้งเดียว — ใช้ยางชุดแรกราว 65–85% ของอายุ (ไม่เกินรอบรองสุดท้าย) แล้วเปลี่ยนเป็นชนิดที่นุ่มสุดที่วิ่งจนจบได้ */
function planStop(start: Compound, laps: number, rng: () => number) {
  const life = TYRE_LIFE[start] * laps;
  const lap = Math.max(1, Math.min(laps - 1, Math.round(life * (0.65 + rng() * 0.2))));
  return { lap, next: suggestCompound(laps - lap, laps) };
}

/** อยู่ในพิทเลน (ไม่ชน/ไม่บัง/ไม่ให้ลมดูดกับรถบนสนาม) */
const inPit = (o: RaceCar) => o.pitOff !== null;

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
    if (j === i || o.finish !== null || inPit(o)) return;
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
    if (j === i || inPit(o)) return;
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
    if (j === i || inPit(o)) return true;
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
  // คันหน้ากำลังแซงคันอื่นอยู่ (ขบวนรถติดกัน) → รอให้เขาจบก่อน ไม่งั้นจะเบียดเข้าเลนเดียวกัน
  if (race.cars[f.j].pass) return { state: "wait" };
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
  else if (aiPitCall(race, rc) && approachingPit(t, c.s)) lane = race.pitLane.side; // จะเข้าพิท: ชิดเลนฝั่งพิท
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
      const chaser = race.cars.some((o, j) => j !== i && !o.pass && !inPit(o) && c.s - o.car.s > 0 && (c.s - o.car.s - CAR_LEN) / Math.max(15, o.car.v) < 0.5);
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
    const side = race.cars.find((o, j) => j !== i && !inPit(o) && Math.abs(latM(t, o.car) - laneValue(t, "offset", o.car.s, lane)) < CAR_W && Math.abs(o.car.s - c.s) < CAR_LEN * 3);
    if (side) merge = side.car.s - c.s > -1.5 ? -0.04 : 0.02;
  }
  // ความเร็วเป้าหมาย: ตามฝีมือ · แซงอยู่บนทางตรง = เหยียบเต็ม (ไม่มีแรงเสริมฟรี ใช้ลมดูด + แบต)
  const scale = 1 - rc.slack - (rc.mistake > 0 ? 0.03 : 0) + merge;
  // ยาง: เกาะน้อยลง (สึก/เย็น/ชนิดแข็ง) = เข้าโค้งช้าลงตาม · Soft ใหม่ = เข้าได้เร็วขึ้น
  let pedals: Input = rc.pass && brakeAheadAt(t, c.s, c.lat) > 60 ? { throttle: true, brake: false, sm: true } : idealInput(t, c, scale, tyreGrip(rc.tyre));
  // ตามติดคันหน้าแล้วกำลังไล่ทัน (เช่นคันหน้าเบรกก่อน) → เบรกตาม ไม่ชนท้าย
  // (รวมคันข้าง ๆ ที่ถนนกำลังจะแคบจนต้องต่อแถว: ถอยไปอยู่ข้างหลังแต่เนิ่น ๆ)
  const fb = frontInBand(race, i, Math.max(SQUEEZE_LOOK, c.v * 1.2));
  if (fb.j >= 0 && c.v > race.cars[fb.j].car.v + 0.5 && gapSec(fb.gap, c.v) < FOLLOW_NEAR) pedals = { throttle: false, brake: true, sm: true };

  // Overtake: เก็บแบตไว้ใช้ตอนแซงบนทางตรงเท่านั้น
  const ot = rc.pass !== null && bend < 0.003 && toBrake > 60 && c.energy > 0;
  return { ...pedals, lane, ot };
}

/**
 * ปุ่มของผู้เล่น · pass = กดแซง (เปลี่ยนเลนขึ้นไปเคียง) · ot = กดค้างใช้แบต
 * pitReq = ขอ/ยกเลิกเข้าพิท (ยางที่จะเปลี่ยน · null = ยกเลิก · ไม่ใส่ = ไม่เปลี่ยน) · pitStop = กดจอด · pitGo = กดปล่อยรถ
 */
export type RaceInput = Input & { pass?: boolean; pitReq?: Compound | null; pitStop?: boolean; pitGo?: boolean };

/** ระยะ (สะสม) ของเส้นชัยถัดไปที่รถจะข้าม */
const nextLine = (t: DriveTrack, s: number) => Math.ceil(s / t.length + 1e-9) * t.length;

/** ระยะก่อนทางเข้าพิทที่รถเริ่มชิดเลนฝั่งพิท (เมตร) */
export const PIT_APPROACH = 350;
/** กำลังจะเข้าพิท: อยู่ในช่วงก่อนทางเข้า (ให้ชิดเลนฝั่งพิทไว้ก่อน แล้วเลี้ยวเข้าได้เนียน) */
export const approachingPit = (t: DriveTrack, s: number) => {
  if (s <= 0) return false;
  const rel = s - nextLine(t, s);
  return rel >= -PIT_IN - PIT_APPROACH && rel < -PIT_IN;
};

/** AI ควรเข้าพิทรอบนี้ไหม (ตามแผน · ยางใกล้หมด · ยังไม่เข้าเลยแล้วเหลือรอบเดียว) → ยางที่จะเปลี่ยน */
function aiPitCall(race: Race, rc: RaceCar): Compound | null {
  const lapNow = rc.car.lap + 1;
  const left = race.laps - rc.car.lap;
  if (rc.plan && lapNow >= rc.plan.lap && rc.pits === 0) return rc.plan.next;
  if (rc.tyre.wear > 0.88 && left > 0.6) return suggestCompound(left - 1, race.laps);
  if (rc.pits === 0 && lapNow >= race.laps) return suggestCompound(0, race.laps);
  return null;
}

/** เริ่มเข้าพิท (รถเพิ่งผ่านทางเข้า) */
function enterPit(race: Race, rc: RaceCar, c: Compound, events: RaceEvent[]) {
  const t = race.track;
  const base = nextLine(t, rc.car.s);
  const side = race.pitLane.side;
  // AI: จังหวะกดจอด/ปล่อยรถคลาดเคลื่อนตามฝีมือ
  const sigma = 1 + rc.slack * 70;
  const g = (race.rng() + race.rng() + race.rng() - 1.5) * 2;
  rc.pit = {
    phase: "in",
    base,
    from: latM(t, rc.car),
    to: laneValue(t, "offset", base + PIT_OUT, side),
    c,
    stopAt: 0,
    err: 0,
    t: 0,
    need: 0,
    ready: false,
    early: false,
    aiErr: Math.max(-STOP_WINDOW + 1, Math.min(STOP_MISS - 1, g * sigma)),
    aiGo: 0.15 + race.rng() * 0.3 + rc.slack * 4,
  };
  rc.pitWant = null;
  rc.pass = null;
  rc.car.sm = false;
  rc.car.ot = false;
  rc.car.slide = 0;
  rc.pitOff = rc.pit.from;
  events.push({ kind: "pitIn", id: rc.id });
}

/** ระยะเบรกจนหยุดจากความเร็ว v ตอนกดจอด */
export const stopDist = (v: number) => (v * v) / (2 * STOP_DECEL);
/** ระยะจอดพลาดกรอบถ้ากดจอดตอนนี้ (ลบ = หยุดก่อนกรอบ) */
export const stopError = (rc: RaceCar) => (rc.pit ? rc.car.s - rc.pit.base + stopDist(rc.car.v) - rc.box : 0);
/** อยู่ในช่องจอดหน้าอู่ (หลบออกจากเลนวิ่งในพิท) */
const atBox = (p: PitState) => p.phase === "brake" || p.phase === "stop" || p.phase === "go";

/** ระยะห่างจากคันหน้าในเลนวิ่งของพิท (รวมเพื่อนร่วมทีมที่จอดอยู่หน้าอู่เดียวกัน = ต้องรอคิว) */
function pitAhead(race: Race, rc: RaceCar) {
  let gap = Infinity;
  let v = 0;
  for (const o of race.cars) {
    if (o === rc || !o.pit || o.pit.base !== rc.pit!.base) continue;
    const queue = o.team === rc.team && o.pit.phase !== "go" && atBox(o.pit);
    if (atBox(o.pit) && !queue) continue;
    const d = o.car.s - rc.car.s;
    if (d > 0 && d < gap) {
      gap = d;
      v = o.car.v;
    }
  }
  return { gap, v };
}

/** ทางออกพิทว่างไหม: ไม่มีรถบนสนามอยู่เคียง/ใกล้ข้างหลังในเลนที่จะกลับเข้า (เร็วกว่าเราก็ต้องเว้นระยะให้เบรกทัน) */
function exitClear(race: Race, rc: RaceCar, lateral: number) {
  const t = race.track;
  return race.cars.every((o) => {
    if (o === rc || inPit(o) || o.remote) return true;
    if (Math.abs(latM(t, o.car) - lateral) >= CAR_W + 0.3) return true;
    const d = o.car.s - rc.car.s;
    const room = CAR_LEN + Math.max(10, (o.car.v - rc.car.v) ** 2 / 50 + 0.2 * o.car.v);
    return d > CAR_LEN + 3 || d < -room;
  });
}

/** เดินรถในพิทหนึ่งขั้น (วิ่งเอง · จอด · เปลี่ยนยาง · ออก) */
function stepPit(race: Race, rc: RaceCar, press: { stop: boolean; go: boolean }, stepEv: StepEvent[], events: RaceEvent[]) {
  const t = race.track;
  const p = rc.pit!;
  const c = rc.car;
  const rel = c.s - p.base;
  let v = c.v;
  // ต่อคิวในพิทเลน: ห่างคันหน้าไม่ต่ำกว่า PIT_QUEUE เมตร (คันหน้าหยุด = หยุดรอ)
  const follow = () => {
    const f = pitAhead(race, rc);
    // ชะลอได้ไม่เกิน 30 ม./วิ² (ไม่กระชาก)
    if (f.gap < 30) v = Math.min(v, Math.max(0, c.v - 30 * STEP, f.v + (f.gap - PIT_QUEUE) * 1.5));
  };
  switch (p.phase) {
    case "in":
      // ชะลอลงให้ทันความเร็วพิทเลนก่อนสุดทางเลี้ยวเข้า
      v = v > PIT_V ? Math.max(PIT_V, v - 25 * STEP) : Math.min(PIT_V, v + 6 * STEP);
      follow();
      if (rel >= -PIT_IN + TAPER) p.phase = "lane";
      break;
    case "lane": {
      v = v > PIT_V ? Math.max(PIT_V, v - 25 * STEP) : Math.min(PIT_V, v + 6 * STEP);
      follow();
      // จุดที่จะหยุดถ้ากดตอนนี้ เทียบกรอบอู่ทีม (เพื่อนร่วมทีมยังจอดอยู่ = ยังกดไม่ได้ ต้องรอคิว)
      const err = rel + stopDist(v) - rc.box;
      const busy = race.cars.some((o) => o !== rc && o.team === rc.team && o.pit?.base === p.base && (o.pit.phase === "brake" || o.pit.phase === "stop"));
      const want = rc.player ? press.stop : err >= p.aiErr;
      if (!busy && ((want && err >= -STOP_WINDOW) || err >= STOP_MISS)) {
        p.phase = "brake";
        p.err = Math.min(err, STOP_MISS);
        p.stopAt = c.s + stopDist(v);
        p.t = Math.max(0.01, stopDist(v));
      }
      break;
    }
    case "brake": {
      const left = p.stopAt - c.s;
      v = Math.sqrt(Math.max(0, 2 * STOP_DECEL * left));
      if (left <= 0.004) {
        v = 0;
        c.s = p.stopAt;
        p.phase = "stop";
        p.t = 0;
        p.need = STOP_BASE + stopExtra(p.err) + (race.rng() - 0.5) * 0.2;
      }
      break;
    }
    case "stop": {
      v = 0;
      p.t += STEP;
      if (!p.ready && p.t >= p.need) p.ready = true;
      const go = rc.player ? press.go : p.ready && p.t >= p.need + p.aiGo;
      if (go && !p.ready && !p.early) {
        // กดก่อนไฟเขียว: ช่างยังไม่เสร็จ เสียเวลาเพิ่ม
        p.early = true;
        p.need += EARLY_GO;
        events.push({ kind: "pitEarly", id: rc.id });
      }
      if (p.ready && (go || p.t >= p.need + AUTO_GO)) {
        rc.tyre = newTyre(p.c, 1);
        rc.pits++;
        const last = rc.stints[rc.stints.length - 1];
        if (last) last.stop = p.t;
        rc.stints.push({ c: p.c, lap: c.lap + (rel >= 0 ? 1 : 2), stop: null });
        events.push({ kind: "pitStop", id: rc.id, time: p.t, err: p.err, grade: stopGrade(p.err), c: p.c });
        p.phase = "go";
        p.stopAt = c.s;
      }
      break;
    }
    case "go":
      v = Math.min(PIT_V, v + 8 * STEP);
      follow();
      if (rel >= PIT_OUT - TAPER) p.phase = "out";
      break;
    case "out":
      // พ้นเส้นจำกัดความเร็ว: เร่งออกไปรวมกับสนาม
      v = Math.min(sample(t, t.vref, c.s), v + accelFor(v, VMAX) * rc.perf.accel * STEP);
      follow();
      break;
  }
  c.v = v;
  advanceCar(t, c, v * STEP, stepEv);
  const now = c.s - p.base;
  // สุดทางออก: กลับเข้าสนามที่เลนฝั่งพิทเมื่อทางว่าง (ไม่ว่าง = วิ่งต่อในเลนออกจนกว่าจะว่าง) แล้วค่อยกลับ racing line
  if (now >= PIT_OUT && (exitClear(race, rc, p.to) || now > PIT_OUT + 250)) {
    rc.pit = null;
    rc.pitOff = null;
    c.lat = race.pitLane.side;
    rc.lane = c.lat;
    c.slide = 0;
    events.push({ kind: "pitOut", id: rc.id });
    return;
  }
  // ช่องจอด: หลบออกจากเลนวิ่งไปทางอู่ระหว่างเบรกเข้า/จอด/ออก
  let shift = 0;
  if (p.phase === "brake") shift = 1 - Math.max(0, p.stopAt - c.s) / p.t;
  else if (p.phase === "stop") shift = 1;
  else if (p.phase === "go") shift = Math.max(0, 1 - (c.s - p.stopAt) / 18);
  rc.pitOff = (now >= PIT_OUT ? p.to : pitLateral(race.pitLane, now, p.from, p.to)) + race.pitLane.side * BOX_SHIFT * shift;
}

/**
 * เดินหน้าการแข่งหนึ่งขั้น STEP · player = ปุ่มของผู้เล่น (lane = เลนที่เลือก)
 */
export function stepRace(race: Race, player: RaceInput, events: RaceEvent[] = []): RaceEvent[] {
  const t = race.track;
  // ขอ/ยกเลิกเข้าพิทได้ทุกเมื่อ (รวมก่อนไฟดับ)
  if (player.pitReq !== undefined) for (const rc of race.cars) if (rc.player) rc.pitWant = rc.finish === null ? player.pitReq : null;
  if (race.lights > 0) {
    race.lights -= STEP;
    return events;
  }
  race.t += STEP;
  const cars = race.cars;

  // ผลจากคันหน้า: ลมดูด (ตรงแนวกัน บนทางตรง) และอากาศเสีย (ในโค้ง)
  cars.forEach((rc, i) => {
    rc.tow = 0;
    rc.dirty = 0;
    if (inPit(rc)) return;
    const f = ahead(race, i);
    if (f.j < 0) return;
    const o = cars[f.j].car;
    const inLine = Math.abs(latM(t, o) - latM(t, rc.car)) < 1.6;
    const bend = Math.abs(sample(t, t.curve, rc.car.s));
    if (inLine && f.gap < TOW_RANGE && bend < 0.004) rc.tow = 1 - f.gap / TOW_RANGE;
    if (inLine && f.gap < DIRTY_RANGE && bend > 0.006) rc.dirty = 1 - f.gap / DIRTY_RANGE;
  });

  const stepEv: StepEvent[] = [];
  /** จบรอบ/เข้าเส้นชัย (ทั้งบนสนามและในพิทเลน) */
  const lapsDone = (rc: RaceCar, i: number) => {
    for (const e of stepEv) {
      if (e.kind !== "lap") continue;
      events.push({ kind: "lap", id: rc.id, lap: rc.car.lap, time: e.result.time });
      if (rc.finish === null && rc.car.lap >= race.laps && (race.finished || isLeader(race, i))) {
        rc.finish = race.t;
        race.finished = true;
      } else if (rc.finish === null && race.finished) {
        rc.finish = race.t;
      }
      if (rc.finish !== null && rc.finish === race.t) {
        // กติกา: ต้องเข้าพิทอย่างน้อย 1 ครั้ง (กำลังอยู่ในพิทตอนข้ามเส้น = นับว่าเข้าแล้ว)
        if (rc.pits === 0 && !rc.pit) {
          rc.penalty += PIT_MISS_PENALTY;
          events.push({ kind: "pitMiss", id: rc.id, penalty: rc.penalty });
        }
        events.push({ kind: "finish", id: rc.id, pos: cars.filter((o) => o.finish !== null).length });
      }
    }
  };
  cars.forEach((rc, i) => {
    // รถผู้เล่นคนอื่น (ออนไลน์): ตำแหน่งตั้งจากเครือข่ายด้วย setRemote
    if (rc.remote) return;
    if (rc.pit) {
      // ในพิท: รถวิ่งเอง ไม่มีกันชนท้าย/แซง
      stepEv.length = 0;
      stepPit(race, rc, { stop: !!(rc.player && player.pitStop), go: !!(rc.player && player.pitGo) }, stepEv, events);
      rc.held = false;
      rc.heldT = 0;
      rc.following = null;
      rc.braking = false;
      rc.passWant = 0;
      lapsDone(rc, i);
      return;
    }
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
      // ขอเข้าพิทไว้: ช่วงก่อนทางเข้ารถชิดเลนฝั่งพิทเอง
      const lane = rc.pass ? passLane(race, i, events) : rc.pitWant && approachingPit(t, rc.car.s) ? race.pitLane.side : (player.lane ?? 0);
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
    const vPre = rc.car.v;
    const sPre = rc.car.s;
    // ยาง: การเกาะถนนตามชนิด/การสึก/ความเย็น
    const g = tyreGrip(rc.tyre);
    stepCar(t, rc.car, { ...input, lane: want }, g === 1 ? rc.perf : { ...rc.perf, grip: rc.perf.grip * g }, stepEv, mods);
    rc.held = rc.car.v > vHold;
    if (rc.held) {
      // อยู่ในระยะกันชนแล้ว (คันหน้าเบรกแรง) → ชะลอรวมกับเบรกเองได้ถึง HOLD_DECEL_CLOSE ไม่งั้นไหลไปทับคันหน้า
      const inside = fb.gap < Math.max(HOLD_MIN, CAR_LEN + HOLD_GAP * vPre);
      const floor = inside ? Math.min(rc.car.v, vPre - HOLD_DECEL_CLOSE * STEP) : rc.car.v - HOLD_DECEL * STEP;
      rc.car.v = Math.max(0, vHold, floor);
    }
    rc.heldT = rc.held || (fb.j >= 0 && (fb.gap - CAR_LEN) / Math.max(15, rc.car.v) < FOLLOW_NEAR) ? rc.heldT + STEP : 0;
    rc.blocked = false;
    if (rc.car.lat !== before) {
      const now = rc.car.lat;
      // ห้ามตัดเข้าเลนที่มีรถเคียงอยู่ หรือมีรถอยู่ข้างหน้าใกล้เกินระยะกันชนท้าย
      const room = CAR_LEN + HOLD_GAP * rc.car.v * 0.6;
      const hit = cars.some((o, j) => {
        const d = o.car.s - rc.car.s;
        if (j === i || inPit(o) || d <= -CAR_LEN - 2 || d >= room) return false;
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
    // ยางสึก: ตามระยะ + ไถล/หลุดโค้ง
    if (rc.finish === null && race.lights <= 0) {
      const before = rc.tyre.wear;
      const sl = stepEv.find((e) => e.kind === "slide");
      wearTyre(rc.tyre, rc.car.s - sPre, wearPerMeter(rc.tyre.c, race.laps, t.length), sl?.kind === "slide" ? sl.amount : 0, STEP);
      if (stepEv.some((e) => e.kind === "excursion")) rc.tyre.wear += EXCURSION_WEAR;
      if (before < 0.75 && rc.tyre.wear >= 0.75) events.push({ kind: "tyreLow", id: rc.id });
    }
    lapsDone(rc, i);
    // ขอเข้าพิทไว้ (ผู้เล่น) / ถึงรอบตามแผน (AI) → ผ่านทางเข้าพิทแล้วเลี้ยวเข้า
    const call = rc.finish !== null ? null : rc.player ? rc.pitWant : aiPitCall(race, rc);
    if (call && sPre > 0) {
      const entry = nextLine(t, sPre) - PIT_IN;
      if (sPre < entry && rc.car.s >= entry) enterPit(race, rc, call, events);
    }
  });
  // ปุ่มแซงของผู้เล่น: สถานะและฝั่งที่แซงได้ตอนนี้
  for (let i = 0; i < cars.length; i++) {
    const rc = cars[i];
    if (!rc.player) continue;
    const chk = rc.pass || rc.pit || rc.finish !== null ? ({ state: "none" } as const) : passCheck(race, i);
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
      // ออนไลน์: รถผ่านกันได้ (กันแลค) — ผลักเฉพาะรถที่จำลองในเครื่องนี้ · รถในพิทเลนไม่ชนกับรถบนสนาม
      if (back.remote || front.remote || inPit(back) || inPit(front)) continue;
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
      if (inPit(A) || inPit(B)) continue;
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
  if (inPit(race.cars[idx])) return { left, right };
  race.cars.forEach((o, j) => {
    if (j === idx || inPit(o) || Math.abs(o.car.s - me.s) > CAR_LEN + 2) return;
    const d = latM(t, o.car) - latM(t, me);
    if (Math.abs(d) < CAR_W * 2) {
      if (d < 0) left = true;
      else right = true;
    }
  });
  return { left, right };
}

export { STEP };

/**
 * สถานะรถที่ส่งผ่านเครือข่าย: [ระยะ, ความเร็ว, เลน, ไถล, ปีกพับ, Overtake, รอบที่จบ, โทษ, เวลาจบ (−1 = ยังไม่จบ),
 *  ระยะเยื้องในพิทเลน (0 = อยู่บนสนาม), ยาง (0 S · 1 M · 2 H), ยางสึก, เข้าพิทไปแล้วกี่ครั้ง] — 4 ช่องท้ายไม่มีได้ (เวอร์ชันเก่า)
 */
export type NetState = [s: number, v: number, lat: number, slide: number, sm: 0 | 1, ot: 0 | 1, lap: number, pen: number, fin: number, pit?: number, tyre?: number, wear?: number, pits?: number];

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
  rc.pitOff === null ? 0 : Math.round(rc.pitOff * 100) / 100 || 0.01,
  COMPOUNDS.indexOf(rc.tyre.c),
  Math.round(rc.tyre.wear * 100) / 100,
  rc.pits,
];

/** ตั้งตำแหน่งรถผู้เล่นคนอื่นจากเครือข่าย (ประมาณล่วงหน้าตามเวลาที่ข้อมูลเดินทางมา ageSec) */
export function setRemote(race: Race, id: string, st: NetState, ageSec: number) {
  const rc = race.cars.find((c) => c.id === id);
  if (!rc || !rc.remote) return;
  const [s, v, lat, slide, sm, ot, lap, pen, fin, pit = 0, tyre = 1, wear = 0, pits = 0] = st;
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
  rc.pitOff = pit === 0 ? null : pit;
  rc.tyre.c = COMPOUNDS[tyre] ?? "medium";
  rc.tyre.wear = wear;
  rc.pits = pits;
  if (fin >= 0 && rc.finish === null) {
    rc.finish = fin;
    race.finished = true;
  }
}

/** ระหว่างเฟรม: รถผู้เล่นคนอื่นวิ่งต่อด้วยความเร็วล่าสุด (ไม่ให้กระตุกระหว่างรอข้อมูล) */
export function advanceRemote(race: Race, dt: number) {
  for (const rc of race.cars) if (rc.remote && rc.finish === null && race.lights <= 0) rc.car.s += rc.car.v * dt;
}

