import type { RaceResult } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

function gapText(r: RaceResult, i: number) {
  if (r.status !== "Finished" && !r.status.startsWith("+")) return r.status;
  if (i === 0) return r.Time?.time ?? "—";
  return r.Time?.time ?? r.status;
}

export default function ResultsTable({ results }: { results: RaceResult[] }) {
  const fl = results.find((r) => r.FastestLap?.rank === "1");

  return (
    <section className="card overflow-hidden p-0">
      <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
        ผลการแข่ง
      </h2>
      <ul className="divide-y divide-white/5">
        {results.map((r, i) => (
          <li
            key={r.Driver.driverId}
            className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
          >
            <span className="w-6 text-right text-sm tabular-nums text-white/40">
              {r.position}
            </span>
            <span
              className="h-7 w-1 shrink-0 rounded-full"
              style={{ background: teamColor(r.Constructor.constructorId) }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.Driver.givenName.charAt(0)}.{" "}
                <span className="uppercase">{r.Driver.familyName}</span>
                {r === fl && (
                  <span
                    title="Fastest lap"
                    className="ml-1.5 align-middle text-[10px] font-bold text-purple-300"
                  >
                    ⏱ FL
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-white/50">{r.Constructor.name}</p>
            </div>
            <span className="shrink-0 text-right text-xs tabular-nums text-white/60">
              {gapText(r, i)}
            </span>
            <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums">
              {r.points !== "0" ? r.points : ""}
            </span>
          </li>
        ))}
      </ul>
      {fl?.FastestLap?.Time && (
        <p className="border-t border-white/5 px-5 py-3 text-xs text-white/50">
          ⏱ Fastest lap: <span className="text-white/80">{fl.Driver.familyName}</span>{" "}
          {fl.FastestLap.Time.time} (รอบ {fl.FastestLap.lap})
        </p>
      )}
    </section>
  );
}
