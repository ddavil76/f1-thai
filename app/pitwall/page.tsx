import PitWallApp from "@/components/pitwall/PitWallApp";
import SiteFooter from "@/components/SiteFooter";
import SpeedStreak from "@/components/poster/SpeedStreak";

export const metadata = {
  title: "Pit Wall เกมคุมทีม",
  description: "เกมคุมทีมแข่งจากกำแพงพิท ตั้งค่ารถ ส่งรถออกควอลิฟาย สั่งเข้าพิท เลือกยาง แข่งกับทีม AI หรือเพื่อนออนไลน์",
};

export default function PitWallPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="poster text-sm text-(--color-f1-text)">MANAGER GAME</p>
        <h1 className="text-3xl font-black md:text-4xl">
          Pit <span className="text-(--color-f1)">Wall</span>
        </h1>
        <SpeedStreak className="pb-1 pt-1.5" />
        <p className="text-sm text-white/55">เกมคุมทีมจากกำแพงพิท · เล่นคนเดียวหรือกับเพื่อนออนไลน์ · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ</p>
      </header>

      <PitWallApp />

      <SiteFooter />
    </main>
  );
}
