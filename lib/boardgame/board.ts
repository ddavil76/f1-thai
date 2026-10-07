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

/** โค้งบนกระดาน: ช่วงช่องในรอบ (นับรวมปลาย) อาจคร่อมเส้นชัยได้ (start > end) */
export type Zone = { start: number; end: number };

export type Board = {
  circuitId: string;
  /** ชื่อสนามภาษาไทย */
  name: string;
  d: string;
  w: number;
  h: number;
  cells: Pt[];
  /** โค้งที่ต้องชะลอ คำนวณจากความโค้งของเส้นสนามจริง */
  corners: Zone[];
  /** โซน DRS บนทางตรงยาวที่สุด (ไม่เกิน 2 ช่วง) */
  drs: Zone[];
  /** โซนเบรกก่อนเข้าพิท (ช่องท้ายรอบก่อนเส้นสตาร์ท) */
  pitEntry: Zone;
  /** ช่อง V-BOX บนสนาม — ผ่านแล้วสลับยางฝน/ยางแห้ง และซ่อมรถ */
  vbox: number;
};

export const CELLS_PER_LAP = 36;
/** ช่องที่เลี้ยวเกินมุมนี้ (องศา) นับเป็นส่วนของโค้ง */
const CORNER_DEG = 30;
/** เก็บโค้งที่แรงที่สุดไม่เกินเท่านี้ต่อรอบ — มากกว่านี้รถจะติดโค้งแทบทุกตา */
const MAX_CORNERS = 6;
/** โค้งหนึ่งยาวไม่เกินเท่านี้ (ช่อง) */
const MAX_ZONE = 3;

/** มุมเลี้ยว (องศา) ที่แต่ละช่องของวงปิด */
export function turnAngles(cells: Pt[]): number[] {
  const n = cells.length;
  return cells.map((b, i) => {
    const a = cells[(i - 1 + n) % n];
    const c = cells[(i + 1) % n];
    let x = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return (Math.abs(x) * 180) / Math.PI;
  });
}

/**
 * หาโค้งจากเส้นสนาม: ช่องที่เลี้ยวแรงติดกันรวมเป็นโค้งเดียว (ห่างกัน 1 ช่องก็รวม)
 * แล้วเก็บเฉพาะโค้งที่แรงสุด ช่อง 0 (เส้นสตาร์ท) ไม่นับเป็นโค้ง
 */
export function findCorners(cells: Pt[]): Zone[] {
  const n = cells.length;
  const ang = turnAngles(cells);
  const hot = ang.map((v, i) => i !== 0 && v > CORNER_DEG);
  // ถมช่องว่าง 1 ช่องระหว่างช่องเลี้ยวแรง ให้เป็นโค้งต่อเนื่อง
  const fill = hot.map((h, i) => h || (i !== 0 && hot[(i - 1 + n) % n] && hot[(i + 1) % n]));
  if (fill.every(Boolean)) return [];
  // เริ่มไล่จากช่องที่ไม่ใช่โค้ง จะได้ไม่ตัดโค้งที่คร่อมจุดเริ่มอาเรย์
  const s0 = fill.findIndex((h) => !h);
  const zones: (Zone & { peak: number })[] = [];
  let cur: (Zone & { peak: number }) | null = null;
  for (let k = 1; k <= n; k++) {
    const i = (s0 + k) % n;
    if (fill[i]) {
      if (!cur) cur = { start: i, end: i, peak: ang[i] };
      else {
        cur.end = i;
        cur.peak = Math.max(cur.peak, ang[i]);
      }
    } else if (cur) {
      zones.push(cur);
      cur = null;
    }
  }
  return zones
    .sort((a, b) => b.peak - a.peak)
    .slice(0, MAX_CORNERS)
    .map((z) => trimZone(z, ang, n))
    .sort((a, b) => a.start - b.start);
}

/** โค้งยาวเกิน MAX_ZONE ช่อง: เก็บไว้แค่ช่วงรอบจุดที่เลี้ยวแรงสุด */
function trimZone(z: Zone, ang: number[], n: number): Zone {
  const len = z.start <= z.end ? z.end - z.start + 1 : n - z.start + z.end + 1;
  if (len <= MAX_ZONE) return { start: z.start, end: z.end };
  let peak = z.start;
  for (let k = 0; k < len; k++) {
    const i = (z.start + k) % n;
    if (ang[i] > ang[peak]) peak = i;
  }
  // ให้จุดแรงสุดอยู่กลางช่วง แต่ไม่หลุดออกนอกโค้งเดิม
  const offset = Math.min(Math.max((peak - z.start + n) % n - 1, 0), len - MAX_ZONE);
  const start = (z.start + offset) % n;
  return { start, end: (start + MAX_ZONE - 1) % n };
}

/** ช่องที่เลี้ยวน้อยกว่านี้ (องศา) นับเป็นทางตรง */
const STRAIGHT_DEG = 12;
/** ทางตรงต้องยาวอย่างน้อยเท่านี้ถึงจะเป็นโซน DRS */
const MIN_DRS = 3;
/** โซนเข้าพิทยาวกี่ช่อง (ก่อนเส้นสตาร์ท) */
export const PIT_ENTRY_CELLS = 3;

/** ทางตรงที่ยาวที่สุดไม่เกิน 2 ช่วง ไม่ทับโค้งและโซนเข้าพิท — สนามคดมากจะผ่อนเกณฑ์มุมลงจนเจอ */
export function findStraights(cells: Pt[], corners: Zone[]): Zone[] {
  for (const deg of [STRAIGHT_DEG, 20, 30, 45]) {
    const runs = straightRuns(cells, corners, deg);
    if (runs.length > 0) return runs;
  }
  return [];
}

function straightRuns(cells: Pt[], corners: Zone[], deg: number): Zone[] {
  const n = cells.length;
  const ang = turnAngles(cells);
  const inZone = (z: Zone, c: number) =>
    z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end;
  const flat = ang.map(
    (v, i) => v < deg && i < n - PIT_ENTRY_CELLS && !corners.some((z) => inZone(z, i)),
  );
  const runs: Zone[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && flat[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= MIN_DRS) runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return runs
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, 2)
    .sort((a, b) => a.start - b.start);
}

/** วาง V-BOX กลางรอบ ห่างจากโค้งและโซนเข้าพิท (ทางตรงก่อน) */
export function findVbox(cells: Pt[], corners: Zone[], drs: Zone[]): number {
  const n = cells.length;
  const inZone = (z: Zone, c: number) =>
    z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end;
  const ok = (c: number) => c > 0 && c < n - PIT_ENTRY_CELLS && !corners.some((z) => inZone(z, c));
  const mid = Math.floor(n / 2);
  const order = Array.from({ length: n }, (_, k) => (k % 2 ? mid + Math.ceil(k / 2) : mid - k / 2)).filter(
    (c) => c >= 0 && c < n,
  );
  return order.find((c) => ok(c) && !drs.some((z) => inZone(z, c))) ?? order.find(ok) ?? mid;
}

export function buildBoard(circuitId: string, name: string): Board | null {
  const track = circuitTrack(circuitId);
  if (!track) return null;
  const cells = resampleLoop(parsePolyline(track.d), CELLS_PER_LAP);
  const corners = findCorners(cells);
  const drs = findStraights(cells, corners);
  return {
    circuitId,
    name,
    d: track.d,
    w: track.w,
    h: track.h,
    cells,
    corners,
    drs,
    pitEntry: { start: CELLS_PER_LAP - PIT_ENTRY_CELLS, end: CELLS_PER_LAP - 1 },
    vbox: findVbox(cells, corners, drs),
  };
}
