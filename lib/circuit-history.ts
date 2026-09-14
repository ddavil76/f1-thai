import type { RaceWithResults } from "./f1";

export type CircuitWinner = {
  season: string;
  driverId: string;
  driver: string;
  constructorId: string;
  team: string;
};

export type CircuitLeader = { id: string; name: string; wins: number; ties: number };

export type CircuitHistory = {
  /** จำนวนครั้งที่จัด (บางปีสนามเดียวจัด 2 เรซ เลยไม่ใช่จำนวนปี) */
  total: number;
  firstSeason: string;
  topDriver: CircuitLeader;
  topTeam: CircuitLeader;
  /** ผู้ชนะล่าสุด ใหม่ → เก่า */
  recent: CircuitWinner[];
};

/** ชนะมากสุด — เสมอกันให้คนที่ชนะล่าสุดขึ้นก่อน และบอกว่ามีคนเสมออีกกี่คน */
function leader(
  rows: CircuitWinner[],
  id: (r: CircuitWinner) => string,
  name: (r: CircuitWinner) => string,
): CircuitLeader {
  const tally = new Map<string, { id: string; name: string; wins: number; last: number }>();
  rows.forEach((r, i) => {
    const key = id(r);
    const t = tally.get(key);
    if (t) {
      t.wins++;
      t.last = i;
      t.name = name(r); // ใช้ชื่อล่าสุด (ทีมเปลี่ยนชื่อได้)
    } else {
      tally.set(key, { id: key, name: name(r), wins: 1, last: i });
    }
  });
  const sorted = [...tally.values()].sort((a, b) => b.wins - a.wins || b.last - a.last);
  const top = sorted[0];
  return {
    id: top.id,
    name: top.name,
    wins: top.wins,
    ties: sorted.filter((t) => t !== top && t.wins === top.wins).length,
  };
}

export function summarizeCircuit(
  winners: RaceWithResults[],
  recentCount = 6,
): CircuitHistory | null {
  const rows: CircuitWinner[] = [...winners]
    .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.round) - Number(b.round))
    .flatMap((r) => {
      const w = r.Results[0];
      return w
        ? [
            {
              season: r.season,
              driverId: w.Driver.driverId,
              driver: `${w.Driver.givenName} ${w.Driver.familyName}`,
              constructorId: w.Constructor.constructorId,
              team: w.Constructor.name,
            },
          ]
        : [];
    });
  if (rows.length === 0) return null;

  return {
    total: rows.length,
    firstSeason: rows[0].season,
    topDriver: leader(rows, (r) => r.driverId, (r) => r.driver),
    topTeam: leader(rows, (r) => r.constructorId, (r) => r.team),
    recent: rows.slice(-recentCount).reverse(),
  };
}
