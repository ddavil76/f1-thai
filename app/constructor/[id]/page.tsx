import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getConstructorStandings, getConstructorSeasonResults,
} from "@/lib/f1";
import { getDriverImages } from "@/lib/drivers";
import { teamColor } from "@/lib/teams";
import { flag } from "@/lib/flags";
import CountUp from "@/components/CountUp";
import PuCard from "@/components/PuCard";
import { getPuUsage, findUsage } from "@/lib/power-units";
import { SEASON } from "@/lib/season";

export const revalidate = 600;


type Params = { params: Promise<{ id: string }> };

export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const s = (await getConstructorStandings(SEASON).catch(() => [])).find(
    (x) => x.Constructor.constructorId === id,
  );
  if (!s) return {};
  return {
    title: s.Constructor.name,
    description: `ผลรายสนามและอันดับของ ${s.Constructor.name} — ฤดูกาล ${SEASON}`,
  };
}

export default async function ConstructorPage({ params }: Params) {
  const { id } = await params;
  const [standings, results, pu] = await Promise.all([
    getConstructorStandings(SEASON),
    getConstructorSeasonResults(SEASON, id),
    getPuUsage(SEASON),
  ]);

  const standing = standings.find((s) => s.Constructor.constructorId === id);
  const info = standing?.Constructor ?? results[0]?.results[0]?.Constructor;
  if (!info) notFound();

  const color = teamColor(id);

  // ไลน์อัพล่าสุด = นักแข่งจากผลสนามล่าสุด
  const lineup = Array.from(
    new Map(
      (results.at(-1)?.results ?? []).map((r) => [r.Driver.driverId, r.Driver]),
    ).values(),
  );
  const lineupImages = await getDriverImages(lineup);
  const puRows = pu
    ? lineup.flatMap((d) => {
        const r = findUsage(pu, d);
        return r
          ? [{
              key: r.number,
              name: `${d.givenName} ${d.familyName}`,
              href: `/driver/${d.driverId}`,
              used: r.used,
            }]
          : [];
      })
    : [];

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
        <div className="mt-2 flex items-center gap-3">
          <span
            className="h-10 w-1.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">
            {standing ? `${flag(standing.Constructor.nationality)} ` : ""}
            {info.name}
          </h1>
        </div>

        {lineup.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lineup.map((d) => (
              <Link
                key={d.driverId}
                href={`/driver/${d.driverId}`}
                className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm transition-colors hover:bg-white/10"
              >
                {lineupImages[d.driverId] ? (
                  <span
                    className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full"
                    style={{
                      boxShadow: `0 0 0 1.5px ${color}`,
                      background: `color-mix(in srgb, ${color} 22%, transparent)`,
                    }}
                  >
                    <Image
                      src={lineupImages[d.driverId]}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-cover object-top"
                    />
                  </span>
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                )}
                <span className="font-medium">
                  {d.givenName.charAt(0)}. {d.familyName}
                </span>
              </Link>
            ))}
          </div>
        )}
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

      {pu && puRows.length > 0 && <PuCard event={pu.event} rows={puRows} />}

      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
          ผลรายสนาม
        </h2>
        <ul className="stagger divide-y divide-white/5">
          {results.map((r, i) => (
            <li key={r.round} style={{ "--i": i } as React.CSSProperties}>
              <Link
                href={`/race/${r.round}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] sm:px-5"
              >
                <span className="w-6 text-right text-sm tabular-nums text-white/40">
                  {r.round}
                </span>
                <p className="min-w-0 flex-1 truncate font-medium">{r.raceName}</p>
                <div className="flex shrink-0 gap-2 text-sm tabular-nums">
                  {r.results.map((res) => {
                    const dnf =
                      res.status !== "Finished" && !res.status.startsWith("+");
                    return (
                      <span
                        key={res.Driver.driverId}
                        className={`flex items-center gap-1 ${
                          dnf ? "text-white/30" : ""
                        }`}
                        title={`${res.Driver.givenName} ${res.Driver.familyName}`}
                      >
                        <span className="text-xs text-white/40">
                          {res.Driver.code ?? res.Driver.familyName.slice(0, 3).toUpperCase()}
                        </span>
                        <span className="font-bold">
                          {dnf ? "DNF" : `P${res.position}`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
