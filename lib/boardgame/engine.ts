/**
 * กติกา Grand Prix Tour — ฟังก์ชันล้วน ไม่มี state ซ่อน
 * ความสุ่มทั้งหมดผ่าน `rng` ที่ส่งเข้ามา เพื่อให้เทสต์ซ้ำได้
 *
 * ก่อนแข่ง: ดูพยากรณ์อากาศ แล้วแต่ละคนเลือกการ์ดยาง 4 ใบ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรอง)
 * แต่ละเทิร์นเลือก 1 ใน 2 แบบ:
 *   ขับคุม — เดินคงที่ ไม่พลิกไพ่ ยางไม่สึก
 *   เร่ง   — พลิกไพ่เร่งใบบนสุดของกองตัวเอง ใช้ค่าตามแถวของยาง (นิ่ม/กลาง/แข็ง)
 *            ไพ่มีสัญลักษณ์: สึก (ยางเสื่อม), หยดน้ำ (ความเสี่ยงหมุนในฝน), ทีม/เหตุการณ์ (ผลพิเศษ)
 * ยางหมดอายุ = "ยางพัง": ขับคุมได้เท่าที่ลดทอน ใช้การ์ดไม่ได้ ต้องเข้าพิท
 * ผู้เล่นเดินตามอันดับ (คนนำก่อน) ใครข้ามเส้นชัยก่อนชนะทันที
 * สนามมี 2 เลน: เส้นแข่ง (lane 0) กับเลนนอก (lane 1) — เร่งจากเลนนอกได้ค่าน้อยลง
 * ช่องหนึ่งจุรถได้ 2 คัน (คนละเลน) ถ้าเต็มทั้งสองเลนแซงผ่านไม่ได้ ต้องหยุดหลัง
 * โค้ง: ถ้าเดินเข้าโค้ง ต้องหยุดอยู่ในโค้งก่อน แล้วค่อยออกในตาถัดไป
 * รถ AI เดินเองตามกฎตายตัว (ไพ่เร่งแถวกลาง ไม่คิดเรื่องยาง)
 * อากาศถูกกำหนดไว้ตั้งแต่เริ่มเกมและพยากรณ์ล่วงหน้าได้ (เทิร์นไกล ๆ ไม่แม่น)
 * ธงเหลืองเตือนว่ารอบหน้าอาจมีเซฟตี้คาร์ — ช่วงนั้นเข้าพิทฟรี แต่ผ่านรอบนั้นไปแล้วต้องเสียเวลาเต็ม
 */

import type { Zone } from "./board";

export type Rng = () => number;

export type Tyre = "soft" | "medium" | "hard" | "inter" | "wet";
/** แถวของค่าบนไพ่เร่งที่ยางแต่ละชนิดใช้ */
export type Col = "soft" | "medium" | "hard";
export type Action = "boost" | "slipstream" | "pit" | "save" | "block" | "reroll" | "sky";
export type EventKind = "safety_car" | "red_flag";
export type Weather = "dry" | "light_rain" | "heavy_rain";
export type Mode = "cruise" | "push";
/** ปรับตารางอากาศ: earlier = อากาศถัดไปมาเร็วขึ้น 1 รอบ, later = ยืดอากาศตอนนี้ออกไปอีก 1 รอบ */
export type SkyShift = "earlier" | "later";

/**
 * col = แถวค่าบนไพ่เร่งที่ใช้, life = ไพ่สึกกี่ใบก่อนยางหมดอายุ, best = สภาพอากาศที่เหมาะ
 * ยางฝนใช้แถวเดียวกับยางแห้งที่ใกล้เคียง (อินเตอร์ ≈ กลาง, เว็ท ≈ แข็ง)
 */
export const TYRES: Record<Tyre, { label: string; col: Col; life: number; best: string }> = {
  soft: { label: "นิ่ม", col: "soft", life: 2, best: "แห้ง" },
  medium: { label: "กลาง", col: "medium", life: 3, best: "แห้ง" },
  hard: { label: "แข็ง", col: "hard", life: 5, best: "แห้ง" },
  inter: { label: "อินเตอร์", col: "medium", life: 3, best: "ฝนเบา" },
  wet: { label: "เว็ท", col: "hard", life: 4, best: "ฝนหนัก" },
};

export const COL_LABEL: Record<Col, string> = { soft: "นิ่ม", medium: "กลาง", hard: "แข็ง" };
const COL_INDEX: Record<Col, number> = { soft: 0, medium: 1, hard: 2 };

export type SpeedIcon = "team" | "event" | null;

/**
 * ไพ่เร่ง: v = ค่าก้าวของแถวนิ่ม/กลาง/แข็ง, wear = สัญลักษณ์ยางสึก,
 * risk = จำนวนหยดน้ำ (0–3) ยิ่งมากยิ่งหมุนง่ายตอนเร่งในฝน, icon = ผลพิเศษหลังเดิน
 */
export type SpeedCard = {
  v: [number, number, number];
  wear: boolean;
  risk: number;
  icon: SpeedIcon;
};

const sc = (
  s: number, m: number, h: number, wear: 0 | 1, risk: number, icon: SpeedIcon = null,
): SpeedCard => ({ v: [s, m, h], wear: wear === 1, risk, icon });

/** สำรับไพ่เร่ง 20 ใบ (ทุกคนมีชุดเดียวกัน แต่สับคนละกอง): ไพ่แรงมักสึกง่ายและเสี่ยงหมุน */
export const SPEED_CARDS: SpeedCard[] = [
  sc(9, 7, 5, 1, 3),
  sc(9, 6, 4, 1, 2),
  sc(8, 7, 5, 1, 1, "team"),
  sc(8, 6, 4, 1, 0),
  sc(8, 5, 4, 0, 2, "event"),
  sc(7, 6, 5, 1, 3),
  sc(7, 6, 4, 0, 1),
  sc(7, 5, 5, 1, 0),
  sc(7, 5, 4, 0, 0, "team"),
  sc(7, 5, 4, 1, 2),
  sc(6, 6, 5, 0, 0),
  sc(6, 5, 5, 1, 1, "event"),
  sc(6, 5, 4, 0, 3),
  sc(6, 5, 4, 1, 0),
  sc(6, 5, 4, 0, 2),
  sc(6, 5, 3, 0, 1, "team"),
  sc(5, 5, 5, 0, 0),
  sc(5, 5, 4, 1, 0, "event"),
  sc(5, 4, 4, 0, 1),
  sc(4, 4, 4, 0, 0),
];

/** ค่าก้าวบนไพ่สำหรับยางชนิดนี้ */
export const speedValue = (c: SpeedCard, t: Tyre) => c.v[COL_INDEX[TYRES[t].col]];

/** ค่าเฉลี่ยของแถวนั้นทั้งสำรับ — ไว้บอกผู้เล่นว่ายางแต่ละชนิดแรงแค่ไหน */
export function columnAvg(col: Col): number {
  const sum = SPEED_CARDS.reduce((a, c) => a + c.v[COL_INDEX[col]], 0);
  return Math.round((sum / SPEED_CARDS.length) * 10) / 10;
}

export const WEATHER: Record<Weather, { label: string }> = {
  dry: { label: "แห้ง" },
  light_rain: { label: "ฝนเบา" },
  heavy_rain: { label: "ฝนหนัก" },
};

/** โบนัส/โทษก้าวตอนเร่ง จากยางที่เหมาะหรือไม่เหมาะกับอากาศ */
const MOVE_MOD: Record<Weather, Record<Tyre, number>> = {
  dry: { soft: 0, medium: 0, hard: 0, inter: -1, wet: -2 },
  light_rain: { soft: 0, medium: 0, hard: 0, inter: 1, wet: 0 },
  heavy_rain: { soft: 0, medium: 0, hard: 0, inter: 0, wet: 1 },
};

/** ตอนเร่งในฝน ถ้าไพ่มีหยดน้ำถึงเกณฑ์นี้ = หมุน (ไม่มีเกณฑ์ = ไม่หมุน) */
const SPIN_AT: Record<Weather, Record<Tyre, number>> = {
  dry: { soft: 99, medium: 99, hard: 99, inter: 99, wet: 99 },
  light_rain: { soft: 2, medium: 2, hard: 2, inter: 99, wet: 99 },
  heavy_rain: { soft: 1, medium: 1, hard: 1, inter: 3, wet: 99 },
};

/** โอกาสหมุนโดยประมาณ = สัดส่วนไพ่ในสำรับที่หยดน้ำถึงเกณฑ์ */
export function spinChance(w: Weather, t: Tyre): number {
  const at = SPIN_AT[w][t];
  return SPEED_CARDS.filter((c) => c.risk >= at).length / SPEED_CARDS.length;
}

/** ผลของอากาศต่อยางหนึ่งใบตอนเร่ง (ใช้แสดงคำเตือนในหน้าจอด้วย) */
export const weatherEffect = (w: Weather, t: Tyre) => ({
  move: MOVE_MOD[w][t],
  spin: spinChance(w, t),
});

export const isRainTyre = (t: Tyre) => t === "inter" || t === "wet";
const isWet = (w: Weather) => w !== "dry";

export const ACTIONS: Record<Action, { label: string; desc: string }> = {
  boost: { label: "ดันสุด", desc: "ใช้ตอนเร่ง: +3 ช่อง แต่ยางเสื่อมเพิ่มอีก 1 ใบ (ในแห้ง)" },
  slipstream: { label: "ดูดอากาศ", desc: "+2 ช่อง (+4 ถ้าคุณตามหลังอยู่) ใช้ได้ทั้งขับคุมและเร่ง" },
  pit: {
    label: "เข้าพิท",
    desc: "เปลี่ยนเป็นยางสำรองที่เลือก เสียเวลา 2 ช่อง (ฟรีตอนเซฟตี้คาร์) แล้วขับออกแบบขับคุม",
  },
  save: { label: "ประหยัดยาง", desc: "ใช้ตอนเร่ง: ยางไม่สึกเทิร์นนี้ แต่ −1 ช่อง" },
  block: { label: "ขวางทาง", desc: "คนที่เดินต่อจากคุณเดิน −2 ช่อง (ต้องมีคนเดินตามหลังคุณ)" },
  reroll: { label: "พลิกสองใบ", desc: "ใช้ตอนเร่ง: พลิกไพ่เร่ง 2 ใบ ใช้ใบที่ให้ค่ามากกว่า" },
  sky: {
    label: "ปรับฟ้า",
    desc: "ลัดฟ้า: อากาศถัดไปมาเร็วขึ้น 1 รอบ · ยืดฟ้า: อากาศตอนนี้อยู่ต่ออีก 1 รอบ",
  },
};

export const EVENTS: Record<EventKind, { label: string; desc: string }> = {
  safety_car: {
    label: "เซฟตี้คาร์",
    desc: "ช่องว่างจากผู้นำเหลือครึ่งเดียว ไพ่เร่งมีค่าสูงสุด 5 และเข้าพิทฟรีในรอบนี้เท่านั้น",
  },
  red_flag: { label: "ธงแดง", desc: "ยางที่ใช้อยู่กลับมาใหม่ คันท้ายสุดได้ +3 ช่อง" },
};

/** ผลพิเศษของไพ่เร่งที่มีสัญลักษณ์ "เหตุการณ์" */
export type CardEvent = "lockup" | "wearmore" | "tailwind" | "radio" | "brakes" | "yellow";

export const CARD_EVENTS: Record<CardEvent, { label: string; desc: string }> = {
  lockup: { label: "ล็อกล้อ", desc: "ถอยหลัง 2 ช่อง" },
  wearmore: { label: "ยางเสื่อมเร็ว", desc: "อายุยางลดอีก 1" },
  tailwind: { label: "ลมส่ง", desc: "เดินเพิ่ม +2 ช่อง" },
  radio: { label: "วิทยุทีม", desc: "จั่วการ์ดเพิ่ม 1 ใบ" },
  brakes: { label: "เบรกร้อน", desc: "เทิร์นหน้าขับคุมเท่านั้น" },
  yellow: { label: "ขับพลาด", desc: "รอบหน้าขึ้นธงเหลือง" },
};
const CARD_EVENT_LIST = Object.keys(CARD_EVENTS) as CardEvent[];

export const HAND_SIZE = 3;
export const TYRE_SLOTS = 4;
/** เลือกยางแต่ละชนิดซ้ำได้ไม่เกินนี้ */
export const MAX_PER_COMPOUND = 2;
/** ขับคุมเดินกี่ช่อง */
export const CRUISE_MOVE = 3;
/** ยางพังเดินกี่ช่อง */
export const WORN_MOVE = 2;
/** เสียเวลาเข้าพิทกี่ช่อง (เซฟตี้คาร์ = ฟรี) */
export const PIT_COST = 2;
/** เร่งจากเลนนอกได้ค่าน้อยลงเท่านี้ */
export const OFFLINE_PENALTY = 2;
/** ไพ่เร่งมีค่าสูงสุดเท่านี้ในรอบเซฟตี้คาร์ */
export const SC_SPEED_CAP = 5;
/** โอกาสเกิดธงแดงต้นรอบ */
export const RED_FLAG_CHANCE = 0.08;
/** โอกาสมีธงเหลืองต้นรอบ (เมื่อไม่มีเหตุการณ์อื่น) */
export const YELLOW_CHANCE = 0.3;
/** ธงเหลืองแล้วรอบหน้าเป็นเซฟตี้คาร์จริงกี่ส่วน */
export const YELLOW_TO_SC = 0.6;
/** พยากรณ์เทิร์นที่ห่างเกินนี้จะเริ่มไม่แน่นอน */
export const SURE_AHEAD = 2;
/** จำนวนรอบเทิร์นที่วางแผนอากาศไว้ (เกินนี้แห้ง) */
const PLAN_ROUNDS = 30;
/** โอกาสที่พยากรณ์ระยะไกลของแต่ละรอบผิด */
const FORECAST_WRONG = 0.3;

/** สำรับ action ของผู้เล่นแต่ละคน (13 ใบ) */
export const DECK_LIST: Record<Action, number> = {
  boost: 3, slipstream: 2, pit: 2, save: 2, block: 2, reroll: 1, sky: 1,
};

export type WeatherPlan = {
  /** อากาศจริงของแต่ละรอบเทิร์น (ดัชนี 0 = รอบที่ 1) */
  weather: Weather[];
  /** รอบไหนที่พยากรณ์ระยะไกลจะผิด */
  fcWrong: boolean[];
};

/** สุ่มแผนอากาศ: ฝน 1–2 ช่วง ช่วงละ 2–4 รอบ เริ่มรอบ 3–8 */
export function makeWeatherPlan(rng: Rng): WeatherPlan {
  const weather: Weather[] = Array<Weather>(PLAN_ROUNDS).fill("dry");
  const spells = 1 + (rng() < 0.5 ? 1 : 0);
  for (let s = 0; s < spells; s++) {
    const start = 3 + Math.floor(rng() * 6);
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) {
      const i = start - 1 + k;
      const w: Weather = rng() < 0.4 ? "heavy_rain" : "light_rain";
      if (weather[i] !== "heavy_rain") weather[i] = w;
    }
  }
  return { weather, fcWrong: weather.map(() => rng() < FORECAST_WRONG) };
}

export type Forecast = { weather: Weather; sure: boolean };

/** พยากรณ์ของรอบ `round + ahead` ที่มองจากรอบ `round` — เทิร์นไกลอาจคลาดเคลื่อนหนึ่งขั้น */
export function forecastAt(plan: WeatherPlan, round: number, ahead: number): Forecast {
  const i = round - 1 + ahead;
  const actual = plan.weather[i] ?? "dry";
  const sure = ahead < SURE_AHEAD;
  if (sure || !plan.fcWrong[i]) return { weather: actual, sure };
  const off: Record<Weather, Weather> = {
    dry: "light_rain",
    light_rain: "dry",
    heavy_rain: "light_rain",
  };
  return { weather: off[actual], sure };
}

/** ข้อมูลสนามที่กติกาต้องใช้: จำนวนช่องต่อรอบ และโค้ง */
export type Track = { lapCells: number; corners: Zone[] };

export type Lane = 0 | 1;

export type Player = {
  id: number;
  name: string;
  /** เลขรถ */
  num: number;
  /** รถ AI เดินเอง */
  ai: boolean;
  /** 0 = เส้นแข่ง, 1 = เลนนอก */
  lane: Lane;
  /** ตำแหน่งสะสมเป็นจำนวนช่อง (0 = เส้นสตาร์ท) */
  progress: number;
  /** ยางที่ใส่ไว้ตอนเริ่ม — ใบแรกคือใบที่ใช้อยู่ ที่เหลือเป็นยางสำรอง */
  tyres: Tyre[];
  /** อายุยางใบที่ใช้อยู่ (จำนวนไพ่สึกที่รับได้อีก) 0 = ยางพัง */
  life: number;
  hand: Action[];
  deck: Action[];
  discard: Action[];
  /** กองไพ่เร่ง (เก็บเป็นลำดับในอาเรย์ SPEED_CARDS) ใบแรกคือใบที่จะพลิก */
  speedDeck: number[];
  speedDiscard: number[];
  /** ก้าวที่โดนหักในเทิร์นถัดไป (จากการ์ดขวางทาง) */
  debuff: number;
  /** เบรกร้อน: เทิร์นถัดไปขับคุมเท่านั้น */
  limp: boolean;
};

export type TurnLog = {
  player: number;
  ai: boolean;
  /** ตำแหน่งก่อนเดิน */
  from: number;
  /** ถูกรถขวางจนเดินไม่ครบ */
  blocked: boolean;
  /** ต้องหยุดในโค้ง */
  corner: boolean;
  /** ไพ่เร่งที่ใช้ (ลำดับใน SPEED_CARDS) — null เมื่อขับคุม */
  card: number | null;
  action: Action | null;
  mode: Mode;
  moved: number;
  /** เริ่มเทิร์นด้วยยางพัง */
  worn: boolean;
  /** หมุนในฝน */
  spun: boolean;
  /** ผลของสัญลักษณ์เหตุการณ์บนไพ่ (ถ้ามี) */
  cardEvent: CardEvent | null;
};

export type GameState = WeatherPlan & {
  track: Track;
  players: Player[];
  /** ช่องที่ต้องไปให้ถึง = ช่องต่อรอบ × จำนวนรอบ */
  total: number;
  round: number;
  /** ลำดับผู้เล่น (id) ที่เดินในรอบเทิร์นนี้ — คนนำก่อน */
  order: number[];
  /** ตำแหน่งในอาเรย์ order ของคนที่ถึงตาเล่น */
  turn: number;
  /** เหตุการณ์ของรอบนี้ (ถ้ามี) */
  event: EventKind | null;
  /** ธงเหลืองรอบนี้ — รอบหน้ามีโอกาสเป็นเซฟตี้คาร์ */
  yellow: boolean;
  /** มีเหตุผิดปกติในรอบนี้ (หมุน/ขับพลาด) — ทำให้รอบหน้าขึ้นธงเหลือง */
  incident: boolean;
  winner: number | null;
  /** อันดับสุดท้ายตอนจบเรซ (id เรียงตามอันดับ) */
  finish: number[] | null;
  /** เทิร์นของผู้เล่นคนล่าสุด */
  lastTurn: TurnLog | null;
  /** ทุกการเดินตั้งแต่ผู้เล่นตัดสินใจครั้งล่าสุด (รวมรถ AI ที่เดินตามมา) */
  feed: TurnLog[];
};

export const weatherNow = (s: GameState): Weather => s.weather[s.round - 1] ?? "dry";

/** ผู้เล่นที่ถึงตาเล่น */
export const activePlayer = (s: GameState): Player => s.players[s.order[s.turn]];

/** ในรอบนี้มีคนเดินต่อจากคุณหรือไม่ (ใช้กับการ์ดขวางทาง) */
const hasFollower = (s: GameState) => s.turn < s.order.length - 1;

export const isWorn = (p: Player) => p.life <= 0;

/** เทิร์นนี้บังคับขับคุมหรือไม่ (ยางพัง หรือเบรกร้อน) */
export const mustCruise = (p: Player) => isWorn(p) || p.limp;

/** อากาศรอบนี้พลิกประเภทจากรอบก่อน (แห้ง ↔ ฝน) — ช่วงสลับยางด่วนฟรี */
export function weatherFlipped(s: GameState): boolean {
  if (s.round < 2) return false;
  const prev = s.weather[s.round - 2] ?? "dry";
  return isWet(prev) !== isWet(weatherNow(s));
}

/** สลับยางด่วน: ต้องเป็นรอบที่อากาศพลิก เลือกยางสำรองที่เหมาะกับอากาศใหม่ และยางที่ใช้อยู่ต้องไม่เหมาะ */
export function canSwap(s: GameState, p: Player, idx: number): boolean {
  if (!weatherFlipped(s) || idx < 1 || idx >= p.tyres.length) return false;
  const wet = isWet(weatherNow(s));
  return isRainTyre(p.tyres[idx]) === wet && isRainTyre(p.tyres[0]) !== wet;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ชุดยางที่เลือกใช้ได้จริงหรือไม่: ครบช่อง และชนิดเดียวกันไม่เกินที่กำหนด */
export function validTyres(tyres: Tyre[]): boolean {
  if (tyres.length !== TYRE_SLOTS) return false;
  return (Object.keys(TYRES) as Tyre[]).every(
    (t) => tyres.filter((x) => x === t).length <= MAX_PER_COMPOUND,
  );
}

/** จั่วการ์ด action จนมือครบ (ถึง `size` ใบ) — สำรับหมดก็สับกองทิ้งกลับมาเป็นสำรับใหม่ */
function refill(p: Player, rng: Rng, size = HAND_SIZE): Player {
  let { deck, discard } = p;
  const hand = [...p.hand];
  while (hand.length < size) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      deck = shuffle(discard, rng);
      discard = [];
    }
    hand.push(deck[0]);
    deck = deck.slice(1);
  }
  return { ...p, hand, deck, discard };
}

/** พลิกไพ่เร่งใบบนสุด — กองหมดก็สับกองทิ้งกลับมา */
function drawSpeed(
  deck: number[], discard: number[], rng: Rng,
): { id: number; deck: number[]; discard: number[] } {
  let d = deck;
  let x = discard;
  if (d.length === 0) {
    d = shuffle(x, rng);
    x = [];
  }
  return { id: d[0], deck: d.slice(1), discard: x };
}

/** สเปกรถตอนเริ่มเกม — รถ AI ไม่ต้องเลือกยาง */
export type CarSpec = { name: string; num: number; ai: boolean; tyres?: Tyre[] };

/** ยางของรถ AI: ใช้ค่าแถวกลางเสมอ ไม่สึก ไม่ต้องเข้าพิท */
const AI_TYRES: Tyre[] = ["medium"];
const AI_LIFE = 99;

/**
 * เริ่มเกม: จัดกริดแถวละ 2 คัน (คันแรกของแถวอยู่เส้นแข่ง) แถวหน้าอยู่เส้นสตาร์ท แถวหลังถอยไปทีละช่อง
 * `grid` = ลำดับกริด (id) ถ้าไม่ส่งจะสุ่ม แล้วให้รถ AI ที่อยู่หน้าผู้เล่นเดินไปก่อนเลย
 */
export function newGame(
  cars: CarSpec[],
  track: Track,
  laps: number,
  plan: WeatherPlan,
  rng: Rng,
  grid?: number[],
): GameState {
  const deckCards = (Object.keys(DECK_LIST) as Action[]).flatMap((a) =>
    Array<Action>(DECK_LIST[a]).fill(a),
  );
  const speedIds = SPEED_CARDS.map((_, i) => i);
  const order = grid ?? shuffle(cars.map((_, id) => id), rng);
  const players = cars.map((car, id) => {
    const slot = order.indexOf(id);
    const tyres = car.ai ? AI_TYRES : (car.tyres ?? AI_TYRES);
    return refill(
      {
        id,
        name: car.name,
        num: car.num,
        ai: car.ai,
        lane: (slot % 2) as Lane,
        progress: -Math.floor(slot / 2) || 0, // กัน -0
        tyres,
        life: car.ai ? AI_LIFE : TYRES[tyres[0]].life,
        hand: [],
        deck: car.ai ? [] : shuffle(deckCards, rng),
        discard: [],
        speedDeck: shuffle(speedIds, rng),
        speedDiscard: [],
        debuff: 0,
        limp: false,
      },
      rng,
    );
  });
  const state: GameState = {
    ...plan,
    track,
    players,
    total: track.lapCells * laps,
    round: 1,
    order,
    turn: 0,
    event: null,
    yellow: false,
    incident: false,
    winner: null,
    finish: null,
    lastTurn: null,
    feed: [],
  };
  return runAI(state, rng);
}

/** ช่องในรอบของตำแหน่งสะสม */
export const lapCell = (t: Track, p: number) => ((p % t.lapCells) + t.lapCells) % t.lapCells;

/** อยู่ในโค้งไหน (ลำดับใน corners) หรือ -1 */
export function cornerAt(t: Track, p: number): number {
  const c = lapCell(t, p);
  return t.corners.findIndex((z) =>
    z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end,
  );
}

/** เลนที่ถูกรถคันอื่นใช้อยู่ ณ ตำแหน่งนั้น */
function takenLanes(players: Player[], self: number, p: number): Set<Lane> {
  return new Set(players.filter((o) => o.id !== self && o.progress === p).map((o) => o.lane));
}

/**
 * เดินไปข้างหน้า `n` ช่องจริงบนสนาม:
 * 1) ถ้าทางเข้าโค้งใหม่ ต้องหยุดที่ช่องสุดท้ายของโค้งนั้น (ออกจากโค้งที่ยืนอยู่ได้ตามปกติ)
 * 2) ช่องที่รถเต็มทั้งสองเลนผ่านไม่ได้ — หยุดหลังช่องนั้น
 * 3) ลงจอดเส้นแข่งก่อนถ้าว่าง ไม่งั้นเลนนอก ถ้าเต็มทั้งคู่ถอยมาช่องก่อนหน้า
 */
export function travel(
  s: GameState, players: Player[], car: Player, n: number,
): { progress: number; lane: Lane; blocked: boolean; corner: boolean } {
  const t = s.track;
  let target = car.progress + Math.max(0, n);
  let corner = false;
  const startZone = cornerAt(t, car.progress);
  for (let p = car.progress + 1; p < target; p++) {
    const z = cornerAt(t, p);
    if (z >= 0 && z !== startZone && cornerAt(t, p + 1) !== z) {
      target = p;
      corner = true;
      break;
    }
  }
  let reach = car.progress;
  let blocked = false;
  for (let p = car.progress + 1; p <= target; p++) {
    if (takenLanes(players, car.id, p).size >= 2) {
      blocked = true;
      break;
    }
    reach = p;
  }
  while (reach > car.progress) {
    const taken = takenLanes(players, car.id, reach);
    if (!taken.has(0)) return { progress: reach, lane: 0, blocked, corner };
    if (!taken.has(1)) return { progress: reach, lane: 1, blocked, corner };
    reach--;
    blocked = true;
  }
  return { progress: car.progress, lane: car.lane, blocked, corner };
}

/** จัดรถไม่ให้ทับกันหลังเหตุการณ์ที่ย้ายตำแหน่ง (คันหน้าได้ที่ก่อน คันที่ชนถอยไปช่องหลัง) */
export function settle(players: Player[]): Player[] {
  const sorted = [...players].sort(
    (a, b) => b.progress - a.progress || a.lane - b.lane || a.id - b.id,
  );
  const taken = new Map<number, Set<Lane>>();
  const placed = new Map<number, Player>();
  for (const car of sorted) {
    let p = car.progress;
    for (;;) {
      const used = taken.get(p) ?? new Set<Lane>();
      const lane: Lane | null = !used.has(car.lane) ? car.lane : !used.has(0) ? 0 : !used.has(1) ? 1 : null;
      if (lane !== null) {
        used.add(lane);
        taken.set(p, used);
        placed.set(car.id, { ...car, progress: p, lane });
        break;
      }
      p--;
    }
  }
  return players.map((c) => placed.get(c.id)!);
}

/**
 * เล่นการ์ดนี้ได้หรือไม่ใน `mode` ที่เลือก (mode ที่ส่งมาควรเป็นโหมดจริงหลังบังคับแล้ว)
 * ยางพัง: เล่นได้เฉพาะเข้าพิท (ไม่ต้องมีการ์ดในมือ)
 */
export function canPlay(s: GameState, p: Player, a: Action | null, mode: Mode): boolean {
  if (a === null) return true;
  const worn = isWorn(p);
  if (a === "pit") return p.tyres.length > 1 && (worn || p.hand.includes("pit"));
  if (worn || !p.hand.includes(a)) return false;
  if (a === "boost" || a === "save" || a === "reroll") return mode === "push";
  if (a === "block") return hasFollower(s);
  return true;
}

/** เข้าพิทตอนนี้เสียเวลากี่ช่อง */
export const pitCost = (s: GameState) => (s.event === "safety_car" ? 0 : PIT_COST);

/** ผู้เล่นเรียงตามตำแหน่ง (ผู้นำก่อน) — เสมอกันให้ลำดับเดิม */
export function standings(state: GameState): Player[] {
  return [...state.players].sort(
    (a, b) => b.progress - a.progress || a.lane - b.lane || a.id - b.id,
  );
}

/** ปรับตารางอากาศของรอบถัดไปเป็นต้นไป โดยความยาวแผนคงเดิม */
export function shiftSky(s: GameState, shift: SkyShift): GameState {
  const weather = [...s.weather];
  const fcWrong = [...s.fcWrong];
  const next = s.round; // ดัชนีของรอบถัดไป
  if (shift === "earlier") {
    weather.splice(next, 1);
    fcWrong.splice(next, 1);
    weather.push("dry");
    fcWrong.push(false);
  } else {
    weather.splice(next, 0, weather[s.round - 1] ?? "dry");
    fcWrong.splice(next, 0, false);
    weather.pop();
    fcWrong.pop();
  }
  return { ...s, weather, fcWrong };
}

export type TurnChoice = {
  mode: Mode;
  action: Action | null;
  /** ยางสำรองที่เปลี่ยนไปใช้ตอนเข้าพิท (ลำดับใน tyres, ค่าเริ่มต้น 1) */
  pitTo?: number;
  /** ทิศทางปรับฟ้า เมื่อเล่นการ์ดปรับฟ้า (ค่าเริ่มต้น earlier) */
  sky?: SkyShift;
  /** สลับยางด่วน (ลำดับยางสำรอง) ในรอบที่อากาศพลิก */
  swap?: number | null;
};

/** เล่น 1 เทิร์นของผู้เล่น (แล้วรถ AI ที่ต่อคิวเดินตามจนถึงคนถัดไป) — เลือกไม่ถูกกติกาจะคืน state เดิม */
export function playTurn(state: GameState, choice: TurnChoice, rng: Rng): GameState {
  if (state.winner !== null) return state;
  const { action } = choice;
  const first = activePlayer(state);
  if (first.ai) return state;

  // สลับยางด่วน (ถ้ามี) เกิดก่อนเดิน — ยางเดิมถูกทิ้ง ยางใหม่ได้อายุเต็ม
  let me = first;
  if (choice.swap != null) {
    if (action === "pit" || !canSwap(state, first, choice.swap)) return state;
    const i = choice.swap;
    const tyres = [first.tyres[i], ...first.tyres.slice(1).filter((_, k) => k + 1 !== i)];
    me = { ...first, tyres, life: TYRES[tyres[0]].life };
  }

  const worn = isWorn(me);
  const mode: Mode = mustCruise(me) || action === "pit" ? "cruise" : choice.mode;
  if (!canPlay(state, me, action, mode)) return state;

  let tyres = me.tyres;
  let life = me.life;
  let cost = 0;
  if (action === "pit") {
    const to = choice.pitTo ?? 1;
    if (!(to >= 1 && to < tyres.length)) return state;
    tyres = [tyres[to], ...tyres.slice(1).filter((_, k) => k + 1 !== to)];
    life = TYRES[tyres[0]].life;
    cost = pitCost(state);
  }

  const weather = weatherNow(state);
  const behind = state.players.some((p) => p.progress > me.progress);
  const follow = action === "slipstream" ? (behind ? 4 : 2) : 0;

  let card: number | null = null;
  let speedDeck = me.speedDeck;
  let speedDiscard = me.speedDiscard;
  let spun = false;
  let want: number;
  let decay = 0;

  if (action === "pit") {
    want = Math.max(1, CRUISE_MOVE - cost - me.debuff);
  } else if (mode === "cruise") {
    want = Math.max(1, (worn ? WORN_MOVE : CRUISE_MOVE) + follow - me.debuff);
  } else {
    // พลิกไพ่เร่ง (พลิกสองใบแล้วเลือกใบที่ค่ามากกว่า)
    const drawn: number[] = [];
    for (let k = 0; k < (action === "reroll" ? 2 : 1); k++) {
      const d = drawSpeed(speedDeck, speedDiscard, rng);
      drawn.push(d.id);
      speedDeck = d.deck;
      speedDiscard = d.discard;
    }
    card = drawn.reduce((best, id) =>
      speedValue(SPEED_CARDS[id], tyres[0]) > speedValue(SPEED_CARDS[best], tyres[0]) ? id : best,
    );
    speedDiscard = [...speedDiscard, ...drawn];
    const c = SPEED_CARDS[card];
    const value = state.event === "safety_car"
      ? Math.min(speedValue(c, tyres[0]), SC_SPEED_CAP)
      : speedValue(c, tyres[0]);
    spun = isWet(weather) && c.risk >= SPIN_AT[weather][tyres[0]];
    const bonus = action === "boost" ? 3 : action === "save" ? -1 : follow;
    const offline = me.lane === 1 ? OFFLINE_PENALTY : 0;
    want = spun
      ? 1
      : Math.max(1, value + MOVE_MOD[weather][tyres[0]] + bonus - offline - me.debuff);
    // ฝนไม่ทำให้ยางสึก — ในแห้ง: ไพ่สึก +1, ดันสุด +1, ยางฝนในแห้งร้อนเกิน +1 (ประหยัดยางไม่สึก)
    if (weather === "dry" && action !== "save") {
      decay = (c.wear ? 1 : 0) + (action === "boost" ? 1 : 0) + (isRainTyre(tyres[0]) ? 1 : 0);
    }
  }

  const go = travel(state, state.players, me, want);

  // เข้าพิทตอนยางพังไม่ต้องใช้การ์ด
  const usesCard = action !== null && !(action === "pit" && worn);
  const hand = [...me.hand];
  const discard = [...me.discard];
  if (usesCard && action) {
    hand.splice(hand.indexOf(action), 1);
    discard.push(action);
  }
  let played = refill(
    {
      ...me,
      progress: go.progress,
      lane: go.lane,
      tyres,
      life: Math.max(0, life - decay),
      hand,
      discard,
      speedDeck,
      speedDiscard,
      debuff: 0,
      limp: false,
    },
    rng,
  );

  // สัญลักษณ์พิเศษบนไพ่เร่ง
  let cardEvent: CardEvent | null = null;
  let incident = state.incident || spun;
  let others = state.players;
  if (card !== null) {
    const icon = SPEED_CARDS[card].icon;
    if (icon === "team") played = refill(played, rng, played.hand.length + 1);
    if (icon === "event") {
      cardEvent = CARD_EVENT_LIST[Math.floor(rng() * CARD_EVENT_LIST.length)];
      if (cardEvent === "lockup") {
        // ถอยหลังแล้วจัดรถใหม่ไม่ให้ทับคันข้างหลัง
        const moved = settle(
          others.map((p) => (p.id === me.id ? { ...played, progress: Math.max(me.progress, played.progress - 2) } : p)),
        );
        played = moved.find((p) => p.id === me.id)!;
        others = moved;
      } else if (cardEvent === "wearmore") played = { ...played, life: Math.max(0, played.life - 1) };
      else if (cardEvent === "tailwind") {
        const extra = travel(state, others.map((p) => (p.id === me.id ? played : p)), played, 2);
        played = { ...played, progress: extra.progress, lane: extra.lane };
      } else if (cardEvent === "radio") played = refill(played, rng, played.hand.length + 1);
      else if (cardEvent === "brakes") played = { ...played, limp: true };
      else incident = true;
    }
  }

  const victim = hasFollower(state) ? state.order[state.turn + 1] : -1;
  const players = others.map((p) => {
    if (p.id === me.id) return played;
    if (action === "block" && p.id === victim) return { ...p, debuff: p.debuff + 2 };
    return p;
  });

  const log: TurnLog = {
    player: me.id, ai: false, from: me.progress, blocked: go.blocked, corner: go.corner,
    card, action, mode, moved: played.progress - me.progress, worn, spun, cardEvent,
  };
  let next: GameState = { ...state, players, incident, lastTurn: log, feed: [log] };
  if (action === "sky") next = shiftSky(next, choice.sky ?? "earlier");
  return runAI(advance(next, played, rng), rng);
}

/** หลังรถคันหนึ่งเดินเสร็จ: ตัดสินผู้ชนะ หรือส่งตาต่อ/จบรอบ */
function advance(state: GameState, mover: Player, rng: Rng): GameState {
  // ใครข้ามเส้นชัยก่อนชนะทันที — คนที่เหลือไม่ได้เดินต่อ
  if (mover.progress >= state.total) {
    return {
      ...state,
      winner: mover.id,
      finish: standings(state).map((p) => p.id),
      event: null,
      yellow: false,
    };
  }
  return state.turn === state.order.length - 1
    ? endRound(state, rng)
    : { ...state, turn: state.turn + 1 };
}

/**
 * รถ AI หนึ่งเทิร์น: พลิกไพ่เร่งใช้ค่าแถวกลาง ไม่คิดเรื่องยางและการ์ด
 * เลนนอกได้ค่าน้อยลงเหมือนผู้เล่น เบรกร้อนก็ต้องขับคุม
 */
function aiTurn(state: GameState, rng: Rng): GameState {
  const me = activePlayer(state);
  let card: number | null = null;
  let speedDeck = me.speedDeck;
  let speedDiscard = me.speedDiscard;
  let want: number;
  if (me.limp) {
    want = Math.max(1, CRUISE_MOVE - me.debuff);
  } else {
    const d = drawSpeed(speedDeck, speedDiscard, rng);
    card = d.id;
    speedDeck = d.deck;
    speedDiscard = [...d.discard, d.id];
    const raw = SPEED_CARDS[card].v[COL_INDEX.medium];
    const value = state.event === "safety_car" ? Math.min(raw, SC_SPEED_CAP) : raw;
    want = Math.max(1, value - (me.lane === 1 ? OFFLINE_PENALTY : 0) - me.debuff);
  }
  const go = travel(state, state.players, me, want);
  const moved: Player = {
    ...me, progress: go.progress, lane: go.lane, speedDeck, speedDiscard, debuff: 0, limp: false,
  };
  const log: TurnLog = {
    player: me.id, ai: true, from: me.progress, blocked: go.blocked, corner: go.corner,
    card, action: null, mode: card === null ? "cruise" : "push",
    moved: go.progress - me.progress, worn: false, spun: false, cardEvent: null,
  };
  const next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === me.id ? moved : p)),
    feed: [...state.feed, log],
  };
  return advance(next, moved, rng);
}

/** ให้รถ AI ที่ต่อคิวอยู่เดินไปจนถึงตาผู้เล่น (หรือจบเกม) */
export function runAI(state: GameState, rng: Rng): GameState {
  let s = state;
  while (s.winner === null && activePlayer(s).ai) s = aiTurn(s, rng);
  return s;
}

/**
 * จบรอบ: ขึ้นรอบใหม่ จัดลำดับเดินใหม่ตามอันดับ
 * ธงเหลือง → รอบหน้าเป็นเซฟตี้คาร์ด้วยโอกาส YELLOW_TO_SC, ไม่มีธงเหลือง → อาจเกิดธงแดง
 * ถ้ารอบหน้าไม่มีเหตุการณ์ และมีเหตุผิดปกติหรือสุ่มติด จะขึ้นธงเหลืองเตือนรอบถัดไป
 */
function endRound(state: GameState, rng: Rng): GameState {
  let event: EventKind | null = null;
  if (state.yellow) {
    if (rng() < YELLOW_TO_SC) event = "safety_car";
  } else if (rng() < RED_FLAG_CHANCE) {
    event = "red_flag";
  }
  const yellow = event === null && (state.incident || rng() < YELLOW_CHANCE);
  const base: GameState = { ...state, round: state.round + 1, turn: 0, yellow, incident: false };
  const out = event ? applyEvent(base, event) : { ...base, event: null };
  return { ...out, order: standings(out).map((p) => p.id) };
}

export function applyEvent(state: GameState, event: EventKind): GameState {
  const leader = Math.max(...state.players.map((p) => p.progress));
  let players = state.players;
  if (event === "safety_car") {
    players = players.map((p) => ({
      ...p,
      progress: leader - Math.floor((leader - p.progress) / 2),
    }));
  } else {
    const last = Math.min(...players.map((p) => p.progress));
    players = players.map((p) => ({
      ...p,
      life: p.ai ? p.life : TYRES[p.tyres[0]].life,
      progress: p.progress === last && last !== leader ? p.progress + 3 : p.progress,
    }));
  }
  return { ...state, players: settle(players), event };
}
