/**
 * กติกา Grand Prix Tour — ฟังก์ชันล้วน ไม่มี state ซ่อน
 * ความสุ่มทั้งหมดผ่าน `rng` ที่ส่งเข้ามา เพื่อให้เทสต์ซ้ำได้
 *
 * ก่อนแข่ง: ดูพยากรณ์อากาศ แล้วแต่ละคนเลือกการ์ดยาง 4 ใบ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรอง)
 * แต่ละเทิร์น: เล่นการ์ด action ได้ 1 ใบ (หรือไม่เล่นก็ได้) แล้วทอยเต๋า แล้วจั่วเติมให้ครบ 3 ใบ
 *   ก้าว = เต๋า + โบนัสยาง + โบนัสการ์ด + ผลของอากาศต่อยาง (− 2 ถ้ายางหมดอายุ), อย่างน้อย 1
 * อากาศถูกกำหนดไว้ตั้งแต่เริ่มเกมและพยากรณ์ล่วงหน้าได้ (เทิร์นไกล ๆ ไม่แม่น)
 * ธงเหลืองเตือนว่ารอบหน้าอาจมีเซฟตี้คาร์ — ช่วงนั้นเข้าพิทฟรี แต่ผ่านรอบนั้นไปแล้วต้องเสียเวลาเต็ม
 */

export type Rng = () => number;

export type Tyre = "soft" | "medium" | "hard" | "inter" | "wet";
export type Action = "boost" | "slipstream" | "pit" | "save" | "block" | "reroll";
export type EventKind = "safety_car" | "red_flag";
export type Weather = "dry" | "light_rain" | "heavy_rain";

/** move = โบนัสก้าวต่อเทิร์น, life = ใช้ได้กี่เทิร์นก่อนหมดอายุ, best = สภาพอากาศที่เหมาะ */
export const TYRES: Record<Tyre, { label: string; move: number; life: number; best: string }> = {
  soft: { label: "นิ่ม", move: 3, life: 3, best: "แห้ง" },
  medium: { label: "กลาง", move: 2, life: 5, best: "แห้ง" },
  hard: { label: "แข็ง", move: 1, life: 7, best: "แห้ง" },
  inter: { label: "อินเตอร์", move: 2, life: 5, best: "ฝนเบา" },
  wet: { label: "เว็ท", move: 1, life: 6, best: "ฝนหนัก" },
};

export const WEATHER: Record<Weather, { label: string }> = {
  dry: { label: "แห้ง" },
  light_rain: { label: "ฝนเบา" },
  heavy_rain: { label: "ฝนหนัก" },
};

/** ผลของอากาศต่อยางแต่ละชนิด: move = บวก/ลบก้าว, decay = อายุยางเสื่อมเพิ่มต่อเทิร์น */
const WEATHER_MOD: Record<Weather, Record<Tyre, { move: number; decay: number }>> = {
  dry: {
    soft: { move: 0, decay: 0 },
    medium: { move: 0, decay: 0 },
    hard: { move: 0, decay: 0 },
    inter: { move: -1, decay: 1 },
    wet: { move: -2, decay: 1 },
  },
  light_rain: {
    soft: { move: -2, decay: 1 },
    medium: { move: -2, decay: 1 },
    hard: { move: -2, decay: 1 },
    inter: { move: 1, decay: 0 },
    wet: { move: 0, decay: 0 },
  },
  heavy_rain: {
    soft: { move: -3, decay: 2 },
    medium: { move: -3, decay: 2 },
    hard: { move: -3, decay: 2 },
    inter: { move: -1, decay: 1 },
    wet: { move: 1, decay: 0 },
  },
};

/** ผลของอากาศต่อยางหนึ่งใบ (ใช้แสดงคำเตือนในหน้าจอด้วย) */
export const weatherEffect = (w: Weather, t: Tyre) => WEATHER_MOD[w][t];

export const ACTIONS: Record<Action, { label: string; desc: string }> = {
  boost: { label: "ดันสุด", desc: "+3 ช่อง แต่ยางเสื่อมเพิ่มอีก 1 เทิร์น" },
  slipstream: { label: "ดูดอากาศ", desc: "+2 ช่อง (+4 ถ้าคุณตามหลังอยู่)" },
  pit: { label: "เข้าพิท", desc: "เปลี่ยนเป็นยางสำรองที่เลือก เสียเวลา 2 ช่อง (ฟรีตอนเซฟตี้คาร์)" },
  save: { label: "ประหยัดยาง", desc: "ยางไม่เสื่อมเทิร์นนี้ แต่ −1 ช่อง" },
  block: { label: "ขวางทาง", desc: "คู่แข่งตาถัดไปเดิน −2 ช่อง" },
  reroll: { label: "ทอยซ้ำ", desc: "ทอยเต๋า 2 ครั้ง เอาค่าสูง" },
};

export const EVENTS: Record<EventKind, { label: string; desc: string }> = {
  safety_car: {
    label: "เซฟตี้คาร์",
    desc: "ช่องว่างจากผู้นำเหลือครึ่งเดียว เต๋าสูงสุด 3 และเข้าพิทฟรีในรอบนี้เท่านั้น",
  },
  red_flag: { label: "ธงแดง", desc: "ยางที่ใช้อยู่กลับมาใหม่ คันท้ายสุดได้ +3 ช่อง" },
};

export const HAND_SIZE = 3;
export const TYRE_SLOTS = 4;
/** เลือกยางแต่ละชนิดซ้ำได้ไม่เกินนี้ */
export const MAX_PER_COMPOUND = 2;
/** เสียเวลาเข้าพิทกี่ช่อง (เซฟตี้คาร์ = ฟรี) */
export const PIT_COST = 2;
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

/** สำรับ action ของผู้เล่นแต่ละคน (12 ใบ) */
export const DECK_LIST: Record<Action, number> = {
  boost: 3, slipstream: 2, pit: 2, save: 2, block: 2, reroll: 1,
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

export type GameState = WeatherPlan & {
  players: Player[];
  /** ช่องที่ต้องไปให้ถึง = ช่องต่อรอบ × จำนวนรอบ */
  total: number;
  round: number;
  /** ผู้เล่นที่ถึงตาเล่น (ลำดับใน players) */
  turn: number;
  /** เหตุการณ์ของรอบนี้ (ถ้ามี) */
  event: EventKind | null;
  /** ธงเหลืองรอบนี้ — รอบหน้ามีโอกาสเป็นเซฟตี้คาร์ */
  yellow: boolean;
  winner: number | null;
  lastTurn: TurnLog | null;
};

export const weatherNow = (s: GameState): Weather => s.weather[s.round - 1] ?? "dry";

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
  plan: WeatherPlan,
  rng: Rng,
): GameState {
  const deckCards = (Object.keys(DECK_LIST) as Action[]).flatMap((a) =>
    Array<Action>(DECK_LIST[a]).fill(a),
  );
  return {
    ...plan,
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
    yellow: false,
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

/** เข้าพิทตอนนี้เสียเวลากี่ช่อง */
export const pitCost = (s: GameState) => (s.event === "safety_car" ? 0 : PIT_COST);

/** ผู้เล่นเรียงตามตำแหน่ง (ผู้นำก่อน) — เสมอกันให้ลำดับเดิม */
export function standings(state: GameState): Player[] {
  return [...state.players].sort(
    (a, b) => b.progress - a.progress || a.id - b.id,
  );
}

/**
 * เล่น 1 เทิร์น — `pitTo` คือลำดับของยางสำรองที่จะเปลี่ยนไปใช้ตอนเข้าพิท (1 = ใบสำรองแรก)
 */
export function playTurn(
  state: GameState,
  action: Action | null,
  rng: Rng,
  pitTo = 1,
): GameState {
  if (state.winner !== null) return state;
  const me = state.players[state.turn];
  if (!canPlay(me, action)) return state;
  if (action === "pit" && !(pitTo >= 1 && pitTo < me.tyres.length)) return state;

  let die = rollDie(rng);
  if (action === "reroll") die = Math.max(die, rollDie(rng));
  const rawDie = die;
  if (state.event === "safety_car") die = Math.min(die, 3);

  let tyres = me.tyres;
  let life = me.life;
  let cost = 0;
  if (action === "pit") {
    const next = tyres[pitTo];
    tyres = [next, ...tyres.slice(1).filter((_, i) => i + 1 !== pitTo)];
    life = TYRES[next].life;
    cost = pitCost(state);
  }

  const wx = WEATHER_MOD[weatherNow(state)][tyres[0]];
  const worn = life <= 0;
  const behind = state.players.some((p) => p.progress > me.progress);
  let bonus = 0;
  if (action === "boost") bonus = 3;
  else if (action === "slipstream") bonus = behind ? 4 : 2;
  else if (action === "save") bonus = -1;

  const moved = Math.max(
    1,
    die + TYRES[tyres[0]].move + wx.move + bonus - (worn ? 2 : 0) - me.debuff - cost,
  );
  const decay =
    action === "save" ? 0 : 1 + (action === "boost" ? 1 : 0) + wx.decay;

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

/**
 * จบรอบ: ตัดสินผู้ชนะถ้ามีคนถึงเส้นชัย ไม่งั้นขึ้นรอบใหม่
 * ธงเหลือง → รอบหน้าเป็นเซฟตี้คาร์ด้วยโอกาส YELLOW_TO_SC, ไม่มีธงเหลือง → อาจเกิดธงแดง
 * ถ้ารอบหน้าไม่มีเหตุการณ์ อาจมีธงเหลืองใหม่เตือนรอบถัดไป
 */
function endRound(state: GameState, rng: Rng): GameState {
  const lead = standings(state)[0];
  if (lead.progress >= state.total) {
    // ทุกคนเดินครบจำนวนเทิร์นเท่ากันแล้ว — เสมอกันตัดสินด้วยอายุยางเหลือมากกว่า
    const top = state.players.filter((p) => p.progress === lead.progress);
    top.sort((a, b) => b.life - a.life || a.id - b.id);
    return { ...state, winner: top[0].id, event: null, yellow: false };
  }

  let event: EventKind | null = null;
  if (state.yellow) {
    if (rng() < YELLOW_TO_SC) event = "safety_car";
  } else if (rng() < RED_FLAG_CHANCE) {
    event = "red_flag";
  }
  const yellow = event === null && rng() < YELLOW_CHANCE;
  const base = { ...state, round: state.round + 1, turn: 0, yellow };
  return event ? applyEvent(base, event) : { ...base, event: null };
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
      life: TYRES[p.tyres[0]].life,
      progress: p.progress === last && last !== leader ? p.progress + 3 : p.progress,
    }));
  }
  return { ...state, players, event };
}
