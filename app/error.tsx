"use client";

import { useEffect } from "react";

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
      <span className="text-4xl">🏳️</span>
      <div className="space-y-1">
        <h2 className="text-lg font-bold">โหลดข้อมูลไม่สำเร็จ</h2>
        <p className="text-sm text-white/50">
          ตอนนี้ต่อกับ Jolpica-F1 API ไม่ได้ ลองใหม่อีกครั้งได้เลย
        </p>
      </div>
      <button
        onClick={() => retry()}
        className="rounded-full bg-[--color-f1] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
      >
        ลองอีกครั้ง
      </button>
    </div>
  );
}
