/**
 * การแข่งหนึ่งครั้งของโหมดกลยุทธ์ (Pit Wall Gambit): ห่อเครื่องจำลองของโหมดนักขับ (drive/race.ts)
 * — รถเรา (hero) นักขับ AI ขับเอง · ทีมเราเลือกการ์ดอัปเกรดทุกเลเวลอัป · สั่งเข้าพิท/เลือกยาง · ใช้บูสต์ (แบต OT) เองหรือให้อัตโนมัติ
 * — ทุกคันได้ XP จากระยะทางและการแซง (รอบเร็วสุดของสนามให้รถเรา) · AI ก็เลือกการ์ดของตัวเองเหมือนกัน
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (เทสต์และจำลองหาสมดุลได้)
 */
import { createRace, setBoost, stepRace, STEP, type Difficulty, type Entrant, type Race, type RaceEvent } from "../drive/race";
import { sample, type DriveTrack } from "../drive/line";
import { rand, type Seed } from "../rng";
import { TEAMS } from "../teams";
import type { Compound } from "../types";
import { aiChoice, applyCard, CARD, computeStats, FAC_KEYS, FACS, LIMP_TIME, makeHand, newDeck, xpCost, XP_DIST, XP_FASTEST, XP_PASS, type Deck, type Fac, type Hand, type Stats } from "./cards";

export type Setup = { circuit: string; laps: number; difficulty: Difficulty; startTyre: Compound; team: number; field: number; seed: number };

export type Feed = { id: number; t: number; text: string; tone: "good" | "bad" | "info" | "best" };

/** สถานะการ์ด/XP ของรถหนึ่งคัน */
export type Crew = {
  deck: Deck;
  stats: Stats;
  xp: number;
  /** เศษ XP (ตัวคูณทำให้ได้ทศนิยม) · ระยะที่ยังไม่ถึง XP_DIST */
  frac: number;
  dist: number;
  level: number;
  /** เลเวลอัปที่ยังไม่ได้เลือก · AI จะเลือกตอนเวลานี้ */
  pending: number;
  pickAt: number;
  /** หมวดที่ AI ชอบ */
  pref: Fac;
  /** ตัวคูณ XP ตามระดับ AI (รถเรา = 1) */
  aiXp: number;
  overtakes: number;
  lastLap: number | null;
  bestLap: number | null;
  startPos: number;
};

export type Session = {
  race: Race;
  hero: number;
  setup: Setup;
  rng: Seed;
  crews: Crew[];
  xpCost: number;
  /** การ์ดที่รอผู้เล่นเลือก (เกมค่อย ๆ หยุดจนกว่าจะเลือก) */
  offer: Hand[] | null;
  /** บูสต์อัตโนมัติ · กดบูสต์ค้างไว้ (โหมดกดเอง) */
  autoBoost: boolean;
  boostOn: boolean;
  bestLap: number | null;
  bestCar: number | null;
  feed: Feed[];
  feedId: number;
  doneAt: number | null;
  over: boolean;
};

/** หลังรถเราเข้าเส้นชัย รอคันอื่นอีกกี่วินาทีก่อนสรุปผล */
const FINISH_WAIT = 25;
/** XP ของ AI ตามระดับ (AI เก่งได้การ์ดเร็วกว่า) */
const AI_XP: Record<Difficulty, number> = { easy: 1, normal: 1.25, hard: 1.4 };

/** รถในสนาม: ทีมเรา 2 คัน (คันแรก = รถเรา) + ทีมอื่น ๆ จนครบ field คัน */
export function buildField(team: number, field: number): Entrant[] {
  const all = TEAMS.flatMap((t, ti) => t.drivers.map((d, k) => ({ id: `${t.id}-${k}`, name: d.name, team: t.id, num: d.num, colour: t.color, ink: t.ink, pace: t.pace, skill: d.skill, ti })));
  const mine = all.filter((e) => e.ti === team);
  const rest = all.filter((e) => e.ti !== team);
  return [...mine, ...rest].slice(0, Math.max(2, field)).map(({ ti, ...e }, i) => ({ ...e, hero: i === 0 && ti === team }));
}

export function createSession(track: DriveTrack, setup: Setup): Session {
  const rng: Seed = { s: setup.seed ^ 0x5bd1e995 };
  const entrants = buildField(setup.team, setup.field);
  const hero = entrants[0];
  // กริด: รถเราออกตัวกลางกลุ่ม (ช่อง 5–9) คันอื่นสุ่ม
  const others = entrants.slice(1);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const slot = Math.min(others.length, 4 + Math.floor(rand(rng) * 5));
  const grid = [...others.slice(0, slot), hero, ...others.slice(slot)];
  const race = createRace(track, grid, { laps: setup.laps, difficulty: setup.difficulty, seed: setup.seed, startTyre: setup.startTyre, mustPit: false });
  const heroIdx = race.cars.findIndex((c) => c.hero);
  const crews = race.cars.map((c, i): Crew => {
    const deck = newDeck();
    return { deck, stats: computeStats(deck, 0), xp: 0, frac: 0, dist: 0, level: 1, pending: 0, pickAt: 0, pref: FAC_KEYS[Math.floor(rand(rng) * 5)], aiXp: c.hero ? 1 : AI_XP[setup.difficulty], overtakes: 0, lastLap: null, bestLap: null, startPos: i + 1 };
  });
  const s: Session = { race, hero: heroIdx, setup, rng, crews, xpCost: xpCost(setup.laps, track.length), offer: null, autoBoost: true, boostOn: false, bestLap: null, bestCar: null, feed: [], feedId: 0, doneAt: null, over: false };
  say(s, `ออกสตาร์ทจาก P${heroIdx + 1} นักแข่งพร้อมแล้ว`, "info");
  return s;
}

export const heroCar = (s: Session) => s.race.cars[s.hero];
export const heroCrew = (s: Session) => s.crews[s.hero];

function say(s: Session, text: string, tone: Feed["tone"] = "info") {
  s.feed.push({ id: ++s.feedId, t: s.race.t, text, tone });
  if (s.feed.length > 30) s.feed.splice(0, s.feed.length - 30);
}

/** คิดค่าจากการ์ดใหม่แล้วส่งให้เครื่องจำลอง */
function refresh(s: Session, i: number) {
  const cr = s.crews[i];
  cr.stats = computeStats(cr.deck, s.race.t);
  setBoost(s.race, s.race.cars[i].id, cr.stats.boost);
}

function gainXp(s: Session, i: number, n: number) {
  const cr = s.crews[i];
  cr.frac += n * cr.stats.xpMul * cr.aiXp;
  const whole = Math.floor(cr.frac);
  cr.frac -= whole;
  cr.xp += whole;
  while (cr.xp >= s.xpCost) {
    cr.xp -= s.xpCost;
    cr.level++;
    cr.pending++;
    if (i === s.hero) say(s, `เลเวลอัปเป็น Lv ${cr.level}! เลือกการ์ดอัปเกรดได้`, "good");
    else if (cr.pending === 1) cr.pickAt = s.race.t + 0.5 + rand(s.rng) * 1.5;
  }
}

/** ใช้การ์ดใบนี้กับรถคันที่ i */
function play(s: Session, i: number, h: Hand) {
  const cr = s.crews[i];
  const res = applyCard(s.rng, cr.deck, h, s.race.t, cr.stats.goldDur);
  refresh(s, i);
  if (i !== s.hero) return;
  if (res.gold) say(s, `การ์ดทอง ${CARD[h.id].name} ทำงาน ${Math.round(cr.stats.goldDur)} วิ`, "good");
  else if (res.maxedCard) say(s, `${CARD[h.id].name} อัปครบ 3 ขั้น!`, "best");
  for (const f of res.maxedFacs) say(s, `หมวด${FACS[f].name}เต็ม 6 ช่อง! ${FACS[f].bonus}`, "best");
}

/** ผู้เล่นเลือกการ์ดใบที่ idx */
export function chooseCard(s: Session, idx: number) {
  const cr = heroCrew(s);
  const h = s.offer?.[idx];
  if (!h || s.over) return;
  play(s, s.hero, h);
  cr.pending = Math.max(0, cr.pending - 1);
  s.offer = cr.pending > 0 ? makeHand(s.rng, cr.deck) : null;
  if (!s.offer) cr.pending = 0;
}

/** สั่งเข้าพิทรอบนี้ (ยางที่จะใส่) · null = ยกเลิก */
export function callPit(s: Session, c: Compound | null) {
  const rc = heroCar(s);
  if (rc.finish !== null || rc.pit) return;
  rc.pitWant = c;
  say(s, c ? `รับทราบ เข้าพิทรอบนี้ เปลี่ยนเป็นยาง ${c === "soft" ? "ซอฟต์" : c === "medium" ? "มีเดียม" : "ฮาร์ด"}` : "ยกเลิกเข้าพิท อยู่บนแทร็กต่อ", "info");
}

/** กดบูสต์ (โหมดกดเอง) */
export function toggleBoost(s: Session) {
  const rc = heroCar(s);
  if (s.autoBoost || rc.pit || rc.finish !== null) return;
  if (!s.boostOn && rc.car.energy < 0.05) {
    say(s, "แบตบูสต์ยังไม่พอ รอชาร์จตอนเบรก", "info");
    return;
  }
  s.boostOn = !s.boostOn;
}

/** เปิด/ปิดบูสต์อัตโนมัติ */
export function setAutoBoost(s: Session, on: boolean) {
  s.autoBoost = on;
  s.boostOn = false;
}

/** บูสต์อัตโนมัติ: ทางตรง + มีรถข้างหน้าในระยะ 40 ม. / จี้ท้ายใน 14 ม. / แบตใกล้เต็ม */
function autoBoost(s: Session) {
  const r = s.race;
  const rc = heroCar(s);
  if (rc.pit || rc.car.energy < 0.18 || Math.abs(sample(r.track, r.track.curve, rc.car.s)) > 0.003) return false;
  const near = r.cars.some((o) => {
    if (o === rc || o.pitOff !== null || o.finish !== null) return false;
    const d = o.car.s - rc.car.s;
    return (d > 0 && d < 40) || (d < 0 && d > -14);
  });
  return near || rc.car.energy > 0.92;
}

/** ระยะในรอบ (0..length) */
const lapPos = (t: DriveTrack, s: number) => ((s % t.length) + t.length) % t.length;

/** เดินเวลา secs วินาที · คืนเหตุการณ์ของเครื่องจำลอง */
export function stepSession(s: Session, secs: number): RaceEvent[] {
  const out: RaceEvent[] = [];
  const r = s.race;
  const t = r.track;
  const rc = heroCar(s);
  for (let k = 0; k < secs && !s.over; k += STEP) {
    const prev = r.cars.map((c) => c.car.s);
    if (!s.autoBoost && s.boostOn && rc.car.energy <= 0) {
      s.boostOn = false;
      say(s, "แบตบูสต์หมดแล้ว", "info");
    }
    const ot = r.lights <= 0 && rc.finish === null && (s.autoBoost ? autoBoost(s) : s.boostOn);
    const evs = stepRace(r, { throttle: false, brake: false, ot }, []);
    out.push(...evs);
    for (const e of evs) {
      const i = "id" in e ? r.cars.findIndex((c) => c.id === e.id) : -1;
      if (e.kind === "lap" && i >= 0) {
        const cr = s.crews[i];
        cr.lastLap = e.time;
        if (cr.bestLap === null || e.time < cr.bestLap) cr.bestLap = e.time;
        if (e.lap >= 2 && (s.bestLap === null || e.time < s.bestLap)) {
          s.bestLap = e.time;
          s.bestCar = i;
          if (i === s.hero) {
            say(s, `รอบเร็วที่สุดของสนาม!`, "best");
            gainXp(s, i, XP_FASTEST);
          }
        }
        if (cr.stats.fullErs) r.cars[i].car.energy = 1;
        if (i === s.hero && r.cars[i].finish === null && e.lap === r.laps - 1) say(s, "รอบสุดท้ายแล้ว!", "info");
      }
      if (e.kind === "pitStop" && i === s.hero) say(s, `พิทเรียบร้อย ${e.time.toFixed(1)} วิ`, e.time < 2.8 ? "good" : "info");
      if (e.kind === "pitIn" && i === s.hero) say(s, "เข้าพิทแล้ว", "info");
      if (e.kind === "tyreLow" && i === s.hero) say(s, "ยางเริ่มหมด ควรเข้าพิทเร็ว ๆ นี้", "bad");
      if (e.kind === "offtrack" && i === s.hero) say(s, "หลุดโค้ง! เสียความเร็ว", "bad");
      if (e.kind === "finish" && i === s.hero) {
        s.doneAt = r.t;
        say(s, `เข้าเส้นชัยอันดับ P${e.pos}!`, "good");
      }
    }
    if (r.lights > 0) continue;
    // XP จากระยะทาง · แบตคืนทุกเซกเตอร์
    r.cars.forEach((c, i) => {
      if (c.finish !== null || c.remote) return;
      const cr = s.crews[i];
      const ds = c.car.s - prev[i];
      if (ds > 0 && c.car.s > 0) {
        cr.dist += ds;
        while (cr.dist >= XP_DIST) {
          cr.dist -= XP_DIST;
          gainXp(s, i, 1);
        }
      }
      if (c.pitOff === null && c.car.s > 0) {
        const a = lapPos(t, prev[i]);
        const b = lapPos(t, c.car.s);
        for (const at of [t.length / 3, (2 * t.length) / 3]) if (a < at && b >= at) c.car.energy = Math.min(1, c.car.energy + cr.stats.sector);
      }
    });
    // แซง (ไม่นับรถในพิท)
    for (let i = 0; i < r.cars.length; i++) {
      const c = r.cars[i];
      if (c.finish !== null || c.pitOff !== null) continue;
      for (let j = 0; j < r.cars.length; j++) {
        const o = r.cars[j];
        if (i === j || o.finish !== null || o.pitOff !== null) continue;
        if (prev[i] < prev[j] && c.car.s >= o.car.s && c.car.s - o.car.s < 30) {
          s.crews[i].overtakes++;
          gainXp(s, i, XP_PASS * s.crews[i].stats.otXp);
          if (i === s.hero) say(s, `แซง ${o.name} ขึ้นมา P${r.order.indexOf(i) + 1}`, "good");
          if (j === s.hero) say(s, `${c.name} แซงเราไป ตอนนี้ P${r.order.indexOf(j) + 1}`, "bad");
        }
      }
    }
    // การ์ดทองหมดเวลา · เครื่องรวน (การ์ดเสี่ยง) เริ่ม/จบ
    s.crews.forEach((cr, i) => {
      const d = cr.deck;
      let dirty = false;
      if (d.golds.some((g) => g.until <= r.t)) {
        const n = d.golds.length;
        d.golds = d.golds.filter((g) => g.until > r.t);
        if (i === s.hero) say(s, `การ์ดทอง${n - d.golds.length > 1 ? ` ${n - d.golds.length} ใบ` : ""}หมดเวลาแล้ว`, "info");
        dirty = true;
      }
      if (d.riskAt !== null && r.t >= d.riskAt) {
        d.riskAt = null;
        d.limpUntil = r.t + LIMP_TIME;
        if (i === s.hero) say(s, `เครื่องยนต์รวนจากการ์ดเสี่ยง! วิ่งโหมดประคอง ${LIMP_TIME} วินาที`, "bad");
        dirty = true;
      }
      if (d.limpUntil > 0 && r.t >= d.limpUntil) {
        d.limpUntil = -1;
        if (i === s.hero) say(s, "เครื่องกลับมาปกติแล้ว", "good");
        dirty = true;
      }
      if (dirty) refresh(s, i);
      // AI เลือกการ์ดของตัวเอง
      if (i !== s.hero && cr.pending > 0 && r.t >= cr.pickAt) {
        const hand = makeHand(s.rng, cr.deck);
        if (!hand) cr.pending = 0;
        else {
          play(s, i, hand[aiChoice(s.rng, hand, cr.pref)]);
          cr.pending--;
          if (cr.pending > 0) cr.pickAt = r.t + 0.2 + rand(s.rng) * 0.4;
        }
      }
    });
    const hc = heroCrew(s);
    if (hc.pending > 0 && !s.offer) {
      s.offer = makeHand(s.rng, hc.deck);
      if (!s.offer) hc.pending = 0;
    }
    if (s.doneAt !== null && (r.cars.every((c) => c.finish !== null) || r.t - s.doneAt > FINISH_WAIT)) s.over = true;
  }
  return out;
}

/** อันดับตอนนี้ของรถคันที่ i (1 = นำ) */
export const posOf = (s: Session, i: number) => s.race.order.indexOf(i) + 1;

/** ระยะห่างเป็นวินาทีจากผู้นำ (ไว้แสดงในตารางอันดับ) */
export function gapToLeader(s: Session, i: number): number {
  const r = s.race;
  const lead = r.cars[r.order[0]];
  const c = r.cars[i];
  if (c.finish !== null && lead.finish !== null) return c.finish + c.penalty - (lead.finish + lead.penalty);
  return (lead.car.s - c.car.s) / Math.max(20, c.car.v);
}

