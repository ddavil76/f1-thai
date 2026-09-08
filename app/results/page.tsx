import Link from "next/link";
import { getSeasonWinners, thaiDateOnly, toDate } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

export const metadata = { title: "ผลการแข่ง" };

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function ResultsPage() {
  const races = await getSeasonWinners(SEASON);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          ผลการแข่ง <span className="text-[--color-f1]">F1</span>
        </h1>
        <p className="text-sm text-white/50">
          ฤดูกาล {SEASON} · แข่งไปแล้ว {races.length} สนาม
        </p>
      </header>

      {races.length === 0 ? (
        <p className="card p-6 text-white/60">ฤดูกาลนี้ยังไม่มีผลการแข่ง</p>
      ) : (
        <section className="card overflow-hidden p-0">
          <ul className="divide-y divide-white/5">
            {races.map((r) => {
              const win = r.Results[0];
              const d = toDate({ date: r.date, time: r.time });
              return (
                <li key={r.round}>
                  <Link
                    href={`/race/${r.round}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] sm:px-5"
                  >
                    <span className="w-6 text-right text-sm tabular-nums text-white/40">
                      {r.round}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.raceName}</p>
                      {win && (
                        <p className="flex items-center gap-1.5 truncate text-xs text-white/55">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              background: teamColor(win.Constructor.constructorId),
                            }}
                          />
                          🏆 {win.Driver.givenName.charAt(0)}. {win.Driver.familyName}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                      {d ? thaiDateOnly(d) : ""}
                    </span>
                    <span className="shrink-0 text-white/25">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
