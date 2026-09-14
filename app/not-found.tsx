import Link from "next/link";
import { Flag, Home } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata = { title: "ไม่พบหน้านี้" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl">
      <div className="card flex flex-col items-center gap-5 p-10 text-center">
        <Flag className="h-9 w-9 text-white/40" strokeWidth={1.5} />

        <div className="space-y-1">
          <p className="display text-5xl font-bold tabular-nums text-(--color-f1)">
            404
          </p>
          <h1 className="text-lg font-bold">ไม่พบหน้านี้</h1>
          <p className="text-sm text-white/50">
            ลิงก์อาจพิมพ์ผิด หรือเป็นสนาม นักแข่ง หรือทีมที่ไม่มีในฤดูกาลนี้
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-(--color-f1) px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
        >
          <Home className="h-4 w-4" />
          กลับหน้าหลัก
        </Link>

        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-white/5 pt-5 text-sm">
          {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-white/50 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
