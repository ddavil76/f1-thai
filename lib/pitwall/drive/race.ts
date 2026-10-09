/**
 * แข่งกับ AI ในโหมดนักขับ — รถหลายคันบนสนามเดียวกัน ใช้ฟิสิกส์เดียวกับผู้เล่น (car.ts)
 * การแซง:
 *  1) เลน: racing line + เลนซ้าย/ขวา (เลนในโค้ง = ทางสั้นแต่ช้ากว่า) · เปลี่ยนเลนไม่ได้ถ้ามีรถอยู่ข้าง ๆ
 *  2) ลมดูด: ตามหลังใกล้ ๆ บนทางตรง แรงต้านน้อยลง · อากาศเสีย: ตามติดในโค้ง เกาะถนนน้อยลง
 *  3) Overtake: แบตเตอรี่เสริม · ตามหลังไม่เกิน 1 วิ ตอนผ่านจุดวัด (ต้นโซน Straight Mode) ได้พลังงานเพิ่ม
 *  4) ดวลเบรก/กติกา: เคียงกันเข้าโค้ง คันด้านนอกที่ไม่นำครึ่งคันต้องยอม · ชนท้ายแรง = โทษ +5 วินาที
 * AI ใช้กลไกเดียวกัน (โจมตีเลนใน ป้องกันเลนใน ใช้ Overtake) ฝีมือ/ความผิดพลาดตามนักขับและระดับความยาก
 */
import { idealInput, newCar, perfOf, STEP, stepCar, type CarState, type Input, type Perf, type StepEvent } from "./car";
import { DS, laneValue, sample, type DriveTrack } from "./line";

/** ความยาวรถ (เมตร) และความกว้างที่ถือว่าชนกัน */
export const CAR_LEN = 5.4;
const CAR_W = 1.9;
/** ระยะลมดูด/อากาศเสีย (เมตร) */
const TOW_RANGE = 70;
const DIRTY_RANGE = 22;
/** ได้พลังงานเพิ่มเมื่อผ่านจุดวัดโดยตามหลังไม่เกิน 1 วินาที */
const DETECT_GAP = 1.0;
const DETECT_BONUS = 0.3;
/** โทษชนท้าย (วินาที) และความเร็วชนขั้นต่ำที่นับ (ม./วิ) */
export const CONTACT_PENALTY = 5;
const CONTACT_SPEED = 4;

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
  /** ช่วงเวลากันโทษซ้ำ */
  contactCool: number;
  /** AI: เวลาที่เหลือของความผิดพลาดครั้งนี้ */
  mistake: number;
};

export type RaceEvent =
  | { kind: "overtake"; by: string; on: string }
  | { kind: "contact"; id: string; penalty: number }
  | { kind: "detect"; id: string }
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
      contactCool: 0,
      mistake: 0,
    };
  });
  return { track, laps: opts.laps, cars, t: 0, lights: 4.2 + rng() * 1.2, order: cars.map((_, i) => i), finished: false, rng };
}

const latM = (t: DriveTrack, c: CarState) => laneValue(t, "offset", c.s, c.lat) + c.slide;

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

/** สมองของ AI: เลือกเลน ใช้ Overtake และขับตามความเร็วอ้างอิง (ช้ากว่าเล็กน้อยตามฝีมือ) */
function aiInput(race: Race, i: number): Input {
  const t = race.track;
  const rc = race.cars[i];
  const c = rc.car;
  const front = ahead(race, i);
  const toBrake = brakeAhead(t, c.s);
  // ความผิดพลาด: บางโค้งเบรกเร็ว/ช้าไปนิด
  if (rc.mistake > 0) rc.mistake -= STEP;
  else if (toBrake < 8 && race.rng() < 0.0025 * (1 + rc.slack * 40)) rc.mistake = 1.2;
  const scale = 1 - rc.slack - (rc.mistake > 0 ? 0.03 : 0);
  const pedals = idealInput(t, c, scale);

  // เลือกเลน: ตามติดคันหน้าก่อนโค้ง → ไปเลนในของโค้งถัดไป · โดนตามติด → ป้องกันเลนใน · ทางโล่ง → กลับ racing line
  const turn = turnAhead(t, c.s, 40, 220);
  const inside = turn > 0 ? 1 : -1;
  let lane = rc.lane;
  const behind = race.cars.some((o, j) => j !== i && o.finish === null && c.s - o.car.s > 0 && c.s - o.car.s < 14);
  if (front.j >= 0 && front.gap < 28 && toBrake < 260 && Math.abs(turn) > 0.02) lane = inside;
  else if (behind && toBrake < 300 && Math.abs(turn) > 0.02 && rc.slack < 0.03) lane = inside;
  else if (toBrake > 300 && (front.j < 0 || front.gap > 40)) lane = 0;
  rc.lane = lane;

  // Overtake: ใช้เมื่อไล่ติดคันหน้าบนทางตรง หรือแบตเต็มเกือบหมด
  const straight = Math.abs(sample(t, t.curve, c.s)) < 0.003 && toBrake > 120;
  const ot = straight && ((front.j >= 0 && front.gap < 45 && c.energy > 0.15) || c.energy > 0.85);
  return { ...pedals, lane, ot };
}

/**
 * เดินหน้าการแข่งหนึ่งขั้น STEP · player = ปุ่มของผู้เล่น (lane = เลนที่เลือก)
 */
export function stepRace(race: Race, player: Input, events: RaceEvent[] = []): RaceEvent[] {
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
      // จบแล้ว: วิ่งช้า ๆ ต่อ (cool-down lap)
      rc.car.v = Math.min(rc.car.v, 45);
    }
    const input = rc.player ? player : aiInput(race, i);
    const want = input.lane ?? rc.lane;
    // เปลี่ยนเลนไม่ได้ถ้ามีรถเคียงข้างในเลนนั้น (ขยับเข้าหารถที่อยู่ข้าง ๆ = ย้อนกลับ)
    const before = rc.car.lat;
    const oldM = latM(t, rc.car);
    stepEv.length = 0;
    const smBefore = t.smZone[Math.floor((((rc.car.s / DS) % t.n) + t.n) % t.n)];
    stepCar(t, rc.car, { ...input, lane: want }, rc.perf, stepEv, { tow: rc.tow, dirty: rc.dirty });
    rc.blocked = false;
    if (rc.car.lat !== before) {
      const newM = latM(t, rc.car);
      const hit = cars.some((o, j) => {
        if (j === i || Math.abs(o.car.s - rc.car.s) >= CAR_LEN) return false;
        const om = latM(t, o.car);
        return Math.abs(om - newM) < CAR_W && Math.abs(om - newM) < Math.abs(om - oldM);
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
    if (rc.contactCool > 0) rc.contactCool -= STEP;
  });

  // ชนกัน: คันหลังชนท้ายคันหน้าในแนวเดียวกัน → ถูกดันกลับ ความเร็วเท่าคันหน้า · ชนแรง = โทษ
  for (let a = 0; a < cars.length; a++)
    for (let b = 0; b < cars.length; b++) {
      if (a === b) continue;
      const back = cars[a];
      const front = cars[b];
      // ออนไลน์: รถผ่านกันได้ (กันแลค) แต่ชนท้ายแรงยังโดนโทษ — ผลักเฉพาะรถที่จำลองในเครื่องนี้
      if (back.remote) continue;
      const d = front.car.s - back.car.s;
      if (d <= 0 || d >= CAR_LEN) continue;
      if (Math.abs(latM(t, front.car) - latM(t, back.car)) >= CAR_W) continue;
      const rel = back.car.v - front.car.v;
      if (!front.remote) back.car.s = front.car.s - CAR_LEN;
      if (rel > 0) {
        if (!front.remote) back.car.v = front.car.v;
        if (rel > CONTACT_SPEED && back.contactCool <= 0 && back.finish === null) {
          back.penalty += CONTACT_PENALTY;
          back.contactCool = 3;
          events.push({ kind: "contact", id: back.id, penalty: back.penalty });
        }
      }
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
      if (outer.remote) continue;
      if (outer.car.s - inner.car.s < CAR_LEN / 2 && outer.car.v > inner.car.v - 0.5) {
        outer.car.v = Math.max(0, inner.car.v - 0.5);
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
    if (Math.abs(d) < 4) {
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

