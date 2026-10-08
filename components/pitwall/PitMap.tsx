"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import OsmCredit from "@/components/OsmCredit";
import { CarBody } from "@/components/pitwall/Car";
import type { Board } from "@/lib/pitwall/board";
import { buildSpline, type Frame, type Spline } from "@/lib/pitwall/spline";
import type { TrackModel } from "@/lib/pitwall/track";

/** ระยะจากเส้นกลางสนาม (หน่วยของแผนที่) */
const HALF = 3;
export const SIDE = 1.2;
export const PIT_K = -5.2;
const CAR_SCALE = 0.075;
const MAX_ZOOM = 9;
const CAM_LAG_MS = 220;

/** รถหนึ่งคันบนแผนที่: pos = ระยะสะสม (ช่อง) · k = ระยะห่างจากเส้นกลาง */
export type MapCar = { id: number; num: number; color: string; ink: string; tyre: string; pos: number; k: number; ghost?: boolean; mine?: boolean };

type Pose = { pos: number; k: number };
type Anim = { from: Pose; to: Pose; t0: number; dur: number };

/** ตำแหน่งที่ควรเห็นตอนนี้ (เกลี่ยระหว่างข้อมูลเก่ากับใหม่) */
function poseAt(anims: Map<number, Anim>, shown: Map<number, Pose>, id: number, now: number): Pose | null {
  const a = anims.get(id);
  if (!a) return shown.get(id) ?? null;
  const u = Math.min(1, (now - a.t0) / a.dur);
  return { pos: a.from.pos + (a.to.pos - a.from.pos) * u, k: a.from.k + (a.to.k - a.from.k) * u };
}

const transformOf = (f: Frame) => `translate(${f.x.toFixed(3)} ${f.y.toFixed(3)}) rotate(${f.deg.toFixed(2)})`;

/**
 * แผนที่สนามแบบรถวิ่งต่อเนื่อง: ข้อมูลตำแหน่งมาเป็นระยะ ๆ (ทุก 0.1–0.25 วินาที)
 * แผนที่เกลี่ยตำแหน่งระหว่างรอบให้รถวิ่งลื่น และกล้องตามรถที่โฟกัส
 */
export default function PitMap({
  board, track, cars, focus, neutral, zoomed, onToggle, interval = 150,
}: {
  board: Board;
  track: TrackModel;
  cars: MapCar[];
  focus: number | null;
  neutral: "sc" | "vsc" | null;
  zoomed: boolean;
  onToggle: () => void;
  interval?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 360 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sp = useMemo(() => buildSpline(board.cells), [board.cells]);
  const { w: W, h: H } = size;

  const carEls = useRef(new Map<number, SVGGElement>());
  const dotEls = useRef(new Map<number, SVGCircleElement>());
  const camEl = useRef<SVGGElement>(null);
  const anims = useRef(new Map<number, Anim>());
  const shown = useRef(new Map<number, Pose>());
  const cam = useRef<{ x: number; y: number; z: number } | null>(null);
  const view = useRef({ focus, zoomed, W, H, sp });
  const raf = useRef(0);


  // ข้อมูลใหม่มา: ตั้งเป้าให้รถแต่ละคันวิ่งจากตำแหน่งที่เห็นอยู่ไปตำแหน่งใหม่
  useLayoutEffect(() => {
    view.current = { focus, zoomed, W, H, sp };
    const now = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ids = new Set(cars.map((c) => c.id));
    for (const id of [...anims.current.keys()]) if (!ids.has(id)) anims.current.delete(id);
    for (const c of cars) {
      const cur = poseAt(anims.current, shown.current, c.id, now);
      const to = { pos: c.pos, k: c.k };
      if (!cur || reduce || Math.abs(to.pos - cur.pos) > 4 || to.pos < cur.pos - 0.01) {
        anims.current.delete(c.id);
        shown.current.set(c.id, to);
        continue;
      }
      anims.current.set(c.id, { from: cur, to, t0: now, dur: interval * 1.15 });
      shown.current.set(c.id, cur);
    }
  });

  // ลูปวาดภาพ: ขยับรถตามเป้า และกล้องตามรถที่โฟกัส
  useEffect(() => {
    const loop = (now: number) => {
      const v = view.current;
      for (const [id, el] of carEls.current) {
        const q = poseAt(anims.current, shown.current, id, now);
        if (!q) continue;
        shown.current.set(id, q);
        el.setAttribute("transform", transformOf(v.sp.frame(q.pos, q.k)));
        const dot = dotEls.current.get(id);
        if (dot) {
          const f = v.sp.frame(q.pos, 0);
          dot.setAttribute("cx", f.x.toFixed(2));
          dot.setAttribute("cy", f.y.toFixed(2));
        }
      }
      const target = camTarget(now);
      const c = cam.current ?? target;
      const f = 1 - Math.exp(-16 / CAM_LAG_MS);
      const next = { x: c.x + (target.x - c.x) * f, y: c.y + (target.y - c.y) * f, z: c.z + (target.z - c.z) * f };
      cam.current = next;
      camEl.current?.setAttribute("transform", `translate(${v.W / 2} ${v.H / 2}) scale(${next.z.toFixed(4)}) translate(${(-next.x).toFixed(3)} ${(-next.y).toFixed(3)})`);
      raf.current = requestAnimationFrame(loop);
    };
    const camTarget = (now: number) => {
      const v = view.current;
      const oz = Math.min(v.W / (board.w + 14), v.H / (board.h + 14));
      const overview = { x: board.w / 2, y: board.h / 2, z: oz };
      if (!v.zoomed || v.focus === null) return overview;
      const q = poseAt(anims.current, shown.current, v.focus, now);
      if (!q) return overview;
      const me = v.sp.frame(q.pos, q.k);
      const ahead = v.sp.frame(q.pos + 2, 0);
      return { x: (me.x * 2 + ahead.x) / 3, y: (me.y * 2 + ahead.y) / 3, z: Math.min(Math.min(v.W, v.H) / 42, MAX_ZOOM) };
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [board.w, board.h]);

  const scene = useMemo(() => <Scene sp={sp} track={track} />, [sp, track]);
  const sorted = [...cars].sort((a, b) => Number(!!a.mine) - Number(!!b.mine) || Number(a.id === focus) - Number(b.id === focus));

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden bg-[#0b130f]">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" role="img" aria-label={`แผนที่สนาม รถบนสนาม ${cars.length} คัน`}>
        <g ref={camEl}>
          {scene}
          {neutral && (
            <polygon points={sp.loop(0)} fill="none" stroke="#facc15" strokeOpacity={0.3} strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
          )}
          {sorted.map((c) => (
            <g
              key={c.id}
              ref={(el) => {
                if (el) carEls.current.set(c.id, el);
                else carEls.current.delete(c.id);
              }}
              opacity={c.ghost ? 0.75 : 1}
            >
              <ellipse cx={0.35} cy={0.45} rx={2.5} ry={1.15} fill="#000" fillOpacity={0.45} />
              {c.id === focus && <circle r={3.3} fill="none" stroke="#E10600" strokeWidth={0.35} className="bg-blink" />}
              {c.mine && <ellipse rx={2.9} ry={1.5} fill="#ffffff" fillOpacity={0.16} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={0.18} />}
              <g transform={`scale(${CAR_SCALE}) translate(-30 -13)`}>
                <CarBody color={c.color} ink={c.ink} num={c.num} tyre={c.tyre} ghost={c.ghost} />
              </g>
            </g>
          ))}
        </g>
      </svg>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!zoomed}
        aria-label={zoomed ? "ดูทั้งสนาม" : "ซูมที่รถ"}
        className="absolute right-2 top-2 rounded-xl border border-white/15 bg-[#08080A]/80 p-1.5 backdrop-blur"
      >
        <svg viewBox={`-6 -6 ${board.w + 12} ${board.h + 12}`} className="block h-20 w-14" aria-hidden>
          <polygon points={sp.loop(0)} fill="none" stroke="#4a4a55" strokeWidth={3} strokeLinejoin="round" />
          {cars.map((c) => (
            <circle
              key={c.id}
              ref={(el) => {
                if (el) dotEls.current.set(c.id, el);
                else dotEls.current.delete(c.id);
              }}
              r={c.id === focus ? 3.4 : 2.2}
              fill={c.id === focus ? "#E10600" : c.mine ? "#ffffff" : c.color}
            />
          ))}
        </svg>
        <span className="block pt-0.5 text-center text-[9px] font-bold text-white/70">{zoomed ? "ทั้งสนาม" : "ซูม"}</span>
      </button>
      <OsmCredit className="bottom-1.5 right-2" />
    </div>
  );
}

/** ฉากสนามที่ไม่เปลี่ยน (วาดครั้งเดียว) */
function Scene({ sp, track: t }: { sp: Spline; track: TrackModel }) {
  const n = sp.n;
  const fr = (u: number, k: number) => sp.frame(u, k);
  const ranges = t.corners.map((z) => [z.start - 0.5, (z.end >= z.start ? z.end : z.end + n) + 0.5, !!z.slow] as const);
  const drs = t.drs.map((z) => [z.start - 0.5, (z.end >= z.start ? z.end : z.end + n) + 0.5] as const);
  const pitFrom = t.pitEntry.start - 0.5;
  const pitTo = t.pitEntry.start + t.pitCells - 0.5;
  return (
    <>
      <polygon points={sp.loop(0)} fill="none" stroke="#12261b" strokeWidth={HALF * 2 + 7} strokeLinejoin="round" />
      {ranges.map(([a, b], k) => (
        <polyline key={`g${k}`} points={sp.line(a - 0.4, b + 0.4, 0)} fill="none" stroke="#3d3526" strokeWidth={(HALF + 2.6) * 2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* อาคารพิทและเลนพิท */}
      <polygon points={sp.strip(pitFrom + 0.6, pitTo - 0.6, PIT_K - 4.4, PIT_K - 2.2)} fill="#1c1c22" stroke="#2c2c34" strokeWidth={0.2} />
      <polygon points={sp.strip(pitFrom, pitTo, PIT_K - 1.4, PIT_K + 1.4)} fill="#26262c" />
      <polyline points={sp.line(pitFrom, pitTo, PIT_K + 1.6)} fill="none" stroke="#DEDEDE" strokeOpacity={0.5} strokeWidth={0.2} />
      {/* ขอบแดง-ขาวในโค้ง */}
      {ranges.map(([a, b], k) => (
        <g key={`k${k}`}>
          <polyline points={sp.line(a, b, 0)} fill="none" stroke="#ffffff" strokeWidth={(HALF + 0.55) * 2} strokeLinejoin="round" />
          <polyline points={sp.line(a, b, 0)} fill="none" stroke="#E10600" strokeWidth={(HALF + 0.55) * 2} strokeDasharray="0.7 0.7" strokeLinejoin="round" />
        </g>
      ))}
      <polygon points={sp.loop(0)} fill="none" stroke="#e6e6e6" strokeOpacity={0.8} strokeWidth={HALF * 2} strokeLinejoin="round" />
      <polygon points={sp.loop(0)} fill="none" stroke="#2a2a30" strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
      {drs.map(([a, b], k) => (
        <polyline key={`d${k}`} points={sp.line(a, b, 0)} fill="none" stroke="#DEDEDE" strokeOpacity={0.06} strokeWidth={HALF * 2 - 0.6} />
      ))}
      {ranges.map(([a, b, slow], k) => (
        <polyline key={`c${k}`} points={sp.line(a, b, 0)} fill="none" stroke="#E10600" strokeOpacity={slow ? 0.22 : 0.09} strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
      ))}
      {/* เส้นแบ่งเซกเตอร์ */}
      {t.sectors.map((c, k) => {
        const a = fr(c - 0.5, -HALF);
        const b = fr(c - 0.5, HALF);
        const p = fr(c - 0.5, HALF + 2);
        return (
          <g key={`s${k}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#facc15" strokeOpacity={0.6} strokeWidth={0.25} />
            <text x={p.x} y={p.y} fontSize={1.3} fontWeight={800} fill="#facc15" fillOpacity={0.8} textAnchor="middle" dominantBaseline="central">
              S{k + 2}
            </text>
          </g>
        );
      })}
      {/* เส้นสตาร์ท/เส้นชัย */}
      {Array.from({ length: 8 }, (_, k) => {
        const p = fr(-0.5, -HALF + k * 0.75 + 0.375);
        return (
          <g key={`f${k}`} transform={`translate(${p.x} ${p.y}) rotate(${p.deg})`}>
            <rect x={-0.75} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#fff" : "#08080A"} />
            <rect x={0} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#08080A" : "#fff"} />
          </g>
        );
      })}
      {t.drs.map((z, k) => {
        const p = fr(z.start, HALF + 1.8);
        return (
          <text key={`dl${k}`} x={p.x} y={p.y} fontSize={1.5} fontWeight={800} fill="#DEDEDE" textAnchor="middle" dominantBaseline="central">
            DRS
          </text>
        );
      })}
      {(() => {
        const p = fr(t.pitEntry.start + 3, PIT_K - 5.6);
        return (
          <text x={p.x} y={p.y} fontSize={1.4} fontWeight={800} fill="#DEDEDE" fillOpacity={0.85} textAnchor="middle" dominantBaseline="central">
            PIT
          </text>
        );
      })()}
    </>
  );
}
