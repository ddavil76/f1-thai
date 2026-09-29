"use client";

import { useMemo, useState } from "react";
import { indexOfFrac, miniSectors, type Trace } from "@/lib/telemetry";
import Telemetry3D, { type CarHud } from "./Telemetry3D";

type Side = { code: string; colour: string; trace: Trace };

const W = 1000;
const PAD = 40;
const SECTORS = 25;

// ไล่ความเร็วสีเดียว (แดง F1) มืด → สว่าง — ช้า = มืด เร็ว = สว่าง (บนพื้นดำ)
const RAMP = ["#4a0b08", "#8f0f0a", "#e10600", "#ff6a5c", "#ffd0cb"];

function rampAt(k: number): string {
  const x = Math.max(0, Math.min(1, k)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const c = (h: string, o: number) => parseInt(h.slice(o, o + 2), 16);
  const mix = (o: number) => Math.round(c(RAMP[i], o) + (c(RAMP[i + 1], o) - c(RAMP[i], o)) * f);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(1))}${hex(mix(3))}${hex(mix(5))}`;
}

type Mode = "dom" | "speedA" | "speedB";

/**
 * ผังสนามระบายสี — เส้นทางจากตำแหน่งจริงของรอบ A · ดูแบบ 3D (มีเนินจริง) หรือ 2D
 * · "ใครเร็วกว่า": แบ่ง 25 ช่วง สีของคนที่ผ่านช่วงนั้นเร็วกว่า
 * · "ความเร็ว": สีตามความเร็วของคนที่เลือก
 * จุดของสองคน = ตำแหน่ง ณ "เวลาเดียวกัน" (เห็นว่าอีกคนตามหลัง/นำอยู่ห่างแค่ไหน)
 */
export default function TrackDominance({
  a,
  b,
  aFrac,
  bFrac,
  status,
  controls,
  circuitId,
  ground,
}: {
  a: Side;
  b: Side;
  /** ตำแหน่งในรอบ (0..1) ของแต่ละคน ณ เวลาที่ชี้/ที่เล่นอยู่ — null = ไม่แสดงจุด */
  aFrac: number | null;
  bFrac: number | null;
  /** ข้อความใต้ผัง เช่น "VER ตามหลัง 52 ม." */
  status?: string | null;
  /** ปุ่มเล่น/หยุด */
  controls?: React.ReactNode;
  /** สนามไนต์เรซ → ฉาก 3D กลางคืน */
  circuitId?: string;
  /** ผังสนามที่ผูกกับแผนที่ — ฉากรอบสนามจริง (OSM) */
  ground?: [number, number][];
}) {
  const [mode, setMode] = useState<Mode>("dom");
  const [view, setView] = useState<"3d" | "2d">("3d");

  const sectors = useMemo(() => miniSectors(a.trace, b.trace, SECTORS), [a.trace, b.trace]);
  const n = a.trace.t.length;
  const speedTrace = mode === "speedB" ? b.trace : a.trace;
  const vMin = Math.min(...speedTrace.speed);
  const vMax = Math.max(...speedTrace.speed);

  // สีของทุกจุดในรอบตามโหมด — ใช้ทั้ง 2D และ 3D
  const colors = useMemo(() => {
    if (mode === "dom") {
      const out: string[] = new Array(n);
      for (const s of sectors) for (let i = s.from; i <= s.to; i++) out[i] = s.winner === "a" ? a.colour : b.colour;
      return out;
    }
    return speedTrace.speed.map((v) => rampAt((v - vMin) / (vMax - vMin || 1)));
  }, [mode, sectors, n, a.colour, b.colour, speedTrace, vMin, vMax]);

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
    const offX = (W - PAD * 2 - (maxX - minX) * k) / 2;
    // openf1: y ชี้ขึ้น · SVG: y ชี้ลง → กลับด้าน
    const px = (i: number) => PAD + offX + (xs[i] - minX) * k;
    const py = (i: number) => PAD + (maxY - ys[i]) * k;
    const pts = (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`${px(i).toFixed(1)},${py(i).toFixed(1)}`);
      return out.join(" ");
    };
    return { h, px, py, pts };
  }, [a.trace]);

  if (!geo) {
    return <p className="card p-5 text-sm text-white/50">ไม่มีข้อมูลตำแหน่งบนสนามของรอบนี้ — ดูกราฟด้านล่างแทน</p>;
  }

  const winsA = sectors.filter((s) => s.winner === "a").length;
  const STEP = 4; // 2D: ระบายทีละ 4 จุด (ราว 1/125 ของรอบ)
  const ia = aFrac == null ? null : indexOfFrac(a.trace, aFrac);
  const ib = bFrac == null ? null : indexOfFrac(a.trace, bFrac);
  // หน้าปัดกล้องตามรถ: ค่าของแต่ละคนจาก trace ของตัวเอง ณ ตำแหน่งในรอบตอนนี้
  const hud = (t: Trace, frac: number | null): CarHud | null => {
    if (frac == null) return null;
    const i = indexOfFrac(t, frac);
    return { speed: t.speed[i], gear: t.gear[i], throttle: t.throttle[i], brake: t.brake[i] };
  };

  const tabs: [Mode, string][] = [
    ["dom", "ใครเร็วกว่า"],
    ["speedA", `ความเร็ว ${a.code}`],
    ["speedB", `ความเร็ว ${b.code}`],
  ];

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">ผังสนาม</h2>
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs" role="tablist" aria-label="มุมมอง">
          {(["3d", "2d"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 font-bold uppercase transition ${view === v ? "bg-white text-black" : "text-white/60 hover:text-white"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1 text-xs" role="tablist" aria-label="ระบายสีตาม">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={`shrink-0 rounded-full px-3 py-1 font-semibold transition ${mode === k ? "bg-white text-black" : "text-white/60 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "3d" ? (
        <Telemetry3D
          trace={a.trace}
          colors={colors}
          cars={[
            { code: a.code, colour: a.colour, frac: aFrac, hud: hud(a.trace, aFrac) },
            { code: b.code, colour: b.colour, frac: bFrac, hud: hud(b.trace, bFrac) },
          ]}
          circuitId={circuitId}
          ground={ground}
          onFail={() => setView("2d")}
        />
      ) : (
        <svg viewBox={`0 0 ${W} ${geo.h}`} className="mx-auto block h-auto max-h-[420px] w-full" role="img"
          aria-label={mode === "dom" ? `${a.code} เร็วกว่า ${winsA} จาก ${sectors.length} ช่วง` : "ผังสนามระบายสีตามความเร็ว"}>
          {/* เส้นฐานสีเข้ม — ให้ช่องต่อระหว่างช่วงไม่ขาด */}
          <polyline points={geo.pts(0, n - 1)} fill="none" stroke="#1d1d22" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          {Array.from({ length: Math.ceil((n - 1) / STEP) }, (_, j) => {
            const from = j * STEP;
            const to = Math.min(n - 1, from + STEP);
            return (
              <polyline key={j} points={geo.pts(from, to)} fill="none" stroke={colors[Math.round((from + to) / 2)]}
                strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
            );
          })}
          {/* เส้นสตาร์ท */}
          <circle cx={geo.px(0)} cy={geo.py(0)} r={9} fill="#fff" stroke="#08080a" strokeWidth={3} />
          {/* คนที่สอง = วงแหวน (คู่กับเส้นประในกราฟ) · คนแรก = จุดทึบ วาดทีหลังให้อยู่บน */}
          {ib != null && <circle cx={geo.px(ib)} cy={geo.py(ib)} r={15} fill="#08080a" stroke={b.colour} strokeWidth={7} />}
          {ia != null && <circle cx={geo.px(ia)} cy={geo.py(ia)} r={14} fill={a.colour} stroke="#08080a" strokeWidth={4} />}
        </svg>
      )}

      {controls}

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
      {status && <p className="text-xs font-semibold text-white/80">{status}</p>}
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
