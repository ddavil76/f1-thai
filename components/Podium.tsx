import type { LastRace } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function Podium({ race }: { race: LastRace }) {
  const top3 = race.Results.slice(0, 3);
  if (top3.length < 3) return null;

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-lg font-bold">ผลการแข่งล่าสุด</h2>
        <span className="truncate text-sm text-white/50">
          {race.raceName} · R{race.round}
        </span>
      </div>

      <ul className="space-y-2">
        {top3.map((r, i) => (
          <li
            key={r.Driver.driverId}
            className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2.5"
          >
            <span className="text-base">{MEDAL[i]}</span>
            <span
              className="h-7 w-1 shrink-0 rounded-full"
              style={{ background: teamColor(r.Constructor.constructorId) }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold uppercase">
                {r.Driver.familyName}
              </p>
              <p className="truncate text-xs text-white/50">{r.Constructor.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm tabular-nums text-white/70">
                {r.Time?.time ?? r.status}
              </p>
              <p className="text-xs text-white/40">+{r.points} pts</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
