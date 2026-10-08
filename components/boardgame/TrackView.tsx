"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import OsmCredit from "@/components/OsmCredit";
import { CarBody } from "@/components/boardgame/Car";
import type { Board, Pt } from "@/lib/boardgame/board";
import {
  BOX_AT, PIT_LEN, isRain, stepCost,
  type Driver, type GameState, type Lane,
} from "@/lib/boardgame/engine";
import { look, tyreOf } from "@/components/boardgame/look";
import type { HelpKey } from "@/components/boardgame/help";

/** ระยะจากเส้นกลางสนาม (หน่วยของแผนที่) */
const LANE = 1.3;
const HALF = 3;
const OFF = 4.6;
const PIT = -5.2;
/** ตัวรถยาว 60 หน่วย → ย่อให้ยาวราว 4.5 หน่วยบนแผนที่ */
const CAR_SCALE = 0.075;
/** พิกเซลต่อหน่วยแผนที่สูงสุดตอนซูม */
const MAX_ZOOM = 11;
/** จุดบนเส้นโค้งต่อหนึ่งช่อง — ยิ่งมากเส้นยิ่งเนียน */
const SAMPLES = 12;
/** ช่วงที่ใช้เกลี่ยทิศหัวรถ (ช่อง) */
const HEADING_SPAN = 0.3;
/** โค้งเลี้ยวกี่องศาต่อช่องถึงจะช้าลงเท่าตัว — ยิ่งน้อยยิ่งเบรกหนักในโค้ง */
const CORNER_SLOW = 40;

/** รถวิ่งจากช่องเดิมถึงช่องใหม่ใช้เวลาเท่าไร (ms) — ยิ่งไกลยิ่งนาน แต่ไม่เกินเพดาน */
const DRIVE_BASE_MS = 260;
const DRIVE_PER_CELL_MS = 75;
const DRIVE_MAX_MS = 950;
/** กล้องตามเป้าหมายเร็วแค่ไหน (ms ที่จะเข้าใกล้ราว 63%) */
const CAM_LAG_MS = 170;
/** พื้นที่ด้านล่างแผนที่ที่แถบข้อความบังอยู่ (px) */
const OVERVIEW_BOTTOM = 64;

/** ท่าทางรถบนแผนที่แบบต่อเนื่อง: pos = ระยะสะสม (มีทศนิยมได้ระหว่างวิ่ง) · k = ระยะห่างจากเส้นกลาง · spin = หมุนเพิ่ม */
type Pose = { pos: number; k: number; spin: number };
type Frame = { x: number; y: number; deg: number };

const laneOffset = (l: Lane) => (l === 0 ? -LANE : LANE);

function poseOf(d: Driver): Pose {
  if (d.pit) return { pos: d.pit.base + d.pit.pos, k: PIT, spin: 0 };
  if (d.off) return { pos: d.progress, k: OFF, spin: 35 };
  return { pos: d.progress, k: laneOffset(d.lane), spin: 0 };
}

/* ---------- เส้นสนามแบบโค้งเรียบ ---------- */

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * เส้นโค้ง Catmull-Rom (แบบ centripetal ไม่เกิดห่วง) ลากผ่านกลางทุกช่อง วนครบรอบ
 * ทรงคล้ายสนามจริงพอจำได้ แต่เรียบ รถจึงวิ่งและหันหัวได้ลื่น
 */
function buildSpline(cells: Pt[]) {
  const n = cells.length;
  const pts: Pt[] = [];
  const lerp = (a: Pt, b: Pt, ta: number, tb: number, t: number): Pt => {
    const w = tb - ta || 1e-6;
    return { x: (a.x * (tb - t) + b.x * (t - ta)) / w, y: (a.y * (tb - t) + b.y * (t - ta)) / w };
  };
  for (let i = 0; i < n; i++) {
    const p0 = cells[(i - 1 + n) % n];
    const p1 = cells[i];
    const p2 = cells[(i + 1) % n];
    const p3 = cells[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(dist(p0, p1)) + 1e-4;
    const t2 = t1 + Math.sqrt(dist(p1, p2)) + 1e-4;
    const t3 = t2 + Math.sqrt(dist(p2, p3)) + 1e-4;
    for (let s = 0; s < SAMPLES; s++) {
      const t = t1 + ((t2 - t1) * s) / SAMPLES;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      pts.push(lerp(b1, b2, t1, t2, t));
    }
  }
  const N = pts.length;
  const tan = pts.map((_, j) => {
    const a = pts[(j - 1 + N) % N];
    const b = pts[(j + 1) % N];
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const center = (u: number): Pt => {
    const v = (((u % n) + n) % n) * SAMPLES;
    const j = Math.floor(v);
    const f = v - j;
    const a = pts[j % N];
    const b = pts[(j + 1) % N];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  /** ตำแหน่งและทิศที่ช่อง u (มีทศนิยมได้) ห่างจากเส้นกลาง k — ทิศหัวรถเกลี่ยจากช่วงสั้น ๆ รอบจุด จะได้ไม่กระชากในโค้งหักศอก */
  const frame = (u: number, k = 0): Frame => {
    const c = center(u);
    const a = center(u - HEADING_SPAN);
    const b = center(u + HEADING_SPAN);
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return { x: c.x - ty * k, y: c.y + tx * k, deg: (Math.atan2(ty, tx) * 180) / Math.PI };
  };

  // "ต้นทุน" การวิ่งตามความโค้ง: โค้งแรงนับแพง → รถชะลอเข้าโค้งแล้วเร่งบนทางตรงเอง
  const cost = new Float64Array(N + 1);
  for (let j = 0; j < N; j++) {
    const ta = tan[j];
    const tb = tan[(j + 1) % N];
    const turn = Math.abs(Math.atan2(ta.x * tb.y - ta.y * tb.x, ta.x * tb.x + ta.y * tb.y)) * (180 / Math.PI) * SAMPLES;
    cost[j + 1] = cost[j] + (1 + turn / CORNER_SLOW) / SAMPLES;
  }
  const lapCost = cost[N];
  /** ต้นทุนสะสมถึงช่อง u (นับข้ามรอบได้) */
  const costAt = (u: number) => {
    const lap = Math.floor(u / n);
    const v = (u - lap * n) * SAMPLES;
    const j = Math.floor(v);
    return lap * lapCost + cost[j] + (cost[Math.min(N, j + 1)] - cost[j]) * (v - j);
  };
  /** หาช่อง u ที่ต้นทุนสะสมเท่ากับ c (ค้นแบบแบ่งครึ่งในช่วง lo..hi) */
  const posAtCost = (c: number, lo: number, hi: number) => {
    let a = Math.min(lo, hi);
    let b = Math.max(lo, hi);
    for (let i = 0; i < 24; i++) {
      const m = (a + b) / 2;
      if (costAt(m) < c) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  const pt = (u: number, k: number) => {
    const f = frame(u, k);
    return `${f.x.toFixed(2)},${f.y.toFixed(2)}`;
  };
  /** เส้นตามสนามจากช่อง u0 ถึง u1 ห่างจากกลาง k */
  const line = (u0: number, u1: number, k: number) => {
    const out: string[] = [];
    const steps = Math.max(1, Math.round((u1 - u0) * SAMPLES));
    for (let s = 0; s <= steps; s++) out.push(pt(u0 + ((u1 - u0) * s) / steps, k));
    return out.join(" ");
  };
  /** แถบพื้นที่ตามสนามจากช่อง u0 ถึง u1 ระหว่างระยะ k0..k1 */
  const strip = (u0: number, u1: number, k0: number, k1: number) =>
    `${line(u0, u1, k0)} ${line(u0, u1, k1).split(" ").reverse().join(" ")}`;
  /** เส้นรอบสนามทั้งวง (polygon) */
  const loop = (k: number) => line(0, n - 1 / SAMPLES, k);
  return { n, frame, line, strip, loop, costAt, posAtCost };
}

type Spline = ReturnType<typeof buildSpline>;

const placePose = (sp: Spline, q: Pose): Frame => {
  const f = sp.frame(q.pos, q.k);
  return { ...f, deg: f.deg + q.spin };
};

const poseTransform = (p: Frame) => `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) rotate(${p.deg.toFixed(2)})`;

/** เร่งออกตัวแล้วเบรกเข้าจุดจอด */
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

export type Spot = { progress: number; lane: Lane };

type Anim = { from: Pose; to: Pose; t0: number; dur: number; c0: number; c1: number; cell: number };

/** จุดที่ไปถึงได้ของแต่ละตัวเลือก (โชว์ก่อนเลือกไพ่) */
export type Reach = { label: string; progress: number; lane: Lane; tone: "base" | "card" };

export default function TrackView({
  board, state, focus, ghost, zoomed, onToggle, onHelp, reach = [], instant = false,
}: {
  reach?: Reach[];
  /** วาดตำแหน่งรถทันทีไม่ทำแอนิเมชัน (เช่นเริ่มดูซ้ำ) */
  instant?: boolean;
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

  const sp = useMemo(() => buildSpline(board.cells), [board.cells]);
  const t = state.track;
  const n = sp.n;
  const { w: W, h: H } = size;

  /* ---------- แอนิเมชัน: รถวิ่งตามเส้นโค้ง + กล้องตามนุ่ม ๆ ---------- */
  const carEls = useRef(new Map<number, SVGGElement>());
  const trailEls = useRef(new Map<number, SVGLineElement>());
  const camEl = useRef<SVGGElement>(null);
  const shown = useRef(new Map<number, Pose>());
  const anims = useRef(new Map<number, Anim>());
  const cam = useRef<{ x: number; y: number; z: number } | null>(null);
  const raf = useRef(0);
  const view = useRef({ focusId: null as number | null, ghost: null as Spot | null, zoomed, W, H, drivers: state.drivers, sp, track: state.track, ours: state.rules === "ours" });

  /** เป้ากล้อง: ซูมที่รถที่โฟกัส (ตำแหน่งที่กำลังวิ่งอยู่จริง) มองไปข้างหน้า หรือดูทั้งสนาม */
  const camTarget = () => {
    const v = view.current;
    // ดูทั้งสนาม: เผื่อที่ด้านล่างให้แถบข้อความการเดิน แล้วดันภาพขึ้นครึ่งหนึ่งของที่เผื่อ
    const oz = Math.min(v.W / (board.w + 14), (v.H - OVERVIEW_BOTTOM) / (board.h + 14));
    const overview = { x: board.w / 2, y: board.h / 2 + OVERVIEW_BOTTOM / 2 / oz, z: oz };
    const d = v.focusId === null ? null : v.drivers[v.focusId];
    if (!v.zoomed || !d) return overview;
    const q = shown.current.get(d.id) ?? poseOf(d);
    const me = placePose(v.sp, q);
    const ahead = v.ghost ? v.sp.frame(v.ghost.progress, laneOffset(v.ghost.lane)) : v.sp.frame(q.pos + 2.5, 0);
    const span = Math.hypot(ahead.x - me.x, ahead.y - me.y) + 18;
    return { x: (me.x + ahead.x) / 2, y: (me.y + ahead.y) / 2, z: Math.min(Math.min(v.W, v.H) / Math.max(36, span), MAX_ZOOM) };
  };

  const writeCam = () => {
    const c = cam.current;
    const v = view.current;
    if (c && camEl.current) {
      camEl.current.setAttribute("transform", `translate(${v.W / 2} ${v.H / 2}) scale(${c.z.toFixed(4)}) translate(${(-c.x).toFixed(3)} ${(-c.y).toFixed(3)})`);
    }
  };

  /** ตัวเลข "−แรง" ลอยขึ้นแล้วจางหาย (อยู่ในกลุ่มกล้อง จึงเลื่อนไปกับสนาม) */
  const spawnCost = (p: Frame, cost: number) => {
    const g = camEl.current;
    if (!g) return;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("x", p.x.toFixed(2));
    el.setAttribute("y", p.y.toFixed(2));
    el.setAttribute("font-size", "1.6");
    el.setAttribute("font-weight", "900");
    el.setAttribute("text-anchor", "middle");
    el.setAttribute("fill", cost >= 3 ? "#ff3b2f" : cost === 2 ? "#fdba74" : "#ffffff");
    el.setAttribute("class", "bg-float");
    el.textContent = `−${cost}`;
    g.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  };

  const kick = () => {
    if (raf.current) return;
    let last = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      let busy = false;
      for (const [id, a] of anims.current) {
        const el = carEls.current.get(id);
        const trail = trailEls.current.get(id);
        const u = Math.min(1, (now - a.t0) / a.dur);
        const e = ease(u);
        const q = {
          // เดินตามต้นทุนความโค้ง: ช้าในโค้ง เร็วบนทางตรง
          pos: view.current.sp.posAtCost(a.c0 + (a.c1 - a.c0) * e, a.from.pos, a.to.pos),
          k: a.from.k + (a.to.k - a.from.k) * e,
          spin: a.from.spin + (a.to.spin - a.from.spin) * e,
        };
        const before = shown.current.get(id)?.pos ?? q.pos;
        shown.current.set(id, q);
        el?.setAttribute("transform", poseTransform(placePose(view.current.sp, q)));
        // เส้นความเร็วท้ายรถ ยาวตามความเร็วจริงในเฟรมนี้ (ช่องต่อวินาที)
        const speed = dt > 0 ? (Math.abs(q.pos - before) * 1000) / dt : 0;
        trail?.setAttribute("x2", (-2.2 - Math.min(7, speed * 0.32)).toFixed(2));
        trail?.setAttribute("opacity", u < 1 ? Math.min(0.75, speed * 0.04).toFixed(2) : "0");
        // รถผู้เล่น (กติกาของเรา): ตัวเลขแรงที่ใช้ลอยขึ้นทุกช่องที่วิ่งเข้า
        const v = view.current;
        if (v.ours && !v.drivers[id]?.ai && a.to.pos > a.from.pos) {
          while (a.cell < Math.floor(q.pos) && a.cell < a.to.pos) {
            a.cell++;
            spawnCost(v.sp.frame(a.cell, q.k > 0 ? q.k + 2 : q.k - 2), stepCost(v.track, a.cell));
          }
        }
        if (u < 1) busy = true;
        else anims.current.delete(id);
      }
      const target = camTarget();
      const c = cam.current ?? target;
      const f = reduce ? 1 : 1 - Math.exp(-dt / CAM_LAG_MS);
      const next = { x: c.x + (target.x - c.x) * f, y: c.y + (target.y - c.y) * f, z: c.z + (target.z - c.z) * f };
      cam.current = next;
      writeCam();
      const settled = Math.abs(target.x - next.x) < 0.01 && Math.abs(target.y - next.y) < 0.01 && Math.abs(target.z - next.z) < 0.001;
      raf.current = busy || !settled ? requestAnimationFrame(tick) : 0;
    };
    raf.current = requestAnimationFrame(tick);
  };

  // ทุกครั้งที่สถานะเปลี่ยน: ตั้งแอนิเมชันให้รถที่ย้ายที่ แล้วปลุกลูปให้ทำงาน
  useLayoutEffect(() => {
    view.current = { focusId: focus?.id ?? null, ghost, zoomed, W, H, drivers: state.drivers, sp, track: state.track, ours: state.rules === "ours" };
    const reduce = instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    for (const d of state.drivers) {
      if (d.finished !== null || d.out) {
        shown.current.delete(d.id);
        anims.current.delete(d.id);
        continue;
      }
      const to = poseOf(d);
      const from = shown.current.get(d.id);
      const el = carEls.current.get(d.id);
      const same = from && from.pos === to.pos && from.k === to.k && from.spin === to.spin;
      if (!from || !el || reduce || same) {
        anims.current.delete(d.id);
        shown.current.set(d.id, to);
        continue;
      }
      const prev = anims.current.get(d.id);
      if (prev && prev.to.pos === to.pos && prev.to.k === to.k && prev.to.spin === to.spin) continue;
      const c0 = sp.costAt(from.pos);
      const c1 = sp.costAt(to.pos);
      const dur = Math.min(DRIVE_MAX_MS, DRIVE_BASE_MS + (Math.abs(c1 - c0) + Math.abs(to.k - from.k) / 3) * DRIVE_PER_CELL_MS);
      anims.current.set(d.id, { from, to, t0: now, dur, c0, c1, cell: Math.floor(from.pos) });
      el.setAttribute("transform", poseTransform(placePose(sp, from)));
    }
    if (!cam.current) {
      cam.current = camTarget();
      writeCam();
    }
    kick();
  });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ---------- ฉากสนาม (คำนวณครั้งเดียวต่อสนาม) ---------- */
  const scene = useMemo(() => {
    const cornerRanges = t.corners.map((z) => {
      const end = z.end >= z.start ? z.end : z.end + n;
      return [z.start - 0.5, end + 0.5, !!z.slow] as const;
    });
    const drsRanges = t.drs.map((z) => [z.start - 0.5, (z.end >= z.start ? z.end : z.end + n) + 0.5] as const);
    const pitFrom = t.pitEntry.start - 0.5;
    const pitTo = t.pitEntry.start + PIT_LEN - 0.5;
    return { cornerRanges, drsRanges, pitFrom, pitTo };
  }, [t, n]);

  const racers = state.drivers.filter((d) => d.finished === null && !d.out);
  const rain = isRain(state);
  const fr = (u: number, k: number) => sp.frame(u, k);
  const spotOf = (d: Driver) => placePose(sp, poseOf(d));

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden bg-[#0b130f]">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 block"
        role="img"
        aria-label={`แผนที่สนาม${board.name}${focus ? ` ซูมที่รถหมายเลข ${focus.num}` : ""} รถบนสนาม ${racers.length} คัน`}
      >
        <g ref={camEl}>
          {/* หญ้าข้างทาง */}
          <polygon points={sp.loop(0)} fill="none" stroke="#12261b" strokeWidth={HALF * 2 + 7} strokeLinejoin="round" />
          {/* กรวดรอบโค้ง (วาดเป็นเส้นหนาตามแนวกลาง โค้งแคบก็ไม่เกิดหนามแหลม) */}
          {scene.cornerRanges.map(([a, b], k) => (
            <polyline key={k} points={sp.line(a - 0.4, b + 0.4, 0)} fill="none" stroke="#3d3526" strokeWidth={(HALF + 2.6) * 2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {/* อาคารพิทและเลนพิท */}
          <polygon points={sp.strip(scene.pitFrom + 0.6, scene.pitTo - 0.6, PIT - 4.4, PIT - 2.2)} fill="#1c1c22" stroke="#2c2c34" strokeWidth={0.2} />
          {Array.from({ length: PIT_LEN - 1 }, (_, i) => (
            <polygon
              key={i}
              points={sp.strip(scene.pitFrom + 0.7 + i, scene.pitFrom + 1.5 + i, PIT - 4.1, PIT - 2.5)}
              fill={i + 1 === BOX_AT ? "#3a2a10" : "#25252c"}
            />
          ))}
          <polygon points={sp.strip(scene.pitFrom, scene.pitTo, PIT - 1.4, PIT + 1.4)} fill="#26262c" />
          <polyline points={sp.line(scene.pitFrom, scene.pitTo, PIT + 1.6)} fill="none" stroke="#DEDEDE" strokeOpacity={0.5} strokeWidth={0.2} />
          {/* ขอบแดง-ขาวในโค้ง (อยู่ใต้ผิวแทร็ก โผล่เป็นแนวขอบสองข้าง) */}
          {scene.cornerRanges.map(([a, b], k) => (
            <g key={k}>
              <polyline points={sp.line(a, b, 0)} fill="none" stroke="#ffffff" strokeWidth={(HALF + 0.55) * 2} strokeLinejoin="round" />
              <polyline points={sp.line(a, b, 0)} fill="none" stroke="#E10600" strokeWidth={(HALF + 0.55) * 2} strokeDasharray="0.7 0.7" strokeLinejoin="round" />
            </g>
          ))}
          {/* ผิวแทร็ก + เส้นขอบขาว */}
          <polygon points={sp.loop(0)} fill="none" stroke="#e6e6e6" strokeOpacity={0.8} strokeWidth={HALF * 2} strokeLinejoin="round" />
          <polygon points={sp.loop(0)} fill="none" stroke="#2a2a30" strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
          {/* เซฟตี้คาร์ / VSC: ถนนเหลืองทุกเซกเตอร์ (ช่วง ENDING จางลง) */}
          {state.neutral && (
            <polygon
              points={sp.loop(0)}
              fill="none"
              stroke="#facc15"
              strokeOpacity={state.neutral.left > 1 ? 0.32 : 0.16}
              strokeWidth={HALF * 2 - 0.45}
              strokeLinejoin="round"
            />
          )}
          {/* เส้นแข่ง (เลนใน) จาง ๆ */}
          <polygon points={sp.loop(-LANE)} fill="none" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={LANE * 2 - 0.4} strokeLinejoin="round" />
          {/* โซน DRS */}
          {scene.drsRanges.map(([a, b], k) => (
            <polyline key={k} points={sp.line(a, b, 0)} fill="none" stroke="#DEDEDE" strokeOpacity={0.06} strokeWidth={HALF * 2 - 0.6} />
          ))}
          {/* โค้ง: ระบายแดง — โค้งความเร็วต่ำเข้มกว่า */}
          {scene.cornerRanges.map(([a, b, slow], k) => (
            <polyline key={k} points={sp.line(a, b, 0)} fill="none" stroke="#E10600" strokeOpacity={slow ? 0.26 : 0.1} strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
          ))}
          {/* โซนเข้าพิท / V-BOX */}
          <polygon points={sp.strip(t.pitEntry.start - 0.5, t.pitEntry.end + 0.5, -HALF + 0.25, HALF - 0.25)} fill="none" stroke="#DEDEDE" strokeOpacity={0.45} strokeWidth={0.18} strokeDasharray="0.6 0.5" />
          <polygon points={sp.strip(t.vbox - 0.5, t.vbox + 0.5, -HALF + 0.25, HALF - 0.25)} fill="#DEDEDE" fillOpacity={0.05} stroke="#DEDEDE" strokeWidth={0.25} />
          {/* ธงเหลือง */}
          {state.flags.map((f, k) => (
            <polyline key={k} points={sp.line(f.from - 0.5, f.to + 0.5, 0)} fill="none" stroke="#facc15" strokeOpacity={0.24} strokeWidth={HALF * 2 - 0.45} strokeLinejoin="round" />
          ))}
          {/* เส้นแบ่งช่อง */}
          {Array.from({ length: n }, (_, i) => {
            if (i === 0) return null;
            const a = fr(i - 0.5, -HALF + 0.3);
            const b = fr(i - 0.5, HALF - 0.3);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={0.12} />;
          })}
          {/* ช่องจอดกริดสตาร์ท */}
          {Array.from({ length: 12 }, (_, s) => {
            const pos = -Math.floor(s / 2);
            const k = laneOffset((s % 2) as Lane);
            return (
              <polyline
                key={s}
                points={[fr(pos - 0.3, k - 0.95), fr(pos + 0.32, k - 0.95), fr(pos + 0.32, k + 0.95), fr(pos - 0.3, k + 0.95)]
                  .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                  .join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.45}
                strokeWidth={0.15}
              />
            );
          })}
          {/* เส้นสตาร์ท/เส้นชัย ลายตาหมากรุก */}
          {Array.from({ length: 8 }, (_, k) => {
            const p = fr(-0.5, -HALF + k * 0.75 + 0.375);
            return (
              <g key={k} transform={`translate(${p.x} ${p.y}) rotate(${p.deg})`}>
                <rect x={-0.75} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#fff" : "#08080A"} />
                <rect x={0} y={-0.375} width={0.75} height={0.75} fill={k % 2 ? "#08080A" : "#fff"} />
              </g>
            );
          })}
          {/* ป้าย */}
          {t.drs.map((zn, k) => {
            const p = fr(zn.start, HALF + 1.8);
            return (
              <text key={k} x={p.x} y={p.y} fontSize={1.5} fontWeight={800} fill="#DEDEDE" textAnchor="middle" dominantBaseline="central">
                DRS
              </text>
            );
          })}
          <Label p={fr(t.vbox, HALF + 2)}>V-BOX</Label>
          {/* กติกาของเรา: ป้ายบอกว่าช่องโค้งกินแรงกี่ก้าว */}
          {state.rules === "ours" &&
            scene.cornerRanges.map(([a, b, slow], k) => {
              const p = fr((a + b) / 2, -HALF - 2.4);
              return (
                <g key={k}>
                  <circle cx={p.x} cy={p.y} r={1.25} fill={slow ? "#E10600" : "#08080A"} stroke="#fff" strokeWidth={0.2} />
                  <text x={p.x} y={p.y} fontSize={1.25} fontWeight={900} fill="#fff" textAnchor="middle" dominantBaseline="central">
                    ×{slow ? 3 : 2}
                  </text>
                </g>
              );
            })}
          <Label p={fr(t.pitEntry.start + BOX_AT, PIT - 5.6)}>PIT</Label>

          {/* กติกาของเรา: แรงที่ช่องโค้งข้างหน้ากิน */}
          {state.rules === "ours" &&
            focus &&
            Array.from({ length: 12 }, (_, i) => focus.progress + 1 + i).map((c) => {
              const cost = stepCost(t, c);
              if (cost === 1) return null;
              const p = fr(c, 0);
              return (
                <text key={c} x={p.x} y={p.y} fontSize={1.05} fontWeight={900} fill={cost >= 3 ? "#ff3b2f" : "#fdba74"} fillOpacity={0.9} textAnchor="middle" dominantBaseline="central">
                  {cost}
                </text>
              );
            })}
          {/* จุดที่ไปถึงได้ของแต่ละตัวเลือก (รวมป้ายถ้าไปถึงที่เดียวกัน) */}
          {Object.values(
            reach.reduce<Record<string, Reach & { labels: string[] }>>((acc, r) => {
              const key = `${r.progress}:${r.lane}`;
              (acc[key] ??= { ...r, labels: [] }).labels.push(r.label);
              if (r.tone === "card") acc[key].tone = "card";
              return acc;
            }, {}),
          ).map((r) => {
            const p = fr(r.progress, laneOffset(r.lane));
            const text = r.labels.join("·");
            const w = 1.2 + text.length * 0.75;
            return (
              <g key={`${r.progress}:${r.lane}`} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`} opacity={0.95}>
                <rect x={-w / 2} y={-1} width={w} height={2} rx={1} fill={r.tone === "base" ? "#1F1F24" : "#E10600"} stroke="#fff" strokeWidth={0.15} />
                <text fontSize={1.2} fontWeight={900} fill="#fff" textAnchor="middle" dominantBaseline="central">
                  {text}
                </text>
              </g>
            );
          })}

          {/* รถ */}
          {[...racers]
            .sort((a, b) => Number(a.id === focus?.id) - Number(b.id === focus?.id))
            .map((d) => {
              const c = look(d);
              const me = d.id === focus?.id;
              return (
                <g
                  key={d.id}
                  ref={(el) => {
                    if (el) carEls.current.set(d.id, el);
                    else carEls.current.delete(d.id);
                  }}
                  transform={poseTransform(placePose(sp, poseOf(d)))}
                  opacity={d.pit ? 0.8 : 1}
                >
                  {/* เส้นความเร็ว (ยืดตอนวิ่ง) */}
                  <line
                    ref={(el) => {
                      if (el) trailEls.current.set(d.id, el);
                      else trailEls.current.delete(d.id);
                    }}
                    x1={-2.2}
                    y1={0}
                    x2={-2.2}
                    y2={0}
                    stroke={c.color}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    opacity={0}
                  />
                  {/* เงาใต้รถ */}
                  <ellipse cx={0.35} cy={0.45} rx={2.5} ry={1.15} fill="#000" fillOpacity={0.45} />
                  {me && <circle r={3.3} fill="none" stroke="#E10600" strokeWidth={0.35} className="bg-blink" />}
                  {/* รถที่ผู้เล่นคุม: ฐานขาวจาง ๆ ให้แยกจากรถ AI ที่สีคล้ายกันได้ */}
                  {!d.ai && <ellipse rx={2.9} ry={1.5} fill="#ffffff" fillOpacity={0.18} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={0.18} />}
                  <g transform={`scale(${CAR_SCALE}) translate(-30 -13)`}>
                    <CarBody color={c.color} ink={c.ink} num={d.num} tyre={tyreOf(d)} ghost={!!d.pit} />
                  </g>
                </g>
              );
            })}
          {/* รถเซฟตี้คาร์นำขบวน */}
          {state.neutral?.kind === "sc" && racers.some((d) => !d.pit && !d.off) && (() => {
            const lead = Math.max(...racers.filter((d) => !d.pit && !d.off).map((d) => d.progress));
            return (
              <g transform={poseTransform(placePose(sp, { pos: lead + 1, k: -LANE, spin: 0 }))} aria-label="รถเซฟตี้คาร์">
                <ellipse cx={0.35} cy={0.45} rx={2.5} ry={1.15} fill="#000" fillOpacity={0.45} />
                <g transform={`scale(${CAR_SCALE}) translate(-30 -13)`}>
                  <rect x="4" y="5" width="52" height="16" rx="6" fill="#facc15" stroke="#08080A" strokeWidth="1.2" />
                  <rect x="22" y="8" width="14" height="10" rx="2" fill="#08080A" />
                  <text x="44" y="13.5" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="900" fill="#08080A">SC</text>
                </g>
              </g>
            );
          })()}
          {ghost && focus && (
            <g transform={poseTransform(placePose(sp, { pos: ghost.progress, k: laneOffset(ghost.lane), spin: 0 }))} className="bg-ghost">
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
          <polygon points={sp.loop(0)} fill="none" stroke="#4a4a55" strokeWidth={3} strokeLinejoin="round" />
          {racers.map((d) => {
            const p = spotOf(d);
            const me = d.id === focus?.id;
            return <circle key={d.id} cx={p.x} cy={p.y} r={me ? 3.4 : 2} fill={me ? "#E10600" : d.ai ? "#8a8a95" : "#DEDEDE"} />;
          })}
        </svg>
        <span className="block pt-0.5 text-center text-[9px] font-bold text-white/70">{zoomed ? "ทั้งสนาม" : "ซูม"}</span>
      </button>

      <div className="absolute left-2 top-2 flex flex-col items-start gap-0.5 rounded-lg bg-[#08080A]/60 px-1.5 py-1 text-[10px] text-white/75">
        {(
          [
            ...(state.rules === "ours"
              ? ([
                  ["corner", "โค้งเร็ว ×2", "bg-(--color-f1)/30"],
                  ["corner", "โค้งช้า ×3", "bg-(--color-f1)/80"],
                ] as const)
              : ([["corner", "โค้ง", "bg-(--color-f1)/60"]] as const)),
            ["drs", "DRS", "bg-white/30"],
            ["vbox", "V-BOX", "border border-white/60"],
            ...(state.flags.length ? ([["flag", "ธงเหลือง", "bg-yellow-400/70"]] as const) : []),
          ] as const
        ).map(([k, label, sw]) => (
          <button key={label} type="button" onClick={() => onHelp?.(k)} className="flex items-center gap-1 underline decoration-white/25 decoration-dotted underline-offset-2">
            <i className={`h-2 w-2 rounded-sm ${sw}`} />
            {label}
          </button>
        ))}
      </div>
      <OsmCredit className="bottom-1.5 right-2" />
    </div>
  );
}

function Label({ p, children }: { p: Frame; children: string }) {
  return (
    <text x={p.x} y={p.y} fontSize={1.3} fontWeight={800} fill="#DEDEDE" fillOpacity={0.85} textAnchor="middle" dominantBaseline="central">
      {children}
    </text>
  );
}

