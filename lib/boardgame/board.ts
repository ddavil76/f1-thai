import { circuitTrack } from "@/lib/circuits";

export type Pt = { x: number; y: number };

/** แปลง path แบบ "M x,y L x,y ... Z" (เส้นหักล้วน) เป็นรายการจุด */
export function parsePolyline(d: string): Pt[] {
  const pts: Pt[] = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    pts.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return pts;
}

/**
 * วางช่องบนเส้นสนามให้ห่างกันเท่า ๆ กันตามระยะเส้น วนครบรอบ
 * ช่อง 0 = เส้นสตาร์ท/เส้นชัย
 */
export function resampleLoop(pts: Pt[], count: number): Pt[] {
  if (pts.length < 2 || count < 1) return [];
  const loop = [...pts];
  const first = pts[0];
  const last = pts[pts.length - 1];
  // path ปิดอยู่แล้วถ้าจุดสุดท้ายซ้ำจุดแรก ไม่งั้นลากปิดเอง
  if (first.x !== last.x || first.y !== last.y) loop.push(first);

  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < loop.length; i++) {
    const len = Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y);
    seg.push(len);
    total += len;
  }

  const out: Pt[] = [];
  let i = 0;
  let acc = 0; // ระยะสะสมถึงต้นเซกเมนต์ i
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count;
    while (i < seg.length - 1 && acc + seg[i] < target) {
      acc += seg[i];
      i++;
    }
    const t = seg[i] === 0 ? 0 : (target - acc) / seg[i];
    out.push({
      x: loop[i].x + (loop[i + 1].x - loop[i].x) * t,
      y: loop[i].y + (loop[i + 1].y - loop[i].y) * t,
    });
  }
  return out;
}

export type Board = {
  circuitId: string;
  /** ชื่อสนามภาษาไทย */
  name: string;
  d: string;
  w: number;
  h: number;
  cells: Pt[];
};

export const CELLS_PER_LAP = 16;

export function buildBoard(circuitId: string, name: string): Board | null {
  const track = circuitTrack(circuitId);
  if (!track) return null;
  return {
    circuitId,
    name,
    d: track.d,
    w: track.w,
    h: track.h,
    cells: resampleLoop(parsePolyline(track.d), CELLS_PER_LAP),
  };
}
