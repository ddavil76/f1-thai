/**
 * โหมดคุมนักขับ AI (roguelite autobattler) — โครงของรัน
 * — นักขับ AI ขับเอง (เครื่องจำลองของโหมดนักขับ) · เราเป็นทีมหลังรถ: เลือกการ์ดเลเวลอัประหว่างเรซ · สั่งเข้าพิท · เลือกยาง
 * — 2 ช่วง · แผนที่แตกทาง: เรซ · สปรินต์ · โรงงาน · อีเวนต์ · บอสท้ายช่วง
 * — เงิน + ความเชื่อมั่นสปอนเซอร์ (หัวใจ): พลาดเป้าเรซ = เสียหัวใจ · หมด = จบรัน · ชนะบอสช่วงสุดท้าย = แชมป์
 * — ชิ้นส่วนติดรถถาวรทั้งรัน (การ์ดเลเวลอัปหายเมื่อจบเรซ)
 * สถานะเป็น JSON (เก็บในเครื่องได้) · สุ่มด้วยเมล็ด · ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { NO_BOOST, type Boost, type Difficulty, type Entrant } from "../drive/race";
import { gauss, rand, type Seed } from "../rng";
import { CIRCUITS, TEAMS } from "../teams";
import type { Compound } from "../types";
import { cardOf, combine, PARTS, RACE_CARDS, type Card, type Rarity } from "./cards";

export type NodeKind = "race" | "sprint" | "shop" | "event" | "boss";
export type BossId = "storm" | "rival" | "decider";
export type EventId = "sponsor" | "used_parts" | "test_day" | "rookie" | "media" | "gamble";

export type MapNode = { id: number; row: number; col: number; kind: NodeKind; next: number[]; circuit?: string; event?: EventId; boss?: BossId };
export type ActMap = { nodes: MapNode[]; rows: number };

export type ShopItem = ({ type: "part"; id: string } | { type: "heal" } | { type: "purge" }) & { price: number; sold: boolean };
export type Pending = { kind: "reward"; options: string[] } | { kind: "shop"; items: ShopItem[] } | { kind: "event"; event: EventId };
export type RaceLog = { act: number; kind: NodeKind; circuit: string; pos: number; target: number; ok: boolean; money: number; dnf: boolean; level: number };

export type RunState = {
  v: 2;
  seed: number;
  rng: Seed;
  team: number;
  heat: number;
  act: number;
  at: number | null;
  done: number[];
  maps: ActMap[];
  money: number;
  rep: number;
  maxRep: number;
  /** ชิ้นส่วนที่ติดรถ (id ของ PARTS) */
  parts: string[];
  tier: number;
  next: { target: number; moneyMult: number };
  log: RaceLog[];
  pending: Pending | null;
  status: "map" | "pending" | "won" | "lost";
  inRace?: boolean;
};

export const ACTS = 2;
const ROWS = 5;
export const START_MONEY = 100;
export const START_REP = 3;
export const FIELD = TEAMS.length * 2;
/** รถเราเริ่มช้ากว่าทีมช้าสุด · ชนะบอสช่วงแรกเร็วขึ้น · นักขับฝีมือตั้งต้น */
const START_PACE = 1.4;
const TIER_PACE = 0.5;
const START_SKILL = 0.12;
const TIER_SKILL = 0.08;
/** ทีมอื่นพัฒนาระหว่างฤดูกาล (ความแม่นของนักขับ AI ต่อช่วง) */
const AI_DEV = 0.003;
export const LAPS: Record<"race" | "sprint" | "boss", number> = { race: 3, sprint: 2, boss: 4 };
const TARGET: Record<"race" | "sprint", number[]> = { race: [10, 6], sprint: [9, 6] };
export const BOSS: Record<BossId, { name: string; text: string; target: number }> = {
  storm: { name: "แทร็กเดือด", text: "แทร็กร้อนจัด ยางทุกคันสึกเร็วขึ้น 60% — จังหวะเข้าพิทสำคัญมาก", target: 8 },
  rival: { name: "ทีมคู่ปรับ", text: "ทีมคู่แข่งอัปเกรดใหญ่ ทั้งสองคันเร็วขึ้นชัดเจน", target: 8 },
  decider: { name: "เกมชี้ชะตาแชมป์", text: "นักขับ AI ทุกคันเต็มร้อย · ต้องจบท็อป 3", target: 3 },
};
export const EVENTS: Record<EventId, { title: string; text: string; options: { label: string; text: string }[] }> = {
  sponsor: { title: "สปอนเซอร์ใหม่", text: "บริษัทเครื่องดื่มเสนอเงินก้อนใหญ่ แต่อยากเห็นผลงานทันที", options: [{ label: "รับเงิน", text: "เงิน +80 · เป้าเรซถัดไปยากขึ้น 2 อันดับ" }, { label: "ปฏิเสธ", text: "ไม่มีอะไรเกิดขึ้น" }] },
  used_parts: { title: "อะไหล่มือสอง", text: "มีคนเสนอขายชิ้นส่วนจากทีมที่ปิดตัว สภาพไม่แน่นอน", options: [{ label: "ซื้อ (30)", text: "ได้ชิ้นส่วนหายากสุ่ม 1 ชิ้น + คำสาปสุ่ม 1 ใบ" }, { label: "ผ่าน", text: "ไม่มีอะไรเกิดขึ้น" }] },
  test_day: { title: "วันทดสอบ", text: "สนามว่างหนึ่งวัน จะใช้ยังไงดี", options: [{ label: "ทดสอบชิ้นส่วน (20)", text: "ได้ชิ้นส่วนธรรมดาสุ่ม 1 ชิ้น" }, { label: "พักทีม", text: "ความเชื่อมั่น +1" }] },
  rookie: { title: "นักขับดาวรุ่ง", text: "อะคาเดมีขอให้ดาวรุ่งลองรถในช่วงซ้อม", options: [{ label: "ให้ลอง", text: "เงิน +40" }, { label: "ไม่ให้", text: "ไม่มีอะไรเกิดขึ้น" }] },
  media: { title: "งานแถลงข่าว", text: "นักข่าวถามว่าเรซหน้าจะสู้ทีมใหญ่ได้ไหม", options: [{ label: "ท้าชน", text: "เป้าเรซถัดไปยากขึ้น 1 อันดับ · ได้เงินจากเรซนั้น ×2" }, { label: "ถ่อมตัว", text: "ไม่มีอะไรเกิดขึ้น" }] },
  gamble: { title: "เดิมพันในแพดด็อก", text: "ทีมอื่นชวนพนันผลเรซกันสนุก ๆ", options: [{ label: "เดิมพัน 40", text: "50% ได้คืน 100" }, { label: "ไม่เล่น", text: "ไม่มีอะไรเกิดขึ้น" }] },
};
export const PRICE: Record<Rarity, number> = { common: 45, rare: 75, legend: 120, curse: 0 };
export const HEAL_PRICE = 60;
export const PURGE_PRICE = 50;

const pickOf = <T>(seed: Seed, xs: readonly T[]) => xs[Math.floor(rand(seed) * xs.length)];
export const heroId = (run: RunState) => `${TEAMS[run.team].id}-0`;

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
  if (!nodes.some((n) => n.kind === "shop")) {
    const n = nodes.find((x) => x.id === rows[ROWS - 2][0])!;
    n.kind = "shop";
    delete n.circuit;
    delete n.event;
  }
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

export function newRun(seed: number, team: number, heat = 0): RunState {
  const rng: Seed = { s: seed | 0 || 1 };
  const maps: ActMap[] = [];
  let base = 0;
  for (let a = 0; a < ACTS; a++) {
    const m = buildAct(rng, a, base);
    base += m.nodes.length;
    maps.push(m);
  }
  return {
    v: 2,
    seed,
    rng,
    team,
    heat,
    act: 0,
    at: null,
    done: [],
    maps,
    money: START_MONEY,
    rep: START_REP,
    maxRep: START_REP,
    parts: [],
    tier: 0,
    next: { target: 0, moneyMult: 1 },
    log: [],
    pending: null,
    status: "map",
  };
}

export const nodeOf = (run: RunState, id: number) => run.maps.flatMap((m) => m.nodes).find((n) => n.id === id)!;

export function choices(run: RunState): MapNode[] {
  if (run.status !== "map") return [];
  const m = run.maps[run.act];
  if (run.at === null) return m.nodes.filter((n) => n.row === 0);
  return nodeOf(run, run.at).next.map((id) => nodeOf(run, id));
}

export const isRace = (k: NodeKind): k is "race" | "sprint" | "boss" => k === "race" || k === "sprint" || k === "boss";

export function targetOf(run: RunState, node: MapNode): number {
  const base = node.kind === "boss" ? BOSS[node.boss!].target : TARGET[node.kind === "sprint" ? "sprint" : "race"][Math.min(run.act, ACTS - 1)];
  return Math.max(1, base - Math.floor(run.heat / 2) - run.next.target);
}

/* ---------------- เรซ ---------------- */

/** ทุกอย่างที่ต้องใช้สร้างเรซ (กริดเรียงตามความเร็ว + โชค) */
export type RaceSetup = {
  circuit: string;
  laps: number;
  mustPit: boolean;
  difficulty: Difficulty;
  seed: number;
  entrants: Entrant[];
  hero: string;
  /** อัปเกรดตั้งต้นของรถแต่ละคัน (รถเรา = ชิ้นส่วน) */
  boosts: Record<string, Boost>;
  startTyre: Compound;
  target: number;
};

export function raceSetup(run: RunState, node: MapNode, startTyre: Compound): RaceSetup {
  const hero = heroId(run);
  const seed: Seed = { s: (run.seed ^ (node.id * 7919)) | 0 };
  const boss = node.boss;
  const rivalTeam = boss === "rival" ? TEAMS.findIndex((_, i) => i !== run.team) : -1;
  const entrants: Entrant[] = TEAMS.flatMap((t, ti) =>
    t.drivers.map((d, k) => {
      const id = `${t.id}-${k}`;
      const mine = ti === run.team;
      // ทีมเรา: รถ/นักขับเริ่มช้าสุด ไม่ว่าเลือกสีทีมไหน · ชนะบอสช่วงแรกดีขึ้น
      const pace = mine ? START_PACE - run.tier * TIER_PACE : t.pace;
      const skill = mine ? START_SKILL - run.tier * TIER_SKILL : d.skill;
      return { id, name: d.name, team: t.id, num: d.num, colour: t.color, ink: t.ink, pace, skill, hero: id === hero };
    }),
  );
  const speed = (e: Entrant) => e.pace + e.skill * 3 + gauss(seed) * 0.25;
  const grid = entrants.map((e) => ({ e, t: speed(e) })).sort((a, b) => a.t - b.t).map((x) => x.e);
  const boosts: Record<string, Boost> = {};
  for (const e of grid) {
    let b: Boost = { ...NO_BOOST, slack: -AI_DEV * run.act - 0.002 * run.heat };
    if (e.id === hero) b = combine(run.parts);
    else if (e.team === TEAMS[run.team].id) b = { ...NO_BOOST };
    if (boss === "storm") b = { ...b, wear: b.wear * 1.6 };
    if (boss === "rival" && TEAMS[rivalTeam]?.id === e.team) b = { ...b, top: b.top * 1.012, grip: b.grip * 1.02, slack: b.slack - 0.008 };
    boosts[e.id] = b;
  }
  return {
    circuit: node.circuit ?? "monza",
    laps: LAPS[node.kind === "boss" ? "boss" : node.kind === "sprint" ? "sprint" : "race"],
    mustPit: node.kind !== "sprint",
    difficulty: boss === "decider" || run.heat >= 4 ? "hard" : "normal",
    seed: seed.s,
    entrants: grid,
    hero,
    boosts,
    startTyre,
    target: targetOf(run, node),
  };
}

export function prize(run: RunState, node: MapNode, pos: number, ok: boolean) {
  const mult = node.kind === "sprint" ? 0.6 : node.kind === "boss" ? 1.5 : 1;
  return Math.round((Math.max(0, 15 - pos) * 6 * mult + (ok ? 20 : 0)) * run.next.moneyMult);
}

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

/** จบเรซ: เงิน · หัวใจ · รางวัล หรือจบรัน · level = เลเวลที่ไปถึงในเรซนั้น (สถิติ) */
export function finishRace(run: RunState, pos: number, dnf: boolean, level = 0): RunState {
  const r = clone(run);
  r.inRace = false;
  const n = nodeOf(r, r.at!);
  const target = targetOf(r, n);
  const ok = !dnf && pos <= target;
  const money = prize(r, n, pos, ok);
  r.money += money;
  r.log.push({ act: r.act, kind: n.kind, circuit: n.circuit ?? "", pos, target, ok, money, dnf, level });
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
    if (ok) r.tier++;
    r.rep = Math.min(r.maxRep, r.rep + 1);
  }
  r.pending = { kind: "reward", options: rewards(r, n.kind === "boss" ? "boss" : "race") };
  r.status = "pending";
  return r;
}

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

function partOf(r: RunState, rarity: Rarity, avoid: string[]): string {
  const pool = PARTS.filter((p) => p.rarity === rarity && !avoid.includes(p.id));
  const any = PARTS.filter((p) => p.rarity !== "curse" && !avoid.includes(p.id));
  return pickOf(r.rng, pool.length ? pool : any.length ? any : PARTS.filter((p) => p.rarity !== "curse")).id;
}

function rewards(r: RunState, tier: "race" | "boss"): string[] {
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(partOf(r, rollRarity(r.rng, tier), [...r.parts, ...out]));
  return out;
}

export function chooseReward(run: RunState, idx: number): RunState {
  if (run.pending?.kind !== "reward") return run;
  const r = clone(run);
  const id = (r.pending as Extract<Pending, { kind: "reward" }>).options[idx];
  if (id) r.parts.push(id);
  else r.money += 20;
  r.pending = null;
  r.status = "map";
  nextAct(r);
  return r;
}

function shopItems(r: RunState): ShopItem[] {
  const items: ShopItem[] = [];
  const got = [...r.parts];
  for (let i = 0; i < 4; i++) {
    const id = partOf(r, rollRarity(r.rng, "shop"), got);
    got.push(id);
    items.push({ type: "part", id, price: PRICE[cardOf(id).rarity], sold: false });
  }
  items.push({ type: "heal", price: HEAL_PRICE, sold: false });
  if (r.parts.some((c) => cardOf(c).rarity === "curse")) items.push({ type: "purge", price: PURGE_PRICE, sold: false });
  return items;
}

export function buy(run: RunState, idx: number, arg?: string): RunState {
  if (run.pending?.kind !== "shop") return run;
  const r = clone(run);
  const it = (r.pending as Extract<Pending, { kind: "shop" }>).items[idx];
  if (!it || it.sold || r.money < it.price) return run;
  if (it.type === "heal") {
    if (r.rep >= r.maxRep) return run;
    r.rep++;
  } else if (it.type === "purge") {
    const k = r.parts.findIndex((c) => cardOf(c).rarity === "curse" && (!arg || c === arg));
    if (k < 0) return run;
    r.parts.splice(k, 1);
  } else r.parts.push(it.id);
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
        const up = partOf(r, "rare", r.parts);
        const curse = pickOf(r.rng, PARTS.filter((p) => p.rarity === "curse")).id;
        r.parts.push(up, curse);
        text = `ได้ ${cardOf(up).name} · แต่ติดคำสาป ${cardOf(curse).name}`;
        break;
      }
      case "test_day": {
        if (r.money < 20) return { run, text: "เงินไม่พอ" };
        r.money -= 20;
        const up = partOf(r, "common", r.parts);
        r.parts.push(up);
        text = `ได้ ${cardOf(up).name}`;
        break;
      }
      case "rookie":
        r.money += 40;
        text = "ได้เงิน 40";
        break;
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

/* ---------------- ระหว่างเรซ: การ์ดเลเวลอัป ---------------- */

/** สุ่มการ์ดเลเวลอัป 3 ใบ (ไม่ซ้ำกันในชุด · ใบเสี่ยงไม่เกินหนึ่งใบ) */
export function levelChoices(seed: Seed, have: string[]): Card[] {
  const out: Card[] = [];
  for (let guard = 0; out.length < 3 && guard < 50; guard++) {
    const x = rand(seed);
    const rarity: Rarity = x < 0.05 ? "legend" : x < 0.32 ? "rare" : "common";
    const pool = RACE_CARDS.filter((c) => c.rarity === rarity && !out.includes(c) && !(c.risk && out.some((o) => o.risk)) && !(c.rarity === "legend" && have.includes(c.id)));
    if (pool.length) out.push(pickOf(seed, pool));
  }
  return out;
}

export function fameOf(run: RunState) {
  const met = run.log.filter((l) => l.ok).length;
  return met * 5 + run.act * 20 + (run.status === "won" ? 50 + run.heat * 10 : 0);
}

const clone = (r: RunState): RunState => JSON.parse(JSON.stringify(r));
