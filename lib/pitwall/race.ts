/**
 * จำลองการแข่งแบบเวลาเดินต่อเนื่อง (ทีละ 0.1 วินาทีของเกม)
 * ตำแหน่งรถ pos = ระยะสะสมเป็นช่อง (มีทศนิยม) · รอบ = floor(pos / lapCells)
 * รถที่ช้ากว่าหนึ่งรอบไม่ขวางรถที่กำลังจะน็อครอบ (ธงฟ้า)
 */
import { AI_PACE, ERS, FUEL_PER_LAP, MODE, TYRE, raceWear, setupPenalty, tyreLife, wearPenalty } from "./model";
import { gauss, rand, type Seed } from "./rng";
import { cellOf, inZone, lapOf, type TrackModel } from "./track";
import type { AiLevel, Car, Compound, DriveMode, ErsMode, Fight, LaunchKind, Neutral, TeamOrder } from "./types";
import { COMPOUND_INFO } from "./types";

export const SIM_DT = 0.1;
/** ระยะห่างต่ำสุดระหว่างรถ (ช่อง) */
const MIN_GAP = 0.08;
const SC_GAP = 0.07;
/** เวลาที่เสียในเลนพิท (นอกจากเวลาวิ่งปกติ) และเวลาจอดเปลี่ยนยาง */
export const PIT_LOSS = 18;
const STOP_BASE = 2.3;
/** แต้มตามอันดับ */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
/** ไม่เข้าพิทเลยทั้งเรซ = บวกเวลา (ยางชนิดไหนก็ได้) */
export const NO_STOP_PENALTY = 20;
/** การแซงใช้เวลา (วินาทีของเกม): ขึ้นเทียบข้างแล้วค่อย ๆ นำ (ไม่วาบข้ามคันหน้า) · แซงคันที่ช้ากว่ารอบ */
export const DUEL_TIME = 2.6;
const LAP_DUEL_TIME = 1.4;
/** ปุ่ม "แซงเลย": ต้องห่างคันหน้าไม่เกินกี่วินาที · ใช้แบตเท่าไร · ต้องรอกี่วินาทีถึงลองใหม่ได้ */
export const ATTACK_GAP = 0.8;
export const ATTACK_ERS = 0.2;
export const ATTACK_COOLDOWN = 12;

/** กำลังแซง: rival = คันที่ถูกแซง · from = ระยะห่างตอนเริ่ม (ช่อง) · win = แซงผ่านไหม (ตัดสินตอนเริ่ม) · called = ผู้เล่นสั่งเอง */
export type Duel = { rival: number; t: number; dur: number; from: number; win: boolean; called: boolean };

export type PitState = { start: number; t: number; drive: number; stop: number; compound: Compound; changed: boolean };

export type RaceCar = {
  id: number;
  pos: number;
  /** ฝั่งซ้าย/ขวาของถนนบนแผนที่ */
  side: -1 | 1;
  compound: Compound;
  set: number;
  wear: number;
  /** ยางชุดนี้ใช้มากี่รอบ */
  age: number;
  ers: number;
  mode: DriveMode;
  ersMode: ErsMode;
  fight: Fight;
  /** สั่งเข้าพิทรอบนี้ (ยางที่จะใส่) */
  pitReq: Compound | null;
  pit: PitState | null;
  stops: number;
  /** ยางแต่ละช่วงตามลำดับ (รวมยางออกตัว) */
  stints: Compound[];
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  noise: number;
  secStart: number;
  sec: (number | null)[];
  lastSec: (number | null)[];
  finished: number | null;
  out: string | null;
  drs: boolean;
  /** เสียเวลาค้างอยู่ (เช่นล็อกล้อ) วินาที */
  delay: number;
  /** ให้ AI ช่วยคุมกลยุทธ์ (รถ AI = true เสมอ) */
  auto: boolean;
  /** บวกเวลา (วินาที) */
  penalty: number;
  grid: number;
  /** ระยะถึงคันหน้า / คันหลัง (วินาที) */
  gapAhead: number | null;
  gapBehind: number | null;
  /** เวลาต่อช่องล่าสุด และเวลาแบบไม่นับลม/DRS (ไว้เทียบความเร็วตอนแซง) */
  ct: number;
  clean: number;
  warned: number;
  /** กำลังแซงคันหน้าอยู่ (null = ไม่) · รอใช้ปุ่มแซงอีกกี่วินาที */
  duel?: Duel | null;
  cd?: number;
  /** คันหน้าคันไหน · ช่องห่างกับคันหน้าหดลงกี่วินาทีต่อวินาที (เฉลี่ยราว 10 วินาที · ลบ = ห่างออก) */
  aheadId?: number | null;
  closing?: number;
};

export type RaceState = {
  t: number;
  laps: number;
  /** ตัวคูณการสึกของยางในเรซนี้ */
  wear: number;
  started: boolean;
  cars: RaceCar[];
  neutral: Neutral | null;
  /** ธงตาหมากรุก: คันนำวิ่งครบแล้ว */
  flag: boolean;
  finishOrder: number[];
  fastest: { car: number; time: number } | null;
  orders: TeamOrder[];
  overtakes: number;
  done: boolean;
};

export type RaceCtx = {
  track: TrackModel;
  cars: Car[];
  teams: readonly { pace: number }[];
  ai: AiLevel;
  /** รถคันนี้มีผู้เล่นคุม (ไม่ใช่รถ AI) */
  human: (car: number) => boolean;
  seed: Seed;
  say: (team: number | null, car: number | null, text: string, tone?: "info" | "good" | "bad" | "warn") => void;
};

const label = (ctx: RaceCtx, id: number) => `#${ctx.cars[id].num}`;

/** เลือกชุดยางที่ดีที่สุดของชนิดนี้ (ใหม่สุด) */
export function bestSet(car: Car, c: Compound): number {
  let best = -1;
  car.sets.forEach((s, i) => {
    if (s.compound !== c) return;
    if (best < 0 || s.wear < car.sets[best].wear) best = i;
  });
  return best;
}
export const freshSets = (car: Car, c: Compound) => car.sets.filter((s) => s.compound === c && !s.used).length;

export function newRace(ctx: RaceCtx, grid: number[], laps: number, start: Record<number, Compound>): RaceState {
  const cars: RaceCar[] = grid.map((id, slot) => {
    const spec = ctx.cars[id];
    const c = start[id] ?? "medium";
    const set = Math.max(0, bestSet(spec, c));
    const s = spec.sets[set];
    if (s) s.used = true;
    return {
      id,
      pos: -slot * 0.2,
      side: slot % 2 ? 1 : -1,
      compound: c,
      set,
      wear: s?.wear ?? 0,
      age: 0,
      ers: 0.7,
      mode: "normal",
      ersMode: "auto",
      fight: "none",
      pitReq: null,
      pit: null,
      stops: 0,
      stints: [c],
      lapStart: 0,
      lastLap: null,
      bestLap: null,
      noise: 0,
      secStart: 0,
      sec: [null, null, null],
      lastSec: [null, null, null],
      finished: null,
      out: null,
      drs: false,
      delay: 0,
      auto: !ctx.human(id),
      penalty: 0,
      grid: slot + 1,
      gapAhead: null,
      gapBehind: null,
      ct: 0,
      clean: 0,
      warned: 0,
      duel: null,
      cd: 0,
    };
  });
  cars.sort((a, b) => a.id - b.id);
  return {
    t: 0,
    laps,
    wear: raceWear(laps),
    started: false,
    cars,
    neutral: null,
    flag: false,
    finishOrder: [],
    fastest: null,
    orders: ctx.teams.map(() => "free" as TeamOrder),
    overtakes: 0,
    done: false,
  };
}

/** ผลออกตัว: ขยับขึ้น/ลงบนกริด (ช่อง) */
export const LAUNCH_GAIN: Record<LaunchKind, number> = { great: 0.32, good: 0.16, ok: 0, slow: -0.18, jump: -0.5 };
export function applyLaunches(st: RaceState, kinds: Record<number, LaunchKind>) {
  for (const c of st.cars) c.pos += LAUNCH_GAIN[kinds[c.id] ?? "ok"];
}

const active = (c: RaceCar) => c.finished === null && c.out === null;
const onTrack = (c: RaceCar) => active(c) && c.pit === null;

/** อันดับปัจจุบัน: เข้าเส้นชัยแล้วเรียงตามรอบและเวลา → ยังวิ่งเรียงตามระยะ → ออกจากเรซท้ายสุด */
export function standings(st: RaceState, lapCells: number): RaceCar[] {
  const laps = (c: RaceCar) => Math.floor(c.pos / lapCells + 1e-6);
  const fin = st.cars.filter((c) => c.finished !== null);
  fin.sort((a, b) => laps(b) - laps(a) || a.finished! + a.penalty - (b.finished! + b.penalty));
  const run = st.cars.filter((c) => c.finished === null && c.out === null).sort((a, b) => b.pos - a.pos);
  const out = st.cars.filter((c) => c.out !== null).sort((a, b) => b.pos - a.pos);
  return [...fin, ...run, ...out];
}

function cellTime(ctx: RaceCtx, st: RaceState, c: RaceCar): { ct: number; clean: number } {
  const t = ctx.track;
  const spec = ctx.cars[c.id];
  const lap = lapOf(t, c.pos);
  const lapsLeft = Math.max(0, st.laps - lap);
  let perf =
    ctx.teams[spec.team].pace +
    spec.skill +
    setupPenalty(spec.downforce, t.idealDownforce) +
    TYRE[c.compound].offset +
    wearPenalty(c.wear) +
    MODE[c.mode].pace +
    lapsLeft * FUEL_PER_LAP +
    c.noise +
    (ctx.human(c.id) ? 0 : AI_PACE[ctx.ai]);
  if (c.fight === "defend") perf += 0.15;
  const cell = cellOf(t, c.pos);
  const kind = t.kinds[cell];
  let f = 1 + perf / t.baseLap;
  if (kind === "straight" && c.ers > 0.02) {
    const e = ERS[c.fight === "attack" ? "boost" : c.ersMode];
    if (c.ersMode !== "harvest" && (c.ersMode === "boost" || c.fight === "attack" || c.ers > 0.25)) f -= e.straight;
  }
  if (c.ersMode === "harvest") f += 0.004;
  const clean = t.baseLap * t.share[cell] * f;
  // ตามติดคันหน้า: ทางตรงได้สลิปสตรีม โค้งเจออากาศปั่นป่วน
  if (c.gapAhead !== null && c.gapAhead < 1) f *= kind === "straight" ? 0.99 : 1.012;
  if (c.drs) f *= 0.965;
  if (st.neutral) f *= st.neutral.kind === "sc" ? 1.45 : 1.35;
  return { ct: t.baseLap * t.share[cell] * f, clean };
}

function passChance(ctx: RaceCtx, st: RaceState, x: RaceCar, a: RaceCar): number {
  const t = ctx.track;
  const sx = ctx.cars[x.id];
  const sa = ctx.cars[a.id];
  if (sx.team === sa.team) {
    if (st.orders[sx.team] === "swap") return 1;
    if (st.orders[sx.team] === "hold") return 0;
  }
  // เทียบความเร็วจริงของรถ (ไม่นับสลิปสตรีม) — ต้องเร็วกว่าพอสมควรถึงจะแซงได้
  const rel = (a.clean - x.clean) / Math.max(1e-6, a.clean) + (x.drs ? 0.012 : 0) + (x.fight === "attack" ? 0.004 : 0);
  const straight = t.kinds[cellOf(t, x.pos)] === "straight";
  let p = Math.max(0, rel - 0.006) * 0.15;
  if (!straight) p *= 0.1;
  if (x.drs) p *= 2;
  if (x.fight === "attack") p *= 1.6;
  if (a.fight === "defend") p *= 0.45;
  p *= 1 + (sa.downforce - sx.downforce) * 0.6;
  return Math.min(0.3, p);
}

/** ระยะคนแซงเทียบคันที่ถูกแซง (ช่อง) ตามเวลาของการแซง: ผ่าน = ขึ้นเทียบแล้วนำ · ไม่ผ่าน = ขึ้นเทียบแล้วหลุดกลับไปข้างหลัง */
function duelRel(d: Duel): number {
  const u = Math.min(1, d.t / d.dur);
  const ease = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return v * v * (3 - 2 * v);
  };
  if (d.win) return d.from + (MIN_GAP + 0.02 - d.from) * ease(u);
  const side = -0.01;
  return u < 0.55 ? d.from + (side - d.from) * ease(u / 0.55) : side + (-MIN_GAP * 1.2 - side) * ease((u - 0.55) / 0.45);
}

function startDuel(st: RaceState, c: RaceCar, rival: RaceCar, win: boolean, dur: number, called: boolean) {
  c.duel = { rival: rival.id, t: 0, dur, from: Math.min(-0.02, c.pos - rival.pos), win, called };
  // ขึ้นเทียบอีกฝั่งของถนน
  c.side = rival.side === 1 ? -1 : 1;
}

function endDuel(ctx: RaceCtx, st: RaceState, c: RaceCar) {
  const d = c.duel!;
  c.duel = null;
  const a = st.cars[d.rival];
  const t = ctx.track;
  const lapping = lapOf(t, a.pos) < lapOf(t, c.pos);
  const sa = ctx.cars[a.id];
  const sc = ctx.cars[c.id];
  if (!d.win) {
    c.delay += 0.15;
    if (ctx.human(c.id)) ctx.say(sc.team, c.id, `${label(ctx, c.id)} แซง ${label(ctx, a.id)} ไม่ผ่าน — ถูกปิดไลน์ เสียจังหวะ`, "bad");
    if (ctx.human(a.id)) ctx.say(sa.team, a.id, `${label(ctx, a.id)} ป้องกัน ${label(ctx, c.id)} ไว้ได้!`, "good");
    return;
  }
  if (lapping) return;
  st.overtakes++;
  if (sa.team === sc.team && st.orders[sc.team] === "swap") st.orders[sc.team] = "free";
  if (ctx.human(c.id)) ctx.say(sc.team, c.id, `${label(ctx, c.id)} แซง ${label(ctx, a.id)} ได้!`, "good");
  if (ctx.human(a.id)) ctx.say(sa.team, a.id, `${label(ctx, a.id)} โดน ${label(ctx, c.id)} แซง`, "bad");
}

/** คันที่อยู่ข้างหน้าบนสนามที่จะแซงได้ (ห่างไม่เกิน ATTACK_GAP วินาที ไม่ใช่รถที่กำลังแซง/ถูกแซงอยู่) */
export function attackTarget(st: RaceState, track: TrackModel, c: RaceCar): RaceCar | null {
  if (!onTrack(c) || c.duel || c.gapAhead === null || c.gapAhead > ATTACK_GAP) return null;
  const a = st.cars.filter((o) => o !== c && onTrack(o) && o.pos > c.pos).sort((x, y) => x.pos - y.pos)[0];
  if (!a || a.duel || st.cars.some((o) => o.duel?.rival === a.id)) return null;
  return lapOf(track, a.pos) - lapOf(track, c.pos) <= 1 ? a : null;
}

/** โอกาสที่กด "แซงเลย" แล้วผ่าน: เร็วกว่าแค่ไหน · DRS · ทางตรง/โค้ง · ยาง · แบต · อีกคันป้องกัน */
export function attackOdds(track: TrackModel, cars: Car[], st: RaceState, x: RaceCar, a: RaceCar): number {
  const sx = cars[x.id];
  const sa = cars[a.id];
  if (sx.team === sa.team) {
    if (st.orders[sx.team] === "swap") return 1;
    if (st.orders[sx.team] === "hold") return 0;
  }
  const rel = (a.clean - x.clean) / Math.max(1e-6, a.clean);
  const straight = track.kinds[cellOf(track, x.pos)] === "straight";
  let p = 0.3 + rel * 30 + (x.drs ? 0.2 : 0) + (straight ? 0.08 : -0.15) + (a.fight === "defend" ? -0.15 : 0) + (a.wear - x.wear) * 0.35 + (x.ers - a.ers) * 0.1;
  p *= 1 + (sa.downforce - sx.downforce) * 0.3;
  return Math.max(0.05, Math.min(0.9, p));
}

/** ผู้เล่นกด "แซงเลย": ใช้แบต ทอยตามโอกาส แล้วขึ้นเทียบ (ผลออกตอนจบการแซง) */
export function tryAttack(ctx: RaceCtx, st: RaceState, c: RaceCar): string | null {
  if (!st.started || st.neutral) return "แซงไม่ได้ช่วงนี้";
  if ((c.cd ?? 0) > 0) return `รออีก ${Math.ceil(c.cd ?? 0)} วิ`;
  if (c.ers < ATTACK_ERS) return "แบตไม่พอ";
  const a = attackTarget(st, ctx.track, c);
  if (!a) return `ต้องตามคันหน้าไม่เกิน ${ATTACK_GAP} วิ`;
  const odds = attackOdds(ctx.track, ctx.cars, st, c, a);
  c.ers -= ATTACK_ERS;
  c.cd = ATTACK_COOLDOWN;
  startDuel(st, c, a, rand(ctx.seed) < odds, DUEL_TIME, true);
  ctx.say(ctx.cars[c.id].team, c.id, `${label(ctx, c.id)} พุ่งขึ้นเทียบ ${label(ctx, a.id)}! (โอกาส ${Math.round(odds * 100)}%)`, "info");
  return null;
}

function enterPit(ctx: RaceCtx, c: RaceCar, compound: Compound) {
  const t = ctx.track;
  const stop = STOP_BASE + rand(ctx.seed) * 0.9 + (rand(ctx.seed) < 0.05 ? 3 : 0);
  const drive = t.baseLap * t.pitCells * (1 / t.lapCells) * 1.0 + PIT_LOSS;
  c.pit = { start: c.pos, t: 0, drive, stop, compound, changed: false };
  c.pitReq = null;
  c.drs = false;
  c.duel = null;
}

function changeTyres(ctx: RaceCtx, c: RaceCar) {
  const spec = ctx.cars[c.id];
  const comp = c.pit!.compound;
  const set = bestSet(spec, comp);
  if (set >= 0) {
    if (spec.sets[c.set]) spec.sets[c.set].wear = c.wear;
    c.set = set;
    c.wear = spec.sets[set].wear;
    spec.sets[set].used = true;
  } else c.wear = 0.5;
  c.compound = comp;
  c.age = 0;
  c.stops++;
  c.stints.push(comp);
  c.pit!.changed = true;
}

/** AI วางกลยุทธ์ยาง: ยางนิ่มสุดที่อยู่ได้ถึงจบ ไม่งั้นยางแข็งสุดที่มี */
export function planCompound(ctx: RaceCtx, st: RaceState, c: RaceCar): Compound {
  const lapsLeft = st.laps - lapOf(ctx.track, c.pos);
  const spec = ctx.cars[c.id];
  const options = (["soft", "medium", "hard"] as Compound[]).filter((k) => bestSet(spec, k) >= 0);
  const fits = options.filter((k) => tyreLife(k, "normal", st.wear) >= lapsLeft * 1.05);
  if (fits.length) return fits[0];
  return options.slice(-1)[0] ?? "hard";
}

function aiThink(ctx: RaceCtx, st: RaceState, c: RaceCar) {
  const lap = lapOf(ctx.track, c.pos);
  const lapsLeft = st.laps - lap;
  const smart = ctx.ai !== "easy";
  // เข้าพิท
  if (!c.pitReq && !c.pit && lapsLeft >= 1) {
    const limit = ctx.ai === "hard" ? 0.68 : ctx.ai === "easy" ? 0.82 : 0.72;
    const scCheap = smart && st.neutral && c.wear > 0.38 && lapsLeft > 3;
    const mustStop = c.stops === 0 && lapsLeft <= 3;
    const dying = c.wear > limit && (lapsLeft > 2 || c.wear > 0.95);
    if (scCheap || mustStop || dying) c.pitReq = planCompound(ctx, st, c);
  }
  // โหมดขับ
  if (lapsLeft <= 2 && c.wear < 0.85) c.mode = "push";
  else if (c.wear > 0.75 && lapsLeft > 3) c.mode = "save";
  else c.mode = "normal";
}

function aiFight(c: RaceCar) {
  if (c.gapAhead !== null && c.gapAhead < 0.8 && c.ers > 0.35) c.fight = "attack";
  else if (c.gapBehind !== null && c.gapBehind < 0.7) c.fight = "defend";
  else c.fight = "none";
}

function startNeutral(ctx: RaceCtx, st: RaceState, kind: "sc" | "vsc", why: string) {
  if (st.neutral || st.flag) return;
  st.neutral = { kind, laps: kind === "sc" ? 2 + Math.floor(rand(ctx.seed) * 2) : 1 + Math.floor(rand(ctx.seed) * 2), ending: false };
  for (const c of st.cars) c.drs = false;
  ctx.say(null, null, `${kind === "sc" ? "SAFETY CAR" : "VSC"}! ${why} — เข้าพิทตอนนี้เสียเวลาน้อย`, "warn");
}

function lapIncidents(ctx: RaceCtx, st: RaceState, c: RaceCar) {
  if (st.neutral || st.flag) return;
  const risk = MODE[c.mode].risk * (c.fight === "attack" ? 1.5 : 1) * (c.wear > 0.95 ? 6 : c.wear > 0.85 ? 2.5 : 1);
  const r = rand(ctx.seed);
  const team = ctx.cars[c.id].team;
  if (r < 0.003 * risk) {
    c.out = "ชน";
    ctx.say(team, c.id, `${label(ctx, c.id)} ชนออกจากเรซ!`, "bad");
    startNeutral(ctx, st, rand(ctx.seed) < 0.6 ? "sc" : "vsc", `${label(ctx, c.id)} ชน`);
  } else if (r < 0.003 * risk + 0.0008) {
    c.out = "เครื่องเสีย";
    ctx.say(team, c.id, `${label(ctx, c.id)} รถเสีย จอดข้างสนาม`, "bad");
    startNeutral(ctx, st, "vsc", `${label(ctx, c.id)} จอดข้างสนาม`);
  } else if (r < 0.03 * MODE[c.mode].risk) {
    c.delay += 0.6 + rand(ctx.seed) * 0.8;
    c.wear = Math.min(1.2, c.wear + 0.03);
    if (ctx.human(c.id)) ctx.say(team, c.id, `${label(ctx, c.id)} ล็อกล้อเข้าโค้ง เสียเวลานิดหน่อย`, "bad");
  }
}

/** เดินเวลาไป dt วินาทีของเกม */
export function stepRace(ctx: RaceCtx, st: RaceState, dt = SIM_DT) {
  if (!st.started || st.done) return;
  const t = ctx.track;
  const L = t.lapCells;
  st.t += dt;
  const leaderBefore = Math.max(...st.cars.filter(active).map((c) => c.pos), -Infinity);

  // 1) ความเร็วที่อยากไป
  const want = new Map<number, number>();
  for (const c of st.cars) {
    if (!active(c)) continue;
    if (c.pit) continue;
    const ct = cellTime(ctx, st, c);
    c.ct = ct.ct;
    c.clean = ct.clean;
    let step = dt;
    if (c.delay > 0) {
      const d = Math.min(c.delay, dt * 0.7);
      c.delay -= d;
      step -= d;
    }
    want.set(c.id, c.pos + step / c.ct);
  }

  // 2) จัดลำดับจากหน้าไปหลัง แล้วจำกัดไม่ให้ทะลุคันหน้า
  //    แซงสำเร็จ = เริ่ม "ขึ้นเทียบ" (duel): คู่นั้นไม่บังกันเอง คนแซงเดินตามจังหวะแซงเทียบกับคันที่ถูกแซง
  const order = st.cars.filter(onTrack).sort((a, b) => b.pos - a.pos);
  const placed: { car: RaceCar; pos: number }[] = [];
  const placedOf = new Map<number, number>();
  // ยกเลิกการแซงที่อีกคันเข้าพิท/ออกจากการแข่ง
  for (const c of order) if (c.duel && !onTrack(st.cars[c.duel.rival])) c.duel = null;
  for (const c of order) c.cd = Math.max(0, (c.cd ?? 0) - dt);
  const attackerOf = new Map<number, number>();
  for (const c of order) if (c.duel) attackerOf.set(c.duel.rival, c.id);
  for (const c of order) {
    let np = want.get(c.id)!;
    const gap = st.neutral?.kind === "sc" ? SC_GAP : MIN_GAP;
    const d = c.duel;
    const skip = d ? d.rival : (attackerOf.get(c.id) ?? -1);
    const ahead = placed.filter((p) => p.pos >= c.pos && p.car.id !== skip).sort((a, b) => a.pos - b.pos)[0];
    if (d) {
      d.t += dt;
      const rp = placedOf.get(d.rival) ?? want.get(d.rival) ?? st.cars[d.rival].pos;
      np = Math.max(c.pos, rp + duelRel(d));
      if (ahead && ahead.pos > c.pos) np = Math.min(np, Math.max(c.pos, ahead.pos - gap));
      if (d.t >= d.dur) endDuel(ctx, st, c);
    } else if (ahead && np > ahead.pos - gap) {
      const lapping = lapOf(t, ahead.car.pos) < lapOf(t, c.pos);
      const free = !ahead.car.duel && !attackerOf.has(ahead.car.id);
      if (free && !st.neutral && (lapping || rand(ctx.seed) < passChance(ctx, st, c, ahead.car) * (dt / SIM_DT))) {
        startDuel(st, c, ahead.car, true, lapping ? LAP_DUEL_TIME : DUEL_TIME, false);
        attackerOf.set(ahead.car.id, c.id);
      }
      np = Math.max(c.pos, ahead.pos - gap);
    }
    placed.push({ car: c, pos: np });
    placedOf.set(c.id, np);
  }

  // 3) รถในเลนพิท
  for (const c of st.cars) {
    if (!active(c) || !c.pit) continue;
    const p = c.pit;
    p.t += dt;
    const half = p.drive / 2;
    let along: number;
    if (p.t < half) along = p.t / p.drive;
    else if (p.t < half + p.stop) {
      along = 0.5;
      if (!p.changed) changeTyres(ctx, c);
    } else along = Math.min(1, (p.t - p.stop) / p.drive);
    const np = p.start + t.pitCells * along;
    placed.push({ car: c, pos: np });
    if (along >= 1) {
      const team = ctx.cars[c.id].team;
      if (ctx.human(c.id)) ctx.say(team, c.id, `${label(ctx, c.id)} ออกจากพิท ยาง ${COMPOUND_INFO[c.compound].label} · จอด ${p.stop.toFixed(1)} วิ`, p.stop > 4 ? "bad" : "good");
      c.pit = null;
    }
  }

  // 4) ย้ายจริง: นับรอบ เซกเตอร์ ยางสึก แบต เข้าพิท
  for (const { car: c, pos: np } of placed) {
    const old = c.pos;
    const moved = Math.max(0, np - old);
    c.pos = np;
    if (!c.pit) {
      const e = ERS[c.fight === "attack" ? "boost" : c.ersMode];
      const kind = t.kinds[cellOf(t, old)];
      const deploy = kind === "straight" && c.ersMode !== "harvest" && (c.ersMode === "boost" || c.fight === "attack" || c.ers > 0.25);
      c.ers = Math.min(1, Math.max(0, c.ers + moved * (deploy ? -e.drain : kind === "straight" ? (c.ersMode === "harvest" ? e.charge : 0) : e.charge)));
      const neutralWear = st.neutral ? 0.3 : 1;
      c.wear = Math.min(1.2, c.wear + (moved / L) * TYRE[c.compound].wear * MODE[c.mode].wear * (c.fight === "attack" ? 1.15 : 1) * neutralWear * st.wear);
      // DRS: เปิดได้ถ้าเข้าโซนแล้วห่างคันหน้าไม่ถึง 1 วิ (ตั้งแต่รอบ 2)
      for (const z of t.drs) {
        const zs = z.start;
        const crossed = Math.floor(old) % L !== zs && cellOf(t, np) === zs;
        if (crossed) c.drs = !st.neutral && lapOf(t, np) >= 1 && c.gapAhead !== null && c.gapAhead < 1;
      }
      if (c.drs && !t.drs.some((z) => inZone(z, Math.floor(np), L))) c.drs = false;
      // เข้าพิท
      const pe = t.pitEntry.start;
      if (c.pitReq && Math.floor(old) % L !== pe && cellOf(t, np) === pe && !st.flag) enterPit(ctx, c, c.pitReq);
    }
    // เซกเตอร์
    for (let k = 0; k < 2; k++) {
      const sc = t.sectors[k];
      const crossed = cellOf(t, old) < sc && cellOf(t, np) >= sc && lapOf(t, old) === lapOf(t, np);
      if (crossed && old >= 0) {
        c.sec[k] = st.t - c.secStart;
        c.secStart = st.t;
      }
    }
    // ครบรอบ
    if (lapOf(t, np) > lapOf(t, old)) {
      const lapNo = lapOf(t, np);
      if (old >= 0) {
        c.sec[2] = st.t - c.secStart;
        c.lastSec = [...c.sec];
        c.lastLap = st.t - c.lapStart;
        if (c.lastLap > 0 && (c.bestLap === null || c.lastLap < c.bestLap)) c.bestLap = c.lastLap;
        if (lapNo >= 2 && c.lastLap > 0 && !st.neutral && (st.fastest === null || c.lastLap < st.fastest.time)) {
          st.fastest = { car: c.id, time: c.lastLap };
          if (ctx.human(c.id)) ctx.say(ctx.cars[c.id].team, c.id, `${label(ctx, c.id)} ทำรอบเร็วสุดของเรซ!`, "good");
        }
      }
      c.lapStart = st.t;
      c.secStart = st.t;
      c.sec = [null, null, null];
      c.age++;
      c.noise = gauss(ctx.seed) * 0.12;
      if (st.flag && c.finished === null) {
        c.finished = st.t;
        st.finishOrder.push(c.id);
        if (noStop(c)) c.penalty += NO_STOP_PENALTY;
        continue;
      }
      if (lapNo >= 1) lapIncidents(ctx, st, c);
      if (c.auto) aiThink(ctx, st, c);
      warnHuman(ctx, st, c);
    }
  }

  // 5) คันนำครบระยะ = ธงตาหมากรุก · นับรอบ SC/VSC
  const leaderNow = Math.max(...st.cars.filter(active).map((c) => c.pos), -Infinity);
  if (!st.flag && leaderNow >= st.laps * L) {
    st.flag = true;
    const lead = st.cars.find((c) => active(c) && c.pos === leaderNow) ?? st.cars.find((c) => c.finished !== null);
    if (lead && lead.finished === null) {
      lead.finished = st.t;
      st.finishOrder.push(lead.id);
      if (noStop(lead)) lead.penalty += NO_STOP_PENALTY;
    }
    ctx.say(null, null, `ธงตาหมากรุก! ${lead ? `${label(ctx, lead.id)} ข้ามเส้นชัยเป็นคันแรก` : ""}`, "good");
  }
  if (st.neutral && Math.floor(leaderNow / L) > Math.floor(leaderBefore / L)) {
    st.neutral.laps--;
    if (st.neutral.laps === 1) {
      st.neutral.ending = true;
      ctx.say(null, null, `${st.neutral.kind === "sc" ? "เซฟตี้คาร์" : "VSC"} จะจบรอบนี้ — เตรียมเร่ง`, "info");
    } else if (st.neutral.laps <= 0) {
      st.neutral = null;
      ctx.say(null, null, "ธงเขียว! กลับมาแข่งต่อ", "good");
    }
  }

  // 6) ช่องห่าง และ AI ตัดสินใจระหว่างรอบ
  const run = st.cars.filter(onTrack).sort((a, b) => b.pos - a.pos);
  const lapSec = t.baseLap / L;
  run.forEach((c, i) => {
    const a = run[i - 1];
    const b = run[i + 1];
    const prev = c.gapAhead;
    c.gapAhead = a && lapOf(t, a.pos) - lapOf(t, c.pos) <= 1 ? (a.pos - c.pos) * lapSec : null;
    // ใกล้ขึ้น/ห่างออก (คันหน้าคันเดิมเท่านั้น)
    if (a && c.gapAhead !== null && prev !== null && c.aheadId === a.id) c.closing = (c.closing ?? 0) + ((prev - c.gapAhead) / dt - (c.closing ?? 0)) * Math.min(1, dt / 10);
    else c.closing = 0;
    c.aheadId = a ? a.id : null;
    c.gapBehind = b ? (c.pos - b.pos) * lapSec : null;
    if (c.auto) aiFight(c);
  });
  for (const c of st.cars) if (c.pit) {
    c.gapAhead = null;
    c.gapBehind = null;
  }
  if (st.flag && st.cars.every((c) => !active(c))) st.done = true;
}

/** ยังไม่ได้เข้าพิท (กำลังอยู่ในเลนพิทถือว่าเข้าแล้ว) */
const noStop = (c: RaceCar) => c.stops === 0 && !c.pit;

function warnHuman(ctx: RaceCtx, st: RaceState, c: RaceCar) {
  if (!ctx.human(c.id)) return;
  const team = ctx.cars[c.id].team;
  const left = Math.max(0, Math.round((1 - c.wear) * 100));
  if (c.wear > 0.85 && c.warned < 2) {
    c.warned = 2;
    ctx.say(team, c.id, `${label(ctx, c.id)} ยางเหลือ ${left}% — ใกล้หมดสภาพ ควรเข้าพิท`, "bad");
  } else if (c.wear > 0.65 && c.warned < 1) {
    c.warned = 1;
    ctx.say(team, c.id, `${label(ctx, c.id)} ยางเหลือ ${left}%`, "warn");
  }
  if (noStop(c) && !c.pitReq && st.laps - lapOf(ctx.track, c.pos) === 3)
    ctx.say(team, c.id, `${label(ctx, c.id)} ยังไม่ได้เข้าพิท — ต้องเข้าอย่างน้อย 1 ครั้ง ไม่งั้นบวก ${NO_STOP_PENALTY} วิ`, "warn");
}

/** ผลการแข่ง (เรียงแล้ว) พร้อมแต้ม */
export function classify(st: RaceState, lapCells: number) {
  const laps = (c: RaceCar) => Math.floor(c.pos / lapCells + 1e-6);
  const all = standings(st, lapCells);
  const winner = all.find((c) => c.finished !== null);
  return all.map((c, i) => ({
    id: c.id,
    pos: i + 1,
    laps: laps(c),
    time: c.finished !== null ? c.finished + c.penalty : null,
    gap:
      c.finished !== null && winner
        ? laps(c) < laps(winner)
          ? `+${laps(winner) - laps(c)} รอบ`
          : i === 0
            ? "ชนะ"
            : `+${(c.finished + c.penalty - (winner.finished! + winner.penalty)).toFixed(1)}`
        : c.out ?? "",
    points: c.out === null && i < POINTS.length ? POINTS[i] : 0,
    stops: c.stops,
    stints: c.stints,
    grid: c.grid,
    best: c.bestLap,
    penalty: c.penalty,
    out: c.out,
  }));
}
