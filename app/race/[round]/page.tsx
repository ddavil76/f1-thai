import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Flag, Zap } from "lucide-react";
import SessionCountdown from "@/components/SessionCountdown";
import CircuitMap from "@/components/CircuitMap";
import ResultsTable from "@/components/ResultsTable";
import QualifyingTable from "@/components/QualifyingTable";
import LocalTime from "@/components/tz/LocalTime";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  getSchedule, getRaceResults, getQualifying, getSprintResults, findNextRace,
  getCircuitImage, getSessions, isSprintWeekend, isPastRace, toDate,
} from "@/lib/f1";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

type Params = { params: Promise<{ round: string }> };

export const dynamicParams = true;

/** prerender เฉพาะสนามรอบ ๆ ปัจจุบัน — ที่เหลือ render ตอนเข้าครั้งแรก
 *  (กันไม่ให้ build ยิง Jolpica ทีเดียวเป็นร้อย request) */
export async function generateStaticParams() {
  const races = await getSchedule(SEASON).catch(() => []);
  const nextRound = Number(findNextRace(races)?.round ?? races.length);
  return races
    .filter((r) => Math.abs(Number(r.round) - nextRound) <= 2)
    .map((r) => ({ round: r.round }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { round } = await params;
  const race = (await getSchedule(SEASON).catch(() => [])).find(
    (r) => r.round === round,
  );
  if (!race) return {};
  return {
    title: `${race.raceName} · Round ${race.round}`,
    description: `ตารางสุดสัปดาห์ ผังสนาม และผลการแข่ง — ${race.raceName} (${race.Circuit.circuitName})`,
  };
}

export default async function RacePage({ params }: Params) {
  const { round } = await params;
  const races = await getSchedule(SEASON);
  const race = races.find((r) => r.round === round);
  if (!race) notFound();

  const past = isPastRace(race);
  const raceStart = toDate({ date: race.date, time: race.time });
  const [results, quali, sprint, circuitImg] = await Promise.all([
    past ? getRaceResults(SEASON, round) : Promise.resolve(null),
    past ? getQualifying(SEASON, round) : Promise.resolve([]),
    past && isSprintWeekend(race) ? getSprintResults(SEASON, round) : Promise.resolve([]),
    getCircuitImage(race.Circuit),
  ]);
  const sessions = getSessions(race);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-sm text-white/40 transition hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          ปฏิทินทั้งฤดูกาล
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Round {race.round}
          </p>
          {isSprintWeekend(race) && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-300 ring-1 ring-yellow-400/30">
              <Zap className="h-3 w-3" fill="currentColor" />
              Sprint
            </span>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">
          {race.raceName}
        </h1>
        <p className="text-sm text-white/60">
          {race.Circuit.circuitName} · {race.Circuit.Location.locality},{" "}
          {race.Circuit.Location.country}
        </p>
      </div>

      <CircuitMap src={circuitImg} name={race.Circuit.circuitName} />

      {!past && raceStart && (
        <section className="card p-5">
          <SessionCountdown race={race} />
          <p className="mt-4 flex items-center gap-1.5 text-sm text-white/80">
            <Flag className="h-4 w-4 shrink-0 text-white/50" />
            <span>
              ออกสตาร์ท{" "}
              <LocalTime
                iso={raceStart.toISOString()}
                kind="full"
                circuitId={race.Circuit.circuitId}
              />{" "}
              น.
            </span>
          </p>
          <a
            href={googleCalendarUrl({
              title: `F1: ${race.raceName}`,
              start: raceStart,
              location: race.Circuit.circuitName,
            })}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-95"
          >
            <CalendarPlus className="h-4 w-4" />
            เพิ่มลง Google Calendar
          </a>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">ตารางสุดสัปดาห์</h2>
          <ul className="divide-y divide-white/5">
            {sessions.map((s) => (
              <li key={s.label} className="flex items-center justify-between py-2">
                <span className="font-medium">{s.label}</span>
                <span className="text-right text-sm">
                  <span className="text-white/50">
                    <LocalTime
                      iso={s.at.toISOString()}
                      kind="date"
                      circuitId={race.Circuit.circuitId}
                    />
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    <LocalTime
                      iso={s.at.toISOString()}
                      kind="time"
                      circuitId={race.Circuit.circuitId}
                    />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {past && results && results.Results.length > 0 && (
        <ResultsTable results={results.Results} />
      )}
      {past && sprint.length > 0 && (
        <ResultsTable results={sprint} title="ผลสปรินต์" />
      )}
      {past && quali.length > 0 && <QualifyingTable results={quali} />}
      {past &&
        (!results || results.Results.length === 0) &&
        quali.length === 0 && (
          <p className="card p-6 text-center text-sm text-white/50">
            ยังไม่มีผลการแข่งสำหรับสนามนี้
          </p>
        )}

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
