"use client";

import { useId, useMemo, useRef } from "react";
import { timeDelta, type Trace } from "@/lib/telemetry";

type Side = { code: string; colour: string; trace: Trace };

const VW = 1000;
const H_DELTA = 90;
const H_SPEED = 150;
const H_THR = 70;
const H_BRK = 34;
const H_GEAR = 70;
const B_DASH = "7 5"; // คนที่สองเส้นประ — แยกได้แม้สีทีมใกล้กัน/ตาบอดสี

/** จุดของเส้น (x = ระยะ 0..VW) */
function linePoints(vals: number[], min: number, max: number, h: number, pad = 4): string {
  const n = vals.length;
  const span = max - min || 1;
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * VW;
    const y = pad + (1 - (vals[i] - min) / span) * (h - pad * 2);
    s += `${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return s;
}

/** เส้นขั้นบันได (เกียร์) */
function stepPoints(vals: number[], min: number, max: number, h: number, pad = 4): string {
  const n = vals.length;
  const span = max - min || 1;
  const y = (v: number) => (pad + (1 - (v - min) / span) * (h - pad * 2)).toFixed(1);
  let s = `0,${y(vals[0])} `;
  for (let i = 1; i < n; i++) {
    const x = ((i / (n - 1)) * VW).toFixed(1);
    if (vals[i] !== vals[i - 1]) s += `${x},${y(vals[i - 1])} ${x},${y(vals[i])} `;
  }
  return s + `${VW},${y(vals[n - 1])}`;
}

function Panel({
  title,
  unit,
  height,
  hoverX,
  ticks,
  children,
}: {
  title: string;
  unit?: string;
  height: number;
  hoverX: number | null;
  /** เส้นกริดแนวนอน [ค่า y ใน viewBox, ป้าย] */
  ticks?: [number, string][];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5 text-[11px] font-semibold text-white/50">
        {title}
        {unit && <span className="font-normal text-white/55">{unit}</span>}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${VW} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
          {ticks?.map(([y]) => (
            <line key={y} x1={0} x2={VW} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" vectorEffect="non-scaling-stroke" />
          ))}
          {children}
          {hoverX != null && (
            <line x1={hoverX} x2={hoverX} y1={0} y2={height} stroke="rgba(255,255,255,0.55)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {ticks?.map(([y, label]) => (
          <span key={y} className="pointer-events-none absolute left-1 -translate-y-1/2 font-mono text-[9px] text-white/55" style={{ top: y }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * กราฟเทียบรอบของสองคน เรียงซ้อนกัน แกนนอน = ระยะทางในรอบ (ใช้ร่วมกันทุกแผง)
 * แตะ/ลากบนกราฟ → เส้นเล็งทุกแผง + ค่าของทั้งสองคน ณ จุดนั้น + จุดบนผังสนาม
 */
export default function TraceCharts({
  a,
  b,
  hover,
  onHover,
}: {
  a: Side;
  b: Side;
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const n = a.trace.t.length;
  const delta = useMemo(() => timeDelta(a.trace, b.trace), [a.trace, b.trace]);
  const lengthKm = a.trace.length / 1000;

  const dMax = Math.max(0.05, ...delta.map(Math.abs));
  const vMin = Math.floor(Math.min(...a.trace.speed, ...b.trace.speed) / 20) * 20;
  const vMax = Math.ceil(Math.max(...a.trace.speed, ...b.trace.speed) / 20) * 20;
  const hoverX = hover == null ? null : (hover / (n - 1)) * VW;

  const pick = (clientX: number) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onHover(Math.round(k * (n - 1)));
  };

  const yOf = (v: number, min: number, max: number, h: number, pad = 4) =>
    pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);

  // ส่วนต่างเวลา: เหนือเส้นศูนย์ = A นำ (สี A) · ใต้เส้น = B นำ (สี B)
  // เส้นกราฟคิดครั้งเดียวต่อคู่รอบ — ตอนเล่น/ลากนิ้ว วาดใหม่แค่เส้นเล็ง (มือถือไม่กระตุก)
  const lines = useMemo(
    () => ({
      delta: linePoints(delta, -dMax, dMax, H_DELTA),
      speedA: linePoints(a.trace.speed, vMin, vMax, H_SPEED),
      speedB: linePoints(b.trace.speed, vMin, vMax, H_SPEED),
      thrA: linePoints(a.trace.throttle, 0, 100, H_THR),
      thrB: linePoints(b.trace.throttle, 0, 100, H_THR),
      gearA: stepPoints(a.trace.gear, 1, 8, H_GEAR),
      gearB: stepPoints(b.trace.gear, 1, 8, H_GEAR),
    }),
    [a.trace, b.trace, delta, dMax, vMin, vMax],
  );
  const deltaLine = lines.delta;
  const zeroY = yOf(0, -dMax, dMax, H_DELTA);
  const deltaArea = `0,${zeroY} ${deltaLine} ${VW},${zeroY}`;

  const i = hover;
  const read = i == null ? null : {
    km: (a.trace.frac[i] * lengthKm).toFixed(2),
    d: delta[i],
  };

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold sec-title">เทียบทั้งรอบ</h2>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <LegendLine colour={a.colour} label={a.code} />
          <LegendLine colour={b.colour} label={b.code} dashed />
        </div>
      </div>

      {/* ค่า ณ จุดที่ชี้ — ติดขอบบนใต้แถบเมนูตอนเลื่อน (มือถือไม่มี tooltip ลอยบังนิ้ว
          และกราฟยาวกว่าจอ แตะแผงล่าง ๆ ก็ยังเห็นค่า) */}
      <div className="sticky top-16 z-10 min-h-[3.25rem] rounded-xl border border-white/10 bg-[#141418]/95 px-3 py-2 text-xs backdrop-blur" aria-live="polite">
        {read && i != null ? (
          <div className="space-y-1">
            <div className="flex justify-between text-white/55">
              <span>ระยะ {read.km} กม.</span>
              <span className="font-semibold text-white/80">
                {Math.abs(read.d) < 0.0005 ? "เท่ากัน" : `${read.d > 0 ? a.code : b.code} นำ ${Math.abs(read.d).toFixed(3)} วิ`}
              </span>
            </div>
            {[a, b].map((s) => (
              <div key={s.code} className="flex items-center gap-2 font-mono text-white/80">
                <span className="h-2.5 w-1 rounded-full" style={{ background: s.colour }} />
                <span className="w-9 font-sans font-bold">{s.code}</span>
                <span className="w-[4.5rem] shrink-0">{Math.round(s.trace.speed[i])} km/h</span>
                <span className="w-8 shrink-0">G{s.trace.gear[i]}</span>
                <span className="shrink-0 whitespace-nowrap">คันเร่ง {Math.round(s.trace.throttle[i])}%</span>
                {s.trace.brake[i] ? <span className="font-sans text-[#ff6a5c]">เบรก</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="pt-2 text-white/55">แตะหรือลากบนกราฟเพื่อดูค่าแต่ละจุด</p>
        )}
      </div>

      <div
        ref={box}
        className="space-y-3 select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
      >
        <Panel title="ส่วนต่างเวลา" unit={`บน = ${a.code} นำ · ล่าง = ${b.code} นำ`} height={H_DELTA} hoverX={hoverX}
          ticks={[[yOf(dMax * 0.8, -dMax, dMax, H_DELTA), `+${(dMax * 0.8).toFixed(2)}`], [zeroY, "0"], [yOf(-dMax * 0.8, -dMax, dMax, H_DELTA), `-${(dMax * 0.8).toFixed(2)}`]]}>
          <defs>
            <clipPath id={`${uid}-up`}><rect x={0} y={0} width={VW} height={zeroY} /></clipPath>
            <clipPath id={`${uid}-down`}><rect x={0} y={zeroY} width={VW} height={H_DELTA - zeroY} /></clipPath>
          </defs>
          <polygon points={deltaArea} fill={a.colour} fillOpacity={0.35} clipPath={`url(#${uid}-up)`} />
          <polygon points={deltaArea} fill={b.colour} fillOpacity={0.35} clipPath={`url(#${uid}-down)`} />
          <polyline points={deltaLine} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </Panel>

        <Panel title="ความเร็ว" unit="km/h" height={H_SPEED} hoverX={hoverX}
          ticks={[vMax, (vMin + vMax) / 2, vMin].map((v) => [yOf(v, vMin, vMax, H_SPEED), String(Math.round(v))] as [number, string])}>
          <polyline points={lines.speedA} fill="none" stroke={a.colour} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points={lines.speedB} fill="none" stroke={b.colour} strokeWidth={2} strokeDasharray={B_DASH} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </Panel>

        <Panel title="คันเร่ง" unit="%" height={H_THR} hoverX={hoverX}
          ticks={[[yOf(100, 0, 100, H_THR), "100"], [yOf(0, 0, 100, H_THR), "0"]]}>
          <polyline points={lines.thrA} fill="none" stroke={a.colour} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <polyline points={lines.thrB} fill="none" stroke={b.colour} strokeWidth={2} strokeDasharray={B_DASH} vectorEffect="non-scaling-stroke" />
        </Panel>

        <Panel title="เบรก" unit="แถวบน = คนแรก · แถวล่าง = คนที่สอง" height={H_BRK} hoverX={hoverX}>
          {[a, b].map((s, row) => {
            const y = row === 0 ? 4 : H_BRK / 2 + 2;
            const h = H_BRK / 2 - 6;
            const rects: React.ReactNode[] = [];
            let from = -1;
            s.trace.brake.forEach((v, j) => {
              if (v && from < 0) from = j;
              if ((!v || j === n - 1) && from >= 0) {
                const x0 = (from / (n - 1)) * VW;
                const x1 = (j / (n - 1)) * VW;
                rects.push(<rect key={j} x={x0} y={y} width={Math.max(2, x1 - x0)} height={h} rx={2} fill={s.colour} opacity={row === 0 ? 1 : 0.75} />);
                from = -1;
              }
            });
            return <g key={s.code}>{rects}</g>;
          })}
        </Panel>

        <Panel title="เกียร์" height={H_GEAR} hoverX={hoverX}
          ticks={[[yOf(8, 1, 8, H_GEAR), "8"], [yOf(1, 1, 8, H_GEAR), "1"]]}>
          <polyline points={lines.gearA} fill="none" stroke={a.colour} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <polyline points={lines.gearB} fill="none" stroke={b.colour} strokeWidth={2} strokeDasharray={B_DASH} vectorEffect="non-scaling-stroke" />
        </Panel>

        <div className="flex justify-between font-mono text-[10px] text-white/55">
          {Array.from({ length: 6 }, (_, k) => (
            <span key={k}>{((lengthKm * k) / 5).toFixed(1)}</span>
          ))}
        </div>
        <p className="-mt-2 text-center text-[10px] text-white/55">ระยะทางในรอบ (กม.)</p>
      </div>
    </section>
  );
}

function LegendLine({ colour, label, dashed }: { colour: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <svg width="22" height="6" aria-hidden>
        <line x1="1" x2="21" y1="3" y2="3" stroke={colour} strokeWidth="2.5" strokeDasharray={dashed ? "5 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
