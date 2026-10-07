/**
 * กติกาเกมกระดาน — ฟังก์ชันล้วน ความสุ่มทั้งหมดผ่าน `rng`
 *
 * ทีมละ 2 คัน กริด 12 คัน (ที่ว่างเติมด้วยรถ AI) เดินตามอันดับ (คันนำก่อน)
 * ตาหนึ่งมี 2 ขั้น:
 *   1) เลือกวิธีเดิน: พื้นฐาน 4 ช่อง / เปิดไพ่ MOVE (เฉพาะรถบนเส้นแข่ง) / DRS / สลิปสตรีม / โหมด PUSH·PACE
 *      หรือเรื่องพิท (เข้าเลนพิท, วิ่งในเลนพิท, เปลี่ยนยางในช่องพิท) หรือกลับเข้าสนาม
 *   2) เห็นระยะแล้วค่อยเลือก: ERS +2, ATTACK, BLOCK, เลนที่จะจบ
 * ระหว่างตาเล่นไพ่ PITWALL ของทีมได้ (playPitwall)
 *
 * เหตุการณ์: ไพ่ MOVE/AI บางใบเปิดไพ่ ACTION หลังเดิน — พลาดเอง อากาศเปลี่ยน ยางช้ำ ERS ดับ เสียสมาธิ
 * ออกนอกขอบสนาม (ใบเตือน → โทษ) เบรกร้อน เฉี่ยวชน (ทอยเต๋าอุบัติเหตุทุกคันที่อยู่ติดกัน)
 * หลุดออกนอกสนาม/รถเสียหาย = ธงเหลือง 1 รอบ · ชนออก = เซฟตี้คาร์ จัดแถวใหม่
 * ฝน (มาตรอากาศขั้น 5–6): ยางไม่สึก ไพ่บางใบทำให้หมุน ผ่าน V-BOX เพื่อสลับยางฝน/ยางแห้ง
 */

import type { Zone } from "./board";
import {
  ACTION_DECK, ACTION_OURS, AI_DECK, INCIDENT_DIE, INCIDENT_DIE_OURS, MOVE_DECK, PITWALL_DECK, PITWALL_OURS,
  type ActionKind, type AiCard, type IncidentFace, type MoveCard, type PitwallKind,
} from "./cards";

export * from "./cards";

export type Rng = () => number;
export type Lane = 0 | 1;
export type Compound = "yellow" | "red";

export const BASE_MOVE = 4;
export const WORN_MOVE = 3;
export const PIT_SPEED = 3;
export const ERS_BONUS = 2;
export const ERS_MAX = 3;
/** รางยางสึกมีกี่ขั้น — สุดรางแล้วเจอไพ่สึกอีก = ยางพัง */
export const WEAR_MAX = 6;
/** เหรียญ ATTACK / BLOCK / SLIPSTREAM ใช้ได้กี่ครั้งต่อคัน */
export const TOKEN_USES = 2;
/** เลนพิทยาวกี่ช่อง (เริ่มที่โซนเข้าพิท) และช่องพิทอยู่ช่องที่เท่าไร */
export const PIT_LEN = 7;
export const BOX_AT = 4;
export const GRID_SIZE = 12;
/** มาตรอากาศ 1..WEATHER_MAX เลยขั้นสุดท้ายวนกลับไปแดดออก — ตั้งแต่ RAIN_AT คือฝนตก */
export const WEATHER_MAX = 6;
export const RAIN_AT = 5;
/** ธงเหลืองคลุมจากรถที่เกิดเหตุไปข้างหน้ากี่ช่อง */
export const FLAG_LEN = 4;
/** เซฟตี้คาร์ออกห่างคันนำกี่ช่อง (+ต่อคันที่ชนเพิ่ม, +ต่อคันที่เสียหาย) */
export const SC_GAP = 12;
export const SC_CRASH = 6;
export const SC_DAMAGE = 3;
/** โทษที่ยังไม่ได้ชดใช้ตอนจบเรซ = ถอยกี่อันดับ */
export const PENALTY_PLACES = 3;
export const PITWALL_START = 3;
/** กติกาของเรา: ERS ในโซน DRS ได้เพิ่มเท่านี้ */
export const ERS_DRS_BONUS = 3;
/** กติกาของเรา: เปิดไพ่ MOVE ตอนอยู่นอกเส้นแข่ง ระยะลดลงเท่านี้ */
export const OFFLINE_PENALTY = 1;
/** กติกาของเรา: ออกนอกขอบสนาม / เสียจังหวะ ถอยกี่ช่อง */
export const BACK_CELLS = 2;
/** กติกาของเรา: ฝนตกกี่เทิร์นแล้วหยุดเอง */
export const RAIN_ROUNDS = 3;
/** กติกาของเรา: อากาศ 3 สถานะ (ค่าเดียวกับมาตร 1–6 จะได้ใช้ isRain ร่วมกัน) */
export const OURS_WEATHER = [1, 3, 5] as const;
/** กติกาของเรา: ฝนหยุดแล้วเป็น "ทางหมาด" ก่อนแห้ง (อยู่ระหว่างเมฆกับฝนบนมาตร) */
export const DAMP = 4;
export const DAMP_ROUNDS = 2;
/** เซฟตี้คาร์ / VSC อยู่กี่เทิร์น — เทิร์นสุดท้ายขึ้นสถานะ ENDING */
export const NEUTRAL_ROUNDS = 2;

export const COMPOUNDS: Record<Compound, { label: string; wear: number }> = {
  yellow: { label: "เหลือง", wear: 1 },
  red: { label: "แดง", wear: 2 },
};

export const moveValue = (c: MoveCard, comp: Compound) => (comp === "red" ? c.r : c.y);

/** ข้อมูลสนามที่กติกาใช้ — vbox = ช่องสลับยางฝน/ยางแห้งบนสนาม */
export type Track = { lapCells: number; corners: Zone[]; drs: Zone[]; pitEntry: Zone; vbox: number };

export type PitState = {
  /** ตำแหน่งสะสมของช่องแรกในเลนพิท (ตรงกับช่องแรกของโซนเข้าพิท) */
  base: number;
  /** ช่องในเลนพิท 0..PIT_LEN-1 */
  pos: number;
  /** จอดอยู่ในช่องพิท รอเปลี่ยนยาง (หรือรับโทษ) ตาหน้า */
  inBox: boolean;
  /** เปลี่ยนยาง/จอดเสร็จแล้ว */
  served: boolean;
};

/** attack/block/slip = เหรียญของกติกาเต็มรูปแบบ · pass = เหรียญ "แซง" ของกติกาของเรา */
export type Tokens = { attack: number; block: number; slip: number; pass: number };
/** ours = กติกาของเรา (ง่าย ค่าเริ่มต้นของหน้าเว็บ) · full = กติกาเต็มรูปแบบ */
export type Rules = "ours" | "full";
export type Mode = { kind: "push" } | { kind: "pace"; value: number };

export type Driver = {
  id: number;
  name: string;
  num: number;
  /** ทีมของผู้เล่น (ลำดับใน teams) หรือ -1 สำหรับรถ AI */
  team: number;
  ai: boolean;
  /** ตำแหน่งสะสม (ช่อง) — ในเลนพิทใช้ base + pos */
  progress: number;
  /** 0 = เส้นแข่ง, 1 = นอกเส้นแข่ง */
  lane: Lane;
  pit: PitState | null;
  compound: Compound;
  /** ใส่ยางฝนอยู่ (ระดับสึกของยางแห้งค้างไว้ตามเดิม) */
  wet: boolean;
  /** ยางสึกกี่ขั้นแล้ว 0..WEAR_MAX */
  wear: number;
  worn: boolean;
  /** ยางสำรองที่เหลือในพิท */
  sets: Compound[];
  ers: number;
  tokens: Tokens;
  /** ตั้งใจเข้าพิท: ระยะถูกตัดให้หยุดในโซนเข้าพิท */
  boxing: boolean;
  /** ประกาศ BLOCK ใส่รถคันนี้ (id) จนกว่าคันนั้นจะเดินเสร็จ */
  blockVictim: number | null;
  /** ตามหลังรถคันนี้ติดในเลนเดียวกันตอนมันออกตัว — ใช้สลิปสตรีมตามได้ */
  slipTarget: number | null;
  /** หลุดออกไปข้างสนาม — ตาหน้ากลับเข้าสนามถ้าช่องข้างว่าง */
  off: boolean;
  /** ชนออกจากเรซ */
  out: boolean;
  /** รถเสียหาย: เดินเองช่องละ 3 จนกว่าจะผ่าน V-BOX หรือเข้าพิท */
  damage: boolean;
  /** เบรกร้อน: ได้แค่ BASE จนกว่าจะผ่าน V-BOX หรือเข้าพิท */
  brakes: boolean;
  /** ใบเตือนออกนอกขอบสนาม / โทษที่ต้องจอดเพิ่มในพิท */
  warn: boolean;
  penalty: boolean;
  mode: Mode | null;
  /** ระยะเพิ่มในตานี้จาก PITWALL */
  bonus: number;
  /** เล่นพิทสต็อปเร็วไว้ — ยางที่จะใส่ ("keep" = ยางเดิม) */
  quick: Compound | "keep" | null;
  /** อันดับตอนข้ามเส้นชัย (null = ยังไม่จบ) */
  finished: number | null;
  pits: number;
};

export type Team = { name: string; moveDeck: number[]; moveDiscard: number[]; pitwall: number[] };

export type MoveKind =
  | "base" | "card" | "drs" | "slip" | "worn" | "push" | "pace" | "rejoin" | "pitIn" | "pitLane" | "box";

/** ขั้นที่ 2 ที่รออยู่: รู้ระยะแล้ว รอเลือก ERS / ATTACK / BLOCK / เลน */
export type Pending = { driver: number; kind: "base" | "card" | "drs" | "push" | "pace"; card: number | null; value: number };

export type Flag = { from: number; to: number; until: number };

export type GameEvent =
  | { t: "action"; card: ActionKind; driver: number; ok: boolean }
  | { t: "pitwall"; team: number }
  | { t: "spin"; driver: number }
  | { t: "incident"; rolls: { driver: number; face: IncidentFace }[] }
  | { t: "sc"; at: number }
  | { t: "vsc" }
  | { t: "green"; kind: "sc" | "vsc" }
  | { t: "weather"; from: number; to: number }
  | { t: "vbox"; driver: number; wet: boolean }
  | { t: "warn" | "penalty" | "paceEnd" | "served" | "back"; driver: number };

export type TurnLog = {
  driver: number;
  ai: boolean;
  kind: MoveKind;
  /** ไพ่ MOVE ที่เปิด (หรือไพ่ AI) */
  card: number | null;
  moved: number;
  corner: boolean;
  blocked: boolean;
  ers: boolean;
  recharge: boolean;
  /** ATTACK ใส่ใคร */
  attacked: number | null;
  block: boolean;
  /** ใช้เหรียญแซง */
  pass: boolean;
  /** ยางสึกเพิ่มกี่ขั้น */
  wear: number;
  nowWorn: boolean;
  finished: boolean;
  events: GameEvent[];
};

export type GameState = {
  track: Track;
  drivers: Driver[];
  teams: Team[];
  laps: number;
  total: number;
  round: number;
  /** ลำดับ id ที่เดินในรอบนี้ (ไม่รวมคันที่จบแล้ว) */
  order: number[];
  turn: number;
  pending: Pending | null;
  aiDeck: number[];
  aiDiscard: number[];
  actionDeck: number[];
  actionDiscard: number[];
  pwDeck: number[];
  pwDiscard: number[];
  weather: number;
  /** กติกาของเรา: ฝนจะหยุดในอีกกี่เทิร์น */
  rainLeft: number;
  rules: Rules;
  /** ช่วงเซฟตี้คาร์ / VSC — left = เหลือกี่เทิร์น (1 = ENDING จบเทิร์นนี้) */
  neutral: { kind: "sc" | "vsc"; left: number } | null;
  /** รถ AI รอให้หน้าจอสั่งเดินทีละคัน (aiStep) */
  stepAI: boolean;
  flags: Flag[];
  /** id ตามลำดับที่ข้ามเส้นชัย */
  finishOrder: number[];
  /** ทุกการเดินตั้งแต่ผู้เล่นตัดสินใจครั้งล่าสุด (รวมรถ AI) */
  feed: TurnLog[];
  over: boolean;
};

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i);

/** จั่วใบบนสุด กองหมดสับกองทิ้งกลับมา */
function drawFrom(deck: number[], discard: number[], rng: Rng) {
  let d = deck;
  let x = discard;
  if (d.length === 0) {
    d = shuffle(x, rng);
    x = [];
  }
  return { id: d[0], deck: d.slice(1), discard: [...x, d[0]] };
}

/* ---------- ตำแหน่งบนสนาม ---------- */

export const lapCell = (t: Track, p: number) => ((p % t.lapCells) + t.lapCells) % t.lapCells;

export const inZone = (z: Zone, c: number) =>
  z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end;

/** อยู่ในโซนไหนของรายการ (ลำดับ) หรือ -1 */
export const zoneAt = (t: Track, zones: Zone[], p: number) =>
  zones.findIndex((z) => inZone(z, lapCell(t, p)));

export const isRain = (s: GameState) => s.weather >= RAIN_AT;

/** ยังแข่งอยู่บนสนาม (ไม่อยู่ในพิท ไม่จบ ไม่ชนออก) */
export const onTrack = (d: Driver) => d.pit === null && d.finished === null && !d.out;
/** กินที่บนสนาม — รถที่หลุดออกไปข้างสนามไม่ขวางใคร */
const solid = (d: Driver) => onTrack(d) && !d.off;

const occupied = (drivers: Driver[], self: number, p: number, lane: Lane) =>
  drivers.some((o) => o.id !== self && solid(o) && o.progress === p && o.lane === lane);

const carAt = (drivers: Driver[], p: number, lane: Lane) =>
  drivers.find((o) => solid(o) && o.progress === p && o.lane === lane);

export const activeDriver = (s: GameState): Driver => s.drivers[s.order[s.turn]];

export const inFlag = (s: GameState, d: Driver) =>
  onTrack(d) &&
  s.flags.some((f) =>
    inZone({ start: lapCell(s.track, f.from), end: lapCell(s.track, f.to) }, lapCell(s.track, d.progress)),
  );

/**
 * ข้อจำกัดของรถในตานี้
 * slow = ได้แค่ BASE ห้ามไพ่ MOVE/เหรียญ/ERS/DRS (เบรกร้อน, อยู่ในธงเหลือง, ยางฝนบนทางแห้ง)
 * limp = เดินเองช่องละ 3 ห้ามทุกอย่าง (ยางพัง, รถเสียหาย)
 */
export function limits(s: GameState, d: Driver) {
  const rain = isRain(s);
  return {
    rain,
    flag: inFlag(s, d),
    // กติกาของเรา: ยางผิดสภาพแค่ช้าลง (ดู moveFor) ไม่ถูกล็อก · SC/VSC ทุกคันได้แค่ BASE
    slow: d.brakes || inFlag(s, d) || (s.rules === "full" && d.wet && !rain) || s.neutral !== null,
    limp: d.worn || d.damage,
  };
}

/** อันดับ: คันที่จบแล้วตามลำดับเส้นชัย แล้วตามระยะ ชนออกอยู่ท้าย — จบเรซแล้วคันที่ค้างโทษถอย 3 อันดับ */
export function standings(s: GameState): Driver[] {
  let done = s.finishOrder.map((id) => s.drivers[id]);
  if (s.over) {
    done = done
      .map((d, i) => ({ d, k: i + (d.penalty ? PENALTY_PLACES + 0.5 : 0) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.d);
  }
  const racing = s.drivers
    .filter((d) => d.finished === null && !d.out)
    .sort(
      (a, b) =>
        b.progress - a.progress ||
        Number(a.pit !== null) - Number(b.pit !== null) ||
        Number(a.off) - Number(b.off) ||
        a.lane - b.lane ||
        a.id - b.id,
    );
  const out = s.drivers.filter((d) => d.out).sort((a, b) => b.progress - a.progress);
  return [...done, ...racing, ...out];
}

/* ---------- เริ่มเกม ---------- */

export type CarSpec = {
  name: string;
  num: number;
  team: number;
  ai: boolean;
  compound?: Compound;
  /** ยางสึกตั้งต้น (เช่นวิ่งรอบพิเศษในควอลิฟาย) */
  wear?: number;
};

/** ยางทั้งหมดต่อคัน: เหลือง 2 แดง 2 — ใส่ออกตัว 1 ชุด ที่เหลือรอในพิท */
const SETS: Compound[] = ["yellow", "yellow", "red", "red"];

/** stepAI = ไม่ให้รถ AI เดินรวดเดียว — หน้าจอเรียก aiStep ทีละคันเพื่อทำแอนิเมชัน */
export type GameOptions = { weather?: number; rules?: Rules; stepAI?: boolean };

export function newGame(
  cars: CarSpec[],
  teamNames: string[],
  track: Track,
  laps: number,
  rng: Rng,
  grid?: number[],
  opts: GameOptions = {},
): GameState {
  const order = grid ?? shuffle(ids(cars.length), rng);
  const rules = opts.rules ?? "full";
  const weather = opts.weather ?? 1;
  const wet = weather >= RAIN_AT;
  const drivers: Driver[] = cars.map((c, id) => {
    const slot = order.indexOf(id);
    const compound = c.compound ?? "yellow";
    const sets = [...SETS];
    sets.splice(sets.indexOf(compound), 1);
    return {
      id,
      name: c.name,
      num: c.num,
      team: c.team,
      ai: c.ai,
      progress: -Math.floor(slot / 2) || 0,
      lane: (slot % 2) as Lane,
      pit: null,
      compound,
      wet,
      wear: c.ai ? 0 : (c.wear ?? 0),
      worn: false,
      sets: c.ai ? [] : sets,
      ers: ERS_MAX,
      tokens:
        rules === "ours"
          ? { attack: 0, block: 0, slip: 0, pass: TOKEN_USES }
          : { attack: TOKEN_USES, block: TOKEN_USES, slip: TOKEN_USES, pass: 0 },
      boxing: false,
      blockVictim: null,
      slipTarget: null,
      off: false,
      out: false,
      damage: false,
      brakes: false,
      warn: false,
      penalty: false,
      mode: null,
      bonus: 0,
      quick: null,
      finished: null,
      pits: 0,
    };
  });
  const pwIds = ids(PITWALL_DECK.length).filter((i) => rules === "full" || PITWALL_OURS.includes(PITWALL_DECK[i].kind));
  const acIds = ids(ACTION_DECK.length).filter((i) => rules === "full" || ACTION_OURS.includes(ACTION_DECK[i]));
  let pwDeck = shuffle(pwIds, rng);
  const teams: Team[] = teamNames.map((name) => {
    const pitwall = pwDeck.slice(0, PITWALL_START);
    pwDeck = pwDeck.slice(PITWALL_START);
    return { name, moveDeck: shuffle(ids(MOVE_DECK.length), rng), moveDiscard: [], pitwall };
  });
  const state: GameState = {
    track,
    drivers,
    teams,
    laps,
    total: track.lapCells * laps,
    round: 1,
    order,
    turn: 0,
    pending: null,
    aiDeck: shuffle(ids(AI_DECK.length), rng),
    aiDiscard: [],
    actionDeck: shuffle(acIds, rng),
    actionDiscard: [],
    pwDeck,
    pwDiscard: [],
    weather,
    rainLeft: rules === "ours" && wet ? RAIN_ROUNDS : 0,
    rules,
    stepAI: !!opts.stepAI,
    neutral: null,
    flags: [],
    finishOrder: [],
    feed: [],
    over: false,
  };
  return state.stepAI ? state : runAI(state, rng);
}

/* ---------- สิ่งที่ทำได้ในตานี้ ---------- */

/** เปิดไพ่ MOVE ได้เฉพาะรถบนเส้นแข่ง (ยกเว้นตาแรกของเกม) ที่ไม่ติดข้อจำกัด */
export function canCard(s: GameState, d: Driver) {
  const l = limits(s, d);
  return onTrack(d) && !d.off && !l.slow && !l.limp && (s.rules === "ours" || d.lane === 0 || s.round === 1);
}

/** DRS: อยู่ในโซน DRS และมีรถอยู่ช่องหน้าติดกันในเลนเดียวกัน — คืนรถคันหน้า */
export function drsTarget(s: GameState, d: Driver): Driver | null {
  const l = limits(s, d);
  if (s.rules === "ours" || s.round === 1 || !onTrack(d) || d.off || l.slow || l.limp || zoneAt(s.track, s.track.drs, d.progress) < 0) {
    return null;
  }
  return carAt(s.drivers, d.progress + 1, d.lane) ?? null;
}

/** สลิปสตรีม: รถที่ตามติดออกตัวไปแล้วในรอบนี้ และยังมีเหรียญ */
export function slipTargetOf(s: GameState, d: Driver): Driver | null {
  const l = limits(s, d);
  if (s.rules === "ours" || s.round === 1 || d.slipTarget === null || d.tokens.slip <= 0 || l.slow || l.limp || !onTrack(d) || d.off) {
    return null;
  }
  const t = s.drivers[d.slipTarget];
  return solid(t) && t.progress - 1 >= d.progress ? t : null;
}

/** ERS ได้กี่ช่อง — กติกาของเรา ในโซน DRS ได้มากกว่า */
export const ersBonus = (s: GameState, d: Driver) =>
  s.rules === "ours" && zoneAt(s.track, s.track.drs, d.progress) >= 0 ? ERS_DRS_BONUS : ERS_BONUS;

/** กติกาของเรา: อยู่นอกเส้นแข่ง (ไม่ใช่ตาแรก) ไพ่ MOVE ลดระยะ */
export const offlinePenalty = (s: GameState, d: Driver) =>
  s.rules === "ours" && d.lane === 1 && s.round > 1 ? OFFLINE_PENALTY : 0;

export const canPitIn = (s: GameState, d: Driver) =>
  onTrack(d) && !d.off && inZone(s.track.pitEntry, lapCell(s.track, d.progress));

/** โหมดจาก PITWALL ใช้ได้ไหมในตานี้ (ติดข้อจำกัดก็พักไว้ก่อน ไม่ทิ้ง) */
const modeReady = (s: GameState, d: Driver) => {
  const l = limits(s, d);
  return onTrack(d) && !d.off && !l.slow && !l.limp ? d.mode : null;
};

export type Options = {
  inBox: boolean;
  pitLane: boolean;
  rejoin: boolean;
  worn: boolean;
  base: boolean;
  card: boolean;
  drs: boolean;
  slip: boolean;
  pitIn: boolean;
  push: boolean;
  pace: boolean;
};

export function options(s: GameState, d: Driver = activeDriver(s)): Options {
  const none: Options = {
    inBox: false, pitLane: false, rejoin: false, worn: false, base: false, card: false,
    drs: false, slip: false, pitIn: false, push: false, pace: false,
  };
  if (d.pit) return { ...none, inBox: d.pit.inBox, pitLane: !d.pit.inBox };
  if (d.off) return { ...none, rejoin: true };
  const l = limits(s, d);
  const mode = modeReady(s, d);
  return {
    ...none,
    worn: l.limp,
    base: !l.limp,
    card: canCard(s, d),
    drs: drsTarget(s, d) !== null,
    slip: slipTargetOf(s, d) !== null,
    pitIn: canPitIn(s, d),
    push: mode?.kind === "push",
    pace: mode?.kind === "pace",
  };
}

/** ระยะของไพ่ MOVE ตามยางที่ใส่ — ฝนตกและใส่ยางฝนใช้แถวยางฝน */
export const cardValue = (c: MoveCard, d: Driver, rain: boolean) => (rain && d.wet ? c.w : moveValue(c, d.compound));

/**
 * ระยะของไพ่ MOVE ในเกมนี้ — กติกาของเรา ยางผิดสภาพแค่ช้าลง:
 * ยางฝนใช้แถวฝนเสมอ · ยางแห้งตอนฝนตก −2 (และอาจหมุน) · ตอนทางหมาด −1
 */
export function moveFor(s: GameState, c: MoveCard, d: Driver): number {
  if (s.rules === "full") return cardValue(c, d, isRain(s));
  if (d.wet) return c.w;
  const cut = isRain(s) ? 2 : s.weather === DAMP ? 1 : 0;
  return Math.max(1, moveValue(c, d.compound) - cut);
}

/** โหมด PUSH วิ่งเท่าไพ่สึกที่เร็วที่สุดของยางที่ใส่ */
export const pushValue = (s: GameState, d: Driver) =>
  Math.max(...MOVE_DECK.filter((c) => c.tires).map((c) => moveFor(s, c, d)));

/* ---------- การเดิน ---------- */

/** หยุดที่ช่องสุดท้ายของโซนแรกที่เพิ่งเข้า (ออกจากโซนที่ยืนอยู่ได้ตามปกติ) */
function capAtZone(t: Track, zones: Zone[], from: number, to: number): number {
  const startZone = zoneAt(t, zones, from);
  for (let p = from + 1; p < to; p++) {
    const z = zoneAt(t, zones, p);
    if (z >= 0 && z !== startZone && zoneAt(t, zones, p + 1) !== z) return p;
  }
  return to;
}

/**
 * เดินบนสนาม: ตัดที่โค้ง (และโซนเข้าพิทถ้าตั้งใจเข้าพิท) ตัดหลังรถที่ BLOCK เราไว้
 * แล้วไล่ทีละช่อง — ช่องเต็มสองเลนผ่านไม่ได้ และเปลี่ยนเลนแนวทแยงผ่านรถ 2 คันไม่ได้
 * จบแล้วเลื่อนข้างไปเลนที่ต้องการได้ถ้าว่าง (ค่าเริ่มต้นเส้นแข่ง)
 */
export function travel(
  s: GameState, d: Driver, want: number, lanePref: Lane = 0,
  /** เหรียญแซง: ผ่านจุดที่รถขวางเต็มทางได้กี่จุด */
  squeeze = 0,
): { progress: number; lane: Lane; corner: boolean; blocked: boolean } {
  const t = s.track;
  const start = d.progress;
  let target = start + Math.max(0, want);
  let blocked = false;

  const blocker = s.drivers.find((o) => o.blockVictim === d.id && solid(o) && o.progress > start);
  // เซฟตี้คาร์: ห้ามแซง ตามหลังคันหน้าทุกเลน
  if (s.neutral?.kind === "sc") {
    const ahead = s.drivers.filter((o) => o.id !== d.id && solid(o) && o.progress > start).map((o) => o.progress);
    if (ahead.length && target > Math.min(...ahead) - 1) {
      target = Math.max(start, Math.min(...ahead) - 1);
      blocked = true;
    }
  }
  if (blocker && target > blocker.progress - 1) {
    target = Math.max(start, blocker.progress - 1);
    blocked = true;
  }
  let corner = false;
  const zones = d.boxing ? [...t.corners, t.pitEntry] : t.corners;
  const capped = capAtZone(t, zones, start, target);
  if (capped < target) {
    target = capped;
    corner = true;
  }

  const occ = (p: number, l: Lane) => occupied(s.drivers, d.id, p, l);
  let lanes = new Set<Lane>([d.lane]);
  let reach = start;
  for (let p = start + 1; p <= target; p++) {
    const next = new Set<Lane>();
    for (const l of [0, 1] as Lane[]) {
      if (occ(p, l)) continue;
      const other = (1 - l) as Lane;
      if (lanes.has(l)) next.add(l);
      // เปลี่ยนเลนแนวทแยงไม่ได้ถ้ามีรถขวางทั้งสองมุม
      else if (lanes.has(other) && !(occ(p - 1, l) && occ(p, other))) next.add(l);
    }
    if (next.size === 0) {
      if (squeeze > 0) {
        // ลอดผ่านจุดที่ขวาง — จอดทับไม่ได้ แต่ไปต่อได้ทั้งสองเลน
        squeeze--;
        lanes = new Set<Lane>([0, 1]);
        continue;
      }
      blocked = true;
      break;
    }
    lanes = next;
    reach = p;
  }
  if (reach === start) return { progress: start, lane: d.lane, corner, blocked };
  const free = (l: Lane) => !occ(reach, l);
  const lane: Lane = free(lanePref) ? lanePref : free(0) ? 0 : 1;
  return { progress: reach, lane, corner, blocked };
}

/** วางรถที่ออกจากพิท/ถูกย้าย ไม่ให้ทับคันอื่น (ลองเลนที่ต้องการก่อน แล้วถอยทีละช่อง) */
function placeFree(drivers: Driver[], d: Driver, p: number, prefer: Lane): { progress: number; lane: Lane } {
  for (let q = p; ; q--) {
    for (const l of [prefer, (1 - prefer) as Lane]) {
      if (!occupied(drivers, d.id, q, l)) return { progress: q, lane: l };
    }
  }
}

/** วิ่งในเลนพิท: ช่องละ PIT_SPEED แซงในเลนพิทไม่ได้ ถึงช่องพิทต้องจอด */
function pitStep(s: GameState, d: Driver): Driver {
  const pit = d.pit!;
  let pos = pit.pos + PIT_SPEED;
  let inBox = false;
  if (!pit.served && pos >= BOX_AT) {
    pos = BOX_AT;
    inBox = true;
  }
  const abs = (x: number) => pit.base + x;
  for (const o of s.drivers) {
    if (o.id === d.id || !o.pit || o.finished !== null || o.out) continue;
    // ตำแหน่งของคันอื่นเทียบกับเลนพิทของเรา — อยู่ข้างหน้าในระยะที่จะวิ่ง = ต้องหยุดหลัง
    const rel = o.pit.base + o.pit.pos - pit.base;
    if (rel > pit.pos && rel <= pos) {
      pos = rel - 1;
      inBox = false;
    }
  }
  pos = Math.max(pos, pit.pos);
  if (pos >= PIT_LEN) {
    const spot = placeFree(s.drivers, d, abs(pos), 1);
    return { ...d, pit: null, progress: spot.progress, lane: spot.lane };
  }
  return { ...d, pit: { ...pit, pos, inBox }, progress: abs(pos) };
}

/**
 * จอดเปลี่ยนยาง: เลือกชุดใหม่ (หรือ "keep" = ยางเดิม แค่สลับยางฝน/แห้งตามอากาศ)
 * ซ่อมรถและเบรกไปด้วย · ถ้าค้างโทษ ต้องจอดต่ออีกตา
 */
function stopAt(d: Driver, set: Compound | "keep" | undefined, rain: boolean, events: GameEvent[]): Driver {
  let x: Driver = { ...d, pits: d.pits + 1, wet: rain, damage: false, brakes: false, quick: null };
  if (!d.ai) {
    const pick = set === "keep" && !d.worn ? null : set && set !== "keep" && d.sets.includes(set) ? set : d.sets[0];
    if (pick) {
      const sets = [...d.sets];
      sets.splice(sets.indexOf(pick), 1);
      x = { ...x, compound: pick, sets, wear: 0, worn: false };
    } else if (d.worn) {
      // ยางหมดพิทแล้วยังพัง: ใส่ชุดเก่าที่ยังพอวิ่งได้
      x = { ...x, worn: false, wear: WEAR_MAX };
    }
  }
  if (d.penalty) {
    events.push({ t: "served", driver: d.id });
    return { ...x, penalty: false, warn: false, pit: { ...d.pit!, inBox: true, served: true } };
  }
  return { ...x, pit: { ...d.pit!, inBox: false, served: true } };
}

const replace = (s: GameState, d: Driver): GameState => ({
  ...s,
  drivers: s.drivers.map((o) => (o.id === d.id ? d : o)),
});

const emptyLog = (kind: MoveKind): Omit<TurnLog, "finished" | "driver" | "ai"> => ({
  kind, card: null, moved: 0, corner: false, blocked: false, ers: false, recharge: false,
  attacked: null, block: false, pass: false, wear: 0, nowWorn: false, events: [],
});

/** เลื่อนอากาศ — เต็มรูปแบบวนมาตร 1–6 · กติกาของเรา แดด → เมฆ → ฝน (ฝนแล้วค้างที่ฝน) */
function advanceWeather(w: number, by: number, rules: Rules) {
  if (rules === "full") return ((w - 1 + by) % WEATHER_MAX) + 1;
  const i = OURS_WEATHER.findIndex((x) => x >= w);
  return OURS_WEATHER[Math.min(OURS_WEATHER.length - 1, Math.max(0, i) + by)];
}

/** รถที่อยู่ติดกัน (หน้า หลัง ข้าง ไม่นับแนวทแยง) */
function neighbours(drivers: Driver[], d: Driver): Driver[] {
  return drivers.filter(
    (o) =>
      o.id !== d.id &&
      solid(o) &&
      ((o.progress === d.progress && o.lane !== d.lane) ||
        (o.lane === d.lane && Math.abs(o.progress - d.progress) === 1)),
  );
}

/**
 * ผลกระทบหลังเดินที่เปลี่ยนรถหลายคันได้ — เก็บรถทั้งหมดไว้ใน Map แล้วค่อยรวมกลับ
 * นับคันที่ชน/เสียหายไว้คำนวณเซฟตี้คาร์
 */
class Fx {
  cars: Map<number, Driver>;
  events: GameEvent[];
  crashes = 0;
  damaged = 0;
  weather: number;
  rainLeft: number;
  flags: Flag[];
  constructor(private s: GameState, events: GameEvent[]) {
    this.cars = new Map(s.drivers.map((d) => [d.id, d]));
    this.events = events;
    this.weather = s.weather;
    this.rainLeft = s.rainLeft;
    this.flags = s.flags;
  }
  get ours() {
    return this.s.rules === "ours";
  }
  get(id: number) {
    return this.cars.get(id)!;
  }
  set(d: Driver) {
    this.cars.set(d.id, d);
  }
  list() {
    return [...this.cars.values()].sort((a, b) => a.id - b.id);
  }
  flag(d: Driver) {
    this.flags = [...this.flags, { from: d.progress, to: d.progress + FLAG_LEN, until: this.s.round + 1 }];
  }
  goOff(id: number) {
    const d = this.get(id);
    if (!solid(d)) return;
    this.set({ ...d, off: true, lane: 1 });
    this.flag(d);
  }
  /** ถอยหลัง (กติกาของเรา) — ช่องเต็มก็ถอยต่อจนเจอช่องว่าง */
  back(id: number) {
    const d = this.get(id);
    if (!solid(d)) return;
    const spot = placeFree(this.list(), d, d.progress - BACK_CELLS, d.lane);
    this.set({ ...d, progress: spot.progress, lane: spot.lane });
    this.events.push({ t: "back", driver: id });
  }
  trackLimit(id: number) {
    if (this.ours) return this.back(id);
    const d = this.get(id);
    if (d.penalty) return;
    if (d.warn) {
      this.set({ ...d, penalty: true });
      this.events.push({ t: "penalty", driver: id });
    } else {
      this.set({ ...d, warn: true });
      this.events.push({ t: "warn", driver: id });
    }
  }
  setWeather(w: number) {
    if (this.ours && w >= RAIN_AT) this.rainLeft = RAIN_ROUNDS;
    if (w === this.weather) return;
    this.events.push({ t: "weather", from: this.weather, to: w });
    this.weather = w;
  }
  incident(id: number, rng: Rng) {
    const first = this.get(id);
    const involved = [first, ...neighbours(this.list(), first)];
    const die = this.ours ? INCIDENT_DIE_OURS : INCIDENT_DIE;
    const rolls = involved.map((d) => {
      const face = die[Math.floor(rng() * die.length)];
      // กติกาของเรา: รถผู้เล่นไม่ชนออก แค่เสียหาย
      return { driver: d.id, face: this.ours && face === "crash" && !d.ai ? ("damage" as const) : face };
    });
    this.events.push({ t: "incident", rolls });
    for (const r of rolls) {
      const d = this.get(r.driver);
      if (r.face === "warn") this.trackLimit(d.id);
      else if (r.face === "penalty") this.set({ ...d, penalty: true });
      else if (r.face === "off") this.goOff(d.id);
      else if (r.face === "back") this.back(d.id);
      else if (r.face === "damage") {
        // รถเสียหาย = VSC ทั้งสนาม (แทนธงเหลืองเฉพาะจุด)
        this.set({ ...d, damage: true });
        this.damaged++;
      } else if (r.face === "crash") {
        this.set({ ...d, out: true, off: false, mode: null });
        this.crashes++;
      }
    }
  }
  /** เปิดไพ่ ACTION ใส่รถคันนี้ — ทำไม่ได้ก็ข้ามไป */
  action(kind: ActionKind, id: number, rng: Rng) {
    const d = this.get(id);
    let ok = true;
    const human = !d.ai;
    const rain = this.weather >= RAIN_AT;
    switch (kind) {
      case "mistake":
        if (solid(d) && d.lane === 0 && !occupied(this.list(), d.id, d.progress, 1)) this.set({ ...d, lane: 1 });
        else ok = false;
        break;
      case "weather":
        this.setWeather(advanceWeather(this.weather, 1, this.s.rules));
        break;
      case "storm":
        this.setWeather(1 + Math.floor(rng() * WEATHER_MAX));
        break;
      case "tires":
        if (human && !d.worn && !rain) {
          const next = d.wear + COMPOUNDS[d.compound].wear;
          this.set(next > WEAR_MAX ? { ...d, wear: WEAR_MAX, worn: true } : { ...d, wear: next });
        } else ok = false;
        break;
      case "ersFail":
        if (human && d.ers > 0) this.set({ ...d, ers: 0 });
        else ok = false;
        break;
      case "focusAttack":
      case "focusBlock":
      case "focusSlip": {
        const k = kind === "focusAttack" ? "attack" : kind === "focusBlock" ? "block" : "slip";
        if (human && d.tokens[k] > 0) this.set({ ...d, tokens: { ...d.tokens, [k]: 0 } });
        else ok = false;
        break;
      }
      case "focusAll":
        if (human) {
          const t = d.tokens;
          this.set({ ...d, tokens: { ...t, attack: Math.max(0, t.attack - 1), block: Math.max(0, t.block - 1), slip: Math.max(0, t.slip - 1) } });
        } else ok = false;
        break;
      case "trackLimits": {
        if (this.ours) {
          this.back(id);
          break;
        }
        if (solid(d) && !occupied(this.list(), d.id, d.progress + 1, d.lane)) this.set({ ...d, progress: d.progress + 1 });
        this.trackLimit(id);
        break;
      }
      case "brakes":
        if (solid(d)) this.set({ ...d, brakes: true, mode: null });
        else ok = false;
        break;
      case "incident":
        if (solid(d)) this.incident(id, rng);
        else ok = false;
        break;
    }
    this.events.unshift({ t: "action", card: kind, driver: id, ok });
  }
}

/** ผ่านช่อง V-BOX ระหว่าง from → to ไหม */
const throughVbox = (t: Track, from: number, to: number) => {
  for (let p = from + 1; p <= to; p++) if (lapCell(t, p) === t.vbox) return true;
  return false;
};

/** ผ่าน V-BOX: ซ่อมรถ/เบรก และสลับยางฝน-ยางแห้งให้ตรงกับอากาศ */
function vboxVisit(d: Driver, rain: boolean, events: GameEvent[]): Driver {
  let x = d;
  if (d.wet !== rain) {
    x = { ...x, wet: rain };
    events.push({ t: "vbox", driver: d.id, wet: rain });
  }
  if (d.damage || d.brakes) x = { ...x, damage: false, brakes: false };
  return x;
}

/** เซฟตี้คาร์: วางห่างคันนำ แล้วจัดรถทุกคันเรียงแถวบนเส้นแข่งข้างหลัง รถในพิทจบการเปลี่ยนยางทันที */
function deploySafetyCar(s: GameState, crashes: number, damaged: number, events: GameEvent[]): GameState {
  const field = standings(s).filter((o) => o.finished === null && !o.out);
  if (field.length === 0) return s;
  const lead = field[0];
  const raw = lead.progress + SC_GAP + SC_CRASH * (crashes - 1) + SC_DAMAGE * damaged;
  const at = Math.max(lead.progress + 1, Math.min(raw, s.total - 1));
  const rain = isRain(s);
  const spot = new Map(field.map((o, i) => [o.id, at - 1 - i]));
  events.push({ t: "sc", at });
  const drivers = s.drivers.map((o) => {
    const p = spot.get(o.id);
    if (p === undefined) return o;
    let x: Driver = { ...o, progress: p, lane: 0, off: false, blockVictim: null, slipTarget: null, boxing: false };
    if (o.pit) {
      if (!o.pit.served) {
        const other = o.sets.find((c) => c !== o.compound) ?? o.sets[0];
        x = stopAt(x, o.quick ?? other ?? "keep", rain, events);
      }
      x = { ...x, pit: null, penalty: false };
    }
    return x;
  });
  const next: GameState = {
    ...s, drivers, flags: [], round: s.round + 1, turn: 0, pending: null, neutral: { kind: "sc", left: NEUTRAL_ROUNDS },
  };
  return { ...next, order: standings(next).filter((o) => o.finished === null && !o.out).map((o) => o.id) };
}

/** กติกาของเรา: จบเทิร์นแล้วนับถอยหลังฝน → ทางหมาด → แดดออก */
function rainTick(s: GameState, events: GameEvent[]): Partial<GameState> {
  if (s.rules !== "ours" || s.weather < DAMP) return {};
  const left = s.rainLeft - 1;
  if (left > 0) return { rainLeft: left };
  const to = s.weather >= RAIN_AT ? DAMP : OURS_WEATHER[0];
  events.push({ t: "weather", from: s.weather, to });
  return { rainLeft: to === DAMP ? DAMP_ROUNDS : 0, weather: to };
}

/** จบเทิร์น: นับถอยหลังเซฟตี้คาร์ / VSC */
function neutralTick(s: GameState, events: GameEvent[]): Partial<GameState> {
  if (!s.neutral) return {};
  if (s.neutral.left > 1) return { neutral: { ...s.neutral, left: s.neutral.left - 1 } };
  events.push({ t: "green", kind: s.neutral.kind });
  return { neutral: null };
}

/** จบการเดินของรถหนึ่งคัน: บันทึก เช็กเส้นชัย ส่งตาต่อ แล้วให้ AI เดินจนถึงคนถัดไป */
function finishMove(
  s: GameState,
  mover: Driver,
  log: Omit<TurnLog, "finished" | "driver" | "ai">,
  rng: Rng,
  /** ตำแหน่งก่อนเดินบนสนาม — ใช้หาว่าใครตามติดจนสลิปสตรีมได้ (เรื่องพิทไม่นับ) */
  origin: Driver | null = null,
  sc: { crashes: number; damaged: number } | null = null,
): GameState {
  let d = mover;
  let finishOrder = s.finishOrder;
  const crossed = d.finished === null && !d.out && d.progress >= s.total;
  if (crossed) {
    finishOrder = [...finishOrder, d.id];
    d = { ...d, finished: finishOrder.length, pit: null, off: false };
  }
  // ใครตามติดคันนี้ในเลนเดียวกันตอนออกตัว และยังไม่ได้เดินรอบนี้ = สลิปสตรีมตามได้
  const laterInRound = new Set(s.order.slice(s.turn + 1));
  let drivers = s.drivers.map((o) => {
    if (o.id === d.id) return d;
    let x = o;
    if (x.blockVictim === d.id) x = { ...x, blockVictim: null };
    if (
      origin !== null &&
      laterInRound.has(x.id) &&
      solid(x) &&
      x.lane === origin.lane &&
      x.progress === origin.progress - 1
    ) {
      x = { ...x, slipTarget: d.id };
    }
    return x;
  });
  if (d.slipTarget !== null) drivers = drivers.map((o) => (o.id === d.id ? { ...o, slipTarget: null } : o));
  const events = [...log.events];
  let next: GameState = { ...s, drivers, finishOrder, pending: null };
  const done = (x: GameState) => x.drivers.every((o) => o.finished !== null || o.out);

  if (sc && sc.crashes > 0 && !done(next)) {
    next = deploySafetyCar(next, sc.crashes, sc.damaged, events);
  } else if (done(next)) {
    next = { ...next, over: true };
  } else {
    // รถเสียหาย (ไม่มีใครชนออก) = VSC ถ้ายังไม่มี SC/VSC อยู่
    if (sc && sc.damaged > 0 && !next.neutral) {
      next = { ...next, neutral: { kind: "vsc", left: NEUTRAL_ROUNDS } };
      events.push({ t: "vsc" });
    }
    let turn = s.turn + 1;
    while (turn < s.order.length && (next.drivers[s.order[turn]].finished !== null || next.drivers[s.order[turn]].out)) {
      turn++;
    }
    if (turn >= s.order.length) {
      // จบรอบ: เรียงลำดับใหม่ ล้างสถานะที่ใช้ได้แค่รอบเดียว ธงเหลืองที่ครบเวลาเก็บ
      const round = s.round + 1;
      next = {
        ...next,
        round,
        turn: 0,
        flags: next.flags.filter((f) => f.until >= round),
        ...rainTick(next, events),
        ...neutralTick(next, events),
        drivers: next.drivers.map((o) => ({ ...o, slipTarget: null, blockVictim: null })),
      };
      next = { ...next, order: standings(next).filter((o) => o.finished === null && !o.out).map((o) => o.id) };
    } else {
      next = { ...next, turn };
    }
  }
  const entry: TurnLog = { ...log, events, driver: d.id, ai: d.ai, finished: crossed };
  next = { ...next, feed: d.ai ? [...s.feed, entry] : [entry] };
  if (done(next)) next = { ...next, over: true };
  return next.over || next.stepAI ? next : runAI(next, rng);
}

/** ATTACK: เราอยู่เส้นแข่งติดท้ายรถคันหน้า และข้างมันว่าง → เราเข้าที่ มันถูกดันออกนอกเส้น */
export function attackTarget(s: GameState, d: Driver, at: { progress: number; lane: Lane }): Driver | null {
  if (d.tokens.attack <= 0 || at.lane !== 0) return null;
  const t = carAt(s.drivers.filter((o) => o.id !== d.id), at.progress + 1, 0);
  if (!t || t.blockVictim === d.id) return null;
  return occupied(s.drivers, d.id, at.progress + 1, 1) ? null : t;
}

type Extras = { ers?: boolean; attack?: boolean; block?: boolean; pass?: boolean; lane?: Lane };

/** ป้ายบนไพ่ที่เกี่ยวกับผลหลังเดิน */
type CardFx = { tires: boolean; ers: boolean; action: boolean; pitwall: boolean; spin: boolean };

const moveFx = (c: MoveCard, d: Driver, rain: boolean): CardFx => ({
  tires: c.tires,
  ers: c.ers,
  action: c.action,
  pitwall: c.pitwall,
  spin: rain && (d.wet ? c.spinWet : c.spinDry),
});

const aiFx = (c: AiCard, d: Driver, rain: boolean): CardFx => ({
  tires: false,
  ers: false,
  action: c.action,
  pitwall: false,
  spin: rain && (d.wet ? c.spinWet : c.spinDry),
});

/** ย้ายรถตามระยะ แล้วใช้ ERS / ATTACK / BLOCK / สึกยาง / หมุน / ไพ่ ACTION */
function resolve(
  s: GameState, d0: Driver, kind: MoveKind, want: number, fx: CardFx | null, cardId: number | null,
  extras: Extras, rng: Rng,
): GameState {
  let d = d0;
  const lim = limits(s, d0);
  const events: GameEvent[] = [];
  const log = { ...emptyLog(kind), card: cardId, events };
  const free = !lim.slow && !lim.limp;
  const ers = !!extras.ers && free && d.ers > 0 && kind !== "slip";
  if (ers) {
    d = { ...d, ers: d.ers - 1 };
    log.ers = true;
  }
  const extra = ["base", "card", "push", "pace"].includes(kind) ? d.bonus : 0;
  const pass = !!extras.pass && free && d.tokens.pass > 0 && kind !== "slip";
  if (pass) {
    d = { ...d, tokens: { ...d.tokens, pass: d.tokens.pass - 1 } };
    log.pass = true;
  }
  const goal = want + extra + (ers ? ersBonus(s, d0) : 0) + (pass ? 1 : 0);
  const go = travel(s, d, goal, extras.lane ?? 0, pass ? 1 : 0);
  log.corner = go.corner;
  log.blocked = go.blocked;
  d = { ...d, progress: go.progress, lane: go.lane, bonus: 0 };
  if (throughVbox(s.track, d0.progress, go.progress)) d = vboxVisit(d, lim.rain, events);
  let drivers = s.drivers.map((o) => (o.id === d.id ? d : o));

  if (extras.attack && free) {
    const t = attackTarget({ ...s, drivers }, d, go);
    if (t) {
      d = { ...d, progress: t.progress, lane: 0, tokens: { ...d.tokens, attack: d.tokens.attack - 1 } };
      drivers = drivers.map((o) => (o.id === d.id ? d : o.id === t.id ? { ...o, lane: 1 } : o));
      log.attacked = t.id;
    }
  }
  if (fx?.tires && !lim.rain) {
    if (d.wear >= WEAR_MAX) {
      d = { ...d, worn: true, mode: null };
      log.nowWorn = true;
    } else {
      const add = Math.min(WEAR_MAX - d.wear, COMPOUNDS[d.compound].wear);
      d = { ...d, wear: d.wear + add };
      log.wear = add;
    }
  }
  if (fx?.ers && !ers && d.ers < ERS_MAX) {
    d = { ...d, ers: d.ers + 1 };
    log.recharge = true;
  }
  if (extras.block && free && d.tokens.block > 0) {
    const victim = s.order[s.turn + 1];
    if (victim !== undefined && s.drivers[victim].progress <= d.progress) {
      d = { ...d, blockVictim: victim, tokens: { ...d.tokens, block: d.tokens.block - 1 } };
      log.block = true;
    }
  }
  if (kind === "pace" && go.progress - d0.progress < goal) {
    d = { ...d, mode: null };
    events.push({ t: "paceEnd", driver: d.id });
  }
  log.moved = d.progress - d0.progress;
  d = { ...d, boxing: d.boxing && d.pit === null };

  let st: GameState = { ...s, drivers: drivers.map((o) => (o.id === d.id ? d : o)) };
  // ไพ่ PITWALL ของทีม
  if (fx?.pitwall && !d.ai && st.teams[d.team] && st.pwDeck.length + st.pwDiscard.length > 0) {
    const pw = drawFrom(st.pwDeck, st.pwDiscard, rng);
    st = {
      ...st,
      pwDeck: pw.deck,
      pwDiscard: pw.discard.slice(0, -1),
      teams: st.teams.map((t, i) => (i === d.team ? { ...t, pitwall: [...t.pitwall, pw.id] } : t)),
    };
    events.push({ t: "pitwall", team: d.team });
  }
  const fxs = new Fx(st, events);
  if (fx?.spin && solid(d)) {
    events.push({ t: "spin", driver: d.id });
    fxs.goOff(d.id);
  }
  if (fx?.action) {
    const a = drawFrom(st.actionDeck, st.actionDiscard, rng);
    st = { ...st, actionDeck: a.deck, actionDiscard: a.discard };
    fxs.action(ACTION_DECK[a.id], d.id, rng);
  }
  st = { ...st, drivers: fxs.list(), weather: fxs.weather, rainLeft: fxs.rainLeft, flags: fxs.flags };
  return finishMove(st, fxs.get(d.id), log, rng, d0, { crashes: fxs.crashes, damaged: fxs.damaged });
}

/** เข้าเลนพิทจากโซนเข้าพิท */
function enterPit(s: GameState, d: Driver, rng: Rng): GameState {
  const offset = lapCell(s.track, d.progress) - s.track.pitEntry.start;
  const base = d.progress - offset;
  const inLane: Driver = { ...d, boxing: false, mode: null, pit: { base, pos: offset, inBox: false, served: false } };
  return pitMove(replace(s, inLane), inLane, "pitIn", d.progress, rng);
}

/** วิ่งในเลนพิท 1 ตา — มีพิทสต็อปเร็วรออยู่ ถึงช่องพิทแล้วเปลี่ยนยางทันที */
function pitMove(s: GameState, d: Driver, kind: MoveKind, from: number, rng: Rng): GameState {
  const events: GameEvent[] = [];
  let moved = pitStep(s, d);
  if (moved.pit?.inBox && moved.quick) moved = stopAt(moved, moved.quick, isRain(s), events);
  return finishMove(replace(s, moved), moved, { ...emptyLog(kind), moved: moved.progress - from, events }, rng);
}

/** จอดในช่องพิท: เปลี่ยนยาง (รถ AI แค่เสียเวลา) แล้ววิ่งออก · ตาที่จอดรับโทษแค่ออกจากพิท */
function serveBox(s: GameState, d: Driver, set: Compound | "keep" | undefined, rng: Rng): GameState {
  const events: GameEvent[] = [];
  let x: Driver;
  if (d.pit!.served) {
    x = { ...d, pit: { ...d.pit!, inBox: false } };
  } else {
    x = stopAt(d, set, isRain(s), events);
    if (x.pit!.inBox) {
      return finishMove(replace(s, x), x, { ...emptyLog("box"), events }, rng);
    }
  }
  const moved = pitStep(replace(s, x), x);
  return finishMove(replace(s, moved), moved, { ...emptyLog("box"), moved: moved.progress - d.progress, events }, rng);
}

/** กลับเข้าสนามจากข้างสนาม: ช่องข้างว่างถึงกลับได้ (จบตา) ไม่ว่างก็รอ */
function rejoin(s: GameState, d: Driver, rng: Rng): GameState {
  const lane = ([1, 0] as Lane[]).find((l) => !occupied(s.drivers, d.id, d.progress, l));
  const x: Driver = lane === undefined ? d : { ...d, off: false, lane };
  return finishMove(replace(s, x), x, emptyLog("rejoin"), rng);
}

function drawMove(s: GameState, team: number, rng: Rng): { id: number; s: GameState } {
  const t = s.teams[team];
  const r = drawFrom(t.moveDeck, t.moveDiscard, rng);
  const teams = s.teams.map((x, i) => (i === team ? { ...x, moveDeck: r.deck, moveDiscard: r.discard } : x));
  return { id: r.id, s: { ...s, teams } };
}

export type Choice = { kind: MoveKind; box?: boolean; set?: Compound | "keep" };

/**
 * ขั้นที่ 1 ของผู้เล่น: เลือกวิธีเดิน — พื้นฐาน/เปิดไพ่/DRS/โหมด จะได้ pending รอขั้นที่ 2
 * ส่วนสลิปสตรีม ยางพัง กลับเข้าสนาม และเรื่องพิท เดินจบในขั้นเดียว · เลือกไม่ได้ตามกติกาจะคืน state เดิม
 */
export function choose(s: GameState, c: Choice, rng: Rng): GameState {
  if (s.over || s.pending) return s;
  const d0 = activeDriver(s);
  if (d0.ai) return s;
  const o = options(s, d0);
  let d: Driver = d0.pit === null ? { ...d0, boxing: !!c.box } : d0;
  // เลือกทางอื่นทั้งที่โหมดใช้ได้ = ทิ้งโหมด
  if (modeReady(s, d0) && c.kind !== "push" && c.kind !== "pace") d = { ...d, mode: null };
  const st = replace(s, d);

  if (c.kind === "box" && o.inBox) return serveBox(st, d, c.set, rng);
  if (c.kind === "pitLane" && o.pitLane) return pitMove(st, d, "pitLane", d.progress, rng);
  if (c.kind === "rejoin" && o.rejoin) return rejoin(st, d, rng);
  if (d.pit || d.off) return s;
  if (c.kind === "pitIn" && o.pitIn) return enterPit(st, d, rng);
  if (c.kind === "worn" && o.worn) return resolve(st, d, "worn", WORN_MOVE, null, null, {}, rng);
  if (c.kind === "slip") {
    const t = slipTargetOf(s, d0);
    if (!t) return s;
    const x = { ...d, tokens: { ...d.tokens, slip: d.tokens.slip - 1 } };
    return resolve(replace(st, x), x, "slip", t.progress - 1 - d.progress, null, null, { lane: t.lane }, rng);
  }
  if (c.kind === "base" && o.base) return { ...st, pending: { driver: d.id, kind: "base", card: null, value: BASE_MOVE } };
  if (c.kind === "push" && o.push) {
    return { ...st, pending: { driver: d.id, kind: "push", card: null, value: pushValue(s, d) - offlinePenalty(s, d) } };
  }
  if (c.kind === "pace" && o.pace && d.mode?.kind === "pace") {
    return { ...st, pending: { driver: d.id, kind: "pace", card: null, value: d.mode.value } };
  }
  if (c.kind === "card" && o.card) {
    const { id, s: s2 } = drawMove(st, d.team, rng);
    const value = Math.max(0, moveFor(s, MOVE_DECK[id], d) - offlinePenalty(s, d));
    return { ...s2, pending: { driver: d.id, kind: "card", card: id, value } };
  }
  if (c.kind === "drs") {
    const t = drsTarget(s, d0);
    if (!t) return s;
    const want = t.blockVictim === d.id ? t.progress - 1 - d.progress : t.progress + 1 - d.progress;
    return { ...st, pending: { driver: d.id, kind: "drs", card: null, value: Math.max(0, want) } };
  }
  return s;
}

/** ขั้นที่ 2 ของผู้เล่น: ยืนยันการเดินพร้อม ERS / ATTACK / BLOCK / เลนที่จะจบ */
export function commit(s: GameState, extras: Extras, rng: Rng): GameState {
  const p = s.pending;
  if (!p) return s;
  const d = s.drivers[p.driver];
  const rain = isRain(s);
  const fx: CardFx | null =
    p.card !== null
      ? moveFx(MOVE_DECK[p.card], d, rain)
      : p.kind === "push"
        ? { tires: true, ers: false, action: false, pitwall: false, spin: rain && !d.wet }
        : null;
  return resolve(s, d, p.kind, p.value, fx, p.card, extras, rng);
}

/* ---------- ไพ่ PITWALL ---------- */

/** รถที่อยู่ติดหน้าในเลนเดียวกัน และไม่ใช่ทีมเดียวกับเรา — เป้าของไพ่ร้องเรียน */
export function reportTarget(s: GameState, d: Driver): Driver | null {
  if (!solid(d)) return null;
  const t = carAt(s.drivers, d.progress + 1, d.lane);
  return t && (t.ai || t.team !== d.team) ? t : null;
}

const teammate = (s: GameState, d: Driver) => s.drivers.find((o) => !o.ai && o.team === d.team && o.id !== d.id);

/** เล่นไพ่ PITWALL ใบนี้ได้ไหมตอนนี้ */
export function canPitwall(s: GameState, kind: PitwallKind, d: Driver = activeDriver(s)): boolean {
  if (s.over || d.ai || d.finished !== null || d.out) return false;
  const stage1 = !s.pending;
  const l = limits(s, d);
  switch (kind) {
    case "attack":
    case "block":
    case "slip":
      return d.tokens[kind] < TOKEN_USES;
    case "charge":
      return d.ers < ERS_MAX;
    case "tires":
      return !d.worn && d.wear > 0;
    case "radar":
      return true;
    case "report":
      return reportTarget(s, d) !== null;
    case "teamSpeed":
      return onTrack(d) && !d.off && !l.limp && (stage1 || s.pending?.kind !== "drs");
    case "quickBox":
      return stage1 && d.quick === null && ((d.pit !== null && !d.pit.served && !d.pit.inBox) || canPitIn(s, d));
    case "push":
    case "pace":
      return stage1 && onTrack(d) && !d.off && !l.limp && !l.slow;
  }
}

/** เล่นไพ่ PITWALL ใบที่ index ในมือทีมของคนที่ถึงตา — set ใช้กับพิทสต็อปเร็ว */
export function playPitwall(s: GameState, index: number, rng: Rng, set?: Compound | "keep"): GameState {
  const d = activeDriver(s);
  const team = s.teams[d.team];
  const cardId = team?.pitwall[index];
  if (d.ai || cardId === undefined) return s;
  const card = PITWALL_DECK[cardId];
  if (!canPitwall(s, card.kind, d)) return s;
  let st: GameState = {
    ...s,
    pwDiscard: [...s.pwDiscard, cardId],
    teams: s.teams.map((t, i) => (i === d.team ? { ...t, pitwall: t.pitwall.filter((_, k) => k !== index) } : t)),
  };
  const fx = new Fx(st, []);
  let x = d;
  switch (card.kind) {
    case "attack":
    case "block":
    case "slip":
      x = { ...x, tokens: { ...x.tokens, [card.kind]: x.tokens[card.kind] + 1 } };
      break;
    case "charge":
      x = { ...x, ers: x.ers + 1 };
      break;
    case "tires":
      x = { ...x, wear: Math.max(0, x.wear - COMPOUNDS[x.compound].wear) };
      break;
    case "radar":
      fx.setWeather(advanceWeather(fx.weather, 2, s.rules));
      break;
    case "report":
      fx.trackLimit(reportTarget(s, d)!.id);
      break;
    case "teamSpeed": {
      x = { ...x, bonus: x.bonus + 1 };
      const mate = teammate(s, d);
      if (mate && solid(mate)) {
        const go = travel(s, mate, 1, mate.lane);
        fx.set({ ...mate, progress: go.progress, lane: go.lane });
      }
      break;
    }
    case "quickBox":
      x = { ...x, quick: set ?? x.sets[0] ?? "keep" };
      break;
    case "push":
      x = { ...x, mode: { kind: "push" } };
      break;
    case "pace":
      x = { ...x, mode: { kind: "pace", value: card.value ?? 5 } };
      break;
  }
  // รถคันที่เล่นอาจโดนเปลี่ยนใน fx ด้วย (ไม่มีไพ่ไหนเปลี่ยนทั้งสองทาง) — รวมกลับ
  fx.set({ ...fx.get(d.id), ...diff(d, x) });
  st = { ...st, drivers: fx.list(), weather: fx.weather, rainLeft: fx.rainLeft, flags: fx.flags };
  return st;
}

/** ฟิลด์ที่เปลี่ยนจาก a → b */
function diff(a: Driver, b: Driver): Partial<Driver> {
  const out: Partial<Driver> = {};
  for (const k of Object.keys(b) as (keyof Driver)[]) {
    if (a[k] !== b[k]) (out as Record<string, unknown>)[k] = b[k];
  }
  return out;
}

/* ---------- รถ AI ---------- */

/** AI เข้าพิทได้ครั้งเดียว หลังผ่านระยะเรซไปแล้วราวหนึ่งในสาม */
const AI_PIT_FROM = 1 / 3;

function aiTurn(s: GameState, rng: Rng): GameState {
  const d = activeDriver(s);
  if (d.pit) {
    if (d.pit.inBox) return serveBox(s, d, undefined, rng);
    return pitMove(s, d, "pitLane", d.progress, rng);
  }
  if (d.off) return rejoin(s, d, rng);
  const l = limits(s, d);
  // ฝนตกแต่ยังใส่ยางแห้ง: เข้าพิทได้ก็เข้าเลย
  if ((d.boxing || (l.rain && !d.wet)) && canPitIn(s, d)) return enterPit(s, d, rng);
  if (l.limp) return resolve(s, d, "worn", WORN_MOVE, null, null, {}, rng);
  if (l.slow) return resolve(s, d, "base", BASE_MOVE, null, null, {}, rng);

  const drs = drsTarget(s, d);
  if (drs) {
    const want = drs.blockVictim === d.id ? drs.progress - 1 - d.progress : drs.progress + 1 - d.progress;
    return resolve(s, d, "drs", Math.max(0, want), null, null, { attack: true }, rng);
  }
  if (s.rules === "full" && d.lane === 1 && s.round > 1) return resolve(s, d, "base", BASE_MOVE, null, null, {}, rng);

  const r = drawFrom(s.aiDeck, s.aiDiscard, rng);
  const card = AI_DECK[r.id];
  const boxing =
    d.boxing || (card.box && d.pits === 0 && d.progress >= s.total * AI_PIT_FROM) || (l.rain && !d.wet);
  const st: GameState = { ...s, aiDeck: r.deck, aiDiscard: r.discard };
  const x = { ...d, boxing };
  const raw = d.wet ? card.w : card.v;
  const cut = s.rules === "ours" && !d.wet ? (l.rain ? 2 : s.weather === DAMP ? 1 : 0) : 0;
  const value = s.rules === "full" ? (l.rain && d.wet ? card.w : card.v) - offlinePenalty(s, d) : Math.max(1, raw - cut) - offlinePenalty(s, d);
  const extras = s.rules === "ours" ? { pass: card.attack } : { attack: card.attack, block: card.block };
  return resolve(replace(st, x), x, "card", value, aiFx(card, d, l.rain), r.id, extras, rng);
}

/** ถึงตารถ AI อยู่ไหม (โหมด stepAI) */
export const aiTurnPending = (s: GameState) => !s.over && activeDriver(s).ai;

/** ให้รถ AI ที่ถึงตาเดิน 1 คัน */
export function aiStep(s: GameState, rng: Rng): GameState {
  return aiTurnPending(s) ? aiTurn(s, rng) : s;
}

/** ให้รถ AI ที่ต่อคิวอยู่เดินไปจนถึงตาผู้เล่น (หรือจบเรซ) */
export function runAI(s: GameState, rng: Rng): GameState {
  let x = s;
  while (!x.over && activeDriver(x).ai) x = aiTurn(x, rng);
  return x;
}
