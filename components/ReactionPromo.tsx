import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** ชวนเล่นเกมออกตัว — วางใกล้เวลาออกสตาร์ทให้เข้าบริบท */
export default function ReactionPromo() {
  return (
    <Link
      href="/reaction"
      className="card flex items-center gap-3 p-4 transition hover:border-white/20"
    >
      <span className="flex shrink-0 gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-red-500/80 shadow-[0_0_6px_1px_rgba(255,40,20,0.5)]"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">คุณจะออกตัวทันไหม?</span>
        <span className="ml-2 text-white/45">
          ลองวัดเวลาตอบสนองแบบนักแข่ง
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
    </Link>
  );
}
