import PitWallApp from "@/components/pitwall/PitWallApp";
import SiteFooter from "@/components/SiteFooter";
import SpeedStreak from "@/components/poster/SpeedStreak";

export const metadata = {
  title: "Pit Wall เกมแข่งรถ",
  description: "เกมแข่งรถ 2 โหมด: หัวหน้าทีมคุมรถจากกำแพงพิท ดูการแข่งแบบ 3D · นักขับขับเองแบบ 3D · เล่นคนเดียวหรือกับเพื่อนออนไลน์",
};

export default function PitWallPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="poster text-sm text-(--color-f1-text)">RACE GAME</p>
        <h1 className="text-3xl font-black md:text-4xl">
          Pit <span className="text-(--color-f1)">Wall</span>
        </h1>
        <SpeedStreak className="pb-1 pt-1.5" />
        <p className="text-sm text-white/55">เกมแข่งรถ 2 โหมด: หัวหน้าทีม หรือนักขับ · เล่นคนเดียวหรือกับเพื่อนออนไลน์ · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ</p>
      </header>

      <PitWallApp />

      <SiteFooter />
    </main>
  );
}
