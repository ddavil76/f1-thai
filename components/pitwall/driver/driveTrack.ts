"use client";

import { useEffect, useState } from "react";
import { buildDriveTrack, type DriveTrack } from "@/lib/pitwall/drive/line";
import { hasRealTrack, loadRawTrack } from "@/lib/pitwall/drive/tracks";

/** สนามที่สร้างแล้ว (สร้างครั้งเดียวต่อสนาม ใช้ร่วมกันทั้งโหมดนักขับและภาพ 3D ของโหมดผู้จัดการทีม) */
const trackCache = new Map<string, DriveTrack | null>();

/** โหลดผังสนามจริง (ถ้ามี) แล้วสร้างสนาม · ระหว่างโหลดได้ undefined */
export function useDriveTrack(circuit: string): DriveTrack | null | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (trackCache.has(circuit)) return;
    let alive = true;
    (async () => {
      const raw = hasRealTrack(circuit) ? await loadRawTrack(circuit).catch(() => null) : null;
      trackCache.set(circuit, buildDriveTrack(circuit, raw));
      if (alive) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [circuit]);
  return trackCache.has(circuit) ? trackCache.get(circuit) : undefined;
}
