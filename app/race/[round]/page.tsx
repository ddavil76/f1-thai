import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Flag, PlayCircle, Zap } from "lucide-react";
import SessionCountdown from "@/components/SessionCountdown";
import CircuitMap from "@/components/CircuitMap";
import CircuitInfo from "@/components/CircuitInfo";
import CircuitHistory from "@/components/CircuitHistory";
import RacePitStops from "@/components/RacePitStops";
import SectionTabs from "@/components/SectionTabs";
import ReactionPromo from "@/components/ReactionPromo";
import ResultsPending from "@/components/ResultsPending";
import ResultsRefresher from "@/components/ResultsRefresher";
import ResultsTable from "@/components/ResultsTable";
import QualifyingTable from "@/components/QualifyingTable";
import PodiumGraphic from "@/components/PodiumGraphic";
import TiltCard from "@/components/TiltCard";
import WeatherBadge from "@/components/WeatherBadge";
import LocalTime from "@/components/tz/LocalTime";
import SiteFooter from "@/components/SiteFooter";
import CheckeredFlag from "@/components/CheckeredFlag";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  getSchedule, getRaceResults, getQualifying, getSprintResults, findNextRace,
  getCircuitImage, getSessions, isSprintWeekend, isPastRace, toDate, resultsGap,
  getPitStops, getCircuitWinners,
} from "@/lib/f1";
import { summarizeRacePits } from "@/lib/pitstops";
import { getRaceWeather } from "@/lib/weather";
import { SEASON } from "@/lib/season";
import { teamColor, teamName } from "@/lib/teams";

export const revalidate = 600;


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
  const [results, quali, sprint, circuitImg, weather, pitStops, circuitWinners] =
    await Promise.all([
      past ? getRaceResults(SEASON, round) : Promise.resolve(null),
      past ? getQualifying(SEASON, round) : Promise.resolve([]),
      past && isSprintWeekend(race) ? getSprintResults(SEASON, round) : Promise.resolve([]),
      getCircuitImage(race.Circuit),
      past ? Promise.resolve(null) : getRaceWeather(race),
      past ? getPitStops(SEASON, round) : Promise.resolve([]),
      getCircuitWinners(race.Circuit.circuitId),
    ]);
  const sessions = getSessions(race);
  const pits =
    results && pitStops.length > 0 ? summarizeRacePits(pitStops, results.Results) : null;
  const hasResults = Boolean(results && results.Results.length > 0);
  const gap = past && !hasResults ? resultsGap(race) : null;
  const winner = hasResults ? results!.Results[0] : null;
  const winnerColor = winner ? teamColor(winner.Constructor.constructorId) : null;

  const sessionsCard = sessions.length > 0 && (
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
  );

  return (
    <main
      className={`mx-auto space-y-6 ${past ? "max-w-3xl" : "max-w-3xl lg:max-w-5xl"}`}
    >
      {/* สนามที่แข่งจบแล้ว: แสงสีทีมผู้ชนะด้านหลังหัวหน้า — แต่ละสนามจึงดูไม่ซ้ำกัน */}
      <div
        className={winnerColor ? "winner-hero" : undefined}
        style={winnerColor ? ({ "--winner": winnerColor } as React.CSSProperties) : undefined}
      >
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
          {winner && winnerColor && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: `color-mix(in srgb, ${winnerColor} 70%, white)`,
                background: `color-mix(in srgb, ${winnerColor} 16%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${winnerColor} 40%, transparent)`,
              }}
            >
              <CheckeredFlag />
              {winner.Driver.familyName} · {teamName(winner.Constructor.constructorId, winner.Constructor.name)}
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

      {/* สนามที่ยังไม่แข่ง: ผังสนามสูงเกือบเต็มจอแรก ดันนับถอยหลังกับตารางลงไปใต้ fold
          บนจอกว้างจึงวางเป็น 2 คอลัมน์แบบหน้าแรก · min-w-0 เพราะ grid item ตั้งต้น
          เป็น min-width:auto แล้วจะไม่ยอมหดจนล้นจอแคบ */}
      {!past && (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          <div className="min-w-0 space-y-6">
            <CircuitMap
              src={circuitImg}
              name={race.Circuit.circuitName}
              circuitId={race.Circuit.circuitId}
              where={{
                season: Number(race.season),
                country: race.Circuit.Location.country,
                locality: race.Circuit.Location.locality,
              }}
            />

            {raceStart && (
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
                {weather && (
                  <div>
                    <WeatherBadge weather={weather} />
                  </div>
                )}
              </section>
            )}

            <ReactionPromo />
          </div>

          <div className="min-w-0 space-y-6">
            {sessionsCard}
            <CircuitInfo circuitId={race.Circuit.circuitId} />
            <CircuitHistory winners={circuitWinners} />
          </div>
        </div>
      )}

      {past && results && results.Results.length >= 3 && (
        <TiltCard className="card p-5">
          <PodiumGraphic top3={results.Results.slice(0, 3)} />
        </TiltCard>
      )}
      {past && SEASON >= 2023 && results && results.Results.length > 0 && (
        <Link
          href={`/race/${round}/replay`}
          className="card flex items-center gap-3 p-4 transition hover:border-white/20"
        >
          <PlayCircle className="h-5 w-5 shrink-0 text-(--color-f1)" />
          <span className="flex-1 text-sm font-semibold">
            ดูรีเพลย์ไทม์มิ่ง
            <span className="ml-2 font-normal text-white/45">
              ตำแหน่ง · ยาง · เวลาต่อรอบ แบบเล่นย้อนหลัง
            </span>
          </span>
          <ArrowLeft className="h-4 w-4 rotate-180 text-white/30" />
        </Link>
      )}
      {!hasResults && raceStart && <ResultsRefresher startIso={raceStart.toISOString()} />}
      {past &&
        !hasResults &&
        (gap ? (
          <ResultsPending race={race} status={gap} />
        ) : (
          quali.length === 0 && (
            <p className="card p-6 text-center text-sm text-white/50">
              ยังไม่มีผลการแข่งสำหรับสนามนี้
            </p>
          )
        ))}

      {past ? (
        <SectionTabs
          tabs={[
            ...(results && results.Results.length > 0
              ? [
                  {
                    key: "race",
                    label: "ผลการแข่ง",
                    content: (
                      <>
                        <ResultsTable results={results.Results} />
                        {sprint.length > 0 && (
                          <ResultsTable results={sprint} title="ผลสปรินต์" />
                        )}
                      </>
                    ),
                  },
                ]
              : []),
            ...(quali.length > 0
              ? [
                  {
                    key: "quali",
                    label: "ควอลิฟาย",
                    content: <QualifyingTable results={quali} />,
                  },
                ]
              : []),
            ...(sessions.length > 0
              ? [
                  {
                    key: "sessions",
                    label: "สุดสัปดาห์",
                    content: sessionsCard,
                  },
                ]
              : []),
            ...(pits
              ? [
                  {
                    key: "pits",
                    label: "พิทสต็อป",
                    content: <RacePitStops summary={pits} />,
                  },
                ]
              : []),
            {
              key: "circuit",
              label: "สนาม",
              content: (
                <>
                  <CircuitMap
                    src={circuitImg}
                    name={race.Circuit.circuitName}
                    circuitId={race.Circuit.circuitId}
                    where={{
                      season: Number(race.season),
                      country: race.Circuit.Location.country,
                      locality: race.Circuit.Location.locality,
                    }}
                    compact
                  />
                  <CircuitInfo circuitId={race.Circuit.circuitId} />
                  <CircuitHistory winners={circuitWinners} />
                </>
              ),
            },
          ]}
        />
      ) : null}

      <SiteFooter source="jolpica" />
    </main>
  );
}
