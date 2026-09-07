import { getSchedule, thaiDateOnly, thaiTimeOnly, toDate } from "@/lib/f1";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function CalendarPage() {
  const races = await getSchedule(SEASON);

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-black p-4 text-white md:p-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          ปฏิทิน <span className="text-red-600">F1</span> ทั้งฤดูกาล
        </h1>
        <p className="text-sm text-white/50">ฤดูกาล {SEASON} · เวลาทั้งหมดเป็น GMT+7</p>
      </header>

      <section className="rounded-2xl bg-neutral-900 p-5">
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
