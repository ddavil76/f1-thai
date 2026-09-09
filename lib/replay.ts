/* ---------- Race replay (openf1.org) ---------- */
// รีเพลย์ไทม์มิ่งย้อนหลังแบบรอบต่อรอบ — ปี 2023+ เท่านั้น
// ผลแข่งจบแล้วไม่เปลี่ยน → cache ยาว 1 ปี

const OF1 = "https://api.openf1.org/v1";
const YEAR = 60 * 60 * 24 * 365;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// openf1 rate-limit burst → ยิงทีละคำขอ + retry
let chain: Promise<unknown> = Promise.resolve();
async function of1<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(600 * attempt);
      try {
        const res = await fetch(`${OF1}/${path}`, { next: { revalidate: YEAR } });
        if (res.ok) return (await res.json()) as T;
        if (res.status !== 429 && res.status < 500) {
          throw new Error(`openf1 ${res.status} ${path}`);
        }
      } catch (e) {
        if (attempt === 3) throw e;
      }
    }
    throw new Error(`openf1 failed ${path}`);
  };
  const result = chain.then(run, run);
  chain = result.catch(() => {});
  return result as Promise<T>;
}

type Session = { session_key: number; date_start: string; year: number };
type Of1Driver = {
  driver_number: number;
  name_acronym: string;
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
  is_pit_out_lap: boolean;
};
type Of1Stint = {
  driver_number: number;
  lap_start: number;
  lap_end: number;
  compound: string | null;
  tyre_age_at_start: number | null;
};
type Of1Pit = { driver_number: number; lap_number: number };
type Of1Pos = { driver_number: number; position: number; date: string };
type Of1RC = {
  date: string;
  category: string;
  flag: string | null;
  message: string | null;
  lap_number: number | null;
  scope: string | null;
};

export type ReplayDriver = {
  num: number;
  code: string;
  team: string;
  colour: string;
};
/** ค่าเวลา + ระดับสี: 0 ปกติ · 1 สถิติตัวเอง · 2 สถิติสนาม */
export type Cell = { t: number | null; tier: 0 | 1 | 2 };
export type ReplayRow = {
  num: number;
  pos: number;
  lap: number;
  gapLeader: string;
  gapAhead: string;
  compound: string;
  tyreAge: number;
  inPit: boolean;
  out: boolean;
  lastLap: Cell;
  bestLap: number | null;
  s: [Cell, Cell, Cell];
};
export type ReplayFrame = { lap: number; flag: string | null; rows: ReplayRow[] };
export type RaceReplay = {
  totalLaps: number;
  drivers: ReplayDriver[];
  frames: ReplayFrame[];
};

const COMPOUND_SHORT: Record<string, string> = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
  INTERMEDIATE: "I",
  WET: "W",
};
export const compoundShort = (c: string) => COMPOUND_SHORT[c] ?? c.slice(0, 1);

const ms = (iso: string) => new Date(iso).getTime();
// ระยะห่างติดลบ = อันดับ (openf1) กับเวลาข้ามเส้นไม่ตรงกันชั่วคราว (ช่วงเข้าพิท) → ปัดเป็น 0
const fmtGap = (sec: number) => `+${Math.max(0, sec).toFixed(3)}`;

/** หา session_key ของ race จากวันที่แข่ง (YYYY-MM-DD) */
async function findRaceSession(
  season: number,
  raceDate: string,
): Promise<number | null> {
  try {
    const list = await of1<Session[]>(
      `sessions?year=${season}&session_name=Race`,
    );
    const hit = list.find((s) => s.date_start?.slice(0, 10) === raceDate);
    return hit?.session_key ?? null;
  } catch {
    return null;
  }
}

export async function getRaceReplay(
  season: number,
  raceDate: string,
): Promise<RaceReplay | null> {
  if (season < 2023) return null;
  const sk = await findRaceSession(season, raceDate);
  if (!sk) return null;

  let drivers: Of1Driver[];
  let laps: Of1Lap[];
  let stints: Of1Stint[];
  let pits: Of1Pit[];
  let positions: Of1Pos[];
  let rc: Of1RC[];
  try {
    drivers = await of1<Of1Driver[]>(`drivers?session_key=${sk}`);
    laps = await of1<Of1Lap[]>(`laps?session_key=${sk}`);
    stints = await of1<Of1Stint[]>(`stints?session_key=${sk}`);
    pits = await of1<Of1Pit[]>(`pit?session_key=${sk}`);
    positions = await of1<Of1Pos[]>(`position?session_key=${sk}`);
    rc = await of1<Of1RC[]>(`race_control?session_key=${sk}`);
  } catch {
    return null;
  }
  if (!laps?.length || !drivers?.length) return null;

  const nums = [...new Set(laps.map((l) => l.driver_number))];
  const dMeta = new Map<number, ReplayDriver>();
  for (const n of nums) {
    const d = drivers.find((x) => x.driver_number === n);
    dMeta.set(n, {
      num: n,
      code: d?.name_acronym ?? String(n),
      team: d?.team_name ?? "",
      colour: `#${d?.team_colour ?? "888888"}`,
    });
  }

  // laps ต่อคน: lapNum -> lap
  const byDriver = new Map<number, Map<number, Of1Lap>>();
  for (const l of laps) {
    if (!byDriver.has(l.driver_number)) byDriver.set(l.driver_number, new Map());
    byDriver.get(l.driver_number)!.set(l.lap_number, l);
  }
  const maxLap = (n: number) =>
    Math.max(0, ...[...(byDriver.get(n)?.keys() ?? [])]);
  const totalLaps = Math.max(...nums.map(maxLap));
  if (totalLaps < 2) return null;

  // เวลาข้ามเส้นเมื่อ "จบ" lap L = date_start ของ lap L+1 (หรือ start+dur ถ้าเป็นรอบสุดท้าย)
  const crossTime = (n: number, L: number): number | null => {
    const m = byDriver.get(n);
    if (!m) return null;
    const next = m.get(L + 1);
    if (next?.date_start) return ms(next.date_start);
    const cur = m.get(L);
    if (cur?.date_start && cur.lap_duration != null)
      return ms(cur.date_start) + cur.lap_duration * 1000;
    return null;
  };
  // เวลาที่ผู้นำจบ lap L (ผู้ที่ข้ามเส้นก่อน)
  const leaderCross = (L: number): number => {
    const times = nums
      .map((n) => crossTime(n, L))
      .filter((t): t is number => t != null);
    return times.length ? Math.min(...times) : Infinity;
  };

  // ตำแหน่ง ณ เวลา t (step function)
  const posEvents = positions
    .filter((p) => p.position != null)
    .sort((a, b) => ms(a.date) - ms(b.date));
  const posAt = (n: number, t: number): number => {
    let p = 20;
    for (const e of posEvents) {
      if (e.driver_number !== n) continue;
      if (ms(e.date) > t) break;
      p = e.position;
    }
    return p;
  };

  // stint lookup
  const stintAt = (n: number, L: number) => {
    const s = stints.find(
      (x) => x.driver_number === n && L >= x.lap_start && L <= x.lap_end,
    );
    if (!s) return { compound: "", age: 0 };
    return {
      compound: s.compound ? compoundShort(s.compound) : "",
      age: (s.tyre_age_at_start ?? 0) + (L - s.lap_start),
    };
  };
  const pitLaps = new Set(pits.map((p) => `${p.driver_number}:${p.lap_number}`));

  // ธง/SC ต่อ lap — เอาเฉพาะที่มีผลทั้งสนาม (SC/VSC/RED/ธงหมากรุก) ข้าม yellow/blue
  const flagWindows: { from: number; to: number; label: string }[] = [];
  const scEvents = rc
    .filter((x) => x.category === "SafetyCar" || x.flag === "RED")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  for (let i = 0; i < scEvents.length; i++) {
    const e = scEvents[i];
    const msg = (e.message ?? "").toUpperCase();
    const lap = e.lap_number ?? 1;
    if (e.flag === "RED") {
      flagWindows.push({ from: lap, to: lap + 1, label: "RED" });
    } else if (/DEPLOYED/.test(msg)) {
      const label = /VSC/.test(msg) ? "VSC" : "SC";
      const end = scEvents
        .slice(i + 1)
        .find((x) => /IN THIS LAP|ENDING/.test((x.message ?? "").toUpperCase()));
      flagWindows.push({
        from: lap,
        to: end?.lap_number ? end.lap_number + 1 : lap + 3,
        label,
      });
    }
  }
  const flagAt = (L: number): string | null => {
    if (L >= totalLaps) return "🏁";
    const w = flagWindows.find((x) => L >= x.from && L <= x.to);
    return w?.label ?? null;
  };

  // best (สะสมถึง lap L) ต่อคน
  const bestLap = new Map<number, number>();
  const bestS = new Map<number, [number, number, number]>();
  let sessBestLap = Infinity;
  const sessBestS: [number, number, number] = [Infinity, Infinity, Infinity];

  const frames: ReplayFrame[] = [];

  for (let L = 1; L <= totalLaps; L++) {
    const asOf = leaderCross(L);

    // อัปเดต best จากรอบ L
    for (const n of nums) {
      const lap = byDriver.get(n)?.get(L);
      if (!lap) continue;
      if (lap.lap_duration != null && !lap.is_pit_out_lap) {
        if (lap.lap_duration < (bestLap.get(n) ?? Infinity))
          bestLap.set(n, lap.lap_duration);
        if (lap.lap_duration < sessBestLap) sessBestLap = lap.lap_duration;
      }
      const secs = [
        lap.duration_sector_1,
        lap.duration_sector_2,
        lap.duration_sector_3,
      ] as const;
      const pb = bestS.get(n) ?? [Infinity, Infinity, Infinity];
      secs.forEach((v, i) => {
        if (v == null) return;
        if (v < pb[i]) pb[i] = v;
        if (v < sessBestS[i]) sessBestS[i] = v;
      });
      bestS.set(n, pb);
    }

    const cell = (v: number | null, pb: number, sb: number): Cell => {
      if (v == null) return { t: null, tier: 0 };
      const tier: 0 | 1 | 2 = v <= sb ? 2 : v <= pb ? 1 : 0;
      return { t: v, tier };
    };

    const rows: ReplayRow[] = nums.map((n) => {
      const done = Math.min(L, maxLap(n)); // รอบล่าสุดที่คนนี้ทำถึง
      const lap = byDriver.get(n)?.get(done);
      const isOut = maxLap(n) < L && maxLap(n) < totalLaps - 1;
      const pb = bestS.get(n) ?? [Infinity, Infinity, Infinity];
      const { compound, age } = stintAt(n, done);
      return {
        num: n,
        pos: posAt(n, asOf),
        lap: done,
        gapLeader: "",
        gapAhead: "",
        compound,
        tyreAge: age,
        inPit: pitLaps.has(`${n}:${L}`),
        out: isOut,
        lastLap: cell(lap?.lap_duration ?? null, bestLap.get(n) ?? Infinity, sessBestLap),
        bestLap: bestLap.get(n) ?? null,
        s: [
          cell(lap?.duration_sector_1 ?? null, pb[0], sessBestS[0]),
          cell(lap?.duration_sector_2 ?? null, pb[1], sessBestS[1]),
          cell(lap?.duration_sector_3 ?? null, pb[2], sessBestS[2]),
        ],
      };
    });

    rows.sort((a, b) => a.pos - b.pos);
    rows.forEach((r, i) => (r.pos = i + 1)); // normalize

    // gaps
    const leader = rows[0];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i === 0) {
        r.gapLeader = "LEADER";
        r.gapAhead = "—";
        continue;
      }
      if (r.out) {
        r.gapLeader = "DNF";
        r.gapAhead = "—";
        continue;
      }
      const lapsDown = leader.lap - r.lap;
      if (lapsDown >= 1) {
        r.gapLeader = `+${lapsDown} LAP`;
      } else {
        const Lc = Math.min(leader.lap, r.lap);
        const a = crossTime(r.num, Lc);
        const b = crossTime(leader.num, Lc);
        r.gapLeader = a != null && b != null ? fmtGap((a - b) / 1000) : "—";
      }
      const ahead = rows[i - 1];
      if (r.inPit) r.gapAhead = "PIT";
      else if (ahead.lap - r.lap >= 1) r.gapAhead = `+${ahead.lap - r.lap} LAP`;
      else {
        const Lc = Math.min(ahead.lap, r.lap);
        const a = crossTime(r.num, Lc);
        const b = crossTime(ahead.num, Lc);
        r.gapAhead = a != null && b != null ? fmtGap((a - b) / 1000) : "—";
      }
    }

    frames.push({ lap: L, flag: flagAt(L), rows });
  }

  return {
    totalLaps,
    drivers: nums.map((n) => dMeta.get(n)!),
    frames,
  };
}
