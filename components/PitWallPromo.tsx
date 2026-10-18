import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TyreDot } from "@/components/pitwall/ui";
import { COMPOUNDS } from "@/lib/pitwall/types";

/** ชวนเล่น Pit Wall — วางต่อจากตารางคะแนนในหน้าแรก (มือถือไม่มีที่ในแถบล่าง) */
export default function PitWallPromo() {
  return (
    <Link
      href="/pitwall"
      className="card flex items-center gap-3 p-4 transition hover:border-white/20"
    >
      <span className="flex shrink-0 -space-x-1.5" aria-hidden>
        {COMPOUNDS.map((c) => (
          <TyreDot key={c} c={c} size={22} />
        ))}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Pit Wall · เกมแข่งรถ</span>
        <span className="block text-white/55">3 โหมด: หัวหน้าทีมวางกลยุทธ์ · นักขับขับเองแบบ 3D · กลยุทธ์การ์ดแบบโรกไลต์</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-(--color-f1) py-1 pr-2 pl-3 text-xs font-bold text-white">
        เล่นเลย
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
