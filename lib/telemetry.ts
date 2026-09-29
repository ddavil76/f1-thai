/* ---------- เทียบเทเลเมทรีรายรอบ (openf1.org) ---------- */
// ความเร็ว/คันเร่ง/เบรก/เกียร์ ~3.7 ครั้งต่อวินาที + ตำแหน่งบนสนาม — ปี 2023+ เท่านั้น
// ดึงจากฝั่ง client เหมือนรีเพลย์ (openf1 บล็อก IP ของ Vercel) และดึงทีละรอบ ไม่ใช่ทั้ง session
// (car_data ทั้งเรซของคนเดียวราว 2-3 MB — หนักเกินสำหรับมือถือ)

import { of1 } from "./openf1";
import { matchRaceSession } from "./replay";

/* ---------- session ---------- */

/** session ที่เทียบเทเลเมทรีได้ — Q เป็นค่าเริ่มต้น (รอบเร็วสุดเทียบกันได้ตรงที่สุด) */
export type TelemetrySessionCode = "Q" | "SQ" | "SPRINT" | "RACE";

// ชื่อ session ของ openf1 — sprint quali ปี 2023 ชื่อ "Sprint Shootout"
const OF1_NAMES: Record<TelemetrySessionCode, string[]> = {
  Q: ["Qualifying"],
  SQ: ["Sprint Qualifying", "Sprint Shootout"],
  SPRINT: ["Sprint"],
  RACE: ["Race"],
};

type Of1Session = { session_key: number; session_name: string; date_start: string };

/** เลือก session ของ openf1 ที่ชื่อตรงประเภทและเวลาเริ่มใกล้กำหนดการที่สุด */
export function matchSession(
  list: Of1Session[],
  code: TelemetrySessionCode,
  startMs: number,
): number | null {
  const names = OF1_NAMES[code];
  return matchRaceSession(list.filter((s) => names.includes(s.session_name)), startMs);
}

// ทั้งปีคำขอเดียว — สลับ Q/Sprint/Race ไม่ต้องยิงซ้ำ
const yearSessions = new Map<number, Promise<Of1Session[]>>();
function sessionsOf(year: number): Promise<Of1Session[]> {
  let p = yearSessions.get(year);
  if (!p) {
    p = of1<Of1Session[]>(`sessions?year=${year}`).catch((e) => {
      yearSessions.delete(year); // พลาดแล้วให้ลองใหม่ได้
      throw e;
    });
    yearSessions.set(year, p);
  }
  return p;
}

export async function findSessionKey(
  season: number,
  code: TelemetrySessionCode,
  startIso: string,
): Promise<number | null> {
  if (season < 2023) return null;
  return matchSession(await sessionsOf(season), code, Date.parse(startIso));
}

/* ---------- นักแข่ง + รอบ ---------- */

type Of1Driver = {
  driver_number: number;
  name_acronym: string;
  full_name?: string;
  team_name: string;
  team_colour: string | null;
};
type Of1Lap = {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed?: number | null;
  i2_speed?: number | null;
  st_speed?: number | null;
  is_pit_out_lap: boolean;
};

export type TelemetryDriver = { num: number; code: string; name: string; team: string; colour: string };

export type TelemetryLap = {
  num: number;
  lap: number;
  /** เวลาเริ่มรอบ (ISO) */
  start: string;
  /** เวลาต่อรอบ (วินาที) */
  time: number;
  sectors: [number | null, number | null, number | null];
  /** ความเร็วที่ speed trap (km/h) */
  trap: number | null;
};

export type SessionLaps = {
  key: number;
  drivers: TelemetryDriver[];
  /** รอบที่ใช้เทียบได้ (มีเวลาครบ ไม่ใช่รอบออกพิท) */
  laps: TelemetryLap[];
};

export function toLaps(raw: Of1Lap[]): TelemetryLap[] {
  return raw
    .filter((l) => l.date_start && l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap)
    .map((l) => ({
      num: l.driver_number,
      lap: l.lap_number,
      start: l.date_start!,
      time: l.lap_duration!,
      sectors: [l.duration_sector_1, l.duration_sector_2, l.duration_sector_3],
      trap: l.st_speed ?? null,
    }));
}

/** รอบเร็วสุดของแต่ละคน เรียงเร็ว → ช้า (ใช้เลือกคู่เริ่มต้น + เรียงรายชื่อ) */
export function fastestLaps(laps: TelemetryLap[]): TelemetryLap[] {
  const best = new Map<number, TelemetryLap>();
  for (const l of laps) {
    const b = best.get(l.num);
    if (!b || l.time < b.time) best.set(l.num, l);
  }
  return [...best.values()].sort((a, b) => a.time - b.time);
}

const pendingLaps = new Map<string, Promise<SessionLaps | null>>();

export function getSessionLaps(sk: number, cache: RequestCache): Promise<SessionLaps | null> {
  const k = String(sk);
  let p = pendingLaps.get(k);
  if (!p) {
    p = (async () => {
      const drivers = await of1<Of1Driver[]>(`drivers?session_key=${sk}`, cache);
      const laps = toLaps(await of1<Of1Lap[]>(`laps?session_key=${sk}`, cache));
      if (!laps.length || !drivers?.length) return null;
      const seen = new Set(laps.map((l) => l.num));
      return {
        key: sk,
        laps,
        drivers: drivers
          .filter((d) => seen.has(d.driver_number))
          .map((d) => ({
            num: d.driver_number,
            code: d.name_acronym,
            name: d.full_name ?? d.name_acronym,
            team: d.team_name,
            colour: `#${d.team_colour ?? "888888"}`,
          })),
      };
    })().catch((e) => {
      pendingLaps.delete(k);
      throw e;
    });
    pendingLaps.set(k, p);
  }
  return p;
}

/* ---------- เทเลเมทรีของรอบเดียว ---------- */

export type Of1Car = {
  date: string;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
  drs?: number | null;
};
export type Of1Loc = { date: string; x: number; y: number };

/** จุดข้อมูลหลังเทียบระยะแล้ว — ทุก array ยาวเท่ากัน index i = ระยะ frac[i] ของรอบ */
export type Trace = {
  /** ความยาวรอบ (เมตร) จากการอินทิเกรตความเร็ว */
  length: number;
  frac: number[];
  /** เวลาตั้งแต่เริ่มรอบ (วินาที) */
  t: number[];
  speed: number[];
  throttle: number[];
  /** เบรก 0/1 (openf1 ให้แค่เหยียบ/ไม่เหยียบ) */
  brake: number[];
  gear: number[];
  /** ตำแหน่งบนสนาม — null ถ้าไม่มีข้อมูล location */
  x: number[] | null;
  y: number[] | null;
};

/** จำนวนจุดหลัง resample — พอสำหรับกราฟกว้างเต็มจอโดยไม่หนัก */
export const TRACE_POINTS = 500;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** หาค่า y ที่ x = at จากชุด (xs เรียงไม่ลด) แบบเส้นตรง — นอกช่วงยึดค่าปลาย */
function interp(xs: number[], ys: number[], at: number): number {
  if (at <= xs[0]) return ys[0];
  const n = xs.length;
  if (at >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= at) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return span > 0 ? lerp(ys[lo], ys[hi], (at - xs[lo]) / span) : ys[lo];
}

/** ค่าขั้นบันได (เกียร์/เบรก) — ใช้ค่าล่าสุดที่ไม่เกินตำแหน่งนั้น */
function step(xs: number[], ys: number[], at: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (at >= xs[hi]) return ys[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= at) lo = mid;
    else hi = mid;
  }
  return ys[lo];
}

/**
 * รวม car_data + location ของรอบเดียว → จุดเรียงตามระยะทาง (0..1 ของรอบ)
 * ระยะทางได้จากอินทิเกรตความเร็วตามเวลา แล้วปรับเป็นสัดส่วนของรอบ
 * สองคนจะได้วางเทียบกันที่ "จุดเดียวกันบนสนาม" แม้ความยาวที่คำนวณได้ต่างกันเล็กน้อย
 */
export function buildTrace(
  car: Of1Car[],
  loc: Of1Loc[],
  startIso: string,
  lapTime: number,
  points = TRACE_POINTS,
): Trace | null {
  const start = Date.parse(startIso);
  const rows = car
    .map((c) => ({ ...c, t: (Date.parse(c.date) - start) / 1000 }))
    .filter((c) => Number.isFinite(c.t) && c.t >= -1 && c.t <= lapTime + 1 && Number.isFinite(c.speed))
    .sort((a, b) => a.t - b.t);
  if (rows.length < 10) return null;

  // เวลาเริ่ม/จบรอบเป๊ะ ๆ — ตัวอย่างแรก/สุดท้ายห่างขอบได้ ~0.3 วิ
  const ts = rows.map((r) => Math.min(lapTime, Math.max(0, r.t)));
  const speeds = rows.map((r) => r.speed);
  ts[0] = 0;
  ts[ts.length - 1] = lapTime;

  // ระยะสะสม (เมตร) — ความเร็วเฉลี่ยสองจุด × เวลา
  const dist = [0];
  for (let i = 1; i < rows.length; i++) {
    dist.push(dist[i - 1] + ((speeds[i - 1] + speeds[i]) / 2 / 3.6) * (ts[i] - ts[i - 1]));
  }
  const length = dist[dist.length - 1];
  if (!(length > 100)) return null;
  const f = dist.map((d) => d / length);

  const throttle = rows.map((r) => Math.max(0, Math.min(100, r.throttle)));
  const brake = rows.map((r) => (r.brake > 0 ? 1 : 0));
  const gear = rows.map((r) => r.n_gear);

  // ตำแหน่ง ณ เวลาของ car_data (location เป็นอีกชุดเวลา)
  const locs = loc
    .map((l) => ({ t: (Date.parse(l.date) - start) / 1000, x: l.x, y: l.y }))
    .filter((l) => Number.isFinite(l.t) && l.t >= -2 && l.t <= lapTime + 2)
    .sort((a, b) => a.t - b.t);
  const hasPos = locs.length >= 10;
  const lt = locs.map((l) => l.t);
  const px = hasPos ? ts.map((t) => interp(lt, locs.map((l) => l.x), t)) : null;
  const py = hasPos ? ts.map((t) => interp(lt, locs.map((l) => l.y), t)) : null;

  const out: Trace = {
    length,
    frac: [], t: [], speed: [], throttle: [], brake: [], gear: [],
    x: px ? [] : null,
    y: py ? [] : null,
  };
  for (let i = 0; i < points; i++) {
    const at = i / (points - 1);
    out.frac.push(at);
    out.t.push(interp(f, ts, at));
    out.speed.push(interp(f, speeds, at));
    out.throttle.push(interp(f, throttle, at));
    out.brake.push(step(f, brake, at));
    out.gear.push(step(f, gear, at));
    if (px && py) {
      out.x!.push(interp(f, px, at));
      out.y!.push(interp(f, py, at));
    }
  }
  return out;
}

/**
 * ส่วนต่างเวลา ณ จุดเดียวกันบนสนาม (วินาที) — บวก = A มาถึงก่อน (A นำ)
 * ค่าที่จุดสุดท้าย = ส่วนต่างเวลาต่อรอบพอดี
 */
export function timeDelta(a: Trace, b: Trace): number[] {
  return a.t.map((ta, i) => b.t[i] - ta);
}

/**
 * แบ่งรอบเป็น n ช่วงเท่า ๆ กัน แล้วดูว่าใครใช้เวลาในช่วงนั้นน้อยกว่า (ผังสนามระบายสี)
 * gain = วินาทีที่ผู้ชนะช่วงนั้นได้มา
 */
export function miniSectors(a: Trace, b: Trace, n = 25): { from: number; to: number; winner: "a" | "b"; gain: number }[] {
  const last = a.t.length - 1;
  const out: { from: number; to: number; winner: "a" | "b"; gain: number }[] = [];
  for (let k = 0; k < n; k++) {
    const i0 = Math.round((k * last) / n);
    const i1 = Math.round(((k + 1) * last) / n);
    const da = a.t[i1] - a.t[i0];
    const db = b.t[i1] - b.t[i0];
    out.push({ from: i0, to: i1, winner: da <= db ? "a" : "b", gain: Math.abs(db - da) });
  }
  return out;
}

const pendingTrace = new Map<string, Promise<Trace | null>>();

/** เทเลเมทรีของรอบเดียว — 2 คำขอ (car_data + location) กรองช่วงเวลาของรอบนั้น */
export function getLapTrace(sk: number, lap: TelemetryLap, cache: RequestCache): Promise<Trace | null> {
  const k = `${sk}:${lap.num}:${lap.lap}`;
  let p = pendingTrace.get(k);
  if (!p) {
    p = (async () => {
      const from = Date.parse(lap.start) - 1000;
      const to = Date.parse(lap.start) + lap.time * 1000 + 1000;
      // openf1 ไม่รับ "Z" ท้ายเวลาในตัวกรอง
      const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "");
      const range = `session_key=${sk}&driver_number=${lap.num}&date>${iso(from)}&date<${iso(to)}`;
      const car = await of1<Of1Car[]>(`car_data?${range}`, cache);
      // ตำแหน่งเป็นของเสริม (ผังสนาม) — ไม่มีก็ยังโชว์กราฟได้
      const loc = await of1<Of1Loc[]>(`location?${range}`, cache).catch(() => [] as Of1Loc[]);
      return buildTrace(car, loc, lap.start, lap.time);
    })().catch((e) => {
      pendingTrace.delete(k);
      throw e;
    });
    pendingTrace.set(k, p);
  }
  return p;
}

/** "1:29.456" */
export function fmtLap(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
