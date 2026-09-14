import type { PitStop, RaceResult } from "./f1";

/** "31.843" → 31.843 · "1:02.596" → 62.596 · "16:12.356" → 972.356 · รูปแบบอื่น → null */
export function parseDuration(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : null;
}

export const fmtSec = (s: number) => s.toFixed(2);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** เกินนี้ไม่ใช่พิทสต็อปแน่ ๆ — จอดรอในพิทเลนช่วงธงแดง (ข้อมูล 2026 มีถึง 35 นาที) */
const HARD_CAP_S = 120;

/** ช้ากว่าค่ากลางของสนามเกินเท่านี้ = ไม่ใช่พิทปกติ (ซ่อมรถ, ธงแดง, โทษ) — ตัดออกก่อนเทียบ */
export const OUTLIER_FACTOR = 1.5;

export type RaceStop = {
  driverId: string;
  driver: string;
  constructorId: string;
  team: string;
  lap: number;
  stop: number;
  seconds: number;
};

export type TeamPit = {
  constructorId: string;
  team: string;
  stops: number;
  best: number;
  median: number;
};

export type RacePitSummary = {
  /** พิทปกติ เรียงเร็ว → ช้า */
  stops: RaceStop[];
  /** จำนวนครั้งที่ตัดทิ้งเพราะช้าผิดปกติ */
  excluded: number;
  /** ทีมเรียงตามค่ากลางของเวลาพิท เร็ว → ช้า */
  teams: TeamPit[];
};

/**
 * สรุปพิทของสนามเดียว — ต้องมีผลการแข่งประกอบ เพราะข้อมูลพิทมีแค่ driverId
 * (และนักขับย้ายทีมกลางฤดูกาลได้ ต้องเอาทีม ณ สนามนั้นจริง ๆ)
 */
export function summarizeRacePits(
  pitStops: PitStop[],
  results: RaceResult[],
): RacePitSummary | null {
  const who = new Map(results.map((r) => [r.Driver.driverId, r]));
  const parsed = pitStops.flatMap((p) => {
    const seconds = parseDuration(p.duration);
    const r = who.get(p.driverId);
    if (seconds == null || !r) return [];
    return [
      {
        driverId: p.driverId,
        driver: `${r.Driver.givenName.charAt(0)}. ${r.Driver.familyName}`,
        constructorId: r.Constructor.constructorId,
        team: r.Constructor.name,
        lap: Number(p.lap),
        stop: Number(p.stop),
        seconds,
      },
    ];
  });
  const capped = parsed.filter((p) => p.seconds <= HARD_CAP_S);
  if (capped.length === 0) return null;

  const limit = median(capped.map((p) => p.seconds)) * OUTLIER_FACTOR;
  const stops = capped.filter((p) => p.seconds <= limit).sort((a, b) => a.seconds - b.seconds);

  const byTeam = new Map<string, RaceStop[]>();
  for (const s of stops) byTeam.set(s.constructorId, [...(byTeam.get(s.constructorId) ?? []), s]);
  const teams = [...byTeam.values()]
    .map((ss) => ({
      constructorId: ss[0].constructorId,
      team: ss[0].team,
      stops: ss.length,
      best: ss[0].seconds,
      median: median(ss.map((s) => s.seconds)),
    }))
    .sort((a, b) => a.median - b.median || a.best - b.best);

  return { stops, excluded: parsed.length - stops.length, teams };
}

export type SeasonTeamPit = {
  constructorId: string;
  team: string;
  races: number;
  /** อันดับเฉลี่ยต่อสนาม (1 = เร็วสุดของสนามนั้น) */
  avgRank: number;
  /** จำนวนสนามที่เป็นทีมพิทเร็วสุด */
  raceWins: number;
  stops: number;
  best: { seconds: number; driver: string; round: string; raceName: string };
};

/**
 * จัดอันดับทั้งฤดูกาลด้วย "อันดับเฉลี่ยต่อสนาม" ไม่ใช่เวลาเฉลี่ย —
 * พิทเลนแต่ละสนามยาวไม่เท่ากัน (17 วิ ถึง 30 วิ) เอาเวลามาเฉลี่ยข้ามสนามจะไม่แฟร์
 */
export function seasonPitRanking(
  races: { round: string; raceName: string; summary: RacePitSummary }[],
) {
  const acc = new Map<string, SeasonTeamPit & { rankSum: number }>();
  for (const { round, raceName, summary } of races) {
    summary.teams.forEach((t, i) => {
      const bestStop = summary.stops.find((s) => s.constructorId === t.constructorId)!;
      const cur = acc.get(t.constructorId) ?? {
        constructorId: t.constructorId,
        team: t.team,
        races: 0,
        avgRank: 0,
        raceWins: 0,
        stops: 0,
        rankSum: 0,
        best: { seconds: Infinity, driver: "", round, raceName },
      };
      cur.team = t.team;
      cur.races++;
      cur.rankSum += i + 1;
      cur.stops += t.stops;
      if (i === 0) cur.raceWins++;
      if (bestStop.seconds < cur.best.seconds) {
        cur.best = { seconds: bestStop.seconds, driver: bestStop.driver, round, raceName };
      }
      acc.set(t.constructorId, cur);
    });
  }

  const teams: SeasonTeamPit[] = [...acc.values()]
    .map(({ rankSum, ...t }) => ({ ...t, avgRank: rankSum / t.races }))
    .sort((a, b) => a.avgRank - b.avgRank || b.raceWins - a.raceWins);
  const fastest = races.map((r) => ({ round: r.round, raceName: r.raceName, stop: r.summary.stops[0] }));

  return { teams, fastest };
}
