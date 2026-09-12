import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDriverStandings, getDriverSeasonResults } from "@/lib/f1";
import { getDriverImage } from "@/lib/drivers";
import { teamColor } from "@/lib/teams";
import { flag } from "@/lib/flags";
import TeammateH2H from "@/components/TeammateH2H";
import CountUp from "@/components/CountUp";
import PuCard from "@/components/PuCard";
import { getPuUsage, findUsage } from "@/lib/power-units";
import { SEASON } from "@/lib/season";

export const revalidate = 600;


type Params = { params: Promise<{ id: string }> };

export const dynamicParams = true;

// render ตอนเข้าครั้งแรก (ไม่ prerender ทั้งหมดตอน build → กัน Jolpica rate-limit)
export function generateStaticParams() {
  return [];
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
  const [standings, results, pu] = await Promise.all([
    getDriverStandings(SEASON),
    getDriverSeasonResults(SEASON, id),
    getPuUsage(SEASON),
  ]);

  const standing = standings.find((s) => s.Driver.driverId === id);
  const driver = standing?.Driver ?? results[0]?.result.Driver;
  if (!driver) notFound();

  const team = standing?.Constructors.at(-1) ?? results.at(-1)?.result.Constructor;
  const color = teamColor(team?.constructorId);
  const photo = await getDriverImage(driver);

  // เพื่อนร่วมทีม (คนล่าสุดที่อยู่ทีมเดียวกัน)
  const mateStanding = team
    ? standings.find(
        (s) =>
          s.Driver.driverId !== id &&
          s.Constructors.at(-1)?.constructorId === team.constructorId,
      )
    : undefined;
  const mateResults = mateStanding
    ? await getDriverSeasonResults(SEASON, mateStanding.Driver.driverId)
    : [];
  const puRow = pu ? findUsage(pu, driver) : undefined;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/standings"
          className="inline-flex items-center gap-1 text-sm text-white/40 transition hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          ตารางคะแนน
        </Link>
        <div className="mt-2 flex items-center gap-4">
          {photo ? (
            <div
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full"
              style={{
                boxShadow: `0 0 0 2px ${color}`,
                background: `color-mix(in srgb, ${color} 22%, transparent)`,
              }}
            >
              <Image
                src={photo}
                alt={`${driver.givenName} ${driver.familyName}`}
                fill
                priority
                sizes="80px"
                className="object-cover object-top"
              />
            </div>
          ) : (
            <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          )}
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
            <p className="display text-2xl font-bold tabular-nums">
              <CountUp value={Number(standing.position)} prefix="P" />
            </p>
            <p className="text-xs text-white/40">อันดับ</p>
          </div>
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              <CountUp value={Number(standing.points)} />
            </p>
            <p className="text-xs text-white/40">แต้ม</p>
          </div>
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              <CountUp value={Number(standing.wins)} />
            </p>
            <p className="text-xs text-white/40">ชนะ</p>
          </div>
        </section>
      )}

      {mateStanding && mateResults.length > 0 && (
        <TeammateH2H
          teammateId={mateStanding.Driver.driverId}
          teammateName={`${mateStanding.Driver.givenName} ${mateStanding.Driver.familyName}`}
          self={results}
          mate={mateResults}
          selfPoints={Number(standing?.points ?? 0)}
          matePoints={Number(mateStanding.points)}
        />
      )}

      {pu && puRow && (
        <PuCard event={pu.event} rows={[{ key: puRow.number, used: puRow.used }]} />
      )}

      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
          ผลรายสนาม
        </h2>
        <ul className="stagger divide-y divide-white/5">
          {results.map((r, i) => {
            const pos = r.result.position;
            const grid = Number(r.result.grid);
            const finish = Number(pos);
            const delta = grid && finish ? grid - finish : 0;
            const dnf = r.result.status !== "Finished" && !r.result.status.startsWith("+");
            return (
              <li key={r.round} style={{ "--i": i } as React.CSSProperties}>
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
