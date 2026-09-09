import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import LocalTime from "@/components/tz/LocalTime";
import { getSeasonWinners, toDate } from "@/lib/f1";
import { getDriverImages } from "@/lib/drivers";
import { teamColor } from "@/lib/teams";
import { SEASON } from "@/lib/season";

export const metadata = { title: "ผลการแข่ง" };

export const revalidate = 600;


export default async function ResultsPage() {
  const races = await getSeasonWinners(SEASON);
  const winnerImages = await getDriverImages(
    races.flatMap((r) => (r.Results[0] ? [r.Results[0].Driver] : [])),
  );

  // สรุปฤดูกาลจากรายชื่อผู้ชนะ (ไม่ต้องยิง request เพิ่ม)
  const winCount = new Map<string, { name: string; n: number }>();
  for (const r of races) {
    const d = r.Results[0]?.Driver;
    if (!d) continue;
    const cur = winCount.get(d.driverId);
    winCount.set(d.driverId, {
      name: `${d.givenName.charAt(0)}. ${d.familyName}`,
      n: (cur?.n ?? 0) + 1,
    });
  }
  const topWinner = [...winCount.values()].sort((a, b) => b.n - a.n)[0];
  const firstWinnerId = races[0]?.Results[0]?.Driver.driverId;
  let streak = 0;
  for (const r of races) {
    if (r.Results[0]?.Driver.driverId === firstWinnerId) streak++;
    else break;
  }
  const winningTeams = new Set(
    races.flatMap((r) => (r.Results[0] ? [r.Results[0].Constructor.constructorId] : [])),
  ).size;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          ผลการแข่ง <span className="text-(--color-f1)">F1</span>
        </h1>
        <p className="text-sm text-white/50">
          ฤดูกาล {SEASON} · แข่งไปแล้ว {races.length} สนาม
        </p>
      </header>

      {races.length > 0 && (
        <section className="card grid grid-cols-3 divide-x divide-white/5 p-0 text-center">
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              {winCount.size}
            </p>
            <p className="text-xs text-white/40">ผู้ชนะไม่ซ้ำหน้า</p>
          </div>
          <div className="p-4">
            <p className="display truncate text-lg font-bold">
              {topWinner?.name ?? "—"}
            </p>
            <p className="text-xs text-white/40">
              ชนะมากสุด · {topWinner?.n ?? 0} ครั้ง
            </p>
          </div>
          <div className="p-4">
            {streak >= 2 ? (
              <>
                <p className="display text-2xl font-bold tabular-nums">
                  {streak}
                </p>
                <p className="text-xs text-white/40">ชนะติดต่อกันตอนนี้</p>
              </>
            ) : (
              <>
                <p className="display text-2xl font-bold tabular-nums">
                  {winningTeams}
                </p>
                <p className="text-xs text-white/40">ทีมที่เคยชนะ</p>
              </>
            )}
          </div>
        </section>
      )}

      {races.length === 0 ? (
        <p className="card p-6 text-white/60">ฤดูกาลนี้ยังไม่มีผลการแข่ง</p>
      ) : (
        <section className="card overflow-hidden p-0">
          <ul className="stagger divide-y divide-white/5">
            {races.map((r, i) => {
              const win = r.Results[0];
              const d = toDate({ date: r.date, time: r.time });
              const img = win ? winnerImages[win.Driver.driverId] : undefined;
              const c = win ? teamColor(win.Constructor.constructorId) : "#666";
              return (
                <li key={r.round} style={{ "--i": i } as React.CSSProperties}>
                  <Link
                    href={`/race/${r.round}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] sm:px-5"
                  >
                    <span className="w-6 text-right text-sm tabular-nums text-white/40">
                      {r.round}
                    </span>
                    {win && (
                      <span
                        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"
                        style={{
                          boxShadow: `0 0 0 1.5px ${c}`,
                          background: `color-mix(in srgb, ${c} 22%, transparent)`,
                        }}
                      >
                        {img && (
                          <Image
                            src={img}
                            alt=""
                            fill
                            sizes="32px"
                            className="object-cover object-top"
                          />
                        )}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.raceName}</p>
                      {win && (
                        <p className="flex items-center gap-1.5 truncate text-xs text-white/55">
                          <Trophy className="h-3 w-3 shrink-0 text-white/40" />
                          {win.Driver.givenName.charAt(0)}. {win.Driver.familyName}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                      {d && (
                        <LocalTime
                          iso={d.toISOString()}
                          kind="date"
                          circuitId={r.Circuit.circuitId}
                        />
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
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
