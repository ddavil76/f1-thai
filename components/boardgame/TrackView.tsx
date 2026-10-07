"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OsmCredit from "@/components/OsmCredit";
import { CarBody } from "@/components/boardgame/Car";
import type { Board, Pt } from "@/lib/boardgame/board";
import {
  BOX_AT, PIT_LEN, inZone, isRain, lapCell, zoneAt,
  type Driver, type GameState, type Lane,
} from "@/lib/boardgame/engine";
import { look, tyreOf } from "@/components/boardgame/look";
import type { HelpKey } from "@/components/boardgame/help";

/** ระยะจากเส้นกลางสนาม (หน่วยของแผนที่) */
const LANE = 1.3;
const HALF = 3;
const OFF = 4.4;
const PIT = -5;
/** ตัวรถยาว 60 หน่วย → ย่อให้ยาวราว 4.5 หน่วยบนแผนที่ */
const CAR_SCALE = 0.075;
/** พิกเซลต่อหน่วยแผนที่สูงสุดตอนซูม */
const MAX_ZOOM = 11;

type Cell = { c: Pt; n: Pt; deg: number };

const add = (a: Pt, n: Pt, k: number): Pt => ({ x: a.x + n.x * k, y: a.y + n.y * k });
const fmt = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

function geometry(cells: Pt[]) {
  const n = cells.length;
  const cell: Cell[] = cells.map((c, i) => {
    const a = cells[(i - 1 + n) % n];
    const b = cells[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { c, n: { x: -dy / len, y: dx / len }, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  // เส้นแบ่งช่อง: กึ่งกลางระหว่างช่อง i-1 กับ i
  const edge = cells.map((c, i) => {
    const p = cells[(i - 1 + n) % n];
    const m = { x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 };
    const na = cell[(i - 1 + n) % n].n;
    const nb = cell[i].n;
    const nx = na.x + nb.x;
    const ny = na.y + nb.y;
    const l = Math.hypot(nx, ny) || 1;
    return { m, n: { x: nx / l, y: ny / l } };
  });
  /** สี่เหลี่ยมของช่อง i ใช้ระบายโค้ง/DRS/ธง */
  const quad = (i: number, w = HALF) => {
    const a = edge[i];
    const b = edge[(i + 1) % n];
    return [add(a.m, a.n, -w), add(b.m, b.n, -w), add(b.m, b.n, w), add(a.m, a.n, w)].map(fmt).join(" ");
  };
  return { cell, edge, quad };
}

export type Spot = { progress: number; lane: Lane };

export default function TrackView({
  board, state, focus, ghost, zoomed, onToggle, onHelp,
}: {
  onHelp?: (k: HelpKey) => void;
  board: Board;
  state: GameState;
  focus: Driver | null;
  ghost: Spot | null;
  zoomed: boolean;
  onToggle: () => void;
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

  const g = useMemo(() => geometry(board.cells), [board.cells]);
  const t = state.track;
  const n = board.cells.length;
  const at = (p: number, k: number) => {
    const x = g.cell[lapCell(t, p)];
    return add(x.c, x.n, k);
  };
  const laneK = (l: Lane) => (l === 0 ? -LANE : LANE);
  const spotOf = (d: Driver): { p: Pt; deg: number } => {
    if (d.pit) {
      const q = d.pit.base + d.pit.pos;
      return { p: at(q, PIT), deg: g.cell[lapCell(t, q)].deg };
    }
    const cell = g.cell[lapCell(t, d.progress)];
    if (d.off) return { p: at(d.progress, OFF), deg: cell.deg + 35 };
    return { p: at(d.progress, laneK(d.lane)), deg: cell.deg };
  };

  // กล้อง: ซูมตามรถที่ถึงตา (มองไปข้างหน้า) หรือดูทั้งสนาม
  const { w: W, h: H } = size;
  let cx = board.w / 2;
  let cy = board.h / 2;
  let z = Math.min(W / (board.w + 14), H / (board.h + 14));
  if (zoomed && focus) {
    const me = spotOf(focus).p;
    const ahead = ghost ? at(ghost.progress, laneK(ghost.lane)) : at(focus.progress + 2, 0);
    cx = (me.x + ahead.x) / 2;
    cy = (me.y + ahead.y) / 2;
    const span = Math.hypot(ahead.x - me.x, ahead.y - me.y) + 18;
    // จอใหญ่ไม่ซูมเกินไป — ให้เห็นสนามข้างหน้าหลายช่อง
    z = Math.min(Math.min(W, H) / Math.max(36, span), MAX_ZOOM);
  }

  const pitCells = Array.from({ length: PIT_LEN }, (_, k) => t.pitEntry.start + k);
  const racers = state.drivers.filter((d) => d.finished === null && !d.out);
  const rain = isRain(state);
  const lane0 = g.cell.map((x) => fmt(add(x.c, x.n, -LANE))).join(" ");

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden bg-[#0d0d11]">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 block"
        role="img"
        aria-label={`แผนที่สนาม${board.name}${focus ? ` ซูมที่รถหมายเลข ${focus.num}` : ""} รถบนสนาม ${racers.length} คัน`}
      >
        <g
          className="transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-cx}px, ${-cy}px)` }}
        >
          {/* ผิวสนาม */}
          <path d={board.d} fill="none" stroke="#3b3b45" strokeWidth={HALF * 2 + 0.8} strokeLinejoin="round" strokeLinecap="round" />
          <path d={board.d} fill="none" stroke="#24242b" strokeWidth={HALF * 2} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={pitCells.map((p) => fmt(at(p, PIT))).join(" ")} fill="none" stroke="#2c2c34" strokeWidth={2.4} strokeLinecap="round" />
          <polyline points={pitCells.map((p) => fmt(at(p, PIT))).join(" ")} fill="none" stroke="#DEDEDE" strokeOpacity={0.45} strokeWidth={0.18} strokeDasharray="0.8 0.6" />
          {/* เส้นแข่ง (เลนใน) */}
          <polygon points={lane0} fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={LANE * 2 - 0.3} strokeLinejoin="round" />
          {/* โซนต่าง ๆ */}
          {g.cell.map((_, i) => {
            const corner = zoneAt(t, t.corners, i) >= 0;
            const drs = zoneAt(t, t.drs, i) >= 0;
            const entry = inZone(t.pitEntry, i);
            return (
              <g key={i}>
                {corner && <polygon points={g.quad(i)} fill="#E10600" fillOpacity={0.2} />}
                {drs && <polygon points={g.quad(i)} fill="#DEDEDE" fillOpacity={0.08} />}
                {entry && (
                  <polygon points={g.quad(i, HALF - 0.25)} fill="none" stroke="#DEDEDE" strokeOpacity={0.5} strokeWidth={0.18} strokeDasharray="0.6 0.5" />
                )}
                {i === t.vbox && <polygon points={g.quad(i, HALF - 0.25)} fill="#DEDEDE" fillOpacity={0.06} stroke="#DEDEDE" strokeWidth={0.25} />}
              </g>
            );
          })}
          {/* ขอบโค้ง แดง-ขาว */}
          {t.corners.map((zn, k) => {
            const cells: number[] = [];
            for (let i = zn.start; ; i = (i + 1) % n) {
              cells.push(i);
              if (i === zn.end) break;
            }
            const side = (s: number) =>
              [...cells.map((i) => g.edge[i]), g.edge[(zn.end + 1) % n]].map((e) => fmt(add(e.m, e.n, s * (HALF + 0.25)))).join(" ");
            return (
              <g key={k}>
                {[-1, 1].map((s) => (
                  <g key={s}>
                    <polyline points={side(s)} fill="none" stroke="#fff" strokeWidth={0.5} />
                    <polyline points={side(s)} fill="none" stroke="#E10600" strokeWidth={0.5} strokeDasharray="0.7 0.7" />
                  </g>
                ))}
              </g>
            );
          })}
          {/* ธงเหลือง */}
          {state.flags.map((f, k) => (
            <g key={k}>
              {Array.from({ length: f.to - f.from + 1 }, (_, j) => (
                <polygon key={j} points={g.quad(lapCell(t, f.from + j))} fill="#facc15" fillOpacity={0.28} />
              ))}
            </g>
          ))}
          {/* เส้นแบ่งช่อง */}
          {g.edge.map((e, i) => (
            <line
              key={i}
              x1={add(e.m, e.n, -HALF).x}
              y1={add(e.m, e.n, -HALF).y}
              x2={add(e.m, e.n, HALF).x}
              y2={add(e.m, e.n, HALF).y}
              stroke="#ffffff"
              strokeOpacity={i === 0 ? 0 : 0.16}
              strokeWidth={0.12}
            />
          ))}
          {/* เส้นสตาร์ท/เส้นชัย ลายตาหมากรุก */}
          {Array.from({ length: 8 }, (_, k) => {
            const e = g.edge[0];
            const p = add(e.m, e.n, -HALF + k * 0.75 + 0.375);
            return (
              <g key={k} transform={`translate(${p.x} ${p.y}) rotate(${g.cell[0].deg})`}>
                <rect x={-0.75} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#fff" : "#08080A"} />
                <rect x={0} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#08080A" : "#fff"} />
              </g>
            );
          })}
          {/* ป้าย */}
          {t.drs.map((zn, k) => {
            const p = at(zn.start, HALF + 1.6);
            return (
              <text key={k} x={p.x} y={p.y} fontSize={1.5} fontWeight={800} fill="#DEDEDE" textAnchor="middle" dominantBaseline="central">
                DRS
              </text>
            );
          })}
          <text {...xy(at(t.vbox, HALF + 1.8))} fontSize={1.3} fontWeight={800} fill="#DEDEDE" textAnchor="middle" dominantBaseline="central">
            V-BOX
          </text>
          <rect {...rectAt(at(t.pitEntry.start + BOX_AT, PIT), 1.4)} fill="none" stroke="#DEDEDE" strokeWidth={0.2} />
          <text {...xy(at(t.pitEntry.start + BOX_AT, PIT - 2))} fontSize={1.3} fontWeight={800} fill="#DEDEDE" fillOpacity={0.8} textAnchor="middle" dominantBaseline="central">
            PIT
          </text>

          {/* รถ */}
          {[...racers]
            .sort((a, b) => Number(a.id === focus?.id) - Number(b.id === focus?.id))
            .map((d) => {
              const s = spotOf(d);
              const c = look(d);
              const me = d.id === focus?.id;
              return (
                <g
                  key={d.id}
                  className="transition-transform duration-500 ease-out motion-reduce:transition-none"
                  style={{ transform: `translate(${s.p.x}px, ${s.p.y}px) rotate(${s.deg}deg)` }}
                  opacity={d.pit ? 0.75 : 1}
                >
                  {me && <circle r={3.3} fill="none" stroke="#E10600" strokeWidth={0.35} className="bg-blink" />}
                  {/* รถที่ผู้เล่นคุม: ฐานขาวจาง ๆ ให้แยกจากรถ AI ที่สีคล้ายกันได้ */}
                  {!d.ai && <ellipse rx={2.9} ry={1.5} fill="#ffffff" fillOpacity={0.22} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={0.18} />}
                  <g transform={`scale(${CAR_SCALE}) translate(-30 -13)`}>
                    <CarBody color={c.color} ink={c.ink} num={d.num} tyre={tyreOf(d)} ghost={!!d.pit} />
                  </g>
                </g>
              );
            })}
          {ghost && focus && (
            <g
              transform={`translate(${at(ghost.progress, laneK(ghost.lane)).x} ${at(ghost.progress, laneK(ghost.lane)).y}) rotate(${g.cell[lapCell(t, ghost.progress)].deg})`}
              className="bg-ghost"
            >
              <circle r={3.3} fill="#ffffff" fillOpacity={0.12} stroke="#ffffff" strokeWidth={0.3} strokeDasharray="0.8 0.6" />
              <g transform={`scale(${CAR_SCALE}) translate(-30 -13)`}>
                <CarBody color="#fff" ink="#fff" num={focus.num} ghost />
              </g>
            </g>
          )}
        </g>
      </svg>

      {rain && <div className="bg-rain pointer-events-none absolute inset-0" aria-hidden />}

      {/* แผนที่ย่อทั้งสนาม — แตะเพื่อสลับซูม/ทั้งสนาม */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!zoomed}
        aria-label={zoomed ? "ดูทั้งสนาม" : "ซูมที่รถ"}
        className="absolute right-2 top-2 rounded-xl border border-white/15 bg-[#08080A]/80 p-1.5 backdrop-blur"
      >
        <svg viewBox={`-6 -6 ${board.w + 12} ${board.h + 12}`} className="block h-24 w-16" aria-hidden>
          <path d={board.d} fill="none" stroke="#4a4a55" strokeWidth={3} strokeLinejoin="round" />
          {racers.map((d) => {
            const p = spotOf(d).p;
            const me = d.id === focus?.id;
            return <circle key={d.id} cx={p.x} cy={p.y} r={me ? 3.4 : 2} fill={me ? "#E10600" : d.ai ? "#8a8a95" : "#DEDEDE"} />;
          })}
        </svg>
        <span className="block pt-0.5 text-center text-[9px] font-bold text-white/70">{zoomed ? "ทั้งสนาม" : "ซูม"}</span>
      </button>

      <div className="absolute left-2 top-2 flex flex-col items-start gap-0.5 rounded-lg bg-[#08080A]/60 px-1.5 py-1 text-[10px] text-white/75">
        {(
          [
            ["corner", "โค้ง", "bg-(--color-f1)/60"],
            ["drs", "DRS", "bg-white/30"],
            ["vbox", "V-BOX", "border border-white/60"],
            ...(state.flags.length ? ([["flag", "ธงเหลือง", "bg-yellow-400/70"]] as const) : []),
          ] as const
        ).map(([k, label, sw]) => (
          <button key={k} type="button" onClick={() => onHelp?.(k)} className="flex items-center gap-1 underline decoration-white/25 decoration-dotted underline-offset-2">
            <i className={`h-2 w-2 rounded-sm ${sw}`} />
            {label}
          </button>
        ))}
      </div>
      <OsmCredit className="bottom-1.5 right-2" />
    </div>
  );
}

const xy = (p: Pt) => ({ x: p.x, y: p.y });
const rectAt = (p: Pt, s: number) => ({ x: p.x - s / 2, y: p.y - s / 2, width: s, height: s });
