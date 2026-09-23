import Link from "next/link";
import type { Race, RaceWithResults } from "@/lib/f1";
import { teamColor, teamName } from "@/lib/teams";

/**
 * แถบสีทั้งฤดูกาล — ช่องละสนาม เป็นสีทีมผู้ชนะ ยังไม่แข่งเป็นเทา สนามถัดไปขอบแดง
 * ดูแวบเดียวรู้ว่าปีนี้ทีมไหนครอง แบบกราฟิกสรุปฤดูกาลในถ่ายทอดสด
 */
export default function SeasonStrip({
  schedule,
  winners,
  nextRound,
}: {
  schedule: Race[];
  winners: RaceWithResults[];
  /** สนามถัดไปที่ยังไม่มีผล (ถ้ามี) */
  nextRound?: string;
}) {
  if (schedule.length === 0) return null;
  const byRound = new Map(winners.map((r) => [r.round, r.Results[0]]));

  // ทีมที่เคยชนะ เรียงตามจำนวนครั้ง — ใช้เป็นคำอธิบายสี
  const tally = new Map<string, { name: string; n: number }>();
  for (const w of byRound.values()) {
    if (!w) continue;
    const id = w.Constructor.constructorId;
    tally.set(id, { name: teamName(id, w.Constructor.name), n: (tally.get(id)?.n ?? 0) + 1 });
  }
  const legend = [...tally.entries()].sort((a, b) => b[1].n - a[1].n);

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">ผู้ชนะทั้งฤดูกาล</h2>
        <span className="text-xs text-white/40">
          {byRound.size}/{schedule.length} สนาม
        </span>
      </div>

      <ol className="flex gap-[3px]" aria-label="สีทีมผู้ชนะแต่ละสนาม">
        {schedule.map((r) => {
          const w = byRound.get(r.round);
          const isNext = r.round === nextRound;
          const label = w
            ? `R${r.round} ${r.raceName} · ${w.Driver.givenName.charAt(0)}. ${w.Driver.familyName} (${teamName(w.Constructor.constructorId, w.Constructor.name)})`
            : `R${r.round} ${r.raceName} · ยังไม่แข่ง`;
          return (
            <li key={r.round} className="min-w-0 flex-1">
              <Link
                href={`/race/${r.round}`}
                title={label}
                aria-label={label}
                className="block h-9 rounded-[3px] transition-transform hover:-translate-y-0.5"
                style={
                  w
                    ? { background: teamColor(w.Constructor.constructorId) }
                    : {
                        background: "rgb(255 255 255 / 0.07)",
                        boxShadow: isNext ? "inset 0 0 0 1.5px var(--color-f1)" : undefined,
                      }
                }
              />
            </li>
          );
        })}
      </ol>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/35">
        <span>R1</span>
        <span>R{schedule.at(-1)?.round}</span>
      </div>

      {legend.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-white/60">
          {legend.map(([id, t]) => (
            <li key={id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: teamColor(id) }} />
              {t.name}
              <span className="tabular-nums text-white/35">{t.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
