import { summarizeCircuit } from "@/lib/circuit-history";
import type { RaceWithResults } from "@/lib/f1";
import { teamColor, teamName } from "@/lib/teams";

/** ผู้ชนะในอดีตของสนาม — ใครชนะที่นี่มากสุด และผู้ชนะล่าสุด */
export default function CircuitHistory({ winners }: { winners: RaceWithResults[] }) {
  const h = summarizeCircuit(winners);
  if (!h) return null;

  const latest = h.recent[0];

  if (h.total === 1) {
    return (
      <section className="card p-5">
        <h2 className="text-lg font-bold">ประวัติสนาม</h2>
        <p className="mt-1 text-sm text-white/60">
          สนามใหม่ · จัด F1 ครั้งแรกปี {h.firstSeason} ผู้ชนะคนแรกคือ{" "}
          <span className="font-semibold text-white">{latest.driver}</span> (
          {teamName(latest.constructorId, latest.team)})
        </p>
      </section>
    );
  }

  const tile = (title: string, name: string, wins: number, ties: number) => (
    <div className="min-w-0 rounded-lg bg-white/[0.04] p-3">
      <p className="text-[11px] text-white/40">{title}</p>
      <p className="truncate font-bold">{name}</p>
      <p className="text-xs tabular-nums text-white/50">
        {wins} ครั้ง{ties > 0 && ` · เท่ากับอีก ${ties}`}
      </p>
    </div>
  );

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-lg font-bold">ประวัติสนาม</h2>
        <p className="text-xs text-white/40">
          จัดมาแล้ว {h.total} ครั้ง · ตั้งแต่ปี {h.firstSeason}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tile("ชนะที่นี่มากสุด", h.topDriver.name, h.topDriver.wins, h.topDriver.ties)}
        {tile(
          "ทีมที่ชนะมากสุด",
          teamName(h.topTeam.id, h.topTeam.name),
          h.topTeam.wins,
          h.topTeam.ties,
        )}
      </div>

      <div>
        <p className="mb-1 text-xs text-white/40">ผู้ชนะล่าสุด</p>
        <ul className="divide-y divide-white/5">
          {h.recent.map((r, i) => (
            <li key={`${r.season}-${i}`} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-10 shrink-0 tabular-nums text-white/40">{r.season}</span>
              <span
                className="h-3.5 w-1 shrink-0 rounded-full"
                style={{ background: teamColor(r.constructorId) }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{r.driver}</span>
              <span className="shrink-0 truncate text-xs text-white/45">
                {teamName(r.constructorId, r.team)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
