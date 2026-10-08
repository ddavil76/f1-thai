/**
 * เส้นสนามแบบโค้งเรียบผ่านกลางทุกช่อง (Catmull-Rom แบบ centripetal) — ใช้วาดแผนที่และวางตำแหน่งรถ
 */
import type { Pt } from "./board";

/** จุดบนเส้นโค้งต่อหนึ่งช่อง — ยิ่งมากเส้นยิ่งเนียน */
const SAMPLES = 12;
/** ช่วงที่ใช้เกลี่ยทิศหัวรถ (ช่อง) */
const HEADING_SPAN = 0.3;
/** โค้งเลี้ยวกี่องศาต่อช่องถึงจะช้าลงเท่าตัว */
const CORNER_SLOW = 40;

export type Frame = { x: number; y: number; deg: number };

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * เส้นโค้ง Catmull-Rom (แบบ centripetal ไม่เกิดห่วง) ลากผ่านกลางทุกช่อง วนครบรอบ
 * ทรงคล้ายสนามจริงพอจำได้ แต่เรียบ รถจึงวิ่งและหันหัวได้ลื่น
 */
export function buildSpline(cells: Pt[]) {
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

export type Spline = ReturnType<typeof buildSpline>;
