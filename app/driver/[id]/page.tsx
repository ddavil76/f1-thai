import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDriverStandings, getDriverSeasonResults } from "@/lib/f1";
import { teamColor } from "@/lib/teams";
import { flag } from "@/lib/flags";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

type Params = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const drivers = await getDriverStandings(SEASON).catch(() => []);
  return drivers.map((s) => ({ id: s.Driver.driverId }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const s = (await getDriverStandings(SEASON).catch(() => [])).find(
    (x) => x.Driver.driverId === id,
  );
  if (!s) return {};
  const name = `${s.Driver.givenName} ${s.Driver.familyName}`;
  return {
    title: name,
    description: `ผลรายสนามและอันดับของ ${name} — ฤดูกาล ${SEASON}`,
  };
}

export default async function DriverPage({ params }: Params) {
  const { id } = await params;
  const [standings, results] = await Promise.all([
    getDriverStandings(SEASON),
    getDriverSeasonResults(SEASON, id),
  ]);

  const standing = standings.find((s) => s.Driver.driverId === id);
  const driver = standing?.Driver ?? results[0]?.result.Driver;
  if (!driver) notFound();

  const team = standing?.Constructors.at(-1) ?? results.at(-1)?.result.Constructor;
  const color = teamColor(team?.constructorId);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/standings"
          className="text-sm text-white/40 transition hover:text-white/70"
        >
          ← ตารางคะแนน
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">
              {flag(driver.nationality)} {driver.givenName}{" "}
              <span className="uppercase">{driver.familyName}</span>
            </h1>
            <p className="text-sm text-white/60">
              {driver.permanentNumber ? `#${driver.permanentNumber} · ` : ""}
              {team?.name}
            </p>
          </div>
        </div>
      </div>

      {standing && (
        <section className="card grid grid-cols-3 divide-x divide-white/5 p-0 text-center">
          <div className="p-4">
            <p className="text-2xl font-black tabular-nums">P{standing.position}</p>
            <p className="text-xs text-white/40">อันดับ</p>
          </div>
          <div className="p-4">
            <p className="text-2xl font-black tabular-nums">{standing.points}</p>
            <p className="text-xs text-white/40">แต้ม</p>
          </div>
          <div className="p-4">
            <p className="text-2xl font-black tabular-nums">{standing.wins}</p>
            <p className="text-xs text-white/40">ชนะ</p>
          </div>
        </section>
      )}

      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
          ผลรายสนาม
        </h2>
        <ul className="divide-y divide-white/5">
          {results.map((r) => {
            const pos = r.result.position;
            const grid = Number(r.result.grid);
            const finish = Number(pos);
            const delta = grid && finish ? grid - finish : 0;
            const dnf = r.result.status !== "Finished" && !r.result.status.startsWith("+");
            return (
              <li key={r.round}>
                <Link
                  href={`/race/${r.round}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] sm:px-5"
                >
                  <span className="w-6 text-right text-sm tabular-nums text-white/40">
                    {r.round}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.raceName}</p>
                    <p className="truncate text-xs text-white/50">
                      ออกตัว P{r.result.grid}
                      {delta !== 0 && !dnf && (
                        <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                          {" "}
                          ({delta > 0 ? "+" : ""}
                          {delta})
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                    {r.result.points !== "0" ? `+${r.result.points}` : ""}
                  </span>
                  <span
                    className={`w-12 shrink-0 text-right font-bold tabular-nums ${
                      dnf ? "text-white/30" : ""
                    }`}
                  >
                    {dnf ? "DNF" : `P${pos}`}
                  </span>
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
