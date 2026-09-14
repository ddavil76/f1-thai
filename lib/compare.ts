import {
  isClassifiedFinish, type DriverQualiResult, type DriverRaceResult, type RaceResult,
} from "./f1";

export type DriverSummary = {
  starts: number;
  wins: number;
  podiums: number;
  dnfs: number;
  bestFinish: number | null;
  avgFinish: number | null;
  /** ไม่นับออกจากพิทเลน (grid 0) */
  avgGrid: number | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** สถิติเรซของนักขับทั้งฤดูกาล (ไม่รวมสปรินต์) — สนามที่ไม่ได้ออกสตาร์ทไม่นับ */
export function summarizeDriver(results: DriverRaceResult[]): DriverSummary {
  const started = results.filter((r) => r.result.status !== "Did not start");
  const finishes = started
    .filter((r) => isClassifiedFinish(r.result.status))
    .map((r) => Number(r.result.position));
  return {
    starts: started.length,
    wins: finishes.filter((p) => p === 1).length,
    podiums: finishes.filter((p) => p <= 3).length,
    dnfs: started.length - finishes.length,
    bestFinish: finishes.length ? Math.min(...finishes) : null,
    avgFinish: avg(finishes),
    avgGrid: avg(started.map((r) => Number(r.result.grid)).filter((g) => g > 0)),
  };
}

/** ใครจบก่อนในสนามเดียวกัน — จบทั้งคู่ดูอันดับ, จบคนเดียวคนนั้นชนะ, ไม่จบทั้งคู่ไม่นับ */
function finishWinner(a: RaceResult | null, b: RaceResult | null): "a" | "b" | null {
  const fa = a !== null && isClassifiedFinish(a.status);
  const fb = b !== null && isClassifiedFinish(b.status);
  if (fa && fb) return Number(a.position) < Number(b.position) ? "a" : "b";
  if (fa) return "a";
  if (fb) return "b";
  return null;
}

/** ปะทะกันเฉพาะสนามที่ลงทั้งคู่: ออกตัวนำ (ข้าม grid 0) และจบก่อน — [a, b] */
export function raceHeadToHead(a: DriverRaceResult[], b: DriverRaceResult[]) {
  const bByRound = new Map(b.map((r) => [r.round, r.result]));
  const grid: [number, number] = [0, 0];
  const race: [number, number] = [0, 0];
  for (const r of a) {
    const other = bByRound.get(r.round);
    if (!other) continue;
    const ga = Number(r.result.grid);
    const gb = Number(other.grid);
    if (ga && gb) grid[ga < gb ? 0 : 1]++;
    const w = finishWinner(r.result, other);
    if (w) race[w === "a" ? 0 : 1]++;
  }
  return { grid, race };
}

/** ควอลิฟายนำกันกี่สนาม — [a, b] */
export function qualiHeadToHead(a: DriverQualiResult[], b: DriverQualiResult[]): [number, number] {
  const bByRound = new Map(b.map((q) => [q.round, q.position]));
  const out: [number, number] = [0, 0];
  for (const q of a) {
    const other = bByRound.get(q.round);
    if (other != null) out[q.position < other ? 0 : 1]++;
  }
  return out;
}

export type RoundRow = {
  round: string;
  raceName: string;
  a: RaceResult | null;
  b: RaceResult | null;
  winner: "a" | "b" | null;
};

/** ผลรายสนามของทั้งสองคนเรียงคู่กัน ใหม่ → เก่า (สนามที่ลงคนเดียวก็แสดง) */
export function roundByRound(a: DriverRaceResult[], b: DriverRaceResult[]): RoundRow[] {
  const rows = new Map<string, RoundRow>();
  for (const r of a) {
    rows.set(r.round, { round: r.round, raceName: r.raceName, a: r.result, b: null, winner: null });
  }
  for (const r of b) {
    const row = rows.get(r.round) ?? {
      round: r.round,
      raceName: r.raceName,
      a: null,
      b: null,
      winner: null,
    };
    row.b = r.result;
    rows.set(r.round, row);
  }
  for (const row of rows.values()) row.winner = finishWinner(row.a, row.b);
  return [...rows.values()].sort((x, y) => Number(y.round) - Number(x.round));
}
