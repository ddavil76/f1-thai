/**
 * กติกาเกมเศรษฐีสายแข่งรถ "เจ้าพ่อพิทเลน" (เวอร์ชันแรก)
 * — ทอยเต๋า 2 ลูก เดินรอบกระดาน · ผ่านเส้นสตาร์ทรับเงินสปอนเซอร์ · ซื้อสนาม/ธุรกิจ · เก็บค่าตั๋ว
 * — ครบกลุ่มสนาม → ค่าตั๋ว ×2 และสร้างอัฒจันทร์ได้ (สร้างเท่า ๆ กันทั้งกลุ่ม) → แพดด็อก VIP
 * — ทอยได้คู่ = ดูดสลิปสตรีม ทอยอีกครั้ง · คู่ 3 ครั้งติด = ขับเร็วในพิทเลน ไปห้องสจ๊วต
 * — ห้องสจ๊วต: ทอยคู่เพื่อออก / จ่ายค่าปรับ / ใช้บัตรอุทธรณ์ · ตาที่ 3 ต้องจ่าย
 * — จ่ายไม่ไหว: ขายสิ่งปลูกสร้างแล้วขายสนามคืนธนาคารครึ่งราคา · ยังไม่พอ = ล้มละลาย
 * — จบฤดูกาลเมื่อมีคนวิ่งครบจำนวนรอบ (จบรอบตาเดินนั้น) หรือเหลือคนเดียว · ชนะด้วยมูลค่ารวม
 * สถานะเป็น JSON ล้วน (เก็บในเครื่องได้) · สุ่มด้วยเมล็ด · ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { rand, type Seed } from "../rng";
import {
  BIZ_SQUARES, BOARD, bizRent, CAP_MIN, circuitRent, FREIGHT_TAX, GROUPS, groupSquares, isOwnable, JAIL, JAIL_FINE, MAX_LEVEL,
  PASS_START, PIT, SIZE, START, START_CASH, type GroupId,
} from "./board";

export type Player = {
  name: string;
  color: string;
  ink: string;
  bot: boolean;
  cash: number;
  pos: number;
  /** 0 = อิสระ · 1–3 = ตาที่อยู่ในห้องสจ๊วต */
  jail: number;
  /** บัตรอุทธรณ์ (ออกจากห้องสจ๊วตฟรี) */
  pardons: number;
  laps: number;
  out: boolean;
};

export type Deck = "radio" | "weather";
export type Phase =
  | { k: "roll" }
  | { k: "buy"; sq: number }
  | { k: "card"; deck: Deck; card: number }
  | { k: "end" }
  | { k: "over" };

export type LogLine = { id: number; who: number | null; text: string; tone?: "good" | "bad" };

export type Game = {
  v: 1;
  seed: Seed;
  players: Player[];
  /** เจ้าของ (index ผู้เล่น) และระดับสิ่งปลูกสร้างของแต่ละช่อง */
  owner: (number | null)[];
  level: number[];
  turn: number;
  round: number;
  laps: number;
  dice: [number, number] | null;
  /** จำนวนครั้งที่ทอยได้คู่ติดกันในตานี้ · ต้องทอยอีกครั้งไหม */
  doubles: number;
  again: boolean;
  phase: Phase;
  decks: Record<Deck, number[]>;
  log: LogLine[];
  logId: number;
};

export type Action =
  | { t: "roll" }
  | { t: "buy" }
  | { t: "pass" }
  | { t: "ok" }
  | { t: "end" }
  | { t: "build"; sq: number }
  | { t: "payJail" }
  | { t: "pardon" };

type CardDef = { text: string; run: (g: Game, p: number) => void };

/** การ์ดวิทยุทีม */
export const RADIO: CardDef[] = [
  { text: "Box box! พิทสต็อปเร็วที่สุดในสนาม — รับ 100", run: (g, p) => earn(g, p, 100) },
  { text: "ปีกหน้าหักจากการแตะกัน — จ่ายค่าซ่อม 80", run: (g, p) => pay(g, p, null, 80) },
  { text: "ทีมสั่งเปลี่ยนกลยุทธ์ — กลับไปเส้นสตาร์ท (รับเงินสปอนเซอร์)", run: (g, p) => moveTo(g, p, START) },
  { text: "ตัดโค้งเกิน track limits — ไปห้องสจ๊วต", run: (g, p) => toJail(g, p) },
  { text: "อุทธรณ์ผ่าน! — เก็บบัตรนี้ไว้ใช้ออกจากห้องสจ๊วตฟรี", run: (g, p) => void g.players[p].pardons++ },
  { text: "ได้สปอนเซอร์รายใหม่ — รับ 50 จากผู้เล่นทุกคน", run: (g, p) => eachOther(g, p, (o) => pay(g, o, p, 50)) },
  { text: "ตรวจสภาพอัฒจันทร์ — จ่าย 25 ต่ออัฒจันทร์ และ 100 ต่อแพดด็อก VIP", run: (g, p) => pay(g, p, null, repairCost(g, p)) },
  { text: "ได้สิทธิ์จัดงานที่โมนาโก — ไปโมนาโก", run: (g, p) => moveTo(g, p, SIZE - 1) },
];

/** การ์ดสภาพอากาศ */
export const WEATHER: CardDef[] = [
  { text: "ฝนตกหนัก! รถลื่น — ถอยหลัง 3 ช่อง", run: (g, p) => moveBy(g, p, -3) },
  { text: "แดดดี คนดูล้นสนาม — รับ 150", run: (g, p) => earn(g, p, 150) },
  { text: "เซฟตี้คาร์ออก — เข้าพิทสต็อป", run: (g, p) => moveTo(g, p, PIT) },
  { text: "พายุพัดป้ายโฆษณาพัง — จ่าย 100", run: (g, p) => pay(g, p, null, 100) },
  { text: "ลมส่งท้ายทางตรง — เดินหน้า 3 ช่อง", run: (g, p) => moveBy(g, p, 3) },
  { text: "ดูดสลิปสตรีม — ไปธุรกิจที่ใกล้ที่สุดข้างหน้า", run: (g, p) => moveTo(g, p, nextBiz(g.players[p].pos)) },
  { text: "ฝนหยุด เลี้ยงข้าวทีมงานทุกทีม — จ่ายผู้เล่นทุกคนคนละ 25", run: (g, p) => eachOther(g, p, (o) => pay(g, p, o, 25)) },
  { text: "ประกันอากาศจ่ายคืน — รับ 75", run: (g, p) => earn(g, p, 75) },
];

export const cardText = (deck: Deck, i: number) => (deck === "radio" ? RADIO : WEATHER)[i].text;

export type Setup = { seed: number; names: string[]; colors: { color: string; ink: string }[]; bots: boolean[]; laps: number };

export function newGame(s: Setup): Game {
  const seed: Seed = { s: s.seed | 0 };
  const g: Game = {
    v: 1,
    seed,
    players: s.names.map((name, i) => ({ name, color: s.colors[i].color, ink: s.colors[i].ink, bot: s.bots[i], cash: START_CASH, pos: START, jail: 0, pardons: 0, laps: 0, out: false })),
    owner: BOARD.map(() => null),
    level: BOARD.map(() => 0),
    turn: 0,
    round: 1,
    laps: s.laps,
    dice: null,
    doubles: 0,
    again: false,
    phase: { k: "roll" },
    decks: { radio: shuffle(seed, RADIO.length), weather: shuffle(seed, WEATHER.length) },
    log: [],
    logId: 0,
  };
  say(g, null, `เริ่มฤดูกาล ${s.laps} รอบ · ทุกคนได้ทุน ${money(START_CASH)}`);
  return g;
}

export const money = (n: number) => `฿${Math.round(n).toLocaleString("en-US")}`;

function shuffle(seed: Seed, n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand(seed) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function say(g: Game, who: number | null, text: string, tone?: LogLine["tone"]) {
  g.log.push({ id: ++g.logId, who, text, tone });
  if (g.log.length > 60) g.log.splice(0, g.log.length - 60);
}

const nextBiz = (pos: number) => BIZ_SQUARES.find((i) => i > pos) ?? BIZ_SQUARES[0];
const eachOther = (g: Game, p: number, f: (o: number) => void) => g.players.forEach((o, i) => i !== p && !o.out && !g.players[p].out && f(i));

function earn(g: Game, p: number, n: number) {
  g.players[p].cash += n;
}

/** สนามทั้งกลุ่มเป็นของคนเดียวกันไหม */
export function ownsGroup(g: Game, p: number, group: GroupId) {
  return groupSquares(group).every((i) => g.owner[i] === p);
}

/** ค่าตั๋ว/ค่าบริการเมื่อคนอื่นตกช่องนี้ */
export function rentOf(g: Game, sq: number): number {
  const o = g.owner[sq];
  const s = BOARD[sq];
  if (o === null) return 0;
  if (s.kind === "circuit") return circuitRent(s.price, g.level[sq], ownsGroup(g, o, s.group));
  if (s.kind === "biz") return bizRent(BIZ_SQUARES.filter((i) => g.owner[i] === o).length);
  return 0;
}

const buildCost = (sq: number) => {
  const s = BOARD[sq];
  return s.kind === "circuit" ? GROUPS[s.group].build : 0;
};

function repairCost(g: Game, p: number) {
  let n = 0;
  g.owner.forEach((o, i) => {
    if (o !== p) return;
    const l = g.level[i];
    n += l === MAX_LEVEL ? 100 : l * 25;
  });
  return n;
}

/** มูลค่ารวม: เงินสด + ราคาสนาม/ธุรกิจ + ค่าสร้าง */
export function worth(g: Game, p: number) {
  let n = g.players[p].cash;
  g.owner.forEach((o, i) => {
    if (o === p) n += (isOwnable(BOARD[i]) ? BOARD[i].price : 0) + g.level[i] * buildCost(i);
  });
  return n;
}

/** สร้างอัฒจันทร์ได้ไหม (ครบกลุ่ม · สร้างเท่า ๆ กัน · เงินพอ) */
export function canBuild(g: Game, p: number, sq: number) {
  const s = BOARD[sq];
  if (s.kind !== "circuit" || g.owner[sq] !== p || g.level[sq] >= MAX_LEVEL) return false;
  if (!ownsGroup(g, p, s.group)) return false;
  const lv = groupSquares(s.group).map((i) => g.level[i]);
  if (g.level[sq] > Math.min(...lv)) return false;
  return g.players[p].cash >= GROUPS[s.group].build;
}

/** จ่ายเงิน (to = null คือธนาคาร) · ไม่พอ = ขายทรัพย์สิน · ยังไม่พอ = ล้มละลาย */
function pay(g: Game, p: number, to: number | null, n: number) {
  if (n <= 0) return;
  const pl = g.players[p];
  if (pl.cash < n) raise(g, p, n);
  if (pl.cash < n) {
    const left = Math.max(0, pl.cash);
    if (to !== null) g.players[to].cash += left;
    bankrupt(g, p, to);
    return;
  }
  pl.cash -= n;
  if (to !== null) g.players[to].cash += n;
}

/** ขายของหาเงิน: สิ่งปลูกสร้างก่อน (ครึ่งราคา จากระดับสูงสุด) แล้วสนามถูกสุดก่อน */
function raise(g: Game, p: number, need: number) {
  const pl = g.players[p];
  const mine = () => g.owner.flatMap((o, i) => (o === p ? [i] : []));
  while (pl.cash < need) {
    const built = mine().filter((i) => g.level[i] > 0).sort((a, b) => g.level[b] - g.level[a]);
    if (!built.length) break;
    const sq = built[0];
    g.level[sq]--;
    pl.cash += buildCost(sq) / 2;
    say(g, p, `ขายสิ่งปลูกสร้างที่${BOARD[sq].name} ได้ ${money(buildCost(sq) / 2)}`, "bad");
  }
  while (pl.cash < need) {
    const props = mine().sort((a, b) => (BOARD[a] as { price: number }).price - (BOARD[b] as { price: number }).price);
    if (!props.length) break;
    const sq = props[0];
    const v = (BOARD[sq] as { price: number }).price / 2;
    g.owner[sq] = null;
    pl.cash += v;
    say(g, p, `ขาย${BOARD[sq].name}คืนธนาคาร ได้ ${money(v)}`, "bad");
  }
}

function bankrupt(g: Game, p: number, to: number | null) {
  const pl = g.players[p];
  pl.cash = 0;
  pl.out = true;
  pl.jail = 0;
  g.owner.forEach((o, i) => {
    if (o === p) {
      g.owner[i] = null;
      g.level[i] = 0;
    }
  });
  say(g, p, `${pl.name} ล้มละลาย!${to !== null ? ` (เงินที่เหลือตกเป็นของ ${g.players[to].name})` : ""}`, "bad");
  if (g.players.filter((x) => !x.out).length <= 1) finish(g);
}

function finish(g: Game) {
  g.phase = { k: "over" };
  const r = ranking(g);
  say(g, r[0], `จบฤดูกาล! ${g.players[r[0]].name} เป็นเจ้าพ่อพิทเลน (มูลค่า ${money(worth(g, r[0]))})`, "good");
}

/** อันดับ: คนที่ยังไม่ล้มละลายก่อน แล้วเรียงตามมูลค่ารวม */
export function ranking(g: Game) {
  return g.players.map((_, i) => i).sort((a, b) => Number(g.players[a].out) - Number(g.players[b].out) || worth(g, b) - worth(g, a));
}

function toJail(g: Game, p: number) {
  const pl = g.players[p];
  pl.pos = JAIL;
  pl.jail = 1;
  g.again = false;
  g.doubles = 0;
  say(g, p, `${pl.name} ถูกเรียกเข้าห้องสจ๊วต`, "bad");
}

/** เดินไปข้างหน้า n ช่อง (ผ่านเส้นสตาร์ทรับเงิน) แล้วจัดการช่องที่ตก */
function walk(g: Game, p: number, n: number) {
  const pl = g.players[p];
  const to = (pl.pos + n) % SIZE;
  if (pl.pos + n >= SIZE) passStart(g, p);
  pl.pos = to;
  land(g, p);
}

function passStart(g: Game, p: number) {
  const pl = g.players[p];
  pl.cash += PASS_START;
  pl.laps++;
  say(g, p, `${pl.name} ผ่านเส้นสตาร์ท รอบที่ ${pl.laps} · รับสปอนเซอร์ ${money(PASS_START)}`, "good");
}

function moveTo(g: Game, p: number, sq: number) {
  const pl = g.players[p];
  if (sq < pl.pos || sq === START) passStart(g, p);
  pl.pos = sq;
  land(g, p);
}

function moveBy(g: Game, p: number, n: number) {
  const pl = g.players[p];
  pl.pos = (pl.pos + n + SIZE) % SIZE;
  land(g, p);
}

/** จัดการช่องที่ตก · ตั้ง phase ถัดไป */
function land(g: Game, p: number) {
  const pl = g.players[p];
  const s = BOARD[pl.pos];
  g.phase = { k: "end" };
  if (isOwnable(s)) {
    const o = g.owner[pl.pos];
    if (o === null) {
      if (pl.cash >= s.price) g.phase = { k: "buy", sq: pl.pos };
      else say(g, p, `${pl.name} เงินไม่พอซื้อ${s.name} (${money(s.price)})`);
    } else if (o !== p) {
      const r = rentOf(g, pl.pos);
      say(g, p, `${pl.name} จ่ายค่า${s.kind === "biz" ? "บริการ" : "ตั๋ว"}${s.name} ${money(r)} ให้ ${g.players[o].name}`, "bad");
      pay(g, p, o, r);
    }
  } else if (s.kind === "radio" || s.kind === "weather") {
    const deck = g.decks[s.kind];
    const card = deck.shift()!;
    deck.push(card);
    g.phase = { k: "card", deck: s.kind, card };
  } else if (s.kind === "tax") {
    const n = s.tax === "freight" ? FREIGHT_TAX : Math.max(CAP_MIN, Math.round((pl.cash * 0.1) / 10) * 10);
    say(g, p, `${pl.name} จ่าย${s.name} ${money(n)}`, "bad");
    pay(g, p, null, n);
  } else if (s.kind === "gojail") {
    toJail(g, p);
  } else if (s.kind === "pit") {
    say(g, p, `${pl.name} แวะพิทสต็อป พักหายใจ`);
  }
  if (g.phase.k === "end" && pl.out) g.phase = g.players.filter((x) => !x.out).length <= 1 ? { k: "over" } : { k: "end" };
  settle(g);
}

/** หลังจัดการช่องเสร็จ: ได้ทอยอีกครั้ง (ทอยคู่) หรือรอจบตา */
function settle(g: Game) {
  if (g.phase.k !== "end") return;
  const pl = g.players[g.turn];
  if (g.again && !pl.out && pl.jail === 0) g.phase = { k: "roll" };
}

function roll(g: Game) {
  const p = g.turn;
  const pl = g.players[p];
  const a = 1 + Math.floor(rand(g.seed) * 6);
  const b = 1 + Math.floor(rand(g.seed) * 6);
  g.dice = [a, b];
  const dbl = a === b;
  if (pl.jail > 0) {
    if (dbl) {
      pl.jail = 0;
      g.again = false;
      say(g, p, `${pl.name} ทอยได้คู่ ${a}-${b} พ้นผิด ออกจากห้องสจ๊วต`, "good");
      walk(g, p, a + b);
      return;
    }
    if (pl.jail >= 3) {
      say(g, p, `${pl.name} ครบ 3 ตา ต้องจ่ายค่าปรับ ${money(JAIL_FINE)}`, "bad");
      pl.jail = 0;
      g.again = false;
      pay(g, p, null, JAIL_FINE);
      if (pl.out) {
        if (g.phase.k !== "over") g.phase = { k: "end" };
        return;
      }
      walk(g, p, a + b);
      return;
    }
    pl.jail++;
    say(g, p, `${pl.name} ทอยได้ ${a}-${b} ยังไม่ได้คู่ อยู่ห้องสจ๊วตต่อ`);
    g.phase = { k: "end" };
    return;
  }
  if (dbl) {
    g.doubles++;
    if (g.doubles >= 3) {
      say(g, p, `${pl.name} ทอยคู่ 3 ครั้งติด — ขับเร็วในพิทเลน!`, "bad");
      toJail(g, p);
      g.phase = { k: "end" };
      return;
    }
    g.again = true;
    say(g, p, `${pl.name} ทอยได้คู่ ${a}-${b} ดูดสลิปสตรีม ได้ทอยอีกครั้ง`);
  } else {
    g.again = false;
    say(g, p, `${pl.name} ทอยได้ ${a}+${b} = ${a + b}`);
  }
  walk(g, p, a + b);
}

function endTurn(g: Game) {
  const n = g.players.length;
  let next = g.turn;
  for (let k = 0; k < n; k++) {
    next = (next + 1) % n;
    if (!g.players[next].out) break;
  }
  const wrapped = next <= g.turn;
  g.turn = next;
  g.doubles = 0;
  g.again = false;
  g.dice = null;
  if (wrapped) {
    g.round++;
    if (g.players.some((x) => !x.out && x.laps >= g.laps)) return finish(g);
  }
  g.phase = { k: "roll" };
}

/** ทำ action ของผู้เล่นตาปัจจุบัน · คืนสถานะใหม่ (ไม่แก้ของเดิม) · action ที่ทำไม่ได้คืนของเดิม */
export function act(game: Game, a: Action): Game {
  const ph = game.phase;
  if (ph.k === "over") return game;
  const g: Game = structuredClone(game);
  const p = g.turn;
  const pl = g.players[p];
  switch (a.t) {
    case "roll":
      if (ph.k !== "roll") return game;
      roll(g);
      break;
    case "buy": {
      if (ph.k !== "buy") return game;
      const s = BOARD[ph.sq] as { name: string; price: number };
      if (pl.cash < s.price) return game;
      pl.cash -= s.price;
      g.owner[ph.sq] = p;
      say(g, p, `${pl.name} ซื้อ${s.name} ${money(s.price)}`, "good");
      g.phase = { k: "end" };
      settle(g);
      break;
    }
    case "pass":
      if (ph.k !== "buy") return game;
      say(g, p, `${pl.name} ไม่ซื้อ${BOARD[ph.sq].name}`);
      g.phase = { k: "end" };
      settle(g);
      break;
    case "ok": {
      if (ph.k !== "card") return game;
      const def = (ph.deck === "radio" ? RADIO : WEATHER)[ph.card];
      say(g, p, `${pl.name} ได้การ์ด${ph.deck === "radio" ? "วิทยุทีม" : "สภาพอากาศ"}: ${def.text}`);
      g.phase = { k: "end" };
      def.run(g, p);
      if (pl.out && (g.phase as Phase).k !== "over") g.phase = { k: "end" };
      settle(g);
      break;
    }
    case "end":
      if (ph.k !== "end") return game;
      endTurn(g);
      break;
    case "build": {
      if (ph.k !== "roll" && ph.k !== "end") return game;
      if (!canBuild(g, p, a.sq)) return game;
      const cost = buildCost(a.sq);
      pl.cash -= cost;
      g.level[a.sq]++;
      say(g, p, `${pl.name} สร้าง${g.level[a.sq] === MAX_LEVEL ? "แพดด็อก VIP" : "อัฒจันทร์"}ที่${BOARD[a.sq].name} (${money(cost)})`, "good");
      break;
    }
    case "payJail":
      if (ph.k !== "roll" || pl.jail === 0 || pl.cash < JAIL_FINE) return game;
      pl.cash -= JAIL_FINE;
      pl.jail = 0;
      say(g, p, `${pl.name} จ่ายค่าปรับ ${money(JAIL_FINE)} ออกจากห้องสจ๊วต`);
      break;
    case "pardon":
      if (ph.k !== "roll" || pl.jail === 0 || pl.pardons <= 0) return game;
      pl.pardons--;
      pl.jail = 0;
      say(g, p, `${pl.name} ใช้บัตรอุทธรณ์ ออกจากห้องสจ๊วต`, "good");
      break;
  }
  return g;
}

/** บอท: เลือก action ถัดไปหนึ่งอย่าง */
export function botAction(g: Game): Action {
  const p = g.turn;
  const pl = g.players[p];
  const ph = g.phase;
  if (ph.k === "card") return { t: "ok" };
  if (ph.k === "buy") {
    const s = BOARD[ph.sq];
    const price = isOwnable(s) ? s.price : 0;
    const completes = s.kind === "circuit" && groupSquaresOwnedAfter(g, p, s.group);
    return pl.cash - price >= 120 || (completes && pl.cash >= price) ? { t: "buy" } : { t: "pass" };
  }
  if (ph.k === "roll" || ph.k === "end") {
    const sq = bestBuild(g, p, 250);
    if (sq !== null) return { t: "build", sq };
  }
  if (ph.k === "roll") {
    if (pl.jail > 0 && pl.pardons > 0) return { t: "pardon" };
    if (pl.jail > 0 && pl.cash > 400 && g.round < 12) return { t: "payJail" };
    return { t: "roll" };
  }
  return { t: "end" };
}

function groupSquaresOwnedAfter(g: Game, p: number, group: GroupId) {
  return groupSquares(group).filter((i) => g.owner[i] !== p).length === 1;
}

/** ช่องที่ควรสร้างก่อน (ระดับต่ำสุด ราคาแพงสุด) โดยเหลือเงินอย่างน้อย reserve */
function bestBuild(g: Game, p: number, reserve: number): number | null {
  const opts = g.owner.flatMap((o, i) => (o === p && canBuild(g, p, i) && g.players[p].cash - buildCost(i) >= reserve ? [i] : []));
  if (!opts.length) return null;
  opts.sort((a, b) => g.level[a] - g.level[b] || (BOARD[b] as { price: number }).price - (BOARD[a] as { price: number }).price);
  return opts[0];
}

/** ช่องที่ผู้เล่นคนนี้ถือ */
export const holdings = (g: Game, p: number) => g.owner.flatMap((o, i) => (o === p ? [i] : []));
