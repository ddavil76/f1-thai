"use client";

import { useEffect, useState } from "react";
import LocalTime from "@/components/tz/LocalTime";
import type { SessionWindow } from "@/lib/race-window";
import { sessionCode } from "@/lib/widget-card";

/** ตารางสุดสัปดาห์แบบเส้นเวลา — จบแล้วจาง · ตัวถัดไป/กำลังแข่งเป็นสีแดง (คิดจากนาฬิกาเครื่อง หน้าถูกแคช) */
export default function WeekendTimeline({
  windows,
  serverNow,
  circuitId,
  dimDone = true,
  variant = "list",
}: {
  windows: SessionWindow[];
  serverNow: number;
  circuitId: string;
  /** จางแถวที่จบแล้ว — ปิดได้สำหรับสนามที่แข่งจบไปแล้ว (ไม่งั้นจางทั้งตาราง) */
  dimDone?: boolean;
  /** list = แถวเส้นเวลา (หน้าสนาม) · cards = แถวการ์ด session (Race Week Highlights หน้าแรก) */
  variant?: "list" | "cards";
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const at = windows.findIndex((w) => w.end > now);

  if (variant === "cards") {
    return (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {windows.map((w, i) => {
          const code = sessionCode(w.label);
          const done = at < 0 || i < at;
          const hot = i === at;
          const live = hot && w.start <= now;
          const iso = new Date(w.start).toISOString();
          const dim = done && dimDone;
          return (
            <li
              key={w.label}
              className={`rounded-xl p-2.5 ring-1 ring-inset ${
                hot ? "bg-(--color-f1)/10 ring-(--color-f1)/45" : "bg-white/[0.03] ring-white/10"
              }`}
            >
              <p className={`poster text-base ${dim ? "text-white/55" : ""}`}>{code}</p>
              <p className="mt-1 text-xs text-white/55">
                <LocalTime iso={iso} kind="date" circuitId={circuitId} />
              </p>
              <p
                className={`mt-0.5 font-display text-base font-bold tabular-nums ${
                  dim ? "text-white/55" : "text-(--color-f1-text)"
                }`}
              >
                {live ? "● LIVE" : <LocalTime iso={iso} kind="time" circuitId={circuitId} />}
              </p>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="grid gap-2.5">
      {windows.map((w, i) => {
        const code = sessionCode(w.label);
        const done = at < 0 || i < at;
        const hot = i === at;
        const live = hot && w.start <= now;
        const iso = new Date(w.start).toISOString();
        // จบแล้ว = ตัวหนังสือจางลงแต่ยังอ่านออก (ไม่ใช้ opacity ทั้งแถว — จางจนต่ำกว่าเกณฑ์อ่านได้)
        const dim = done && dimDone;
        return (
          <li
            key={w.label}
            className={`grid grid-cols-[14px_62px_1fr_auto] items-center gap-2.5 font-display text-[15px] font-semibold ${
              dim ? "text-white/55" : ""
            }`}
          >
            <span
              className={`h-3 w-3 rounded-full border-2 ${
                hot
                  ? "border-(--color-f1) bg-(--color-f1) shadow-[0_0_0_4px_rgb(225_6_0/0.25)]"
                  : code === "RACE" && !dim
                    ? "border-white"
                    : "border-white/20"
              }`}
            />
            <span className={`poster text-base ${hot ? "text-(--color-f1-text)" : ""}`}>{code}</span>
            <span className="text-white/55">
              <LocalTime iso={iso} kind="date" circuitId={circuitId} />
            </span>
            <span className={`tabular-nums ${hot ? "text-(--color-f1-text)" : ""}`}>
              {live ? "● LIVE" : <LocalTime iso={iso} kind="time" circuitId={circuitId} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
