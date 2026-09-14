"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RACE_TAIL_MS, RESULTS_WAIT_MS } from "@/lib/race-window";

const MAX_REFRESHES = 30;

/**
 * วางในหน้าที่ยังไม่มีผลของสนาม `startIso` — ถ้าสนามนั้นควรแข่งจบแล้ว แปลว่าหน้าที่ได้มา
 * อาจเป็นแคช ISR เก่า (คนแรกที่เข้าหลังแคชหมดอายุได้หน้าเก่าเสมอ) หรือ Jolpica ยังไม่ลงผล
 * → ขอหน้าใหม่เป็นระยะ พอหน้าใหม่มีผลแล้ว component นี้จะหายไปเอง
 */
export default function ResultsRefresher({ startIso }: { startIso: string }) {
  const router = useRouter();

  useEffect(() => {
    const start = Date.parse(startIso);
    const due = start + RACE_TAIL_MS;
    let count = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (Date.now() > start + RESULTS_WAIT_MS || count >= MAX_REFRESHES) return;
      if (document.visibilityState === "visible") {
        router.refresh();
        count++;
      }
      // ถี่ช่วงแรก (เผื่อเป็นแคชเก่าที่กำลังสร้างใหม่) แล้วค่อยห่างออก
      timer = setTimeout(tick, count < 2 ? 15_000 : count < 10 ? 60_000 : 5 * 60_000);
    };

    const wait = due - Date.now();
    if (wait <= 0) timer = setTimeout(tick, 3_000);
    // เปิดหน้าค้างไว้ระหว่างแข่ง → เริ่มเช็คหลังแข่งจบ
    else if (wait < 6 * 60 * 60 * 1000) timer = setTimeout(tick, wait + 60_000);

    return () => clearTimeout(timer);
  }, [router, startIso]);

  return null;
}
