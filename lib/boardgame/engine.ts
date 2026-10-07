/**
 * กติกา Grand Prix Tour — ฟังก์ชันล้วน ไม่มี state ซ่อน
 * ความสุ่มทั้งหมดผ่าน `rng` ที่ส่งเข้ามา เพื่อให้เทสต์ซ้ำได้
 *
 * ก่อนแข่ง: ดูพยากรณ์อากาศ แล้วแต่ละคนเลือกการ์ดยาง 4 ใบ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรอง)
 * แต่ละเทิร์นเลือก 1 ใน 2 แบบ:
 *   ขับคุม — เดินคงที่ ไม่ทอยเต๋า ยางไม่สึก
 *   เร่ง   — เต๋า + โบนัสยาง (+ การ์ด) ยางสึก 1 เทิร์น ในฝนยางไม่สึกแต่ถ้ายางไม่เหมาะมีโอกาสหมุน
 * ยางหมดอายุ = "ยางพัง": ขับคุมได้เท่าที่ลดทอน ใช้การ์ดไม่ได้ ต้องเข้าพิท
 * ผู้เล่นเดินตามอันดับ (คนนำก่อน) ใครข้ามเส้นชัยก่อนชนะทันที
 * อากาศถูกกำหนดไว้ตั้งแต่เริ่มเกมและพยากรณ์ล่วงหน้าได้ (เทิร์นไกล ๆ ไม่แม่น)
 * ธงเหลืองเตือนว่ารอบหน้าอาจมีเซฟตี้คาร์ — ช่วงนั้นเข้าพิทฟรี แต่ผ่านรอบนั้นไปแล้วต้องเสียเวลาเต็ม
 */

export type Rng = () => number;

export type Tyre = "soft" | "medium" | "hard" | "inter" | "wet";
export type Action = "boost" | "slipstream" | "pit" | "save" | "block" | "reroll" | "sky";
export type EventKind = "safety_car" | "red_flag";
export type Weather = "dry" | "light_rain" | "heavy_rain";
export type Mode = "cruise" | "push";
/** ปรับตารางอากาศ: earlier = อากาศถัดไปมาเร็วขึ้น 1 รอบ, later = ยืดอากาศตอนนี้ออกไปอีก 1 รอบ */
export type SkyShift = "earlier" | "later";

/** move = โบนัสก้าวตอนเร่ง, life = เร่งได้กี่เทิร์นก่อนยางหมดอายุ, best = สภาพอากาศที่เหมาะ */
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

/** โบนัส/โทษก้าวตอนเร่ง จากยางที่เหมาะหรือไม่เหมาะกับอากาศ */
const MOVE_MOD: Record<Weather, Record<Tyre, number>> = {
  dry: { soft: 0, medium: 0, hard: 0, inter: -1, wet: -2 },
  light_rain: { soft: 0, medium: 0, hard: 0, inter: 1, wet: 0 },
  heavy_rain: { soft: 0, medium: 0, hard: 0, inter: 0, wet: 1 },
};

/** โอกาสหมุนตอนเร่งในฝน (ยางเรียบลื่นกว่ายางฝน) */
const SPIN: Record<Weather, Record<Tyre, number>> = {
  dry: { soft: 0, medium: 0, hard: 0, inter: 0, wet: 0 },
  light_rain: { soft: 0.4, medium: 0.35, hard: 0.3, inter: 0, wet: 0 },
  heavy_rain: { soft: 0.6, medium: 0.6, hard: 0.6, inter: 0.25, wet: 0 },
};

/** ผลของอากาศต่อยางหนึ่งใบตอนเร่ง (ใช้แสดงคำเตือนในหน้าจอด้วย) */
export const weatherEffect = (w: Weather, t: Tyre) => ({ move: MOVE_MOD[w][t], spin: SPIN[w][t] });

export const isRainTyre = (t: Tyre) => t === "inter" || t === "wet";
const isWet = (w: Weather) => w !== "dry";

export const ACTIONS: Record<Action, { label: string; desc: string }> = {
  boost: { label: "ดันสุด", desc: "ใช้ตอนเร่ง: +3 ช่อง แต่ยางสึกเพิ่มอีก 1 เทิร์น" },
  slipstream: { label: "ดูดอากาศ", desc: "+2 ช่อง (+4 ถ้าคุณตามหลังอยู่) ใช้ได้ทั้งขับคุมและเร่ง" },
  pit: {
    label: "เข้าพิท",
    desc: "เปลี่ยนเป็นยางสำรองที่เลือก เสียเวลา 2 ช่อง (ฟรีตอนเซฟตี้คาร์) แล้วขับออกแบบขับคุม",
  },
  save: { label: "ประหยัดยาง", desc: "ใช้ตอนเร่ง: ยางไม่สึกเทิร์นนี้ แต่ −1 ช่อง" },
  block: { label: "ขวางทาง", desc: "คนที่เดินต่อจากคุณเดิน −2 ช่อง (ต้องมีคนเดินตามหลังคุณ)" },
  reroll: { label: "ทอยซ้ำ", desc: "ใช้ตอนเร่ง: ทอยเต๋า 2 ครั้ง เอาค่าสูง" },
  sky: {
    label: "ปรับฟ้า",
    desc: "ลัดฟ้า: อากาศถัดไปมาเร็วขึ้น 1 รอบ · ยืดฟ้า: อากาศตอนนี้อยู่ต่ออีก 1 รอบ",
  },
};

export const EVENTS: Record<EventKind, { label: string; desc: string }> = {
  safety_car: {
    label: "เซฟตี้คาร์",
    desc: "ช่องว่างจากผู้นำเหลือครึ่งเดียว เต๋าตอนเร่งสูงสุด 3 และเข้าพิทฟรีในรอบนี้เท่านั้น",
  },
  red_flag: { label: "ธงแดง", desc: "ยางที่ใช้อยู่กลับมาใหม่ คันท้ายสุดได้ +3 ช่อง" },
};

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

export type Player = {
  id: number;
  name: string;
  /** ตำแหน่งสะสมเป็นจำนวนช่อง (0 = เส้นสตาร์ท) */
  progress: number;
  /** ยางที่ใส่ไว้ตอนเริ่ม — ใบแรกคือใบที่ใช้อยู่ ที่เหลือเป็นยางสำรอง */
  tyres: Tyre[];
  /** อายุยางใบที่ใช้อยู่ (เทิร์นเร่งที่เหลือ) 0 = ยางพัง */
  life: number;
  hand: Action[];
  deck: Action[];
  discard: Action[];
  /** ก้าวที่โดนหักในเทิร์นถัดไป (จากการ์ดขวางทาง) */
  debuff: number;
};

export type TurnLog = {
  player: number;
  /** ค่าเต๋าที่ได้ — null เมื่อขับคุม (ไม่ทอย) */
  die: number | null;
  action: Action | null;
  mode: Mode;
  moved: number;
  /** เริ่มเทิร์นด้วยยางพัง */
  worn: boolean;
  /** หมุนในฝน */
  spun: boolean;
};

export type GameState = WeatherPlan & {
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
  /** มีคนหมุนในรอบนี้ — ทำให้รอบหน้าขึ้นธงเหลือง */
  incident: boolean;
  winner: number | null;
  lastTurn: TurnLog | null;
};

export const weatherNow = (s: GameState): Weather => s.weather[s.round - 1] ?? "dry";

/** ผู้เล่นที่ถึงตาเล่น */
export const activePlayer = (s: GameState): Player => s.players[s.order[s.turn]];

/** ในรอบนี้มีคนเดินต่อจากคุณหรือไม่ (ใช้กับการ์ดขวางทาง) */
const hasFollower = (s: GameState) => s.turn < s.order.length - 1;

export const isWorn = (p: Player) => p.life <= 0;

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
    order: names.map((_, id) => id),
    turn: 0,
    event: null,
    yellow: false,
    incident: false,
    winner: null,
    lastTurn: null,
  };
}

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);

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
    (a, b) => b.progress - a.progress || a.id - b.id,
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

/** เล่น 1 เทิร์น — เลือกไม่ถูกกติกาจะคืน state เดิม */
export function playTurn(state: GameState, choice: TurnChoice, rng: Rng): GameState {
  if (state.winner !== null) return state;
  const { action } = choice;
  const first = activePlayer(state);

  // สลับยางด่วน (ถ้ามี) เกิดก่อนเดิน — ยางเดิมถูกทิ้ง ยางใหม่ได้อายุเต็ม
  let me = first;
  if (choice.swap != null) {
    if (action === "pit" || !canSwap(state, first, choice.swap)) return state;
    const i = choice.swap;
    const tyres = [first.tyres[i], ...first.tyres.slice(1).filter((_, k) => k + 1 !== i)];
    me = { ...first, tyres, life: TYRES[tyres[0]].life };
  }

  const worn = isWorn(me);
  const mode: Mode = worn || action === "pit" ? "cruise" : choice.mode;
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

  let die: number | null = null;
  let spun = false;
  let moved: number;
  let decay = 0;

  if (action === "pit") {
    moved = Math.max(1, CRUISE_MOVE - cost - me.debuff);
  } else if (mode === "cruise") {
    moved = Math.max(1, (worn ? WORN_MOVE : CRUISE_MOVE) + follow - me.debuff);
  } else {
    die = rollDie(rng);
    if (action === "reroll") die = Math.max(die, rollDie(rng));
    const rolled = state.event === "safety_car" ? Math.min(die, 3) : die;
    const chance = SPIN[weather][tyres[0]];
    spun = chance > 0 && rng() < chance;
    const bonus = action === "boost" ? 3 : action === "save" ? -1 : follow;
    moved = spun
      ? 1
      : Math.max(1, rolled + TYRES[tyres[0]].move + MOVE_MOD[weather][tyres[0]] + bonus - me.debuff);
    // ในฝนยางไม่สึก — ในแห้งสึก 1 (+1 ถ้าดันสุด, +1 ถ้าใช้ยางฝนในแห้ง) ประหยัดยางไม่สึก
    if (weather === "dry" && action !== "save") {
      decay = 1 + (action === "boost" ? 1 : 0) + (isRainTyre(tyres[0]) ? 1 : 0);
    }
  }

  // เข้าพิทตอนยางพังไม่ต้องใช้การ์ด
  const usesCard = action !== null && !(action === "pit" && worn);
  const hand = [...me.hand];
  const discard = [...me.discard];
  if (usesCard && action) {
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

  const victim = hasFollower(state) ? state.order[state.turn + 1] : -1;
  const players = state.players.map((p) => {
    if (p.id === me.id) return played;
    if (action === "block" && p.id === victim) return { ...p, debuff: p.debuff + 2 };
    return p;
  });

  let next: GameState = {
    ...state,
    players,
    incident: state.incident || spun,
    lastTurn: { player: me.id, die, action, mode, moved, worn, spun },
  };
  if (action === "sky") next = shiftSky(next, choice.sky ?? "earlier");

  // ใครข้ามเส้นชัยก่อนชนะทันที — คนที่เหลือไม่ได้เดินต่อ
  if (played.progress >= state.total) {
    return { ...next, winner: me.id, event: null, yellow: false };
  }
  return state.turn === state.order.length - 1
    ? endRound(next, rng)
    : { ...next, turn: state.turn + 1 };
}

/**
 * จบรอบ: ขึ้นรอบใหม่ จัดลำดับเดินใหม่ตามอันดับ
 * ธงเหลือง → รอบหน้าเป็นเซฟตี้คาร์ด้วยโอกาส YELLOW_TO_SC, ไม่มีธงเหลือง → อาจเกิดธงแดง
 * ถ้ารอบหน้าไม่มีเหตุการณ์ และมีคนหมุนหรือสุ่มติด จะขึ้นธงเหลืองเตือนรอบถัดไป
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
      life: TYRES[p.tyres[0]].life,
      progress: p.progress === last && last !== leader ? p.progress + 3 : p.progress,
    }));
  }
  return { ...state, players, event };
}
