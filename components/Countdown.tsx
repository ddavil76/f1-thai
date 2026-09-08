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
  race = false,
  liveText = "กำลังแข่งอยู่!",
}: {
  target: string;
  race?: boolean;
  liveText?: string;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const t = new Date(target).getTime();
    const tick = () => setLeft(t - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  // ครั้งแรกยังไม่ render เลข → กัน hydration mismatch
  if (left === null) {
    return <div className="h-[52px] animate-pulse rounded-lg bg-white/10" />;
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
  const box = (v: string, l: string) => (
    <div
      key={l}
      className="flex flex-1 flex-col items-center rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 backdrop-blur-sm"
    >
      <span className="block overflow-hidden">
        <span
          key={v}
          className="animate-tick display block text-xl font-bold tabular-nums sm:text-2xl"
        >
          {v}
        </span>
      </span>
      <span className="text-[9px] uppercase tracking-wide text-white/50">{l}</span>
    </div>
  );

  return (
    <div className="flex gap-1.5">
      {box(String(Math.floor(s / 86400)), "วัน")}
      {box(pad(Math.floor(s / 3600) % 24), "ชม.")}
      {box(pad(Math.floor(s / 60) % 60), "นาที")}
      {box(pad(s % 60), "วินาที")}
    </div>
  );
}
