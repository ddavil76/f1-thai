"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DELAYS_MS = [4_000, 20_000, 60_000];

/**
 * วางไว้ตรงที่ข้อมูลควรมีแต่หายไป — ตอนเรนเดอร์หน้านั้นต้นทางอาจโดน rate limit
 * (มักเกิดตอน build ที่ยิง API พร้อมกันเยอะ) แล้วหน้าที่แคชไว้ก็ค้างค่าว่างจนกว่าจะ
 * มีคนเข้ามากระตุ้นให้สร้างใหม่ — ขอหน้าใหม่ไม่กี่ครั้ง พอมีข้อมูลแล้วตัวนี้จะหายไปเอง
 */
export default function RefreshOnMissing() {
  const router = useRouter();

  useEffect(() => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        attempt++;
      }
      if (attempt < DELAYS_MS.length) timer = setTimeout(tick, DELAYS_MS[attempt]);
    };

    timer = setTimeout(tick, DELAYS_MS[0]);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
