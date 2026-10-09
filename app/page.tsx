import Link from "next/link";
import { ArrowRight, ChevronRight, PartyPopper, Zap } from "lucide-react";
import CircuitMap from "@/components/CircuitMap";
import Podium from "@/components/Podium";
import Standings from "@/components/Standings";
import WeatherBadge from "@/components/WeatherBadge";
import ReactionPromo from "@/components/ReactionPromo";
import WidgetPromo from "@/components/WidgetPromo";
import PitWallPromo from "@/components/PitWallPromo";
import ResultsPending from "@/components/ResultsPending";
import ResultsRefresher from "@/components/ResultsRefresher";
import LocalTime from "@/components/tz/LocalTime";
import SiteFooter from "@/components/SiteFooter";
import PosterCountdown from "@/components/poster/PosterCountdown";
import PosterHeading from "@/components/poster/PosterHeading";
import SpeedStreak from "@/components/poster/SpeedStreak";
import WeekendTimeline from "@/components/poster/WeekendTimeline";
import { circuitTrack } from "@/lib/circuits";
import {
  getSchedule, getLastResults, findNextRace, getUpcomingRaces, getSessionWindows,
  getCircuitImage, getDriverStandings, getConstructorStandings, isSprintWeekend, toDate, resultsGap, firstRaceWithoutResults, nowMs,
} from "@/lib/f1";
import { cardName, raceLaps } from "@/lib/widget-card";
import { getRaceWeather } from "@/lib/weather";
import { getDriverImages } from "@/lib/drivers";
import { SEASON } from "@/lib/season";

export const revalidate = 600;


export default async function Home() {
  const [races, lastRace, drivers, constructors] = await Promise.all([
    getSchedule(SEASON),
    getLastResults(SEASON),
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);
  const driverImages = await getDriverImages(drivers.slice(0, 5).map((d) => d.Driver));

  const next = findNextRace(races);
  const following = getUpcomingRaces(races, 4).slice(1); // 3 สนามถัดจากสนามหน้า
  const windows = next ? getSessionWindows(next) : [];
  const raceStart = next ? toDate({ date: next.date, time: next.time }) : null;
  const serverNow = nowMs();
  // ข้อมูลโปสเตอร์ของสนามถัดไป (ชุดเดียวกับการ์ด widget)
  const nextName = next ? cardName(next.Circuit.circuitId, next.Circuit.circuitName) : "";
  const track = next ? circuitTrack(next.Circuit.circuitId) : null;
  const laps = next && track ? raceLaps(next.Circuit.circuitId, track.length) : null;
  const chips = [
    track?.length ? `${(track.length / 1000).toFixed(3)} กม.` : null,
    laps ? `${laps} รอบ` : null,
    track?.firstGp ? `ตั้งแต่ ${track.firstGp}` : null,
  ].filter((c): c is string => !!c);
  const [circuitImg, weather] = next
    ? await Promise.all([getCircuitImage(next.Circuit), getRaceWeather(next)])
    : [null, null];

  // สนามถัดจากผลล่าสุดที่มี — ถ้าแข่งจบแล้วแต่ยังไม่มีผล ให้บอกและคอยอัปเดตหน้าเอง
  const lastRound = Number(lastRace?.round ?? 0);
  const pending = firstRaceWithoutResults(races, (r) => Number(r.round) <= lastRound);
  const pendingStart = pending ? toDate({ date: pending.date, time: pending.time }) : null;
  const pendingGap = pending ? resultsGap(pending) : null;

  return (
    <main className="mx-auto max-w-3xl lg:max-w-none">
      <h1 className="sr-only">
        F1 Week Race — สนามแข่ง F1 สนามถัดไป นับถอยหลัง ตารางคะแนน และปฏิทิน เวลาไทย
      </h1>
      <p className="poster mb-5 text-sm text-white/55">
        SEASON <span className="text-(--color-f1-text)">{SEASON}</span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* ---- คอลัมน์ซ้าย: การ์ดสนามถัดไป ----
             min-w-0: grid item ตั้งต้นเป็น min-width:auto ซึ่งหดต่ำกว่าขนาด
             ขั้นต่ำของตัวเองไม่ได้ พอจอแคบกว่า ~375px การ์ดเลยดันทะลุออกนอกจอ */}
        <div className="min-w-0 space-y-4">
          {next && raceStart ? (
            <section className="card card-poster p-5 ring-1 ring-inset ring-(--color-f1)/20 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 font-display text-[13px] font-semibold text-white/55">
                <span className="round-tag">R{next.round}</span>
                <span>
                  {next.season} · {next.Circuit.Location.country.toUpperCase()} ·{" "}
                  <span className="poster text-(--color-f1-text)">NEXT RACE</span>
                </span>
                {isSprintWeekend(next) && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-300 ring-1 ring-yellow-400/30">
                    <Zap className="h-3 w-3" fill="currentColor" />
                    Sprint
                  </span>
                )}
              </div>
              <div className="poster-fit mt-2">
                <h2
                  className="poster poster-name"
                  style={{ "--len": nextName.length } as React.CSSProperties}
                >
                  {nextName}
                </h2>
              </div>
              <SpeedStreak className="mt-3" />
              <p className="mt-3 font-display text-sm font-semibold text-white/60">
                {next.raceName} · {next.Circuit.Location.locality}
              </p>
              {chips.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-white/12 px-2.5 py-0.5 font-display text-[13px] font-semibold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* มือถือ: นับถอยหลังขึ้นก่อนฉาก 3D (ข้อมูลสำคัญสุดของหน้า) · จอกว้าง: ฉาก 3D ก่อน */}
              <div className="flex flex-col">
                <div className="order-2 lg:order-1">
                  <CircuitMap
                    src={circuitImg}
                    name={next.Circuit.circuitName}
                    circuitId={next.Circuit.circuitId}
                    where={{
                      season: Number(next.season),
                      country: next.Circuit.Location.country,
                      locality: next.Circuit.Location.locality,
                    }}
                  />
                </div>
                <div className="order-1 mt-5 lg:order-2">
                  <PosterCountdown
                    windows={windows}
                    serverNow={serverNow}
                    raceStart={raceStart.toISOString()}
                    circuitId={next.Circuit.circuitId}
                  />
                  <Link
                    href={`/race/${next.round}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-(--color-f1) px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 active:scale-[0.98]"
                  >
                    ดูรายละเอียดสนาม
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              {weather && (
                <div>
                  <WeatherBadge weather={weather} />
                </div>
              )}
            </section>
          ) : (
            <p className="card flex items-center gap-2 p-6 text-white/60">
              <PartyPopper className="h-5 w-5 shrink-0" />
              {races.length === 0
                ? `ปฏิทินฤดูกาล ${SEASON} ยังไม่ประกาศ`
                : "จบฤดูกาลแล้ว"}
            </p>
          )}

          {next && windows.length > 0 && (
            <section className="card card-poster p-5">
              <PosterHeading kicker="RACE WEEK" title="ตารางสุดสัปดาห์นี้" />
              <WeekendTimeline
                variant="cards"
                windows={windows}
                serverNow={serverNow}
                circuitId={next.Circuit.circuitId}
              />
            </section>
          )}

          <ReactionPromo />
          <WidgetPromo />
        </div>

        {/* ---- คอลัมน์ขวา: ตารางสุดสัปดาห์ / ผลล่าสุด / ถัดไป ---- */}
        <div className="min-w-0 space-y-6">
          {pendingStart && <ResultsRefresher startIso={pendingStart.toISOString()} />}
          {pending && pendingGap === "awaiting" && (
            <ResultsPending race={pending} status="awaiting" href={`/race/${pending.round}`} />
          )}
          {lastRace && <Podium race={lastRace} />}

          {drivers.length > 0 && (
            <Standings
              drivers={drivers}
              constructors={constructors}
              driverImages={driverImages}
              top={5}
              href="/standings"
            />
          )}

          <PitWallPromo />

          {following.length > 0 && (
            <section className="card card-poster p-5">
              <PosterHeading kicker="NEXT UP" title="ถัดไป" />
              <ul className="divide-y divide-white/8">
                {following.map((r) => {
                  const d = toDate({ date: r.date, time: r.time })!;
                  return (
                    <li key={r.round}>
                      <Link
                        href={`/race/${r.round}`}
                        className="flex items-center gap-3 rounded-lg py-2.5 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className="round-tag shrink-0">R{r.round}</span>
                        <div className="min-w-0 flex-1">
                          <p className="poster truncate text-xl leading-tight">
                            {cardName(r.Circuit.circuitId, r.Circuit.circuitName)}
                          </p>
                          <p className="flex items-center gap-1.5 truncate font-display text-xs font-semibold text-white/50">
                            {r.Circuit.Location.country.toUpperCase()}
                            {isSprintWeekend(r) && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-yellow-400 px-1 text-[10px] font-black text-black">
                                <Zap className="h-2.5 w-2.5" fill="currentColor" />
                                SPRINT
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/12 px-2.5 py-0.5 font-display text-xs font-semibold tabular-nums text-white/80">
                          <LocalTime
                            iso={d.toISOString()}
                            kind="date"
                            circuitId={r.Circuit.circuitId}
                          />
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/55" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      <SiteFooter source="jolpica" className="mt-8" />
    </main>
  );
}
