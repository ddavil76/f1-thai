"use client";

import { useEffect, useState } from "react";
import type { WidgetPayload, WidgetSession } from "@/lib/widget";
import { lightsLit } from "@/lib/widget-card";

/**
 * ตัวอย่าง widget ธีมการ์ดด้วยข้อมูลจริงของสนามถัดไป — รูปการ์ดเดียวกับที่มือถือโหลด (/api/widget/card)
 * + กล่องนับถอยหลังมุมซ้ายล่าง (บนมือถือ widget วาดเอง ตรงกับ pill() ใน public/scriptable-widget.js)
 */

const SIZES = [
  { size: "small", w: 155, h: 155 },
  { size: "medium", w: 329, h: 155 },
  { size: "large", w: 329, h: 345 },
] as const;
type Size = (typeof SIZES)[number]["size"];

const TH_SESSION: Record<string, string> = {
  FP1: "ซ้อม 1", FP2: "ซ้อม 2", FP3: "ซ้อม 3", SQ: "สปรินต์ควอลิฟาย", SPRINT: "สปรินต์", Q: "ควอลิฟาย", RACE: "เรซ",
};
const TH_DAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const DAY = 86_400_000;
const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** session ที่ยังไม่จบ ณ ตอนนี้ (ข้อมูลแคชไว้ได้ ไม่เชื่อ state อย่างเดียว) */
function current(p: WidgetPayload, now: number): { s: WidgetSession | null; live: boolean; done: boolean } {
  const s = p.sessions.find((x) => Date.parse(x.endsAt) > now) ?? null;
  return { s, live: !!s && Date.parse(s.startsAt) <= now, done: !s };
}

function Pill({ size, s, live, done, now }: { size: Size; s: WidgetSession | null; live: boolean; done: boolean; now: number }) {
  const code = s?.code ?? "RACE";
  const target = s ? Date.parse(s.startsAt) : now;
  const left = target - now;
  const name = size === "small" ? code : (TH_SESSION[code] ?? code);
  const label = live
    ? `${name} · กำลังแข่ง`
    : done
      ? "จบสุดสัปดาห์"
      : size === "medium"
        ? `${name} · ${TH_DAY[new Date(target).getDay()]} ${hm(new Date(target))}`
        : `${name} เริ่มใน`;
  const lit = live || done ? 0 : lightsLit(left);
  const fs = size === "large" ? 28 : size === "medium" ? 25 : 24;

  return (
    <div className="absolute bottom-3 left-[15px] rounded-xl bg-[#1b1b22] px-2.5 pb-1.5 pt-1 text-[#f3f1ec]">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] font-bold text-[#f3f1ec]/70">{label}</span>
        <span className="flex gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-[7px] w-[7px] rounded-full ${i < lit ? "bg-[#ff2a1a]" : "bg-[#3a0d0b]"}`} />
          ))}
        </span>
      </div>
      {live ? (
        <div className="font-black leading-tight text-[#ff3b2f]" style={{ fontSize: fs * 0.8 }}>● LIVE</div>
      ) : done ? (
        <div className="font-black leading-tight" style={{ fontSize: fs * 0.7 }}>จบแล้ว</div>
      ) : left > DAY ? (
        <div className="flex items-baseline gap-[3px] font-mono font-bold leading-tight text-[#ff3b2f]" style={{ fontSize: fs }}>
          {Math.floor(left / DAY)}
          <span className="font-sans text-[10.5px] text-[#f3f1ec]">วัน</span>
          <span className="ml-[3px]">{pad(Math.floor(left / HOUR) % 24)}</span>
          <span className="font-sans text-[10.5px] text-[#f3f1ec]">ชม.</span>
        </div>
      ) : (
        <div className="font-mono font-bold leading-tight tabular-nums text-[#ff3b2f]" style={{ fontSize: fs }}>
          {pad(Math.floor(left / HOUR))}:{pad(Math.floor(left / 60_000) % 60)}:{pad(Math.floor(left / 1000) % 60)}
        </div>
      )}
    </div>
  );
}

export default function WidgetPreview() {
  const [data, setData] = useState<WidgetPayload | null | "error">(null);
  const [dark, setDark] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch("/api/widget")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: WidgetPayload) => alive && setData(p.race ? p : "error"))
      .catch(() => alive && setData("error"));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (data === "error") return null;
  const cur = data ? current(data, now) : null;
  const tz = -new Date().getTimezoneOffset();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-center gap-4" aria-label="ตัวอย่างหน้าตา widget" role="img">
        {SIZES.map(({ size, w, h }) => (
          <div
            key={size}
            className="relative max-w-full overflow-hidden rounded-[22px] bg-white/5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]"
            style={{ width: w, height: h }}
          >
            {data && cur && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก route ของเว็บเอง ขนาดตรงกล่องอยู่แล้ว */}
                <img
                  src={
                    `/api/widget/card?round=${data.race!.round}&size=${size}&w=${w}&h=${h}&s=2` +
                    `&theme=${dark ? "dark" : "light"}&tz=${tz}&v=2` +
                    (cur.s ? `&next=${cur.s.code}` : "") +
                    (cur.live ? "&live=1" : "")
                  }
                  alt=""
                  width={w}
                  height={h}
                  className="absolute inset-0 h-full w-full object-cover object-left"
                />
                <span
                  className={`absolute right-2.5 top-1.5 text-[7px] ${dark ? "text-white/35" : "text-[#1b1b22]/35"}`}
                >
                  ↻{hm(new Date(data.generatedAt))}
                </span>
                <Pill size={size} s={cur.s} live={cur.live} done={cur.done} now={now} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1 text-xs" role="group" aria-label="ธีม">
        {[
          [false, "สว่าง"],
          [true, "มืด"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={dark === v}
            onClick={() => setDark(v as boolean)}
            className={`rounded-full px-3 py-1 font-bold transition ${
              dark === v ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
