import Link from "next/link";
import { CalendarArrowDown, ChevronRight } from "lucide-react";
import LocalTime from "@/components/tz/LocalTime";
import { getSchedule, findNextRace, isPastRace, toDate } from "@/lib/f1";
import { SEASON } from "@/lib/season";

export const metadata = { title: "ปฏิทินทั้งฤดูกาล" };

export const revalidate = 600;


export default async function CalendarPage() {
  const races = await getSchedule(SEASON);
  const nextRound = findNextRace(races)?.round;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            ปฏิทิน <span className="text-(--color-f1)">F1</span> ทั้งฤดูกาล
          </h1>
          <p className="text-sm text-white/50">ฤดูกาล {SEASON}</p>
        </div>
        {races.length > 0 && (
          <a
            href="/calendar.ics"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
          >
            <CalendarArrowDown className="h-4 w-4" />
            ดาวน์โหลดปฏิทิน (.ics) ทุก session
          </a>
        )}
      </header>

      {races.length === 0 && (
        <p className="card p-6 text-sm text-white/60">
          ปฏิทินฤดูกาล {SEASON} ยังไม่ประกาศ — กลับมาดูใหม่อีกครั้งนะ
        </p>
      )}

      <section className={races.length === 0 ? "hidden" : "card p-2 sm:p-4"}>
        <ul className="stagger divide-y divide-white/5">
          {races.map((r, i) => {
            const d = toDate({ date: r.date, time: r.time })!;
            const past = isPastRace(r);
            const isNext = r.round === nextRound;
            return (
              <li key={r.round} style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={`/race/${r.round}`}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.05] ${
                    past ? "opacity-40 hover:opacity-100" : ""
                  }`}
                >
                  <span
                    className={`w-6 text-right text-sm tabular-nums ${
                      isNext ? "font-bold text-(--color-f1)" : "text-white/40"
                    }`}
                  >
                    {r.round}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.raceName}</p>
                    <p className="truncate text-xs text-white/50">
                      {r.Circuit.Location.locality}, {r.Circuit.Location.country}
                    </p>
                  </div>
                  <span className="text-right text-xs tabular-nums text-white/70">
                    <LocalTime
                      iso={d.toISOString()}
                      kind="date"
                      circuitId={r.Circuit.circuitId}
                    />
                    <br />
                    <LocalTime
                      iso={d.toISOString()}
                      kind="time"
                      circuitId={r.Circuit.circuitId}
                    />{" "}
                    น.
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
