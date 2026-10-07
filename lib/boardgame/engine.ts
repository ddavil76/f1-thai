/**
 * กติกา Grand Prix Tour — ฟังก์ชันล้วน ไม่มี state ซ่อน
 * ความสุ่มทั้งหมดผ่าน `rng` ที่ส่งเข้ามา เพื่อให้เทสต์ซ้ำได้
 *
 * ก่อนแข่ง: แต่ละคนเลือกการ์ดยาง 3 ใบ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรอง)
 * แต่ละเทิร์น: เล่นการ์ด action ได้ 1 ใบ (หรือไม่เล่นก็ได้) แล้วทอยเต๋า แล้วจั่วเติมให้ครบ 3 ใบ
 *   ก้าว = เต๋า + โบนัสยาง + โบนัสการ์ด (− 2 ถ้ายางหมดอายุ), อย่างน้อย 1
 * ต้นรอบ (ตั้งแต่รอบ 2) มีโอกาสเกิดเหตุการณ์สุ่ม ช่วยให้คนตามหลังกลับมาสู้ได้
 */

export type Rng = () => number;

export type Tyre = "soft" | "medium" | "hard";
export type Action = "boost" | "slipstream" | "pit" | "save" | "block" | "reroll";
export type EventKind = "safety_car" | "rain" | "red_flag";

/** move = โบนัสก้าวต่อเทิร์น, life = ใช้ได้กี่เทิร์นก่อนหมดอายุ */
export const TYRES: Record<Tyre, { label: string; move: number; life: number }> = {
  soft: { label: "นิ่ม", move: 3, life: 3 },
  medium: { label: "กลาง", move: 2, life: 5 },
  hard: { label: "แข็ง", move: 1, life: 7 },
};

export const ACTIONS: Record<Action, { label: string; desc: string }> = {
  boost: { label: "ดันสุด", desc: "+3 ช่อง แต่ยางเสื่อมเพิ่มอีก 1 เทิร์น" },
  slipstream: { label: "ดูดอากาศ", desc: "+2 ช่อง (+4 ถ้าคุณตามหลังอยู่)" },
  pit: { label: "เข้าพิท", desc: "เปลี่ยนเป็นยางสำรองใบถัดไป แต่เต๋าเหลือครึ่งเดียว" },
  save: { label: "ประหยัดยาง", desc: "ยางไม่เสื่อมเทิร์นนี้ แต่ −1 ช่อง" },
  block: { label: "ขวางทาง", desc: "คู่แข่งตาถัดไปเดิน −2 ช่อง" },
  reroll: { label: "ทอยซ้ำ", desc: "ทอยเต๋า 2 ครั้ง เอาค่าสูง" },
};

export const EVENTS: Record<EventKind, { label: string; desc: string }> = {
  safety_car: { label: "เซฟตี้คาร์", desc: "ช่องว่างจากผู้นำเหลือครึ่งเดียว" },
  rain: { label: "ฝนตก", desc: "รอบนี้เต๋าสูงสุด 4 และยางเสื่อมเพิ่ม 1" },
  red_flag: { label: "ธงแดง", desc: "ยางที่ใช้อยู่กลับมาใหม่ คันท้ายสุดได้ +3 ช่อง" },
};

export const HAND_SIZE = 3;
export const TYRE_SLOTS = 3;
/** เลือกยางแต่ละชนิดซ้ำได้ไม่เกินนี้ */
export const MAX_PER_COMPOUND = 2;
export const EVENT_CHANCE = 0.35;

/** สำรับ action ของผู้เล่นแต่ละคน (12 ใบ) */
export const DECK_LIST: Record<Action, number> = {
  boost: 3, slipstream: 2, pit: 2, save: 2, block: 2, reroll: 1,
};

export type Player = {
  id: number;
  name: string;
  /** ตำแหน่งสะสมเป็นจำนวนช่อง (0 = เส้นสตาร์ท) */
  progress: number;
  /** ยางที่ใส่ไว้ตอนเริ่ม — ใบแรกคือใบที่ใช้อยู่ ที่เหลือเป็นยางสำรอง */
  tyres: Tyre[];
  /** อายุยางใบที่ใช้อยู่ (เทิร์นที่เหลือ) 0 = หมดอายุ */
  life: number;
  hand: Action[];
  deck: Action[];
  discard: Action[];
  /** ก้าวที่โดนหักในเทิร์นถัดไป (จากการ์ดขวางทาง) */
  debuff: number;
};

export type TurnLog = {
  player: number;
  die: number;
  action: Action | null;
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

/** จั่วจากสำรับจนมือครบ — สำรับหมดก็สับกองทิ้งกลับมาเป็นสำรับใหม่ */
function refill(p: Player, rng: Rng): Player {
  let { deck, discard } = p;
  const hand = [...p.hand];
  while (hand.length < HAND_SIZE) {
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

export function newGame(
  names: string[],
  total: number,
  tyres: Tyre[][],
  rng: Rng,
): GameState {
  const deckCards = (Object.keys(DECK_LIST) as Action[]).flatMap((a) =>
    Array<Action>(DECK_LIST[a]).fill(a),
  );
  return {
    players: names.map((name, id) =>
      refill(
        {
          id,
          name,
          progress: 0,
          tyres: tyres[id],
          life: TYRES[tyres[id][0]].life,
          hand: [],
          deck: shuffle(deckCards, rng),
          discard: [],
          debuff: 0,
        },
        rng,
      ),
    ),
    total,
    round: 1,
    turn: 0,
    event: null,
    winner: null,
    lastTurn: null,
  };
}

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);

export function canPlay(p: Player, a: Action | null) {
  if (a === null) return true;
  if (!p.hand.includes(a)) return false;
  return a !== "pit" || p.tyres.length > 1;
}

/** ผู้เล่นเรียงตามตำแหน่ง (ผู้นำก่อน) — เสมอกันให้ลำดับเดิม */
export function standings(state: GameState): Player[] {
  return [...state.players].sort(
    (a, b) => b.progress - a.progress || a.id - b.id,
  );
}

export function playTurn(
  state: GameState,
  action: Action | null,
  rng: Rng,
): GameState {
  if (state.winner !== null) return state;
  const me = state.players[state.turn];
  if (!canPlay(me, action)) return state;

  const rain = state.event === "rain";
  let die = rollDie(rng);
  if (action === "reroll") die = Math.max(die, rollDie(rng));
  const rawDie = die;
  if (rain) die = Math.min(die, 4);

  let tyres = me.tyres;
  let life = me.life;
  if (action === "pit") {
    tyres = tyres.slice(1);
    life = TYRES[tyres[0]].life;
    die = Math.ceil(die / 2);
  }

  const worn = life <= 0;
  const behind = state.players.some((p) => p.progress > me.progress);
  let bonus = 0;
  if (action === "boost") bonus = 3;
  else if (action === "slipstream") bonus = behind ? 4 : 2;
  else if (action === "save") bonus = -1;

  const moved = Math.max(
    1,
    die + TYRES[tyres[0]].move + bonus - (worn ? 2 : 0) - me.debuff,
  );
  const decay =
    action === "save" ? 0 : 1 + (action === "boost" ? 1 : 0) + (rain ? 1 : 0);

  const hand = [...me.hand];
  const discard = [...me.discard];
  if (action) {
    hand.splice(hand.indexOf(action), 1);
    discard.push(action);
  }
  const played = refill(
    {
      ...me,
      progress: me.progress + moved,
      tyres,
      life: Math.max(0, life - decay),
      hand,
      discard,
      debuff: 0,
    },
    rng,
  );

  const victim = (me.id + 1) % state.players.length;
  const players = state.players.map((p) => {
    if (p.id === me.id) return played;
    if (action === "block" && p.id === victim) return { ...p, debuff: p.debuff + 2 };
    return p;
  });
  const next: GameState = {
    ...state,
    players,
    lastTurn: { player: me.id, die: rawDie, action, moved, worn },
  };
  return me.id === players.length - 1 ? endRound(next, rng) : { ...next, turn: me.id + 1 };
}

/** จบรอบ: ตัดสินผู้ชนะถ้ามีคนถึงเส้นชัย ไม่งั้นขึ้นรอบใหม่และสุ่มเหตุการณ์ */
function endRound(state: GameState, rng: Rng): GameState {
  const lead = standings(state)[0];
  if (lead.progress >= state.total) {
    // ทุกคนเดินครบจำนวนเทิร์นเท่ากันแล้ว — เสมอกันตัดสินด้วยอายุยางเหลือมากกว่า
    const top = state.players.filter((p) => p.progress === lead.progress);
    top.sort((a, b) => b.life - a.life || a.id - b.id);
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
      life: TYRES[p.tyres[0]].life,
      progress: p.progress === last && last !== leader ? p.progress + 3 : p.progress,
    }));
  }
  return { ...state, players, event };
}
