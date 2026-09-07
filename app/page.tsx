import Countdown from "@/components/Countdown";
import Standings from "@/components/Standings";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  getSchedule, getDriverStandings, getConstructorStandings,
  findNextRace, getSessions, thaiFull, thaiTimeOnly, thaiDateOnly, toDate,
} from "@/lib/f1";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function Home() {
  const [races, drivers, constructors] = await Promise.all([
    getSchedule(SEASON),
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);

  const next = findNextRace(races);
  const sessions = next ? getSessions(next) : [];
  const raceStart = next ? toDate({ date: next.date, time: next.time }) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-black p-4 text-white md:p-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          <span className="text-red-600">F1</span> เวลาไทย
        </h1>
        <p className="text-sm text-white/50">ฤดูกาล {SEASON} · เวลาทั้งหมดเป็น GMT+7</p>
      </header>

      {/* ---- การ์ดสนามถัดไป ---- */}
      {next && raceStart ? (
        <section className="rounded-2xl bg-gradient-to-br from-red-700 to-neutral-900 p-6">
          <p className="text-xs uppercase tracking-widest text-white/60">
            Round {next.round} · สนามถัดไป
          </p>
          <h2 className="mt-1 text-2xl font-bold">{next.raceName}</h2>
          <p className="text-sm text-white/70">
            {next.Circuit.circuitName} · {next.Circuit.Location.locality},{" "}
            {next.Circuit.Location.country}
          </p>

          <div className="mt-5">
            <Countdown target={raceStart.toISOString()} />
          </div>

          <p className="mt-4 text-sm text-white/80">🏁 ออกสตาร์ท {thaiFull(raceStart)} น.</p>

          <a
            href={googleCalendarUrl({
              title: `F1: ${next.raceName}`,
              start: raceStart,
              location: next.Circuit.circuitName,
            })}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/85"
          >
            📅 เพิ่มลง Google Calendar
          </a>
        </section>
      ) : (
        <p className="rounded-2xl bg-neutral-900 p-6 text-white/60">จบฤดูกาลแล้ว 🎉</p>
      )}

      {/* ---- ตาราง session สุดสัปดาห์นี้ ---- */}
      {sessions.length > 0 && (
        <section className="rounded-2xl bg-neutral-900 p-5">
          <h2 className="mb-3 text-lg font-bold">ตารางสุดสัปดาห์นี้</h2>
          <ul className="divide-y divide-white/5">
            {sessions.map((s) => (
              <li key={s.label} className="flex items-center justify-between py-2.5">
                <span className="font-medium">{s.label}</span>
                <span className="text-right text-sm">
                  <span className="text-white/50">{thaiDateOnly(s.at)}</span>{" "}
                  <span className="font-semibold tabular-nums">{thaiTimeOnly(s.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Standings ---- */}
      <Standings drivers={drivers} constructors={constructors} />

      {/* ---- ปฏิทินทั้งฤดูกาล ---- */}
      <section className="rounded-2xl bg-neutral-900 p-5">
        <h2 className="mb-3 text-lg font-bold">ปฏิทินทั้งฤดูกาล</h2>
        <ul className="divide-y divide-white/5">
          {races.map((r) => {
            const d = toDate({ date: r.date, time: r.time })!;
            const past = d.getTime() < Date.now();
            return (
              <li
                key={r.round}
                className={`flex items-center gap-3 py-2.5 ${past ? "opacity-40" : ""}`}
              >
                <span className="w-6 text-right text-sm text-white/40">{r.round}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.raceName}</p>
                  <p className="truncate text-xs text-white/50">
                    {r.Circuit.Location.locality}, {r.Circuit.Location.country}
                  </p>
                </div>
                <span className="text-right text-xs tabular-nums text-white/70">
                  {thaiDateOnly(d)}
                  <br />
                  {thaiTimeOnly(d)} น.
                </span>
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