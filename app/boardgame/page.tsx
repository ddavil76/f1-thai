import { notFound } from "next/navigation";
import BoardGame from "@/components/boardgame/BoardGame";
import SiteFooter from "@/components/SiteFooter";
import SpeedStreak from "@/components/poster/SpeedStreak";
import { buildBoard } from "@/lib/boardgame/board";

export const metadata = {
  title: "Grand Prix Tour เกมกระดาน",
  description:
    "เกมการ์ดแข่งรอบสนามจริง เลือกไพ่เดิน จัดการยางและ ERS แซงด้วยสลิปสตรีมกับ DRS แข่งกับรถ AI",
};

export default function BoardGamePage() {
  const board = buildBoard("spa", "สปา-ฟรังโคชองส์");
  if (!board) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="poster text-sm text-(--color-f1-text)">BOARD GAME</p>
        <h1 className="text-3xl font-black md:text-4xl">
          Grand Prix <span className="text-(--color-f1)">Tour</span>
        </h1>
        <SpeedStreak className="pb-1 pt-1.5" />
        <p className="text-sm text-white/55">
          เกมการ์ดแข่งรอบสนาม{board.name} · 1–2 คนบนเครื่องเดียว คุมทีมละ 2 คัน แข่งกับรถ AI
        </p>
      </header>

      <BoardGame board={board} />

      <SiteFooter />
    </main>
  );
}
