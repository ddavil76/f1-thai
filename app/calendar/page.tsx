import Link from "next/link";
import { CalendarArrowDown, ChevronRight } from "lucide-react";
import LocalTime from "@/components/tz/LocalTime";
import SiteFooter from "@/components/SiteFooter";
import CheckeredFlag from "@/components/CheckeredFlag";
import { getSchedule, getSeasonWinners, findNextRace, isPastRace, toDate } from "@/lib/f1";
import { teamColor } from "@/lib/teams";
import { SEASON } from "@/lib/season";

export const metadata = { title: "ปฏิทินทั้งฤดูกาล" };

export const revalidate = 600;


export default async function CalendarPage() {
  const [races, winners] = await Promise.all([getSchedule(SEASON), getSeasonWinners(SEASON)]);
  const nextRound = findNextRace(races)?.round;
  const winnerOf = new Map(winners.map((r) => [r.round, r.Results[0]]));

  return (
    <main className="mx-auto max-w-3xl space-y-6 lg:max-w-5xl">
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
        <ul className="stagger divide-y divide-white/5 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:divide-y-0 lg:[&>li]:border-b lg:[&>li]:border-white/5">
          {races.map((r, i) => {
            const d = toDate({ date: r.date, time: r.time })!;
            const past = isPastRace(r);
            const isNext = r.round === nextRound;
            const win = winnerOf.get(r.round);
            const winColor = win ? teamColor(win.Constructor.constructorId) : null;
            return (
              <li key={r.round} style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={`/race/${r.round}`}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.05] ${
                    past ? "opacity-60 hover:opacity-100" : ""
                  } ${
                    isNext
                      ? "bg-(--color-f1)/8 ring-1 ring-inset ring-(--color-f1)/30"
                      : ""
                  }`}
                  // สนามที่จบแล้ว: แถบซ้ายเป็นสีทีมผู้ชนะ
                  style={winColor ? { boxShadow: `inset 3px 0 0 ${winColor}` } : undefined}
                >
                  <span
                    className={`w-6 text-right text-sm tabular-nums ${
                      isNext ? "font-bold text-(--color-f1)" : "text-white/40"
                    }`}
                  >
                    {r.round}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* ป้ายอยู่นอกส่วนที่ตัด … ไม่งั้นชื่อสนามยาว ๆ จะตัดป้ายเหลือแค่ก้อนสี */}
                    <p className="flex min-w-0 items-center gap-2 font-medium">
                      <span className="truncate">{r.raceName}</span>
                      {isNext && (
                        <span className="shrink-0 rounded-full bg-(--color-f1) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          ถัดไป
                        </span>
                      )}
                    </p>
                    {win && winColor ? (
                      <p className="flex items-center gap-1.5 truncate text-xs text-white/60">
                        <CheckeredFlag className="h-2.5 w-2.5 shrink-0" />
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: winColor }}
                        />
                        {win.Driver.givenName.charAt(0)}. {win.Driver.familyName}
                      </p>
                    ) : (
                      <p className="truncate text-xs text-white/50">
                        {r.Circuit.Location.locality}, {r.Circuit.Location.country}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-xs tabular-nums text-white/70">
                    <LocalTime
                      iso={d.toISOString()}
                      kind="date"
                      circuitId={r.Circuit.circuitId}
                    />
                    {/* จอแคบขึ้นบรรทัดใหม่ จอกว้างต่อท้ายไปเลย */}
                    <span className="block sm:ml-1.5 sm:inline">
                      <LocalTime
                        iso={d.toISOString()}
                        kind="time"
                        circuitId={r.Circuit.circuitId}
                      />{" "}
                      น.
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <SiteFooter source="jolpica" />
    </main>
  );
}
