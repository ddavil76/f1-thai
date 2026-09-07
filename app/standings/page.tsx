import Standings from "@/components/Standings";
import { getDriverStandings, getConstructorStandings } from "@/lib/f1";

export const revalidate = 600;

const SEASON = new Date().getFullYear();

export default async function StandingsPage() {
  const [drivers, constructors] = await Promise.all([
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-black p-4 text-white md:p-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          ตารางคะแนน <span className="text-red-600">F1</span>
        </h1>
        <p className="text-sm text-white/50">ฤดูกาล {SEASON}</p>
      </header>

      <Standings drivers={drivers} constructors={constructors} />

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก Jolpica-F1 API · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
