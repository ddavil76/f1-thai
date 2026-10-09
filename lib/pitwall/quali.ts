/**
 * ควอลิฟาย: Q1 → Q2 → Q3 คัดออก (หรือช่วงเดียว) — หัวหน้าทีมสั่งส่งรถออก เลือกยาง จำนวนรอบเร่ง ความเสี่ยง ลากท้ายเพื่อน
 * รอบเร่งคำนวณเวลาตอนเริ่มรอบ (รถ ยาง สนามเร็วขึ้นตามเวลา รถติด ลม พลาด) แล้วรถวิ่งให้ครบตามเวลานั้นบนแผนที่
 */
import { AI_PACE, TYRE, setupPenalty, wearPenalty } from "./model";
import { bestSet, freshSets } from "./race";
import { gauss, rand, type Seed } from "./rng";
import { cellOf, lapOf, type TrackModel } from "./track";
import type { AiLevel, Car, Compound, QualiFormat } from "./types";

export type Risk = "normal" | "attack";
export type Run = { compound: Compound; set: number; laps: number; risk: Risk; tow: boolean; drive: boolean };
export type QStatus = "garage" | "out" | "push" | "in" | "eliminated";

export type QCar = {
  id: number;
  status: QStatus;
  pos: number;
  run: Run | null;
  /** รอบเร่งปัจจุบัน: เวลาเป้าหมาย และเวลาที่เริ่ม */
  lap: { start: number; time: number; sec: [number, number, number]; deleted: boolean; note: string; startPos: number } | null;
  /** เวลาเซกเตอร์ที่วิ่งผ่านแล้วในรอบนี้ */
  shown: (number | null)[];
  best: number | null;
  bestSec: (number | null)[];
  last: { time: number | null; deleted: boolean; note: string; sec: number[] } | null;
  /** รอผลจากการขับเอง (เกมจับจังหวะ) */
  waitDrive: boolean;
  driveDelta: number | null;
  /** AI: จะส่งออกตอนนาฬิกาเหลือเท่าไร */
  plan: number[];
  grid: number | null;
  auto: boolean;
  /** เตือนแล้วว่ายังไม่มีเวลาในช่วงนี้ */
  nudged: boolean;
};

export type QSeg = { name: string; len: number; out: number };
export type QualiState = {
  format: QualiFormat;
  segs: QSeg[];
  seg: number;
  /** นาฬิกาที่เหลือ (วินาทีของเกม) */
  clock: number;
  /** เวลาเกมที่ผ่านไปทั้งควอลิฟาย (ไว้คิดสนามเร็วขึ้น) */
  elapsed: number;
  total: number;
  t: number;
  /** พักระหว่างช่วง / ธงแดง (วินาทีจริง) */
  pause: number;
  red: boolean;
  redDone: boolean[];
  cars: QCar[];
  /** ผลแต่ละช่วง (id เรียงตามเวลา) */
  results: number[][];
  done: boolean;
  grid: number[];
};

export type QualiCtx = {
  track: TrackModel;
  cars: Car[];
  teams: readonly { pace: number }[];
  ai: AiLevel;
  human: (car: number) => boolean;
  seed: Seed;
  say: (team: number | null, car: number | null, text: string, tone?: "info" | "good" | "bad" | "warn") => void;
};

/**
 * ความยาวแต่ละช่วง (วินาทีของเกม ผูกกับเวลาต่อรอบของสนาม) — เกมเดินเร็วกว่าจริงราว 5 เท่า
 * หนึ่งครั้งที่ส่งออก (รอบอุ่นยาง + รอบเร่ง) ใช้ราว 2.2 รอบ
 */
export function segments(format: QualiFormat, n: number, lap: number): QSeg[] {
  if (format === "single") return [{ name: "ควอลิฟาย", len: Math.round(lap * 5.5), out: 0 }];
  const cut = Math.max(1, Math.round(n * 0.28));
  return [
    { name: "Q1", len: Math.round(lap * 3.8), out: cut },
    { name: "Q2", len: Math.round(lap * 3.5), out: cut },
    { name: "Q3", len: Math.round(lap * 3.3), out: 0 },
  ];
}

const label = (ctx: QualiCtx, id: number) => `#${ctx.cars[id].num}`;
export const PIT_BOX = 3;

export function newQuali(ctx: QualiCtx, format: QualiFormat): QualiState {
  const segs = segments(format, ctx.cars.length, ctx.track.baseLap);
  const st: QualiState = {
    format,
    segs,
    seg: 0,
    clock: segs[0].len,
    elapsed: 0,
    total: segs.reduce((a, s) => a + s.len, 0),
    t: 0,
    pause: 0,
    red: false,
    redDone: segs.map(() => false),
    cars: ctx.cars.map((c) => ({
      id: c.id,
      status: "garage",
      pos: boxPos(ctx.track),
      run: null,
      lap: null,
      shown: [null, null, null],
      best: null,
      bestSec: [null, null, null],
      last: null,
      waitDrive: false,
      driveDelta: null,
      plan: [],
      grid: null,
      auto: !ctx.human(c.id),
      nudged: false,
    })),
    results: [],
    done: false,
    grid: [],
  };
  planAI(ctx, st);
  return st;
}

/** ตำแหน่งจอดในพิท (กลางเลนพิท) */
export const boxPos = (t: TrackModel) => t.pitEntry.start + PIT_BOX;
/** จุดออกจากพิทในรอบถัดไป */
const pitExit = (t: TrackModel, from: number) => {
  const L = t.lapCells;
  const base = Math.floor(from / L) * L + t.pitEntry.start + t.pitCells;
  return base;
};

/** ยังวิ่งในช่วงนี้อยู่ไหม */
export const inSession = (q: QCar) => q.status !== "eliminated";

/** เวลาที่น่าจะทำได้ (ไม่รวมรถติด/ลม/พลาด) */
export function expectedLap(ctx: QualiCtx, st: QualiState, id: number, compound: Compound, wear: number): number {
  const t = ctx.track;
  const spec = ctx.cars[id];
  return (
    t.baseLap +
    ctx.teams[spec.team].pace +
    spec.skill +
    setupPenalty(spec.downforce, t.idealDownforce) +
    TYRE[compound].offset +
    wearPenalty(wear) -
    0.55 * (st.elapsed / st.total) -
    1.2 + // ถังน้ำมันเบา + เครื่องโหมดควอลิฟาย
    (ctx.human(id) ? 0 : AI_PACE[ctx.ai])
  );
}

/** สั่งส่งรถออก */
export function sendOut(ctx: QualiCtx, st: QualiState, id: number, run: Omit<Run, "set">): string | null {
  const q = st.cars[id];
  if (q.status !== "garage") return "รถไม่ได้อยู่ในพิท";
  if (st.red || st.pause > 0 || st.done) return "ตอนนี้ส่งรถออกไม่ได้";
  if (st.clock <= 0) return "หมดเวลาแล้ว";
  const spec = ctx.cars[id];
  const set = bestSet(spec, run.compound);
  if (set < 0) return "ไม่มียางชนิดนี้";
  spec.sets[set].used = true;
  q.run = { ...run, set };
  q.status = "out";
  q.pos = pitExit(ctx.track, q.pos);
  q.last = null;
  return null;
}

/** เรียกกลับพิท (ยกเลิกรอบ) */
export function callIn(st: QualiState, id: number) {
  const q = st.cars[id];
  if (q.status === "out" || q.status === "push") {
    q.status = "in";
    q.lap = null;
    q.waitDrive = false;
  }
}

/** ผลจากการขับเอง: ปรับเวลารอบเร่งที่กำลังวิ่ง (หรือเพิ่งจบ) */
export function driveResult(st: QualiState, id: number, delta: number) {
  const q = st.cars[id];
  const d = Math.max(-1.5, Math.min(1.5, delta));
  if (q.lap) {
    q.lap.time += d;
    q.driveDelta = d;
    q.waitDrive = false;
  } else if (q.waitDrive && q.last && q.last.time !== null) {
    q.last.time += d;
    q.waitDrive = false;
    publish(q, q.last);
  }
}

function publish(q: QCar, last: NonNullable<QCar["last"]>) {
  if (last.time === null || last.deleted) return;
  if (q.best === null || last.time < q.best) {
    q.best = last.time;
    const k = last.time / last.sec.reduce((a, b) => a + b, 0);
    q.bestSec = last.sec.map((x) => x * k);
  }
}

function startPush(ctx: QualiCtx, st: QualiState, q: QCar) {
  const run = q.run!;
  const spec = ctx.cars[q.id];
  const set = spec.sets[run.set];
  let time = expectedLap(ctx, st, q.id, run.compound, set.wear);
  const notes: string[] = [];
  // ลากท้ายเพื่อนร่วมทีม
  if (run.tow) {
    const mate = st.cars.find((o) => o.id !== q.id && ctx.cars[o.id].team === spec.team);
    const gap = mate ? mate.pos - q.pos : 0;
    if (mate && mate.status === "push" && gap > 0.4 && gap < 2.5) {
      time -= 0.15;
      notes.push("ได้สลิปสตรีมจากเพื่อนร่วมทีม");
    }
  }
  // รถติด: ยิ่งมีรถอื่นวิ่งช้า ๆ บนสนามมาก ยิ่งเสี่ยง
  const slow = st.cars.filter((o) => o.id !== q.id && (o.status === "out" || o.status === "in")).length;
  if (rand(ctx.seed) < Math.min(0.45, slow * 0.06)) {
    const lost = 0.25 + rand(ctx.seed) * 0.6;
    time += lost;
    notes.push(`ติดรถในรอบเร่ง เสีย ${lost.toFixed(1)} วิ`);
  }
  const attack = run.risk === "attack";
  if (attack) time -= 0.18;
  if (rand(ctx.seed) < (attack ? 0.09 : 0.05)) {
    const lost = 0.6 + rand(ctx.seed);
    time += lost;
    notes.push(`พลาดเข้าโค้ง เสีย ${lost.toFixed(1)} วิ`);
  }
  time += gauss(ctx.seed) * 0.15;
  const deleted = rand(ctx.seed) < (attack ? 0.16 : 0.04);
  const t = ctx.track;
  const s1 = t.share.slice(0, t.sectors[0]).reduce((a, b) => a + b, 0);
  const s2 = t.share.slice(t.sectors[0], t.sectors[1]).reduce((a, b) => a + b, 0);
  const jitter = () => 1 + gauss(ctx.seed) * 0.004;
  const a = time * s1 * jitter();
  const b = time * s2 * jitter();
  q.lap = { start: st.t, time, sec: [a, b, time - a - b], deleted, note: notes.join(" · "), startPos: q.pos };
  q.shown = [null, null, null];
  q.status = "push";
  q.waitDrive = run.drive;
  q.driveDelta = null;
  // ยางชุดนี้สึกจากรอบเร่ง
  set.wear = Math.min(1, set.wear + TYRE[run.compound].wear * 1.4);
}

function finishPush(ctx: QualiCtx, st: QualiState, q: QCar) {
  const lap = q.lap!;
  const team = ctx.cars[q.id].team;
  q.last = { time: lap.time, deleted: lap.deleted, note: lap.note, sec: [...lap.sec] };
  q.lap = null;
  if (!q.waitDrive) publish(q, q.last);
  if (lap.deleted) ctx.say(team, q.id, `${label(ctx, q.id)} รอบถูกตัด (ออกนอกขอบสนาม)`, "bad");
  else if (lap.note && ctx.human(q.id)) ctx.say(team, q.id, `${label(ctx, q.id)} ${lap.note}`, "warn");
  q.run!.laps--;
  const more = q.run!.laps > 0 && st.clock > 0;
  q.status = more ? "push" : "in";
  if (more) startPush(ctx, st, q);
}

/** AI วางแผน: ส่งออกช่วงต้นถึงกลาง (ใช้ 2 รอบเร่งถ้าเวลาพอ) หรือออกช่วงท้ายรอบเดียวตอนสนามเร็วสุด */
function planAI(ctx: QualiCtx, st: QualiState) {
  for (const q of st.cars) if (q.auto && inSession(q)) planCar(ctx, st, q);
}

/** วางแผนให้คันเดียว (ใช้ตอนผู้เล่นเปิดให้ AI ส่งรถออกกลางช่วงด้วย) · ไม่เกินเวลาที่เหลือ */
export function planCar(ctx: QualiCtx, st: QualiState, q: QCar) {
  const lap = ctx.track.baseLap;
  const late = rand(ctx.seed) < 0.4;
  const plan = [late ? lap * (2.3 + rand(ctx.seed) * 0.3) : lap * (3.25 + rand(ctx.seed) * 0.25)];
  if (late) plan.push(lap * 1.0);
  q.plan = plan.map((x) => Math.min(x, st.clock));
}

function aiRun(ctx: QualiCtx, st: QualiState, q: QCar): Omit<Run, "set"> {
  const spec = ctx.cars[q.id];
  const top = ctx.teams[spec.team].pace < 0.3;
  let compound: Compound = "soft";
  if (st.seg === 0 && top && rand(ctx.seed) < 0.35 && freshSets(spec, "medium") > 0) compound = "medium";
  if (bestSet(spec, compound) < 0) compound = (["soft", "medium", "hard"] as Compound[]).find((c) => bestSet(spec, c) >= 0) ?? "medium";
  const laps = st.clock >= ctx.track.baseLap * 3.2 ? 2 : 1;
  return { compound, laps, risk: ctx.ai === "hard" && rand(ctx.seed) < 0.15 ? "attack" : "normal", tow: false, drive: false };
}

/** จัดอันดับในช่วงนี้ (ไม่มีเวลาอยู่ท้าย) */
export function segOrder(st: QualiState): number[] {
  return st.cars
    .filter(inSession)
    .sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9) || a.id - b.id)
    .map((q) => q.id);
}

function endSegment(ctx: QualiCtx, st: QualiState) {
  const order = segOrder(st);
  st.results.push(order);
  const seg = st.segs[st.seg];
  const outN = seg.out;
  const outIds = outN > 0 ? order.slice(order.length - outN) : [];
  const base = order.length - outN;
  outIds.forEach((id, i) => {
    const q = st.cars[id];
    q.status = "eliminated";
    q.grid = base + i + 1;
    ctx.say(ctx.cars[id].team, id, `${label(ctx, id)} ตกรอบ ${seg.name} ออกสตาร์ท P${q.grid}`, "bad");
  });
  if (st.seg + 1 >= st.segs.length) {
    order.slice(0, base).forEach((id, i) => (st.cars[id].grid = i + 1));
    st.grid = st.cars.filter((q) => q.grid !== null).sort((a, b) => a.grid! - b.grid!).map((q) => q.id);
    st.done = true;
    const pole = order[0];
    ctx.say(null, null, `${label(ctx, pole)} คว้าโพล!`, "good");
    return;
  }
  st.seg++;
  st.clock = st.segs[st.seg].len;
  st.pause = 6;
  for (const q of st.cars) {
    if (!inSession(q)) continue;
    q.best = null;
    q.bestSec = [null, null, null];
    q.last = null;
    q.status = "garage";
    q.pos = boxPos(ctx.track);
    q.run = null;
    q.nudged = false;
  }
  planAI(ctx, st);
  ctx.say(null, null, `เริ่ม ${st.segs[st.seg].name} อีกสักครู่`, "info");
}

function redFlag(ctx: QualiCtx, st: QualiState, why: string) {
  st.red = true;
  st.redDone[st.seg] = true;
  st.pause = 8;
  for (const q of st.cars) {
    if (q.status === "out" || q.status === "push" || q.status === "in") {
      q.status = "garage";
      q.pos = boxPos(ctx.track);
      q.lap = null;
      q.run = null;
      q.waitDrive = false;
    }
  }
  // AI วางแผนใหม่ในเวลาที่เหลือ
  for (const q of st.cars) if (q.auto && inSession(q)) q.plan = [st.clock * (0.4 + rand(ctx.seed) * 0.4)];
  ctx.say(null, null, `ธงแดง! ${why} — นาฬิกาหยุด ทุกคันกลับพิท`, "warn");
}

/**
 * เดินเวลา: dt = วินาทีของเกม · realDt = วินาทีจริง (ใช้นับพักระหว่างช่วง/ธงแดง)
 */
export function stepQuali(ctx: QualiCtx, st: QualiState, dt: number, realDt: number) {
  if (st.done) return;
  const t = ctx.track;
  const L = t.lapCells;
  if (st.pause > 0) {
    st.pause -= realDt;
    if (st.pause <= 0) {
      st.pause = 0;
      if (st.red) {
        st.red = false;
        ctx.say(null, null, "ธงเขียว — กลับมาวิ่งต่อ", "good");
      } else ctx.say(null, null, `${st.segs[st.seg].name} เริ่ม!`, "info");
    }
    return;
  }
  st.t += dt;
  st.elapsed += dt;
  const before = st.clock;
  st.clock = Math.max(0, st.clock - dt);
  if (before > 0 && st.clock === 0) ctx.say(null, null, `ธงตาหมากรุก ${st.segs[st.seg].name} — รอบที่เริ่มแล้ววิ่งต่อได้`, "info");

  // ธงแดงสุ่ม (ช่วงละไม่เกินครั้ง)
  if (!st.redDone[st.seg] && st.clock > 60 && rand(ctx.seed) < (0.12 / st.segs[st.seg].len) * dt) {
    const victim = st.cars.filter((q) => q.status === "push" || q.status === "out");
    if (victim.length) {
      const v = victim[Math.floor(rand(ctx.seed) * victim.length)];
      redFlag(ctx, st, `${label(ctx, v.id)} ชนแบริเออร์`);
      return;
    }
  }

  // AI ส่งรถออกตามแผน
  for (const q of st.cars) {
    if (!q.auto || q.status !== "garage" || !q.plan.length) continue;
    if (st.clock <= q.plan[0]) {
      q.plan.shift();
      const order = segOrder(st);
      const cut = order.length - st.segs[st.seg].out;
      const rank = order.indexOf(q.id);
      // รอบสอง: ออกเมื่อยังไม่ปลอดภัย หรือเป็นช่วงสุดท้าย
      if (q.best !== null && st.seg < st.segs.length - 1 && rank < cut - 2) continue;
      if (st.clock < t.baseLap * 2.1) continue;
      sendOut(ctx, st, q.id, aiRun(ctx, st, q));
    }
  }

  // เตือนผู้เล่น: ใกล้หมดเวลาแต่รถยังไม่ได้ทำเวลา (ต้องใช้ราว 2 รอบ: อุ่นยาง + รอบเร่ง)
  for (const q of st.cars) {
    if (q.auto || q.nudged || q.status !== "garage" || q.best !== null || !ctx.human(q.id)) continue;
    if (st.clock > 0 && st.clock <= t.baseLap * 2.8) {
      q.nudged = true;
      ctx.say(ctx.cars[q.id].team, q.id, `${label(ctx, q.id)} ยังไม่มีเวลา — ส่งรถออกตอนนี้ ไม่งั้นจะทำรอบไม่ทัน`, "bad");
    }
  }

  // ขยับรถ
  for (const q of st.cars) {
    if (q.status === "garage" || q.status === "eliminated") continue;
    const old = q.pos;
    if (q.status === "push" && q.lap) {
      // วิ่งตามสัดส่วนเวลาของแต่ละช่อง ให้ครบรอบพอดีเวลาเป้าหมาย
      const elapsed = st.t - q.lap.start;
      const frac = Math.min(1, elapsed / q.lap.time);
      q.pos = q.lap.startPos + posAtShare(t, frac);
      const secs = [t.sectors[0] / L, t.sectors[1] / L];
      for (let k = 0; k < 2; k++) {
        if (q.shown[k] === null && q.pos - q.lap.startPos >= secs[k] * L) q.shown[k] = q.lap.sec[k];
      }
      if (frac >= 1) {
        q.shown[2] = q.lap.sec[2];
        q.pos = q.lap.startPos + L;
        finishPush(ctx, st, q);
      }
      continue;
    }
    // รอบอุ่นยาง / รอบกลับพิท: วิ่งช้ากว่ารอบเร่ง
    const slowF = q.status === "out" ? 1.22 : 1.3;
    const cell = cellOf(t, q.pos);
    q.pos += dt / (t.baseLap * t.share[cell] * slowF);
    if (q.status === "out" && lapOf(t, q.pos) > lapOf(t, old)) {
      q.pos = Math.floor(q.pos / L) * L;
      if (st.clock > 0) startPush(ctx, st, q);
      else q.status = "in";
    } else if (q.status === "in") {
      const pe = t.pitEntry.start;
      if (Math.floor(old) % L !== pe && cellOf(t, q.pos) === pe) {
        q.status = "garage";
        q.pos = boxPos(t);
        q.run = null;
      }
    }
  }

  // หมดเวลาและไม่มีรถในรอบเร่งแล้ว = จบช่วง
  if (st.clock === 0 && !st.cars.some((q) => q.status === "push" || q.status === "out" || q.waitDrive)) endSegment(ctx, st);
}

/** หาว่าเวลาสัดส่วน frac ของรอบ อยู่ที่ช่องไหน */
function posAtShare(t: TrackModel, frac: number): number {
  let acc = 0;
  for (let c = 0; c < t.lapCells; c++) {
    const s = t.share[c];
    if (acc + s >= frac) return c + (frac - acc) / s;
    acc += s;
  }
  return t.lapCells;
}

/** รอผลขับเองนานเกิน: ใช้เวลาที่คำนวณไว้ */
export function expireDrive(st: QualiState, id: number) {
  const q = st.cars[id];
  if (!q.waitDrive) return;
  q.waitDrive = false;
  if (!q.lap && q.last) publish(q, q.last);
}
