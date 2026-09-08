import Standings from "@/components/Standings";
import ChampionshipChart from "@/components/ChampionshipChart";
import SeasonStats from "@/components/SeasonStats";
import {
  getDriverStandings, getConstructorStandings, getChampionshipProgression,
  getPoleLeader, getFastestLapLeader,
} from "@/lib/f1";

export const metadata = { title: "ตารางคะแนน" };

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function StandingsPage() {
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);
  const [progression, poles, fastestLaps] = await Promise.all([
    getChampionshipProgression(SEASON, drivers),
    getPoleLeader(SEASON),
    getFastestLapLeader(SEASON),
  ]);

  const winsLeader = [...drivers]
    .filter((d) => Number(d.wins) > 0)
    .sort((a, b) => Number(b.wins) - Number(a.wins))[0];
  const wins = winsLeader
    ? {
        driverId: winsLeader.Driver.driverId,
        name: `${winsLeader.Driver.givenName.charAt(0)}. ${winsLeader.Driver.familyName}`,
        constructorId: winsLeader.Constructors.at(-1)?.constructorId ?? "",
        count: Number(winsLeader.wins),
      }
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          ตารางคะแนน <span className="text-(--color-f1)">F1</span>
        </h1>
        <p className="text-sm text-white/50">ฤดูกาล {SEASON}</p>
      </header>

      <SeasonStats wins={wins} poles={poles} fastestLaps={fastestLaps} />

      <ChampionshipChart
        rounds={progression.rounds}
        series={progression.series}
      />

      <Standings drivers={drivers} constructors={constructors} />

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
