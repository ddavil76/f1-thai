import Link from "next/link";
import { ChevronRight } from "lucide-react";
import LiveDot from "./LiveDot";
import type { Race } from "@/lib/f1";

/** สนามที่เริ่มแข่งแล้วแต่ Jolpica ยังไม่มีผล — บอกให้รู้ แทนที่สนามจะหายไปเฉย ๆ */
export default function ResultsPending({
  race,
  status,
  href,
}: {
  race: Race;
  status: "live" | "awaiting";
  href?: string;
}) {
  const body = (
    <>
      <span className="inline-flex shrink-0">
        {status === "live" ? (
          <LiveDot />
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {race.raceName} · R{race.round}{" "}
          {status === "live" ? "กำลังแข่งอยู่" : "แข่งจบแล้ว"}
        </span>
        <span className="block text-xs text-white/50">
          {status === "live"
            ? "ผลการแข่งจะขึ้นหลังจบการแข่งขัน"
            : "กำลังรอผลอย่างเป็นทางการ ปกติขึ้นภายในไม่กี่ชั่วโมง หน้านี้จะอัปเดตเอง"}
        </span>
      </span>
    </>
  );

  return href ? (
    <Link href={href} className="card flex items-center gap-3 p-4 transition hover:border-white/20">
      {body}
      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
    </Link>
  ) : (
    <section className="card flex items-center gap-3 p-4">{body}</section>
  );
}
