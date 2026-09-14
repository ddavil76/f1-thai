import Link from "next/link";
import { fmtSec, type RacePitSummary } from "@/lib/pitstops";
import { teamColor, teamName } from "@/lib/teams";

/** พิทสต็อปของสนามเดียว — 5 ครั้งที่เร็วสุด + สรุปรายทีม */
export default function RacePitStops({ summary }: { summary: RacePitSummary }) {
  return (
    <>
      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">พิทเร็วสุด</h2>
        <ol className="divide-y divide-white/5">
          {summary.stops.slice(0, 5).map((s, i) => (
            <li
              key={`${s.driverId}-${s.stop}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5"
            >
              <span className="w-5 shrink-0 text-right tabular-nums text-white/40">{i + 1}</span>
              <span
                className="h-4 w-1 shrink-0 rounded-full"
                style={{ background: teamColor(s.constructorId) }}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{s.driver}</span>
                <span className="ml-2 text-xs text-white/40">
                  {teamName(s.constructorId, s.team)} · รอบ {s.lap}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">
                {fmtSec(s.seconds)}
                <span className="ml-0.5 text-xs font-normal text-white/40">วิ</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card overflow-hidden p-0">
        <h2 className="border-b border-white/5 px-5 py-4 text-lg font-bold">แยกตามทีม</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-white/5 text-[11px] text-white/40">
                <th className="px-4 py-2.5 text-left font-medium sm:px-5">ทีม</th>
                <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">จำนวน</th>
                <th className="px-2 py-2.5 text-right font-medium">เร็วสุด</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">ค่ากลาง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summary.teams.map((t) => (
                <tr key={t.constructorId}>
                  <td className="px-4 py-2.5 sm:px-5">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span
                        className="h-3.5 w-1 shrink-0 rounded-full"
                        style={{ background: teamColor(t.constructorId) }}
                      />
                      {teamName(t.constructorId, t.team)}
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right text-white/60 sm:table-cell">
                    {t.stops}
                  </td>
                  <td className="px-2 py-2.5 text-right">{fmtSec(t.best)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold sm:px-5">
                    {fmtSec(t.median)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-1 text-xs text-white/40">
        เวลาในพิทเลนตั้งแต่เข้าจนออก ไม่ใช่เวลาจอดเปลี่ยนยาง
        {summary.excluded > 0 &&
          ` · ตัด ${summary.excluded} ครั้งที่ช้าผิดปกติออก เช่นจอดรอช่วงธงแดง`}
        {" · "}
        <Link href="/pitstops" className="text-white/60 underline-offset-2 hover:underline">
          ดูทั้งฤดูกาล
        </Link>
      </p>
    </>
  );
}
