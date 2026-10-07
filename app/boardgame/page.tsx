import { notFound } from "next/navigation";
import BoardGame from "@/components/boardgame/BoardGame";
import SiteFooter from "@/components/SiteFooter";
import SpeedStreak from "@/components/poster/SpeedStreak";
import { buildBoard } from "@/lib/boardgame/board";

export const metadata = {
  title: "Grand Prix Tour เกมกระดาน",
  description:
    "เกมกระดานแข่งรอบสนามจริง 2 คนผลัดกันเล่น เลือกยาง ใช้การ์ดกลยุทธ์ ทอยเต๋า แล้วลุ้นเซฟตี้คาร์ ฝน และธงแดง",
};

export default function BoardGamePage() {
  const board = buildBoard("suzuka", "ซูซูกะ");
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
          เกมกระดานแข่งรอบสนาม{board.name} · 2 คนผลัดกันเล่นบนเครื่องเดียว
        </p>
      </header>

      <BoardGame board={board} />

      <SiteFooter />
    </main>
  );
}
