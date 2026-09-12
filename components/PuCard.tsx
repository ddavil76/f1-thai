import Link from "next/link";
import { ChevronRight } from "lucide-react";
import PuCells from "./PuCells";
import { overBy, type PuUsed } from "@/lib/power-units";

type Row = { key: string; name?: string; href?: string; used: PuUsed };

/** การ์ดย่อยบนหน้านักขับ/หน้าทีม — ลิงก์ไปหน้าเทียบทุกทีม */
export default function PuCard({ rows, event }: { rows: Row[]; event: string }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">ชิ้นส่วนเครื่องยนต์</h2>
        <Link
          href="/power-units"
          className="inline-flex items-center gap-0.5 text-xs text-white/50 transition hover:text-white"
        >
          เทียบทุกทีม
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-4">
        {rows.map((r) => {
          const over = overBy(r.used);
          return (
            <div key={r.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                {r.name &&
                  (r.href ? (
                    <Link href={r.href} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  ))}
                <span className={`ml-auto text-xs ${over > 0 ? "text-red-400" : "text-white/40"}`}>
                  {over > 0 ? `เกินโควตา ${over} ชิ้น` : "ยังอยู่ในโควตา"}
                </span>
              </div>
              <PuCells used={r.used} />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-white/40">
        ข้อมูลจากเอกสาร FIA ถึง {event} · ใช้เกินโควตาโดนโทษกริด
      </p>
    </section>
  );
}
