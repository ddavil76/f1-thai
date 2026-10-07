/**
 * กติกาเกมกระดาน (ช่วง A) — ฟังก์ชันล้วน ความสุ่มทั้งหมดผ่าน `rng`
 *
 * ทีมละ 2 คัน กริด 12 คัน (ที่ว่างเติมด้วยรถ AI) แข่ง 4 รอบสนาม เดินตามอันดับ (คันนำก่อน)
 * ตาหนึ่งมี 2 ขั้น:
 *   1) เลือกวิธีเดิน: พื้นฐาน 4 ช่อง (ไม่สึกยาง) / เปิดไพ่ MOVE (เฉพาะรถบนเส้นแข่ง) / DRS / สลิปสตรีม
 *      หรือเรื่องพิท (เข้าเลนพิท, วิ่งในเลนพิท, เปลี่ยนยางในช่องพิท)
 *   2) เห็นระยะแล้วค่อยเลือก: ERS +2, ATTACK, BLOCK, เลนที่จะจบ
 * ไพ่ MOVE มีค่า 2 แถว (ยางเหลือง/ยางแดง) ไพ่ที่มีป้าย "สึก" ทำให้ยางเสื่อม (เหลือง 1 ขั้น แดง 2 ขั้น)
 * บางใบมีสายฟ้า = ชาร์จ ERS คืน 1 ขั้น ยางสุดรางแล้วเจอไพ่สึกอีก = ยางพัง เดินเองช่องละ 3 ต้องเข้าพิท
 * โค้ง: เข้าโค้งต้องหยุดในโค้ง แล้วออกในตาถัดไป ช่องหนึ่งจุ 2 คัน (คนละเลน) และแซงแนวทแยงผ่านรถ 2 คันไม่ได้
 * ข้ามเส้นชัยแล้วไม่ถูกแซง อันดับตามลำดับที่ข้ามเส้น
 */

import type { Zone } from "./board";

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

export const COMPOUNDS: Record<Compound, { label: string; wear: number }> = {
  yellow: { label: "เหลือง", wear: 1 },
  red: { label: "แดง", wear: 2 },
};

/** ไพ่ MOVE: y/r = ระยะเมื่อใส่ยางเหลือง/แดง, tires = ป้ายสึก (ไพ่ความเร็วสูงสุด), ers = สายฟ้าชาร์จ ERS */
export type MoveCard = { y: number; r: number; tires: boolean; ers: boolean };

const mc = (y: number, r: number, tires = false, ers = false): MoveCard => ({ y, r, tires, ers });
const times = <T>(n: number, x: T) => Array.from({ length: n }, () => x);

/** สำรับ MOVE ของแต่ละทีม (30 ใบ) — ไพ่ที่เร็วสุดคือไพ่ที่ทำให้ยางสึก */
export const MOVE_DECK: MoveCard[] = [
  ...times(2, mc(7, 9, true, true)),
  ...times(2, mc(7, 9, true)),
  mc(7, 8, true, true),
  ...times(2, mc(7, 8, true)),
  mc(6, 9, true, true),
  ...times(2, mc(6, 9, true)),
  ...times(6, mc(6, 7)),
  ...times(4, mc(6, 6)),
  ...times(4, mc(5, 7)),
  ...times(4, mc(5, 6)),
  ...times(2, mc(4, 5)),
];

export const moveValue = (c: MoveCard, comp: Compound) => (comp === "red" ? c.r : c.y);

/** ไพ่ของรถ AI: v = ระยะ, box = ถึงเวลาเข้าพิท, attack/block = ใช้เหรียญนั้นอัตโนมัติ */
export type AiCard = { v: number; box: boolean; attack: boolean; block: boolean };
const ac = (v: number, f: Partial<AiCard> = {}): AiCard => ({ v, box: false, attack: false, block: false, ...f });

export const AI_DECK: AiCard[] = [
  ...times(3, ac(7)),
  ac(7, { attack: true }),
  ac(7, { box: true }),
  ...times(7, ac(6)),
  ac(6, { attack: true }),
  ac(6, { block: true }),
  ac(6, { box: true }),
  ...times(3, ac(5)),
  ac(5, { attack: true }),
  ac(5, { block: true }),
];

/** ข้อมูลสนามที่กติกาใช้ */
export type Track = { lapCells: number; corners: Zone[]; drs: Zone[]; pitEntry: Zone };

export type PitState = {
  /** ตำแหน่งสะสมของช่องแรกในเลนพิท (ตรงกับช่องแรกของโซนเข้าพิท) */
  base: number;
  /** ช่องในเลนพิท 0..PIT_LEN-1 */
  pos: number;
  /** จอดอยู่ในช่องพิท รอเปลี่ยนยางตาหน้า */
  inBox: boolean;
  /** เปลี่ยนยาง/จอดเสร็จแล้ว กำลังวิ่งออก */
  served: boolean;
};

export type Tokens = { attack: number; block: number; slip: number };

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
  /** อันดับตอนข้ามเส้นชัย (null = ยังไม่จบ) */
  finished: number | null;
  pits: number;
};

export type Team = { name: string; moveDeck: number[]; moveDiscard: number[] };

export type MoveKind = "base" | "card" | "drs" | "slip" | "worn" | "pitIn" | "pitLane" | "box";

/** ขั้นที่ 2 ที่รออยู่: รู้ระยะแล้ว รอเลือก ERS / ATTACK / BLOCK / เลน */
export type Pending = { driver: number; kind: "base" | "card" | "drs"; card: number | null; value: number };

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
  /** ยางสึกเพิ่มกี่ขั้น */
  wear: number;
  nowWorn: boolean;
  finished: boolean;
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

/* ---------- ตำแหน่งบนสนาม ---------- */

export const lapCell = (t: Track, p: number) => ((p % t.lapCells) + t.lapCells) % t.lapCells;

export const inZone = (z: Zone, c: number) =>
  z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end;

/** อยู่ในโซนไหนของรายการ (ลำดับ) หรือ -1 */
export const zoneAt = (t: Track, zones: Zone[], p: number) =>
  zones.findIndex((z) => inZone(z, lapCell(t, p)));

export const onTrack = (d: Driver) => d.pit === null && d.finished === null;

const occupied = (drivers: Driver[], self: number, p: number, lane: Lane) =>
  drivers.some((o) => o.id !== self && onTrack(o) && o.progress === p && o.lane === lane);

const carAt = (drivers: Driver[], p: number, lane: Lane) =>
  drivers.find((o) => onTrack(o) && o.progress === p && o.lane === lane);

export const activeDriver = (s: GameState): Driver => s.drivers[s.order[s.turn]];

/** อันดับ: คันที่จบแล้วตามลำดับเส้นชัย แล้วตามระยะ (บนสนามนำเลนพิท เส้นแข่งนำนอกเส้น) */
export function standings(s: GameState): Driver[] {
  const done = s.finishOrder.map((id) => s.drivers[id]);
  const racing = s.drivers
    .filter((d) => d.finished === null)
    .sort(
      (a, b) =>
        b.progress - a.progress ||
        Number(a.pit !== null) - Number(b.pit !== null) ||
        a.lane - b.lane ||
        a.id - b.id,
    );
  return [...done, ...racing];
}

/* ---------- เริ่มเกม ---------- */

export type CarSpec = { name: string; num: number; team: number; ai: boolean; compound?: Compound };

/** ยางทั้งหมดต่อคัน: เหลือง 2 แดง 2 — ใส่ออกตัว 1 ชุด ที่เหลือรอในพิท */
const SETS: Compound[] = ["yellow", "yellow", "red", "red"];

export function newGame(
  cars: CarSpec[],
  teamNames: string[],
  track: Track,
  laps: number,
  rng: Rng,
  grid?: number[],
): GameState {
  const order = grid ?? shuffle(cars.map((_, i) => i), rng);
  const moveIds = MOVE_DECK.map((_, i) => i);
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
      wear: 0,
      worn: false,
      sets: c.ai ? [] : sets,
      ers: ERS_MAX,
      tokens: { attack: TOKEN_USES, block: TOKEN_USES, slip: TOKEN_USES },
      boxing: false,
      blockVictim: null,
      slipTarget: null,
      finished: null,
      pits: 0,
    };
  });
  const state: GameState = {
    track,
    drivers,
    teams: teamNames.map((name) => ({ name, moveDeck: shuffle(moveIds, rng), moveDiscard: [] })),
    laps,
    total: track.lapCells * laps,
    round: 1,
    order,
    turn: 0,
    pending: null,
    aiDeck: shuffle(AI_DECK.map((_, i) => i), rng),
    aiDiscard: [],
    finishOrder: [],
    feed: [],
    over: false,
  };
  return runAI(state, rng);
}

/* ---------- สิ่งที่ทำได้ในตานี้ ---------- */

/** เปิดไพ่ MOVE ได้เฉพาะรถบนเส้นแข่ง (ยกเว้นตาแรกของเกม) และยางไม่พัง */
export const canCard = (s: GameState, d: Driver) =>
  d.pit === null && !d.worn && (d.lane === 0 || s.round === 1);

/** DRS: อยู่ในโซน DRS และมีรถอยู่ช่องหน้าติดกันในเลนเดียวกัน — คืนรถคันหน้า */
export function drsTarget(s: GameState, d: Driver): Driver | null {
  if (s.round === 1 || d.pit !== null || d.worn || zoneAt(s.track, s.track.drs, d.progress) < 0) {
    return null;
  }
  return carAt(s.drivers, d.progress + 1, d.lane) ?? null;
}

/** สลิปสตรีม: รถที่ตามติดออกตัวไปแล้วในรอบนี้ และยังมีเหรียญ */
export function slipTargetOf(s: GameState, d: Driver): Driver | null {
  if (s.round === 1 || d.slipTarget === null || d.tokens.slip <= 0 || d.worn || d.pit !== null) {
    return null;
  }
  const t = s.drivers[d.slipTarget];
  return onTrack(t) && t.progress - 1 >= d.progress ? t : null;
}

export const canPitIn = (s: GameState, d: Driver) =>
  d.pit === null && d.sets.length + (d.ai ? 1 : 0) > 0 && inZone(s.track.pitEntry, lapCell(s.track, d.progress));

export function options(s: GameState, d: Driver = activeDriver(s)) {
  if (d.pit) {
    return { inBox: d.pit.inBox, pitLane: !d.pit.inBox };
  }
  return {
    worn: d.worn,
    base: !d.worn,
    card: canCard(s, d),
    drs: drsTarget(s, d) !== null,
    slip: slipTargetOf(s, d) !== null,
    pitIn: canPitIn(s, d),
  };
}

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
): { progress: number; lane: Lane; corner: boolean; blocked: boolean } {
  const t = s.track;
  const start = d.progress;
  let target = start + Math.max(0, want);
  let blocked = false;

  const blocker = s.drivers.find((o) => o.blockVictim === d.id && onTrack(o) && o.progress > start);
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

/** วางรถที่ออกจากพิท/ถูกย้าย ไม่ให้ทับคันอื่น (ลองเลนนอกก่อน แล้วถอยทีละช่อง) */
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
    if (o.id === d.id || !o.pit) continue;
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

const replace = (s: GameState, d: Driver): GameState => ({
  ...s,
  drivers: s.drivers.map((o) => (o.id === d.id ? d : o)),
});

/** จบการเดินของรถหนึ่งคัน: บันทึก เช็กเส้นชัย ส่งตาต่อ แล้วให้ AI เดินจนถึงคนถัดไป */
function finishMove(
  s: GameState,
  mover: Driver,
  log: Omit<TurnLog, "finished" | "driver" | "ai">,
  rng: Rng,
  /** ตำแหน่งก่อนเดินบนสนาม — ใช้หาว่าใครตามติดจนสลิปสตรีมได้ (เรื่องพิทไม่นับ) */
  origin: Driver | null = null,
): GameState {
  let d = mover;
  let finishOrder = s.finishOrder;
  const crossed = d.finished === null && d.progress >= s.total;
  if (crossed) {
    finishOrder = [...finishOrder, d.id];
    d = { ...d, finished: finishOrder.length, pit: null };
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
      onTrack(x) &&
      x.lane === origin.lane &&
      x.progress === origin.progress - 1
    ) {
      x = { ...x, slipTarget: d.id };
    }
    return x;
  });
  if (d.slipTarget !== null) drivers = drivers.map((o) => (o.id === d.id ? { ...o, slipTarget: null } : o));
  const entry: TurnLog = { ...log, driver: d.id, ai: d.ai, finished: crossed };
  const feed = d.ai ? [...s.feed, entry] : [entry];
  let next: GameState = { ...s, drivers, finishOrder, feed, pending: null };
  if (next.drivers.every((o) => o.finished !== null)) return { ...next, over: true };

  if (s.turn >= s.order.length - 1) {
    // จบรอบ: เรียงลำดับใหม่ ล้างสถานะที่ใช้ได้แค่รอบเดียว
    next = {
      ...next,
      round: s.round + 1,
      turn: 0,
      drivers: next.drivers.map((o) => ({ ...o, slipTarget: null, blockVictim: null })),
    };
    next = { ...next, order: standings(next).filter((o) => o.finished === null).map((o) => o.id) };
  } else {
    next = { ...next, turn: s.turn + 1 };
  }
  return runAI(next, rng);
}

const emptyLog = (kind: MoveKind): Omit<TurnLog, "finished" | "driver" | "ai"> => ({
  kind, card: null, moved: 0, corner: false, blocked: false, ers: false, recharge: false,
  attacked: null, block: false, wear: 0, nowWorn: false,
});

/** ATTACK: เราอยู่เส้นแข่งติดท้ายรถคันหน้า และข้างมันว่าง → เราเข้าที่ มันถูกดันออกนอกเส้น */
export function attackTarget(s: GameState, d: Driver, at: { progress: number; lane: Lane }): Driver | null {
  if (d.tokens.attack <= 0 || at.lane !== 0) return null;
  const t = carAt(s.drivers.filter((o) => o.id !== d.id), at.progress + 1, 0);
  if (!t || t.blockVictim === d.id) return null;
  return occupied(s.drivers, d.id, at.progress + 1, 1) ? null : t;
}

type Extras = { ers?: boolean; attack?: boolean; block?: boolean; lane?: Lane };

/** ย้ายรถตามระยะ แล้วใช้ ERS / ATTACK / BLOCK / สึกยาง */
function resolve(
  s: GameState, d0: Driver, kind: MoveKind, want: number, card: MoveCard | null, cardId: number | null,
  extras: Extras, rng: Rng,
): GameState {
  let d = d0;
  const log = { ...emptyLog(kind), card: cardId };
  const ers = !!extras.ers && d.ers > 0 && !d.worn && kind !== "slip";
  if (ers) {
    d = { ...d, ers: d.ers - 1 };
    log.ers = true;
  }
  const go = travel(s, d, want + (ers ? ERS_BONUS : 0), extras.lane ?? 0);
  log.corner = go.corner;
  log.blocked = go.blocked;
  d = { ...d, progress: go.progress, lane: go.lane };
  let drivers = s.drivers.map((o) => (o.id === d.id ? d : o));

  if (extras.attack) {
    const t = attackTarget({ ...s, drivers }, d, go);
    if (t) {
      d = { ...d, progress: t.progress, lane: 0, tokens: { ...d.tokens, attack: d.tokens.attack - 1 } };
      drivers = drivers.map((o) => (o.id === d.id ? d : o.id === t.id ? { ...o, lane: 1 } : o));
      log.attacked = t.id;
    }
  }
  if (card && card.tires) {
    if (d.wear >= WEAR_MAX) {
      d = { ...d, worn: true };
      log.nowWorn = true;
    } else {
      const add = Math.min(WEAR_MAX - d.wear, COMPOUNDS[d.compound].wear);
      d = { ...d, wear: d.wear + add };
      log.wear = add;
    }
  }
  if (card && card.ers && !ers && d.ers < ERS_MAX) {
    d = { ...d, ers: d.ers + 1 };
    log.recharge = true;
  }
  if (extras.block && d.tokens.block > 0) {
    const victim = s.order[s.turn + 1];
    if (victim !== undefined && s.drivers[victim].progress <= d.progress) {
      d = { ...d, blockVictim: victim, tokens: { ...d.tokens, block: d.tokens.block - 1 } };
      log.block = true;
    }
  }
  log.moved = d.progress - d0.progress;
  return finishMove({ ...s, drivers }, { ...d, boxing: d.boxing && d.pit === null }, log, rng, d0);
}

/** เข้าเลนพิทจากโซนเข้าพิท */
function enterPit(s: GameState, d: Driver, rng: Rng): GameState {
  const offset = lapCell(s.track, d.progress) - s.track.pitEntry.start;
  const base = d.progress - offset;
  const inLane: Driver = { ...d, boxing: false, pit: { base, pos: offset, inBox: false, served: false } };
  const moved = pitStep(replace(s, inLane), inLane);
  return finishMove(replace(s, moved), moved, { ...emptyLog("pitIn"), moved: moved.progress - d.progress }, rng);
}

/** จอดในช่องพิท: เปลี่ยนยาง (รถ AI แค่เสียเวลา) แล้ววิ่งออก */
function serveBox(s: GameState, d: Driver, set: Compound | undefined, rng: Rng): GameState {
  let x: Driver = { ...d, pits: d.pits + 1, pit: { ...d.pit!, inBox: false, served: true } };
  if (!d.ai) {
    const pick = set && d.sets.includes(set) ? set : d.sets[0];
    if (pick) {
      const sets = [...d.sets];
      sets.splice(sets.indexOf(pick), 1);
      x = { ...x, compound: pick, sets, wear: 0, worn: false };
    }
  }
  const moved = pitStep(replace(s, x), x);
  return finishMove(replace(s, moved), moved, { ...emptyLog("box"), moved: moved.progress - d.progress }, rng);
}

function drawMove(s: GameState, team: number, rng: Rng): { id: number; s: GameState } {
  const t = s.teams[team];
  let deck = t.moveDeck;
  let discard = t.moveDiscard;
  if (deck.length === 0) {
    deck = shuffle(discard, rng);
    discard = [];
  }
  const id = deck[0];
  const teams = s.teams.map((x, i) =>
    i === team ? { ...x, moveDeck: deck.slice(1), moveDiscard: [...discard, id] } : x,
  );
  return { id, s: { ...s, teams } };
}

export type Choice = { kind: MoveKind; box?: boolean; set?: Compound };

/**
 * ขั้นที่ 1 ของผู้เล่น: เลือกวิธีเดิน — พื้นฐาน/เปิดไพ่/DRS จะได้ pending รอขั้นที่ 2
 * ส่วนสลิปสตรีม ยางพัง และเรื่องพิท เดินจบในขั้นเดียว · เลือกไม่ได้ตามกติกาจะคืน state เดิม
 */
export function choose(s: GameState, c: Choice, rng: Rng): GameState {
  if (s.over || s.pending) return s;
  const d0 = activeDriver(s);
  if (d0.ai) return s;
  const o = options(s, d0);
  const d: Driver = d0.pit === null ? { ...d0, boxing: !!c.box } : d0;
  const st = replace(s, d);

  if (c.kind === "box" && "inBox" in o && o.inBox) return serveBox(st, d, c.set, rng);
  if (c.kind === "pitLane" && "pitLane" in o && o.pitLane) {
    const moved = pitStep(st, d);
    return finishMove(replace(st, moved), moved, { ...emptyLog("pitLane"), moved: moved.progress - d.progress }, rng);
  }
  if (d.pit) return s;
  if (c.kind === "pitIn" && canPitIn(s, d)) return enterPit(st, d, rng);
  if (c.kind === "worn" && d.worn) return resolve(st, d, "worn", WORN_MOVE, null, null, {}, rng);
  if (c.kind === "slip") {
    const t = slipTargetOf(s, d);
    if (!t) return s;
    const x = { ...d, tokens: { ...d.tokens, slip: d.tokens.slip - 1 } };
    return resolve(replace(st, x), x, "slip", t.progress - 1 - d.progress, null, null, { lane: t.lane }, rng);
  }
  if (c.kind === "base" && !d.worn) return { ...st, pending: { driver: d.id, kind: "base", card: null, value: BASE_MOVE } };
  if (c.kind === "card" && canCard(s, d)) {
    const { id, s: s2 } = drawMove(st, d.team, rng);
    return { ...s2, pending: { driver: d.id, kind: "card", card: id, value: moveValue(MOVE_DECK[id], d.compound) } };
  }
  if (c.kind === "drs") {
    const t = drsTarget(s, d);
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
  const card = p.card !== null ? MOVE_DECK[p.card] : null;
  return resolve(s, d, p.kind, p.value, card, p.card, extras, rng);
}

/* ---------- รถ AI ---------- */

/** AI เข้าพิทได้ครั้งเดียว หลังผ่านระยะเรซไปแล้วราวหนึ่งในสาม */
const AI_PIT_FROM = 1 / 3;

function aiTurn(s: GameState, rng: Rng): GameState {
  const d = activeDriver(s);
  if (d.pit) {
    if (d.pit.inBox) return serveBox(s, d, undefined, rng);
    const moved = pitStep(s, d);
    return finishMove(replace(s, moved), moved, { ...emptyLog("pitLane"), moved: moved.progress - d.progress }, rng);
  }
  if (d.boxing && canPitIn(s, d)) return enterPit(s, d, rng);

  const drs = drsTarget(s, d);
  if (drs) {
    const want = drs.blockVictim === d.id ? drs.progress - 1 - d.progress : drs.progress + 1 - d.progress;
    return resolve(s, d, "drs", Math.max(0, want), null, null, { attack: true }, rng);
  }
  if (d.lane === 1 && s.round > 1) return resolve(s, d, "base", BASE_MOVE, null, null, {}, rng);

  let deck = s.aiDeck;
  let discard = s.aiDiscard;
  if (deck.length === 0) {
    deck = shuffle(discard, rng);
    discard = [];
  }
  const id = deck[0];
  const card = AI_DECK[id];
  const boxing = d.boxing || (card.box && d.pits === 0 && d.progress >= s.total * AI_PIT_FROM);
  const st: GameState = { ...s, aiDeck: deck.slice(1), aiDiscard: [...discard, id] };
  const x = { ...d, boxing };
  return resolve(replace(st, x), x, "card", card.v, null, id, { attack: card.attack, block: card.block }, rng);
}

/** ให้รถ AI ที่ต่อคิวอยู่เดินไปจนถึงตาผู้เล่น (หรือจบเรซ) */
export function runAI(s: GameState, rng: Rng): GameState {
  let x = s;
  while (!x.over && activeDriver(x).ai) x = aiTurn(x, rng);
  return x;
}
