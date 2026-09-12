import Link from "next/link";
import { ChevronRight, Cog } from "lucide-react";
import Standings from "@/components/Standings";
import ChampionshipChart from "@/components/ChampionshipChart";
import SeasonStats from "@/components/SeasonStats";
import TitleRace from "@/components/TitleRace";
import SectionTabs from "@/components/SectionTabs";
import {
  getDriverStandings, getConstructorStandings, getChampionshipProgression,
  getPoleLeader, getFastestLapLeader, getSchedule, isPastRace, isSprintWeekend,
} from "@/lib/f1";
import { getDriverImages } from "@/lib/drivers";
import { SEASON } from "@/lib/season";

export const metadata = { title: "ตารางคะแนน" };

export const revalidate = 600;


export default async function StandingsPage() {
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);
  const [progression, poles, fastestLaps, driverImages, schedule] =
    await Promise.all([
      getChampionshipProgression(SEASON, drivers),
      getPoleLeader(SEASON),
      getFastestLapLeader(SEASON),
      getDriverImages(drivers.map((d) => d.Driver)),
      getSchedule(SEASON).catch(() => []),
    ]);

  const upcoming = schedule.filter((r) => !isPastRace(r));
  const racesLeft = upcoming.length;
  const sprintsLeft = upcoming.filter(isSprintWeekend).length;

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

      <SectionTabs
        tabs={[
          {
            key: "table",
            label: "ตารางคะแนน",
            content: (
              <Standings
                drivers={drivers}
                constructors={constructors}
                driverImages={driverImages}
              />
            ),
          },
          {
            key: "title",
            label: "ลุ้นแชมป์",
            content: (
              <TitleRace
                drivers={drivers}
                racesLeft={racesLeft}
                sprintsLeft={sprintsLeft}
              />
            ),
          },
          {
            key: "chart",
            label: "กราฟแต้มสะสม",
            content: (
              <ChampionshipChart
                rounds={progression.rounds}
                series={progression.series}
              />
            ),
          },
        ]}
      />

      <Link
        href="/power-units"
        className="card flex items-center gap-3 p-4 transition hover:border-white/20"
      >
        <Cog className="h-5 w-5 shrink-0 text-(--color-f1)" />
        <span className="flex-1 text-sm font-semibold">
          ชิ้นส่วนเครื่องยนต์
          <span className="ml-2 font-normal text-white/45">
            ใครใช้เครื่องยนต์เกินโควตาแล้วบ้าง
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
      </Link>

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
