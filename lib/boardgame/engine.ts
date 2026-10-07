/**
 * กติกา Grand Prix Tour (เฟส 1) — ฟังก์ชันล้วน ไม่มี state ซ่อน
 * ความสุ่มทั้งหมดผ่าน `rng` ที่ส่งเข้ามา เพื่อให้เทสต์ซ้ำได้
 *
 * แต่ละเทิร์น: เลือกการ์ดยาง 1 ใบ + การ์ดกลยุทธ์ได้ 0–1 ใบ แล้วทอยเต๋า
 *   ก้าว = เต๋า + โบนัสยาง + โบนัสกลยุทธ์ (− 2 ถ้ายางหมดสภาพ), อย่างน้อย 1
 * ต้นรอบ (ตั้งแต่รอบ 2) มีโอกาสเกิดเหตุการณ์สุ่ม ช่วยให้คนตามหลังกลับมาสู้ได้
 */

export type Rng = () => number;

export type Tyre = "soft" | "medium" | "hard";
export type Strategy = "pit" | "push" | "eco";
export type EventKind = "safety_car" | "rain" | "red_flag";

export const TYRES: Record<Tyre, { label: string; move: number; wear: number }> = {
  soft: { label: "นิ่ม", move: 3, wear: 3 },
  medium: { label: "กลาง", move: 2, wear: 2 },
  hard: { label: "แข็ง", move: 1, wear: 1 },
};

export const STRATEGIES: Record<Strategy, { label: string; desc: string }> = {
  pit: { label: "เข้าพิท", desc: "ยางใหม่ แต่ทอยได้แค่ครึ่งเดียว" },
  push: { label: "ดันสุด", desc: "+3 ช่อง แต่ยางสึกเพิ่ม +3" },
  eco: { label: "ประหยัด", desc: "−1 ช่อง แต่ยางสึกน้อยลง 2" },
};

export const EVENTS: Record<EventKind, { label: string; desc: string }> = {
  safety_car: { label: "เซฟตี้คาร์", desc: "ช่องว่างจากผู้นำเหลือครึ่งเดียว" },
  rain: { label: "ฝนตก", desc: "รอบนี้เต๋าสูงสุด 4 และยางสึกเพิ่ม +1" },
  red_flag: { label: "ธงแดง", desc: "ทุกคนเปลี่ยนยางใหม่ คันท้ายสุดได้ +3 ช่อง" },
};

/** ยางสึกถึงเท่านี้ = หมดสภาพ ก้าวลด 2 */
export const WORN_AT = 8;
export const EVENT_CHANCE = 0.35;

export type Player = {
  id: number;
  name: string;
  /** ตำแหน่งสะสมเป็นจำนวนช่อง (0 = เส้นสตาร์ท) */
  progress: number;
  wear: number;
  cards: Record<Strategy, number>;
};

export type TurnLog = {
  player: number;
  die: number;
  tyre: Tyre;
  strategy: Strategy | null;
  moved: number;
  worn: boolean;
};

export type GameState = {
  players: Player[];
  /** ช่องที่ต้องไปให้ถึง = ช่องต่อรอบ × จำนวนรอบ */
  total: number;
  round: number;
  /** ผู้เล่นที่ถึงตาเล่น (ลำดับใน players) */
  turn: number;
  /** เหตุการณ์ของรอบนี้ (ถ้ามี) */
  event: EventKind | null;
  winner: number | null;
  lastTurn: TurnLog | null;
};

export const START_CARDS: Record<Strategy, number> = { pit: 2, push: 2, eco: 2 };

export function newGame(names: string[], total: number): GameState {
  return {
    players: names.map((name, id) => ({
      id,
      name,
      progress: 0,
      wear: 0,
      cards: { ...START_CARDS },
    })),
    total,
    round: 1,
    turn: 0,
    event: null,
    winner: null,
    lastTurn: null,
  };
}

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);

export function canPlay(p: Player, s: Strategy | null) {
  return s === null || p.cards[s] > 0;
}

/** ผู้เล่นเรียงตามตำแหน่ง (ผู้นำก่อน) — เสมอกันให้ลำดับเดิม */
export function standings(state: GameState): Player[] {
  return [...state.players].sort(
    (a, b) => b.progress - a.progress || a.id - b.id,
  );
}

export function playTurn(
  state: GameState,
  tyre: Tyre,
  strategy: Strategy | null,
  rng: Rng,
): GameState {
  if (state.winner !== null) return state;
  const me = state.players[state.turn];
  if (!canPlay(me, strategy)) return state;

  const rain = state.event === "rain";
  const rawDie = rollDie(rng);
  let die = rain ? Math.min(rawDie, 4) : rawDie;

  let wear = me.wear;
  let bonus = 0;
  let extraWear = rain ? 1 : 0;
  if (strategy === "pit") {
    wear = 0;
    die = Math.ceil(die / 2);
  } else if (strategy === "push") {
    bonus += 3;
    extraWear += 3;
  } else if (strategy === "eco") {
    bonus -= 1;
    extraWear -= 2;
  }

  const worn = wear >= WORN_AT;
  const t = TYRES[tyre];
  const moved = Math.max(1, die + t.move + bonus - (worn ? 2 : 0));
  const newWear = Math.max(0, wear + t.wear + extraWear);

  const cards = { ...me.cards };
  if (strategy) cards[strategy] -= 1;

  const players = state.players.map((p) =>
    p.id === me.id ? { ...p, progress: p.progress + moved, wear: newWear, cards } : p,
  );
  const lastTurn: TurnLog = {
    player: me.id,
    die: rawDie,
    tyre,
    strategy,
    moved,
    worn,
  };

  const next = { ...state, players, lastTurn };
  return me.id === players.length - 1 ? endRound(next, rng) : { ...next, turn: me.id + 1 };
}

/** จบรอบ: ตัดสินผู้ชนะถ้ามีคนถึงเส้นชัย ไม่งั้นขึ้นรอบใหม่และสุ่มเหตุการณ์ */
function endRound(state: GameState, rng: Rng): GameState {
  const lead = standings(state)[0];
  if (lead.progress >= state.total) {
    // ทุกคนเดินครบจำนวนเทิร์นเท่ากันแล้ว — เสมอกันตัดสินด้วยยางสึกน้อยกว่า
    const top = state.players.filter((p) => p.progress === lead.progress);
    top.sort((a, b) => a.wear - b.wear || a.id - b.id);
    return { ...state, winner: top[0].id, event: null };
  }

  const base = { ...state, round: state.round + 1, turn: 0 };
  if (rng() >= EVENT_CHANCE) return { ...base, event: null };
  const kinds: EventKind[] = ["safety_car", "rain", "red_flag"];
  return applyEvent(base, kinds[Math.floor(rng() * kinds.length)]);
}

export function applyEvent(state: GameState, event: EventKind): GameState {
  const leader = Math.max(...state.players.map((p) => p.progress));
  let players = state.players;
  if (event === "safety_car") {
    players = players.map((p) => ({
      ...p,
      progress: leader - Math.floor((leader - p.progress) / 2),
    }));
  } else if (event === "red_flag") {
    const last = Math.min(...players.map((p) => p.progress));
    players = players.map((p) => ({
      ...p,
      wear: 0,
      progress: p.progress === last && last !== leader ? p.progress + 3 : p.progress,
    }));
  }
  return { ...state, players, event };
}
