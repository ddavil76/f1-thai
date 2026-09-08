import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getConstructorStandings, getConstructorSeasonResults,
} from "@/lib/f1";
import { teamColor } from "@/lib/teams";
import { flag } from "@/lib/flags";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

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
  const [standings, results] = await Promise.all([
    getConstructorStandings(SEASON),
    getConstructorSeasonResults(SEASON, id),
  ]);

  const standing = standings.find((s) => s.Constructor.constructorId === id);
  const info = standing?.Constructor ?? results[0]?.results[0]?.Constructor;
  if (!info) notFound();

  const color = teamColor(id);

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
      </div>

      {standing && (
        <section className="card grid grid-cols-3 divide-x divide-white/5 p-0 text-center">
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              P{standing.position}
            </p>
            <p className="text-xs text-white/40">อันดับ</p>
          </div>
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              {standing.points}
            </p>
            <p className="text-xs text-white/40">แต้ม</p>
          </div>
          <div className="p-4">
            <p className="display text-2xl font-bold tabular-nums">
              {standing.wins}
            </p>
            <p className="text-xs text-white/40">ชนะ</p>
          </div>
        </section>
      )}

      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">
          ผลรายสนาม
        </h2>
        <ul className="divide-y divide-white/5">
          {results.map((r) => (
            <li key={r.round}>
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
