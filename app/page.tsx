import Link from "next/link";
import { CalendarPlus, ChevronRight, Flag, PartyPopper, Zap } from "lucide-react";
import SessionCountdown from "@/components/SessionCountdown";
import CircuitMap from "@/components/CircuitMap";
import Podium from "@/components/Podium";
import WeatherBadge from "@/components/WeatherBadge";
import LocalTime from "@/components/tz/LocalTime";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  getSchedule, getLastResults, findNextRace, getUpcomingRaces, getSessions,
  getCircuitImage, isSprintWeekend, toDate,
} from "@/lib/f1";
import { getRaceWeather } from "@/lib/weather";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function Home() {
  const [races, lastRace] = await Promise.all([
    getSchedule(SEASON),
    getLastResults(SEASON),
  ]);

  const next = findNextRace(races);
  const following = getUpcomingRaces(races, 4).slice(1); // 3 สนามถัดจากสนามหน้า
  const sessions = next ? getSessions(next) : [];
  const raceStart = next ? toDate({ date: next.date, time: next.time }) : null;
  const [circuitImg, weather] = next
    ? await Promise.all([getCircuitImage(next.Circuit), getRaceWeather(next)])
    : [null, null];

  return (
    <main className="mx-auto max-w-3xl lg:max-w-none">
      <h1 className="sr-only">
        F1 Week Race — สนามแข่ง F1 สนามถัดไป นับถอยหลัง ตารางคะแนน และปฏิทิน เวลาไทย
      </h1>
      <p className="mb-5 text-sm text-white/40">ฤดูกาล {SEASON}</p>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* ---- คอลัมน์ซ้าย: การ์ดสนามถัดไป ---- */}
        <div>
          {next && raceStart ? (
            <section className="card p-5 ring-1 ring-inset ring-(--color-f1)/20 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-(--color-f1)">
                  Round {next.round} · สนามถัดไป
                </p>
                {isSprintWeekend(next) && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-300 ring-1 ring-yellow-400/30">
                    <Zap className="h-3 w-3" fill="currentColor" />
                    Sprint
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                {next.raceName}
              </h2>
              <p className="text-sm text-white/70">
                {next.Circuit.circuitName} · {next.Circuit.Location.locality},{" "}
                {next.Circuit.Location.country}
              </p>

              <CircuitMap
                src={circuitImg}
                name={next.Circuit.circuitName}
                circuitId={next.Circuit.circuitId}
              />

              <div className="mt-5">
                <SessionCountdown race={next} />
              </div>

              <p className="mt-4 flex items-center gap-1.5 text-sm text-white/80">
                <Flag className="h-4 w-4 shrink-0 text-white/50" />
                <span>
                  ออกสตาร์ท{" "}
                  <LocalTime
                    iso={raceStart.toISOString()}
                    kind="full"
                    circuitId={next.Circuit.circuitId}
                  />{" "}
                  น.
                </span>
              </p>

              <a
                href={googleCalendarUrl({
                  title: `F1: ${next.raceName}`,
                  start: raceStart,
                  location: next.Circuit.circuitName,
                })}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-95"
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
          ) : (
            <p className="card flex items-center gap-2 p-6 text-white/60">
              <PartyPopper className="h-5 w-5" />
              จบฤดูกาลแล้ว
            </p>
          )}
        </div>

        {/* ---- คอลัมน์ขวา: ตารางสุดสัปดาห์ / ผลล่าสุด / ถัดไป ---- */}
        <div className="space-y-6">
          {next && sessions.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-bold">ตารางสุดสัปดาห์นี้</h2>
              <ul className="divide-y divide-white/5">
                {sessions.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between py-2 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-right text-sm">
                      <span className="text-white/50">
                        <LocalTime
                          iso={s.at.toISOString()}
                          kind="date"
                          circuitId={next.Circuit.circuitId}
                        />
                      </span>{" "}
                      <span className="font-semibold tabular-nums">
                        <LocalTime
                          iso={s.at.toISOString()}
                          kind="time"
                          circuitId={next.Circuit.circuitId}
                        />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lastRace && <Podium race={lastRace} />}

          {following.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-bold">ถัดไป</h2>
              <ul className="divide-y divide-white/5">
                {following.map((r) => {
                  const d = toDate({ date: r.date, time: r.time })!;
                  return (
                    <li key={r.round}>
                      <Link
                        href={`/race/${r.round}`}
                        className="flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className="w-6 text-right text-sm tabular-nums text-white/40">
                          {r.round}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium">{r.raceName}</p>
                            {isSprintWeekend(r) && (
                              <Zap
                                className="h-3 w-3 shrink-0 text-yellow-300"
                                fill="currentColor"
                              />
                            )}
                          </div>
                          <p className="truncate text-xs text-white/50">
                            {r.Circuit.Location.locality}, {r.Circuit.Location.country}
                          </p>
                        </div>
                        <span className="shrink-0 text-right text-xs tabular-nums text-white/70">
                          <LocalTime
                            iso={d.toISOString()}
                            kind="date"
                            circuitId={r.Circuit.circuitId}
                          />
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
