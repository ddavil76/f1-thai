"use client";

import { useEffect } from "react";
import { TriangleAlert, RotateCw } from "lucide-react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card flex flex-col items-center gap-4 p-10 text-center">
      <TriangleAlert className="h-9 w-9 text-white/40" strokeWidth={1.5} />
      <div className="space-y-1">
        <h2 className="text-lg font-bold">โหลดข้อมูลไม่สำเร็จ</h2>
        <p className="text-sm text-white/50">
          ตอนนี้ต่อกับ Jolpica-F1 API ไม่ได้ ลองใหม่อีกครั้งได้เลย
        </p>
      </div>
      <button
        onClick={() => retry()}
        className="inline-flex items-center gap-1.5 rounded-full bg-(--color-f1) px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
      >
        <RotateCw className="h-4 w-4" />
        ลองอีกครั้ง
      </button>
    </div>
  );
}
