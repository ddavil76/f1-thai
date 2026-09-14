import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";
import RefreshOnMissing from "@/components/RefreshOnMissing";
import SectionTabs from "@/components/SectionTabs";
import SiteFooter from "@/components/SiteFooter";
import { getPitStops, getSeasonResults } from "@/lib/f1";
import { fmtSec, seasonPitRanking, summarizeRacePits } from "@/lib/pitstops";
import { teamColor, teamName } from "@/lib/teams";
import { SEASON } from "@/lib/season";

export const metadata: Metadata = {
  title: "พิทสต็อป",
  description: `ทีม F1 ไหนเข้าพิทเร็วสุดในฤดูกาล ${SEASON} — อันดับเฉลี่ยรายสนาม และพิทที่เร็วที่สุดของแต่ละสนาม`,
};

export default async function PitStopsPage() {
  // ไม่ prerender ตอน build: หน้านี้ยิงพิทสต็อปทีละสนาม (endpoint ที่ Jolpica จำกัดหนักสุด)
  // ตอน build โดน 429 จนได้ข้อมูลไม่ครบแล้วค้างใน HTML — render ตอนมีคนเข้าแทน
  // fetch ข้างในยังแคชตาม revalidate ของตัวเอง ไม่ได้ยิง Jolpica ทุกครั้งที่มีคนเปิด
  await connection();
  const seasonResults = (await getSeasonResults(SEASON)).sort(
    (a, b) => Number(a.round) - Number(b.round),
  );
  // gate ของ Jolpica จำกัดให้ยิงทีละ 4 อยู่แล้ว
  const pitStops = await Promise.all(seasonResults.map((r) => getPitStops(SEASON, r.round)));
  const races = seasonResults.flatMap((r, i) => {
    const summary = summarizeRacePits(pitStops[i], r.Results);
    return summary ? [{ round: r.round, raceName: r.raceName, summary }] : [];
  });
  // สนามที่มีผลแล้วแต่ไม่มีพิทเลย = ดึงไม่สำเร็จ (Jolpica จำกัด endpoint นี้หนัก) ไม่ใช่ไม่มีพิท
  const missing = seasonResults.length - races.length;
  const { teams, fastest } = seasonPitRanking(races);

  const header = (
    <header className="space-y-1">
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">
        พิท<span className="text-(--color-f1)">สต็อป</span>
      </h1>
      <p className="text-sm text-white/50">
        ฤดูกาล {SEASON}
        {races.length > 0 && ` · ${races.length} สนาม`}
      </p>
    </header>
  );

  if (teams.length === 0) {
    return (
      <main className="mx-auto max-w-3xl space-y-6">
        {header}
        <p className="card p-6 text-center text-sm text-white/50">ยังไม่มีข้อมูลพิทสต็อปของฤดูกาลนี้</p>
        <SiteFooter source="jolpica" />
      </main>
    );
  }

  const mostWins = [...teams].sort((a, b) => b.raceWins - a.raceWins)[0];
  const totalStops = teams.reduce((n, t) => n + t.stops, 0);

  const ranking = (
    <section className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        {/* จอมือถือซ่อนคอลัมน์ "เร็วสุดของสนาม" (ทีมที่เร็วสุดบ่อยสุดมีในการ์ดด้านบนแล้ว) */}
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-white/5 text-[11px] text-white/40">
              <th className="px-4 py-3 text-left font-medium sm:px-5">ทีม</th>
              <th className="px-2 py-3 text-right font-medium">อันดับเฉลี่ย</th>
              <th className="hidden px-2 py-3 text-right font-medium sm:table-cell">
                เร็วสุดของสนาม
              </th>
              <th className="px-4 py-3 text-right font-medium sm:px-5">พิทเร็วสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {teams.map((t, i) => (
              <tr key={t.constructorId}>
                <td className="px-4 py-2.5 sm:px-5">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="w-4 text-right text-white/40">{i + 1}</span>
                    <span
                      className="h-3.5 w-1 shrink-0 rounded-full"
                      style={{ background: teamColor(t.constructorId) }}
                    />
                    <span className="font-medium">{teamName(t.constructorId, t.team)}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-semibold">{t.avgRank.toFixed(1)}</td>
                <td className="hidden px-2 py-2.5 text-right text-white/70 sm:table-cell">
                  {t.raceWins > 0 ? `${t.raceWins} สนาม` : "–"}
                </td>
                <td className="px-4 py-2.5 text-right sm:px-5">
                  {fmtSec(t.best.seconds)}
                  <span className="ml-1 hidden text-xs text-white/40 sm:inline">R{t.best.round}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const perRace = (
    <section className="card overflow-hidden p-0">
      <ul className="divide-y divide-white/5">
        {[...fastest].reverse().map((f) => (
          <li key={f.round}>
            <Link
              href={`/race/${f.round}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.04] sm:px-5"
            >
              <span className="w-6 shrink-0 text-right tabular-nums text-white/40">{f.round}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.raceName}</span>
                <span className="flex items-center gap-1.5 truncate text-xs text-white/50">
                  <span
                    className="h-2.5 w-1 shrink-0 rounded-full"
                    style={{ background: teamColor(f.stop.constructorId) }}
                  />
                  {f.stop.driver} · {teamName(f.stop.constructorId, f.stop.team)}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">
                {fmtSec(f.stop.seconds)}
                <span className="ml-0.5 text-xs font-normal text-white/40">วิ</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {header}

      <section className="card grid grid-cols-3 divide-x divide-white/5 p-0 text-center">
        <div className="min-w-0 p-4">
          <p className="display line-clamp-2 text-base font-bold leading-tight sm:text-lg">
            {teamName(teams[0].constructorId, teams[0].team)}
          </p>
          <p className="text-xs text-white/40">อันดับเฉลี่ยดีสุด</p>
        </div>
        <div className="min-w-0 p-4">
          <p className="display line-clamp-2 text-base font-bold leading-tight sm:text-lg">
            {teamName(mostWins.constructorId, mostWins.team)}
          </p>
          <p className="text-xs text-white/40">เร็วสุดของสนาม {mostWins.raceWins} ครั้ง</p>
        </div>
        <div className="p-4">
          <p className="display text-2xl font-bold tabular-nums">{totalStops}</p>
          <p className="text-xs text-white/40">พิทที่นับ</p>
        </div>
      </section>

      {missing > 0 && (
        <>
          <RefreshOnMissing />
          <p className="card px-4 py-3 text-sm text-amber-300/90">
            ยังโหลดข้อมูลพิทไม่ครบ {missing} สนาม อันดับด้านล่างจึงยังไม่นับสนามเหล่านั้น
            หน้านี้จะลองโหลดใหม่เอง
          </p>
        </>
      )}

      <p className="text-sm text-white/55">
        เวลาคือช่วงที่อยู่ในพิทเลนตั้งแต่เข้าจนออก ไม่ใช่เวลาจอดเปลี่ยนยาง 2 วินาทีที่เห็นในทีวี
        พิทเลนแต่ละสนามยาวไม่เท่ากัน จึงจัดอันดับจากอันดับเฉลี่ยต่อสนาม (1 = เร็วสุดของสนามนั้น)
        และตัดพิทที่ช้าผิดปกติ เช่นจอดรอช่วงธงแดง ออกก่อน
      </p>

      <SectionTabs
        tabs={[
          { key: "ranking", label: "อันดับทีม", content: ranking },
          { key: "races", label: "เร็วสุดแต่ละสนาม", content: perRace },
        ]}
      />

      <SiteFooter source="jolpica" />
    </main>
  );
}
