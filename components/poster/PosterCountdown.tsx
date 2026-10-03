"use client";

import { useEffect, useState } from "react";
import LocalTime from "@/components/tz/LocalTime";
import { pickSession, type SessionWindow } from "@/lib/race-window";
import { lightsLit } from "@/lib/widget-card";

const pad = (n: number) => String(n).padStart(2, "0");

/** ชื่อ session ภาษาไทยในกล่องนับถอยหลัง (ตรงกับ widget) */
const TH: Record<string, string> = {
  Qualifying: "ควอลิฟาย",
  "Sprint Quali": "สปรินต์ควอลิฟาย",
  Sprint: "สปรินต์",
  Race: "เรซ",
};

/**
 * กล่องนับถอยหลังแบบ widget ธีมการ์ด — ไฟสตาร์ท 5 ดวงติดเพิ่มวันละดวงเมื่อใกล้เวลา
 * · กล่อง 4 ช่อง วัน/ชั่วโมง/นาที/วินาที เดินทุกวินาที · กำลังแข่ง: ● LIVE ไฟดับหมด
 * เลือก session ฝั่ง client — หน้าถูกแคช (ISR) เลือกครั้งเดียวตอน render จะค้าง
 */
export default function PosterCountdown({
  windows,
  serverNow,
  raceStart,
  circuitId,
}: {
  windows: SessionWindow[];
  /** เวลาตอน render ฝั่ง server — HTML แรกตรงกับที่ hydrate */
  serverNow: number;
  raceStart: string;
  circuitId: string;
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const session = pickSession(windows, now);
  if (!session) return null;

  const name = TH[session.label] ?? session.label;
  const left = session.start - now;
  const live = left <= 0;
  const lit = live ? 0 : lightsLit(left);
  const s = Math.max(0, Math.floor(left / 1000));
  const days = Math.floor(s / 86400);
  const hours = Math.floor(s / 3600) % 24;
  const mins = Math.floor(s / 60) % 60;

  const box = (v: string, label: string, hot = false) => (
    <div className="rounded-xl bg-black/40 px-1 py-2 text-center ring-1 ring-white/10">
      <div
        className={`poster text-[32px] leading-none tabular-nums sm:text-[38px] ${hot ? "text-(--color-f1-text)" : ""}`}
      >
        {v}
      </div>
      <div className="mt-1.5 font-display text-[12px] font-bold text-white/65">{label}</div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-[#1b1b22] px-4 pb-3 pt-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-3 font-display text-[13px] font-bold text-white/70">
        <span>{live ? `${name} · กำลังแข่ง` : `${name} เริ่มใน`}</span>
        <span className="flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < lit ? "bg-[#ff2a1a] shadow-[0_0_8px_#ff2a1a]" : "bg-[#3a0d0b]"
              }`}
            />
          ))}
        </span>
      </div>

      {live ? (
        <div className="poster mt-2 py-2 text-[34px] leading-none text-(--color-f1-text)">● LIVE</div>
      ) : (
        <>
          <span className="sr-only">
            เหลืออีก {days} วัน {hours} ชั่วโมง {mins} นาที
          </span>
          <div aria-hidden className="mt-2.5 grid grid-cols-4 gap-2">
            {box(pad(days), "วัน")}
            {box(pad(hours), "ชั่วโมง")}
            {box(pad(mins), "นาที")}
            {box(pad(s % 60), "วินาที", true)}
          </div>
        </>
      )}

      <p className="mt-2 border-t border-white/10 pt-2 text-[13px] text-white/60">
        ออกสตาร์ท <LocalTime iso={raceStart} kind="full" circuitId={circuitId} /> น.
      </p>
    </div>
  );
}
