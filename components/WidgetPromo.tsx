import Link from "next/link";
import { ChevronRight, Smartphone } from "lucide-react";

/** ชวนติดตั้ง widget บนมือถือ — วางคู่กับการ์ดนับถอยหลังหน้าแรก */
export default function WidgetPromo() {
  return (
    <Link href="/widget" className="card flex items-center gap-3 p-4 transition hover:border-white/20">
      <Smartphone className="h-5 w-5 shrink-0 text-(--color-f1)" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">นับถอยหลังบนหน้าจอมือถือ</span>
        <span className="ml-2 text-white/55">widget สำหรับ iPhone และ Android</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/55" />
    </Link>
  );
}
