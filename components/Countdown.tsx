"use client";
import { useEffect, useState } from "react";
import LiveDot from "./LiveDot";

const pad = (n: number) => String(n).padStart(2, "0");

/** ไฟสตาร์ท 5 ดวง — ติดทีละดวงในช่วง 5 วินาทีสุดท้าย */
function StartLights({ left }: { left: number }) {
  const secs = Math.ceil(left / 1000);
  const lit = left <= 5000 ? Math.min(5, 6 - secs) : 0;
  return (
    <div className="flex flex-col items-center gap-3 py-1">
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full transition-all duration-200 ${
              i < lit
                ? "bg-red-500 shadow-[0_0_14px_3px_rgba(255,45,20,0.75)]"
                : "bg-red-950/70 ring-1 ring-red-900/60"
            }`}
          />
        ))}
      </div>
      <p className="display text-lg font-bold tabular-nums text-white/80">
        {Math.floor(secs / 60)}:{pad(secs % 60)}
      </p>
    </div>
  );
}

export default function Countdown({
  target,
  serverNow,
  race = false,
  liveText = "กำลังแข่งอยู่!",
}: {
  target: string;
  /** เวลา ณ ตอน render ฝั่ง server — ให้ SSR แสดงเลขได้เลย ไม่ต้องรอ client */
  serverNow?: number;
  race?: boolean;
  liveText?: string;
}) {
  const [left, setLeft] = useState<number | null>(() =>
    serverNow != null ? new Date(target).getTime() - serverNow : null,
  );

  useEffect(() => {
    const t = new Date(target).getTime();
    const tick = () => setLeft(t - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  // ไม่มี serverNow และ client ยังไม่ tick → skeleton (กัน hydration mismatch)
  if (left === null) {
    return <div className="h-[74px] animate-pulse rounded-xl bg-white/10" />;
  }

  if (left <= 0) {
    return (
      <div className="flex items-center gap-2 text-lg font-bold text-green-400">
        <LiveDot />
        {liveText}
      </div>
    );
  }

  // 5 นาทีสุดท้ายก่อนออกตัว → ไฟสตาร์ท
  if (race && left <= 5 * 60_000) {
    return <StartLights left={left} />;
  }

  const s = Math.floor(left / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor(s / 3600) % 24;
  const mins = Math.floor(s / 60) % 60;

  const box = (v: string, l: string) => (
    <div
      key={l}
      className="relative flex flex-1 flex-col items-center overflow-hidden rounded-xl border border-white/10 bg-black/40 pb-1.5 pt-2 backdrop-blur-sm"
    >
      <span className="relative block [perspective:280px] [transform-style:preserve-3d]">
        <span
          key={v}
          className="animate-flap display block text-3xl font-bold leading-none tabular-nums sm:text-4xl"
        >
          {v}
        </span>
        <span className="pointer-events-none absolute inset-x-[-40%] top-1/2 h-px -translate-y-px bg-black/60" />
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.15em] text-white/45">
        {l}
      </span>
    </div>
  );

  return (
    <div>
      <span className="sr-only">
        เหลืออีก {days} วัน {hours} ชั่วโมง {mins} นาที
      </span>
      <div aria-hidden className="flex gap-1.5">
        {box(String(days), "วัน")}
        {box(pad(hours), "ชม.")}
        {box(pad(mins), "นาที")}
        {box(pad(s % 60), "วินาที")}
      </div>
    </div>
  );
}
