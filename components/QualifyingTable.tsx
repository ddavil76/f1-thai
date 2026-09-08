import type { QualifyingResult } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

/** เวลาที่ดีที่สุด + รอบที่ตกรอบ */
function best(q: QualifyingResult) {
  if (q.Q3) return { time: q.Q3, seg: "Q3" };
  if (q.Q2) return { time: q.Q2, seg: "Q2" };
  if (q.Q1) return { time: q.Q1, seg: "Q1" };
  return { time: "—", seg: "" };
}

export default function QualifyingTable({
  results,
}: {
  results: QualifyingResult[];
}) {
  return (
    <section className="card overflow-hidden p-0">
      <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
        ควอลิฟาย
      </h2>
      <ul className="divide-y divide-white/5">
        {results.map((q, i) => {
          const b = best(q);
          return (
            <li
              key={q.Driver.driverId}
              className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
            >
              <span className="w-6 text-right text-sm tabular-nums text-white/40">
                {q.position}
              </span>
              <span
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ background: teamColor(q.Constructor.constructorId) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {q.Driver.givenName.charAt(0)}.{" "}
                  <span className="uppercase">{q.Driver.familyName}</span>
                  {i === 0 && (
                    <span className="ml-1.5 align-middle text-[10px] font-bold text-purple-300">
                      POLE
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-white/50">{q.Constructor.name}</p>
              </div>
              {b.seg && b.seg !== "Q3" && (
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                  {b.seg}
                </span>
              )}
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-white/70">
                {b.time}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
