"use client";

import { useMemo, useState } from "react";
import { miniSectors, type Trace } from "@/lib/telemetry";

type Side = { code: string; colour: string; trace: Trace };

const W = 1000;
const PAD = 40;

// ไล่ความเร็วสีเดียว (แดง F1) มืด → สว่าง — ช้า = มืด เร็ว = สว่าง (บนพื้นดำ)
const RAMP = ["#4a0b08", "#8f0f0a", "#e10600", "#ff6a5c", "#ffd0cb"];

function rampAt(k: number): string {
  const x = Math.max(0, Math.min(1, k)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const c = (h: string, o: number) => parseInt(h.slice(o, o + 2), 16);
  const mix = (o: number) => Math.round(c(RAMP[i], o) + (c(RAMP[i + 1], o) - c(RAMP[i], o)) * f);
  return `rgb(${mix(1)},${mix(3)},${mix(5)})`;
}

/**
 * ผังสนามระบายสี — เส้นทางจากตำแหน่งจริงของรอบ A
 * · "ใครเร็วกว่า": แบ่ง 25 ช่วง สีของคนที่ผ่านช่วงนั้นเร็วกว่า
 * · "ความเร็ว": สีตามความเร็วของคนที่เลือก
 * จุดวงกลม = ตำแหน่งที่ชี้อยู่บนกราฟ (hover ร่วมกับกราฟ)
 */
export default function TrackDominance({
  a,
  b,
  hover,
}: {
  a: Side;
  b: Side;
  /** index จุดที่ชี้อยู่บนกราฟ (null = ไม่ได้ชี้) */
  hover: number | null;
}) {
  const [mode, setMode] = useState<"dom" | "speedA" | "speedB">("dom");

  const geo = useMemo(() => {
    const xs = a.trace.x;
    const ys = a.trace.y;
    if (!xs || !ys) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const k = (W - PAD * 2) / span;
    const h = Math.round((maxY - minY) * k + PAD * 2);
    // openf1: y ชี้ขึ้น · SVG: y ชี้ลง → กลับด้าน
    const px = (i: number) => PAD + (xs[i] - minX) * k + ((W - PAD * 2) - (maxX - minX) * k) / 2;
    const py = (i: number) => PAD + (maxY - ys[i]) * k;
    const pts = (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`${px(i).toFixed(1)},${py(i).toFixed(1)}`);
      return out.join(" ");
    };
    return { h, px, py, pts, n: xs.length };
  }, [a.trace]);

  const sectors = useMemo(() => miniSectors(a.trace, b.trace, 25), [a.trace, b.trace]);

  if (!geo) {
    return (
      <p className="card p-5 text-sm text-white/50">ไม่มีข้อมูลตำแหน่งบนสนามของรอบนี้ — ดูกราฟด้านล่างแทน</p>
    );
  }

  const winsA = sectors.filter((s) => s.winner === "a").length;
  const speedTrace = mode === "speedB" ? b.trace : a.trace;
  const vMin = Math.min(...speedTrace.speed);
  const vMax = Math.max(...speedTrace.speed);
  const STEP = 4; // ระบายทีละ 4 จุด (ราว 1/125 ของรอบ)

  const tabs: [typeof mode, string][] = [
    ["dom", "ใครเร็วกว่า"],
    ["speedA", `ความเร็ว ${a.code}`],
    ["speedB", `ความเร็ว ${b.code}`],
  ];

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">ผังสนาม</h2>
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs" role="tablist" aria-label="ระบายสีตาม">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                mode === k ? "bg-white text-black" : "text-white/60 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${geo.h}`} className="mx-auto block h-auto max-h-[420px] w-full" role="img"
        aria-label={mode === "dom" ? `${a.code} เร็วกว่า ${winsA} จาก ${sectors.length} ช่วง` : "ผังสนามระบายสีตามความเร็ว"}>
        {/* เส้นฐานสีเข้ม — ให้ช่องต่อระหว่างช่วงไม่ขาด */}
        <polyline points={geo.pts(0, geo.n - 1)} fill="none" stroke="#1d1d22" strokeWidth={22}
          strokeLinecap="round" strokeLinejoin="round" />
        {mode === "dom"
          ? sectors.map((s, i) => (
              <polyline key={i} points={geo.pts(s.from, s.to)} fill="none"
                stroke={s.winner === "a" ? a.colour : b.colour} strokeWidth={12}
                strokeLinecap="round" strokeLinejoin="round" />
            ))
          : Array.from({ length: Math.ceil((geo.n - 1) / STEP) }, (_, j) => {
              const from = j * STEP;
              const to = Math.min(geo.n - 1, from + STEP);
              const v = speedTrace.speed[Math.round((from + to) / 2)];
              return (
                <polyline key={j} points={geo.pts(from, to)} fill="none"
                  stroke={rampAt((v - vMin) / (vMax - vMin || 1))} strokeWidth={12}
                  strokeLinecap="round" strokeLinejoin="round" />
              );
            })}
        {/* เส้นสตาร์ท */}
        <circle cx={geo.px(0)} cy={geo.py(0)} r={9} fill="#fff" stroke="#08080a" strokeWidth={3} />
        {hover != null && (
          <>
            <circle cx={geo.px(hover)} cy={geo.py(hover)} r={15} fill={a.colour} stroke="#08080a" strokeWidth={4} />
          </>
        )}
      </svg>

      {mode === "dom" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
          <Legend colour={a.colour} label={`${a.code} เร็วกว่า ${winsA} ช่วง`} />
          <Legend colour={b.colour} label={`${b.code} เร็วกว่า ${sectors.length - winsA} ช่วง`} />
          <span className="text-white/35">แบ่งรอบเป็น {sectors.length} ช่วงเท่า ๆ กัน</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="font-mono">{Math.round(vMin)}</span>
          <span className="h-2 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP.join(",")})` }} />
          <span className="font-mono">{Math.round(vMax)} km/h</span>
        </div>
      )}
    </section>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-4 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
}
