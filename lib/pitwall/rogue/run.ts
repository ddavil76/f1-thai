/**
 * โหมด Roguelike "ฤดูกาลเอาตัวรอด" (2 ช่วง · คุมรถคันเดียว)
 * — เริ่มจากทีมช้าสุด เดินแผนที่แบบแตกทาง: เรซ · สปรินต์ · โรงงาน · อีเวนต์ · บอสท้ายช่วง
 * — เงิน (ซื้อของ) + ความเชื่อมั่นสปอนเซอร์ (หัวใจ): พลาดเป้าเรซ = เสียหัวใจ · หมด = จบรัน · ชนะบอสช่วงสุดท้าย = แชมป์
 * — การ์ดอัปเกรดติดรถถาวร · การ์ดกลยุทธ์อยู่ในกอง จั่วใช้ระหว่างแข่ง
 * สถานะทั้งหมดเป็น JSON (เก็บในเครื่องได้) · สุ่มด้วยเมล็ด (รันเดียวกันได้ผลเดิม) · ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import type { CarMods, RaceRules, StrategyKind } from "../race";
import type { RunRaceCfg } from "../room";
import { gauss, rand, type Seed } from "../rng";
import { CIRCUITS, TEAMS } from "../teams";
import type { Compound } from "../types";
import { activeSets, BASE_DECK, combineMods, SET_BONUS, STARTERS, UPGRADES, type Rarity, type StarterId, type UpgradeId } from "./cards";

export type NodeKind = "race" | "sprint" | "shop" | "event" | "boss";
export type BossId = "storm" | "rival" | "decider";
export type EventId = "sponsor" | "used_parts" | "test_day" | "rookie" | "media" | "gamble";

export type MapNode = { id: number; row: number; col: number; kind: NodeKind; next: number[]; circuit?: string; event?: EventId; boss?: BossId };
export type ActMap = { nodes: MapNode[]; rows: number };

export type Reward = { type: "upgrade"; id: UpgradeId } | { type: "strategy"; kind: StrategyKind };
export type ShopItem = (Reward | { type: "heal" } | { type: "purge" } | { type: "thin" }) & { price: number; sold: boolean };
export type Pending = { kind: "reward"; options: Reward[] } | { kind: "shop"; items: ShopItem[] } | { kind: "event"; event: EventId };

export type RaceLog = { act: number; kind: NodeKind; circuit: string; pos: number; target: number; ok: boolean; money: number; dnf: boolean };

export type RunState = {
  v: 1;
  seed: number;
  rng: Seed;
  team: number;
  starter: StarterId;
  heat: number;
  act: number;
  /** โหนดที่อยู่ตอนนี้ (null = ยังไม่เริ่มช่วงนี้) · โหนดที่ผ่านแล้ว */
  at: number | null;
  done: number[];
  maps: ActMap[];
  money: number;
  rep: number;
  maxRep: number;
  cards: UpgradeId[];
  deck: StrategyKind[];
  /** ขั้นของทีม (ชนะบอสช่วงแรก = +1 รถเร็วขึ้น) */
  tier: number;
  /** ผลจากอีเวนต์ที่มีผลกับเรซถัดไป */
  next: { target: number; moneyMult: number };
  log: RaceLog[];
  pending: Pending | null;
  status: "map" | "pending" | "won" | "lost";
  /** กำลังแข่งอยู่ (ปิดหน้า/รีโหลดกลางเรซ = นับเป็นไม่จบการแข่ง ไม่ให้สุ่มเรซใหม่) */
  inRace?: boolean;
};

export const ACTS = 2;
const ROWS = 5;
export const START_MONEY = 100;
export const START_REP = 3;
/** ทีมเราเริ่มที่ความเร็วเท่าไร (วินาที/รอบ เทียบทีมเร็วสุด) · ชนะบอสช่วงแรกเร็วขึ้นเท่าไร */
const START_PACE = 1.2;
const TIER_PACE = 0.35;
/** ทีมอื่นเร็วขึ้นต่อช่วง (วินาที/รอบ) */
const AI_DEV = 0.15;
/** จำนวนรอบ */
export const LAPS: Record<"race" | "sprint" | "boss", number> = { race: 3, sprint: 2, boss: 4 };
/** เป้า (จบไม่ต่ำกว่าอันดับนี้) ตามช่วง */
const TARGET: Record<"race" | "sprint", number[]> = { race: [11, 6], sprint: [10, 6] };
export const BOSS: Record<BossId, { name: string; text: string; target: number; rules: RaceRules; rival?: number }> = {
  storm: { name: "พายุยางพัง", text: "แทร็กร้อนจัด ยางทุกคันสึกเร็วขึ้น 60%", target: 8, rules: { wear: 1.6 } },
  rival: { name: "ทีมคู่ปรับ", text: "ทีมคู่แข่งอัปเกรดใหญ่ เร็วขึ้น 0.6 วิ/รอบ", target: 8, rules: {}, rival: 0.6 },
  decider: { name: "เกมชี้ชะตาแชมป์", text: "อุบัติเหตุบ่อย (เซฟตี้คาร์) · ยางสึกเร็วขึ้น 30% · ต้องจบท็อป 3", target: 3, rules: { wear: 1.3, incidents: 2.5 } },
};
export const EVENTS: Record<EventId, { title: string; text: string; options: { label: string; text: string }[] }> = {
  sponsor: { title: "สปอนเซอร์ใหม่", text: "บริษัทเครื่องดื่มเสนอเงินก้อนใหญ่ แต่อยากเห็นผลงานทันที", options: [{ label: "รับเงิน", text: "เงิน +80 · เป้าเรซถัดไปยากขึ้น 2 อันดับ" }, { label: "ปฏิเสธ", text: "ไม่มีอะไรเกิดขึ้น" }] },
  used_parts: { title: "อะไหล่มือสอง", text: "มีคนเสนอขายชิ้นส่วนจากทีมที่ปิดตัว สภาพไม่แน่นอน", options: [{ label: "ซื้อ (30)", text: "ได้การ์ดหายากสุ่ม 1 ใบ + คำสาปสุ่ม 1 ใบ" }, { label: "ผ่าน", text: "ไม่มีอะไรเกิดขึ้น" }] },
  test_day: { title: "วันทดสอบ", text: "สนามว่างหนึ่งวัน จะใช้ยังไงดี", options: [{ label: "ทดสอบชิ้นส่วน (20)", text: "ได้การ์ดธรรมดาสุ่ม 1 ใบ" }, { label: "พักทีม", text: "ความเชื่อมั่น +1" }] },
  rookie: { title: "นักขับดาวรุ่ง", text: "อะคาเดมีขอให้ดาวรุ่งลองรถในช่วงซ้อม", options: [{ label: "ให้ลอง", text: "เงิน +30 · ได้การ์ดกลยุทธ์สุ่ม 1 ใบ" }, { label: "ไม่ให้", text: "ไม่มีอะไรเกิดขึ้น" }] },
  media: { title: "งานแถลงข่าว", text: "นักข่าวถามว่าเรซหน้าจะสู้ทีมใหญ่ได้ไหม", options: [{ label: "ท้าชน", text: "เป้าเรซถัดไปยากขึ้น 1 อันดับ · ได้เงินจากเรซนั้น ×2" }, { label: "ถ่อมตัว", text: "ไม่มีอะไรเกิดขึ้น" }] },
  gamble: { title: "เดิมพันในแพดด็อก", text: "ทีมอื่นชวนพนันผลเรซกันสนุก ๆ", options: [{ label: "เดิมพัน 40", text: "50% ได้คืน 100" }, { label: "ไม่เล่น", text: "ไม่มีอะไรเกิดขึ้น" }] },
};
export const PRICE: Record<Rarity, number> = { common: 45, rare: 75, legend: 120, curse: 0 };
export const STRATEGY_PRICE = 35;
export const HEAL_PRICE = 60;
export const PURGE_PRICE = 50;
export const THIN_PRICE = 25;

const STRATEGY_POOL: StrategyKind[] = ["attack", "push", "shield", "ers", "save", "drs", "pitcrew", "undercut"];
const pickOf = <T>(seed: Seed, xs: readonly T[]) => xs[Math.floor(rand(seed) * xs.length)];

/** รถที่ผู้เล่นคุม (นักขับคนแรกของทีม) */
export const playerCar = (run: RunState) => run.team * 2;

/* ---------------- แผนที่ ---------------- */

function buildAct(seed: Seed, act: number, idBase: number): ActMap {
  const nodes: MapNode[] = [];
  const rows: number[][] = [];
  const circuits = CIRCUITS.map((c) => c.id);
  let id = idBase;
  for (let r = 0; r < ROWS; r++) {
    const width = r === 0 || r === ROWS - 1 ? 1 : 2 + Math.floor(rand(seed) * 2);
    const row: number[] = [];
    for (let c = 0; c < width; c++) {
      let kind: NodeKind;
      if (r === 0) kind = "race";
      else if (r === ROWS - 1) kind = "boss";
      else {
        const x = rand(seed);
        kind = x < 0.42 ? "race" : x < 0.62 ? "sprint" : x < 0.82 ? "event" : "shop";
        // โรงงานไม่อยู่แถวแรก (ยังไม่มีเงิน) และไม่เกิน 2 ที่ต่อช่วง
        if (kind === "shop" && (r === 1 || nodes.filter((n) => n.kind === "shop").length >= 2)) kind = x < 0.91 ? "event" : "race";
      }
      const n: MapNode = { id: id++, row: r, col: c, kind, next: [] };
      if (kind === "race" || kind === "sprint" || kind === "boss") n.circuit = pickOf(seed, circuits);
      if (kind === "event") n.event = pickOf(seed, Object.keys(EVENTS) as EventId[]);
      if (kind === "boss") n.boss = act === ACTS - 1 ? "decider" : rand(seed) < 0.5 ? "storm" : "rival";
      nodes.push(n);
      row.push(n.id);
    }
    rows.push(row);
  }
  // ทุกช่วงต้องมีโรงงานอย่างน้อยหนึ่งที่ (แถวก่อนบอส)
  if (!nodes.some((n) => n.kind === "shop")) {
    const n = nodes.find((x) => x.id === rows[ROWS - 2][0])!;
    n.kind = "shop";
    delete n.circuit;
    delete n.event;
  }
  // เส้นทาง: ไปโหนดแถวถัดไปที่ตำแหน่งใกล้กัน · ทุกโหนดมีทางเข้า
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let r = 0; r + 1 < ROWS; r++) {
    const a = rows[r];
    const b = rows[r + 1];
    for (let i = 0; i < a.length; i++) {
      const pos = a.length === 1 ? 0.5 : i / (a.length - 1);
      for (let j = 0; j < b.length; j++) {
        const q = b.length === 1 ? 0.5 : j / (b.length - 1);
        if (Math.abs(pos - q) <= 0.51) byId.get(a[i])!.next.push(b[j]);
      }
    }
    for (const j of b) if (!a.some((i) => byId.get(i)!.next.includes(j))) byId.get(a[a.length - 1])!.next.push(j);
  }
  return { nodes, rows: ROWS };
}

export function newRun(seed: number, team: number, starter: StarterId, heat = 0): RunState {
  const rng: Seed = { s: seed | 0 || 1 };
  const maps: ActMap[] = [];
  let base = 0;
  for (let a = 0; a < ACTS; a++) {
    const m = buildAct(rng, a, base);
    base += m.nodes.length;
    maps.push(m);
  }
  const st = STARTERS[starter];
  return {
    v: 1,
    seed,
    rng,
    team,
    starter,
    heat,
    act: 0,
    at: null,
    done: [],
    maps,
    money: START_MONEY,
    rep: START_REP,
    maxRep: START_REP,
    cards: [st.card],
    deck: [...BASE_DECK, st.extra],
    tier: 0,
    next: { target: 0, moneyMult: 1 },
    log: [],
    pending: null,
    status: "map",
  };
}

export const nodeOf = (run: RunState, id: number) => run.maps.flatMap((m) => m.nodes).find((n) => n.id === id)!;
export const actMap = (run: RunState) => run.maps[run.act];

/** โหนดที่เลือกไปต่อได้ */
export function choices(run: RunState): MapNode[] {
  if (run.status !== "map") return [];
  const m = actMap(run);
  if (run.at === null) return m.nodes.filter((n) => n.row === 0);
  return nodeOf(run, run.at).next.map((id) => nodeOf(run, id));
}

/* ---------------- เรซ ---------------- */

export const isRace = (k: NodeKind): k is "race" | "sprint" | "boss" => k === "race" || k === "sprint" || k === "boss";

/** เป้าของเรซ (จบไม่ต่ำกว่าอันดับนี้) — Heat สูงเป้ายากขึ้น · อีเวนต์เพิ่มความยาก */
export function targetOf(run: RunState, node: MapNode): number {
  const base = node.kind === "boss" ? BOSS[node.boss!].target : TARGET[node.kind === "sprint" ? "sprint" : "race"][Math.min(run.act, ACTS - 1)];
  return Math.max(1, base - Math.floor(run.heat / 2) - run.next.target);
}

/** ตัวปรับของรถเรา: การ์ด + โบนัสสาย + ขั้นทีม (ปรับให้เริ่มช้าสุดไม่ว่าเลือกสีทีมไหน) */
export function playerMods(run: RunState): CarMods {
  const base = START_PACE - TEAMS[run.team].pace - run.tier * TIER_PACE;
  return combineMods([{ pace: base }, ...run.cards.map((c) => UPGRADES[c].mods), ...activeSets(run.cards).map((t) => SET_BONUS[t].mods)]);
}

export function energyOf(run: RunState) {
  const start = 1 + run.cards.reduce((a, c) => a + (UPGRADES[c].energy ?? 0), 0);
  const max = 3 + run.cards.reduce((a, c) => a + (UPGRADES[c].maxEnergy ?? 0), 0);
  return { start: Math.min(start, max), max };
}

/** ตั้งค่าเรซของโหนดนี้ (กริดเรียงตามความเร็ว + โชค) */
export function raceCfg(run: RunState, node: MapNode, startTyre: Compound): RunRaceCfg & { target: number } {
  const car = playerCar(run);
  const me = playerMods(run);
  const boss = node.boss ? BOSS[node.boss] : null;
  // ทีมคู่ปรับ (บอส): ทีมที่เร็วสุดที่ไม่ใช่ทีมเรา
  const rivalTeam = boss?.rival ? TEAMS.findIndex((_, i) => i !== run.team) : -1;
  const mods: Record<number, CarMods> = {};
  const ids = TEAMS.flatMap((_, t) => [t * 2, t * 2 + 1]);
  for (const id of ids) {
    const team = Math.floor(id / 2);
    if (id === car) mods[id] = me;
    else if (team === run.team) mods[id] = { pace: START_PACE - TEAMS[team].pace - run.tier * TIER_PACE };
    // ทีมอื่นพัฒนารถระหว่างฤดูกาล (ช่วงหลังเร็วขึ้น) · Heat สูงเร็วขึ้นอีก
    else mods[id] = { pace: -AI_DEV * run.act - 0.08 * run.heat - (team === rivalTeam ? boss!.rival! : 0) };
  }
  const seed: Seed = { s: (run.seed ^ (node.id * 7919)) | 0 };
  const speed = (id: number) => {
    const team = Math.floor(id / 2);
    return TEAMS[team].pace + (TEAMS[team].drivers[id % 2]?.skill ?? 0) + (mods[id]?.pace ?? 0) + gauss(seed) * 0.3;
  };
  const grid = ids.map((id) => ({ id, t: speed(id) })).sort((a, b) => a.t - b.t).map((x) => x.id);
  const e = energyOf(run);
  return {
    circuit: node.circuit ?? "monza",
    laps: LAPS[node.kind === "boss" ? "boss" : node.kind === "sprint" ? "sprint" : "race"],
    car,
    grid,
    startTyre,
    mods,
    rules: { ...(boss?.rules ?? {}), mustStop: node.kind !== "sprint" },
    deck: [...run.deck],
    energy: e.start,
    maxEnergy: e.max,
    target: targetOf(run, node),
  };
}

/** เงินจากอันดับ */
export function prize(run: RunState, node: MapNode, pos: number, ok: boolean) {
  const mult = node.kind === "sprint" ? 0.6 : node.kind === "boss" ? 1.5 : 1;
  return Math.round((Math.max(0, 15 - pos) * 6 * mult + (ok ? 20 : 0)) * run.next.moneyMult);
}

/** เลือกโหนดถัดไป: เรซ = เริ่มเรซ (UI สร้างห้องแข่ง) · โรงงาน/อีเวนต์ = รอให้เลือก */
export function enter(run: RunState, id: number): RunState {
  const n = choices(run).find((x) => x.id === id);
  if (!n) return run;
  const r = clone(run);
  r.at = id;
  if (n.kind === "shop") {
    r.pending = { kind: "shop", items: shopItems(r) };
    r.status = "pending";
  } else if (n.kind === "event") {
    r.pending = { kind: "event", event: n.event! };
    r.status = "pending";
  } else r.status = "map";
  return r;
}

/** จบเรซ: ให้เงิน · ตัดหัวใจถ้าพลาดเป้า · เลือกรางวัล หรือจบรัน */
export function finishRace(run: RunState, pos: number, dnf: boolean): RunState {
  const r = clone(run);
  r.inRace = false;
  const n = nodeOf(r, r.at!);
  const target = targetOf(r, n);
  const ok = !dnf && pos <= target;
  const money = prize(r, n, pos, ok);
  r.money += money;
  r.log.push({ act: r.act, kind: n.kind, circuit: n.circuit ?? "", pos, target, ok, money, dnf });
  r.next = { target: 0, moneyMult: 1 };
  r.done.push(n.id);
  if (!ok) r.rep -= n.kind === "boss" ? 2 : 1;
  if (r.rep <= 0) {
    r.rep = 0;
    r.status = "lost";
    r.pending = null;
    return r;
  }
  if (n.kind === "boss") {
    if (r.act === ACTS - 1) {
      r.status = ok ? "won" : "lost";
      r.pending = null;
      return r;
    }
    // ผ่านช่วงแรก: ทีมขึ้นขั้น · หัวใจ +1 · ไปช่วงถัดไป
    if (ok) r.tier++;
    r.rep = Math.min(r.maxRep, r.rep + 1);
  }
  r.pending = { kind: "reward", options: rewards(r, n.kind === "boss" ? "boss" : "race") };
  r.status = "pending";
  return r;
}

/** ไปช่วงถัดไปหลังบอส */
function nextAct(r: RunState) {
  const n = r.at === null ? null : nodeOf(r, r.at);
  if (n?.kind === "boss" && r.act < ACTS - 1) {
    r.act++;
    r.at = null;
  }
}

/* ---------------- รางวัล / โรงงาน / อีเวนต์ ---------------- */

function rollRarity(seed: Seed, tier: "race" | "boss" | "shop"): Rarity {
  const x = rand(seed);
  if (tier === "boss") return x < 0.35 ? "legend" : "rare";
  return x < 0.06 ? "legend" : x < 0.33 ? "rare" : "common";
}

function upgradeOf(r: RunState, rarity: Rarity, avoid: UpgradeId[]): UpgradeId {
  const pool = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => UPGRADES[id].rarity === rarity && !avoid.includes(id));
  const any = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => UPGRADES[id].rarity !== "curse" && !avoid.includes(id));
  return pickOf(r.rng, pool.length ? pool : any);
}

function rewards(r: RunState, tier: "race" | "boss"): Reward[] {
  const avoid = [...r.cards];
  const a = upgradeOf(r, rollRarity(r.rng, tier), avoid);
  const b = upgradeOf(r, rollRarity(r.rng, tier), [...avoid, a]);
  return [{ type: "upgrade", id: a }, { type: "upgrade", id: b }, { type: "strategy", kind: pickOf(r.rng, STRATEGY_POOL) }];
}

/** เลือกรางวัล (idx = -1 ข้ามรับเงิน 20) */
export function chooseReward(run: RunState, idx: number): RunState {
  if (run.pending?.kind !== "reward") return run;
  const r = clone(run);
  const opt = (r.pending as Extract<Pending, { kind: "reward" }>).options[idx];
  if (opt) take(r, opt);
  else r.money += 20;
  r.pending = null;
  r.status = "map";
  nextAct(r);
  return r;
}

function take(r: RunState, x: Reward) {
  if (x.type === "upgrade") r.cards.push(x.id);
  else r.deck.push(x.kind);
}

function shopItems(r: RunState): ShopItem[] {
  const items: ShopItem[] = [];
  const got: UpgradeId[] = [...r.cards];
  for (let i = 0; i < 3; i++) {
    const id = upgradeOf(r, rollRarity(r.rng, "shop"), got);
    got.push(id);
    items.push({ type: "upgrade", id, price: PRICE[UPGRADES[id].rarity], sold: false });
  }
  for (let i = 0; i < 2; i++) items.push({ type: "strategy", kind: pickOf(r.rng, STRATEGY_POOL), price: STRATEGY_PRICE, sold: false });
  items.push({ type: "heal", price: HEAL_PRICE, sold: false });
  if (r.cards.some((c) => UPGRADES[c].rarity === "curse")) items.push({ type: "purge", price: PURGE_PRICE, sold: false });
  if (r.deck.length > 4) items.push({ type: "thin", price: THIN_PRICE, sold: false });
  return items;
}

/** ซื้อของ (thin/purge: ลบใบแรกที่ระบุ ด้วย arg) */
export function buy(run: RunState, idx: number, arg?: string): RunState {
  if (run.pending?.kind !== "shop") return run;
  const r = clone(run);
  const shop = r.pending as Extract<Pending, { kind: "shop" }>;
  const it = shop.items[idx];
  if (!it || it.sold || r.money < it.price) return run;
  if (it.type === "heal") {
    if (r.rep >= r.maxRep) return run;
    r.rep++;
  } else if (it.type === "purge") {
    const k = r.cards.findIndex((c) => UPGRADES[c].rarity === "curse" && (!arg || c === arg));
    if (k < 0) return run;
    r.cards.splice(k, 1);
  } else if (it.type === "thin") {
    const k = r.deck.findIndex((c) => c === arg);
    if (k < 0 || r.deck.length <= 3) return run;
    r.deck.splice(k, 1);
  } else take(r, it);
  r.money -= it.price;
  it.sold = true;
  return r;
}

export function leaveShop(run: RunState): RunState {
  if (run.pending?.kind !== "shop") return run;
  const r = clone(run);
  r.done.push(r.at!);
  r.pending = null;
  r.status = "map";
  return r;
}

/** เลือกทางในอีเวนต์ · คืนข้อความผล */
export function chooseEvent(run: RunState, opt: number): { run: RunState; text: string } {
  if (run.pending?.kind !== "event") return { run, text: "" };
  const r = clone(run);
  const ev = (r.pending as Extract<Pending, { kind: "event" }>).event;
  let text = "ไม่มีอะไรเกิดขึ้น";
  if (opt === 0) {
    switch (ev) {
      case "sponsor":
        r.money += 80;
        r.next.target += 2;
        text = "ได้เงิน 80 · เรซถัดไปเป้ายากขึ้น 2 อันดับ";
        break;
      case "used_parts": {
        if (r.money < 30) return { run, text: "เงินไม่พอ" };
        r.money -= 30;
        const up = upgradeOf(r, "rare", r.cards);
        const curse = pickOf(r.rng, ["old_engine", "bad_tyres", "rookie_crew"] as UpgradeId[]);
        r.cards.push(up, curse);
        text = `ได้ ${UPGRADES[up].name} · แต่ติดคำสาป ${UPGRADES[curse].name}`;
        break;
      }
      case "test_day": {
        if (r.money < 20) return { run, text: "เงินไม่พอ" };
        r.money -= 20;
        const up = upgradeOf(r, "common", r.cards);
        r.cards.push(up);
        text = `ได้ ${UPGRADES[up].name}`;
        break;
      }
      case "rookie": {
        const k = pickOf(r.rng, STRATEGY_POOL);
        r.money += 30;
        r.deck.push(k);
        text = `ได้เงิน 30 · การ์ดกลยุทธ์ใหม่ 1 ใบ`;
        break;
      }
      case "media":
        r.next.target += 1;
        r.next.moneyMult = 2;
        text = "เรซถัดไปเป้ายากขึ้น 1 อันดับ · ได้เงิน ×2";
        break;
      case "gamble":
        if (r.money < 40) return { run, text: "เงินไม่พอ" };
        r.money -= 40;
        if (rand(r.rng) < 0.5) {
          r.money += 100;
          text = "ชนะเดิมพัน! ได้ 100";
        } else text = "แพ้เดิมพัน เสีย 40";
        break;
    }
  } else if (ev === "test_day") {
    r.rep = Math.min(r.maxRep, r.rep + 1);
    text = "ทีมได้พัก ความเชื่อมั่น +1";
  }
  r.done.push(r.at!);
  r.pending = null;
  r.status = "map";
  return { run: r, text };
}

/* ---------------- จบรัน ---------------- */

/** แต้มชื่อเสียง (สะสมข้ามรัน ใช้ปลดล็อก) */
export function fameOf(run: RunState) {
  const met = run.log.filter((l) => l.ok).length;
  return met * 5 + run.act * 20 + (run.status === "won" ? 50 + run.heat * 10 : 0);
}

const clone = (r: RunState): RunState => JSON.parse(JSON.stringify(r));
