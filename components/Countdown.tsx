"use client";
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Countdown({ target }: { target: string }) {
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
    return <div className="text-xl font-bold text-green-400">🔴 กำลังแข่งอยู่!</div>;
  }

  const s = Math.floor(left / 1000);
  const box = (v: string, l: string) => (
    <div
      key={l}
      className="flex flex-1 flex-col items-center rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 backdrop-blur-sm"
    >
      <span className="text-xl font-black tabular-nums tracking-tight sm:text-2xl">{v}</span>
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