/**
 * พิทเลน (โหมดแข่ง): เลนขนานกับทางตรงช่วงเส้นชัย อยู่หลังกำแพงฝั่งหนึ่ง
 * — แต่ละสนามเลือกช่วงทางตรงใกล้เส้นชัยเอง (ไม่ทับชิเคน/โค้งแคบ ไม่งั้นเส้นทางที่เยื้องออกไปจะพันเป็นวง)
 *   ทางเข้า entry · ทางออก exit (ระยะเทียบเส้นชัย) · ช่วงเลี้ยวเข้า/ออก taper เมตร
 * — อู่ของแต่ละทีมเรียงตามลำดับทีม (ทีมแรกอยู่ใกล้ทางเข้า) · จังหวะกดจอดจึงต่างกันตามตำแหน่งอู่
 * — ในพิทเลนรถวิ่งเองด้วยความเร็วจำกัด · กด "จอด" ให้ตรงจังหวะ (รถเบรกหยุดห่างจากจุดกด STOP_DIST เมตร)
 *   หยุดตรงกรอบ = เปลี่ยนยางไว · ก่อน/เลยกรอบ = ช่างต้องขยับตาม ช้าลงตามระยะที่พลาด
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { DS, sample, type DriveTrack } from "./line";

/** พิทเลนยาวสุดก่อน/หลังเส้นชัย · ช่วงเลี้ยวเข้า/ออก (เมตร) */
export const PIT_IN = 420;
export const PIT_OUT = 360;
export const TAPER = 150;
/** ช่วงเลี้ยวเข้า/ออกสั้นสุด (สนามที่ทางตรงสั้น) · หาช่วงทางตรงห่างจากเส้นชัยได้ไม่เกิน (เมตร) */
const TAPER_MIN = 90;
const SEARCH = 1400;
/** ความโค้ง × ระยะเยื้องของพิท/อู่ ไม่เกินนี้ (เยื้องออกจากโค้งแคบมาก ๆ เส้นทางจะพันเป็นวง) */
const BEND_MAX = 0.25;
/** ความเร็วจำกัดในพิทเลน (ม./วิ) = 80 กม./ชม. */
export const PIT_V = 80 / 3.6;
/** แรงเบรกตอนกดจอด (ม./วิ²) → ระยะเบรกจาก PIT_V จนหยุด */
export const STOP_DECEL = 10;
export const STOP_DIST = (PIT_V * PIT_V) / (2 * STOP_DECEL);
/** ระยะห่างของอู่แต่ละทีม (เมตร) */
export const BOX_GAP = 16;
/** ช่องจอดหน้าอู่ห่างจากกึ่งกลางเลนวิ่งในพิท (เมตร) · ต่อคิวในพิทเลนห่างคันหน้า (กึ่งกลางถึงกึ่งกลาง) */
export const BOX_SHIFT = 3.2;
export const PIT_QUEUE = 8;
/** กดจอดได้เมื่อจุดหยุดอยู่ห่างกรอบไม่เกินนี้ (เมตร) — ไม่กดเลย = จอดเลยกรอบไป STOP_MISS */
export const STOP_WINDOW = 12;
export const STOP_MISS = 10;
/** เวลาเปลี่ยนยางเมื่อจอดตรงกรอบ (วินาที) */
export const STOP_BASE = 2.3;
/** กดปล่อยรถก่อนไฟเขียว = ช่างยังไม่เสร็จ เสียเวลาเพิ่ม · ไม่กดเลย ปล่อยเองหลังไฟเขียวกี่วินาที */
export const EARLY_GO = 0.6;
export const AUTO_GO = 2.5;
/** ไม่เข้าพิทเลย (กติกาต้องเข้าอย่างน้อย 1 ครั้ง) = โทษกี่วินาที */
export const PIT_MISS_PENALTY = 60;
/** ความกว้างพิทเลน · ช่องว่างระหว่างกำแพงสนามกับพิทเลน · ความลึกอู่ (เมตร) */
export const PIT_W = 7;
const PIT_GAP = 2;
export const GARAGE_D = 12;

export type PitLane = {
  /** ฝั่ง: 1 = ขวาของทิศวิ่ง · −1 = ซ้าย */
  side: number;
  /** ระยะเยื้องกึ่งกลางพิทเลนจากเส้นกลางสนาม (เมตร มีเครื่องหมายตามฝั่ง) */
  offset: number;
  /** ขอบพิทเลนด้านสนาม (ระยะจากเส้นกลาง ไม่มีเครื่องหมาย) — กำแพงพิทอยู่ระหว่างนี้กับกำแพงสนาม */
  inner: number;
  /** ทางเข้า · ทางออก (ระยะเทียบเส้นชัย, ลบ = ก่อนเส้น) · ช่วงเลี้ยวเข้า/ออก (เมตร) */
  entry: number;
  exit: number;
  taper: number;
  /** ตำแหน่งกรอบจอดของทีม k เทียบเส้นชัย (เมตร, ลบ = ก่อนเส้น) */
  boxes: number[];
};

/** ระยะจากกรอบแรกถึงกรอบสุดท้าย */
const boxSpan = (teams: number) => (teams - 1) * BOX_GAP;
/** ตำแหน่งกรอบจอดของทีม k เทียบกึ่งกลางแถวอู่ — เรียงทีมแรกใกล้ทางเข้า */
export const boxRel = (k: number, teams: number) => (k - (teams - 1) / 2) * BOX_GAP;

/** ความกว้างถนนฝั่ง side ที่ระยะ s */
const edgeAt = (t: DriveTrack, s: number, side: number) => sample(t, side > 0 ? t.wr : t.wl, s);

/**
 * ช่วงทางตรงสำหรับพิทเลน: ยาวพอ (ทางเลี้ยว 2 ข้าง + แถวอู่) ความโค้งไม่มากเกินระยะเยื้อง และใกล้เส้นชัยที่สุด
 * ไม่มีช่วงไหนผ่าน = ใช้ช่วงที่โค้งน้อยที่สุด
 */
function pitWindow(t: DriveTrack, reach: number, teams: number) {
  const need = 2 * TAPER_MIN + boxSpan(teams) + 40;
  const want = PIT_IN + PIT_OUT;
  const bend = (r: number) => Math.abs(sample(t, t.curve, r)) * reach;
  let best: { a: number; b: number; score: number } | null = null;
  for (const lim of [BEND_MAX, BEND_MAX * 1.6, BEND_MAX * 2.6]) {
    // ช่วงต่อเนื่องที่โค้งไม่เกิน lim
    let start: number | null = null;
    for (let r = -SEARCH; r <= SEARCH + DS; r += DS) {
      const ok = r <= SEARCH && bend(r) < lim;
      if (ok && start === null) start = r;
      if (!ok && start !== null) {
        const end = r - DS;
        if (end - start >= need) {
          // ยาวเกินที่ต้องการ: ตัดให้กึ่งกลางใกล้เส้นชัยที่สุด
          const len = Math.min(want, end - start);
          const a = Math.max(start, Math.min(end - len, -len / 2));
          const score = Math.abs(a + len / 2);
          if (!best || score < best.score) best = { a, b: a + len, score };
        }
        start = null;
      }
    }
    if (best) break;
  }
  return best ? { a: best.a, b: best.b } : { a: -PIT_IN, b: PIT_OUT };
}

/**
 * วางพิทเลน: เลือกช่วงทางตรง แล้วเลือกฝั่งที่ไม่ไปทับถนนช่วงอื่น (เทียบทั้งพิทเลนและอู่) · ทั้งสองฝั่งได้ = ฝั่งตรงข้ามอัฒจันทร์เส้นสตาร์ท
 */
export function pitLane(t: DriveTrack, teams: number): PitLane {
  const reach0 = Math.max(...t.wl, ...t.wr) + t.runoff + PIT_GAP + PIT_W + GARAGE_D;
  const { a, b } = pitWindow(t, reach0, teams);
  const taper = Math.max(TAPER_MIN, Math.min(TAPER, (b - a - boxSpan(teams) - 40) / 2));
  const edge: Record<number, number> = { [-1]: 0, [1]: 0 };
  for (let d = a; d <= b; d += DS) for (const side of [-1, 1]) edge[side] = Math.max(edge[side], edgeAt(t, d, side));
  const innerOf = (side: number) => edge[side] + t.runoff + PIT_GAP;
  // ความเบียด: ระยะใกล้สุดจากจุดในพิท/อู่ ไปถึงขอบถนนช่วงอื่นของสนาม (ห่างตามสนามเกิน 600 ม.)
  const clearance = (side: number) => {
    let worst = Infinity;
    for (let d = a; d <= b; d += 12) {
      const sm = ((d % t.length) + t.length) % t.length;
      const i0 = Math.floor(sm / DS);
      const h = t.heading[i0];
      const cx = t.x[i0];
      const cz = t.z[i0];
      for (const lat of [innerOf(side), innerOf(side) + PIT_W + GARAGE_D]) {
        const x = cx - Math.sin(h) * lat * side;
        const z = cz + Math.cos(h) * lat * side;
        for (let i = 0; i < t.n; i += 2) {
          const ds = Math.abs(i * DS - sm);
          if (Math.min(ds, t.length - ds) < 600) continue;
          const gap = Math.hypot(t.x[i] - x, t.z[i] - z) - Math.max(t.wl[i], t.wr[i]) - t.runoff;
          if (gap < worst) worst = gap;
        }
      }
    }
    return worst;
  };
  // อัฒจันทร์เส้นสตาร์ทอยู่ด้านนอกโค้งหลังทางตรง (ดู terrain.ts) → พิทอยู่ฝั่งตรงข้าม
  const standSide = sample(t, t.curve, 190) > 0 ? -1 : 1;
  const prefer = -standSide;
  const cp = clearance(prefer);
  const co = clearance(-prefer);
  const side = cp >= 8 || cp >= co ? prefer : -prefer;
  const inner = innerOf(side);
  // แถวอู่อยู่กึ่งกลางช่วงที่มีกำแพงพิท
  const mid = (a + taper + (b - taper)) / 2;
  return { side, inner, offset: side * (inner + PIT_W / 2), entry: a, exit: b, taper, boxes: Array.from({ length: teams }, (_, k) => mid + boxRel(k, teams)) };
}

/** ช่วงพิทเลนที่มีกำแพงพิทกั้น (เทียบเส้นชัย) — นอกช่วงนี้คือทางเลี้ยวเข้า/ออก (กำแพงสนามเปิดช่อง) */
export const wallFrom = (p: PitLane) => p.entry + p.taper;
export const wallTo = (p: PitLane) => p.exit - p.taper;

/** ระยะสะสมของทางเข้าพิทถัดไปที่รถ (ระยะ s) จะผ่าน */
export const nextPitEntry = (t: DriveTrack, p: PitLane, s: number) => Math.floor((s - p.entry) / t.length + 1) * t.length + p.entry;

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

/**
 * ระยะเยื้อง (เมตร) ของรถในพิท ณ ระยะ rel เทียบเส้นชัย (entry..exit)
 * from = ระยะเยื้องตอนเริ่มเลี้ยวเข้า · to = ระยะเยื้องของเลนที่จะกลับเข้าสนาม
 */
export function pitLateral(p: PitLane, rel: number, from: number, to: number) {
  if (rel < wallFrom(p)) return from + (p.offset - from) * smooth((rel - p.entry) / p.taper);
  if (rel > wallTo(p)) return p.offset + (to - p.offset) * smooth((rel - wallTo(p)) / p.taper);
  return p.offset;
}

/** เวลาเปลี่ยนยางที่เพิ่ม (วินาที) ตามระยะที่จอดพลาดกรอบ err (เมตร) */
export const stopExtra = (err: number) => {
  const e = Math.abs(err);
  return e <= 0.75 ? 0 : Math.min(4.5, 0.45 * (e - 0.75) ** 1.15);
};

export type StopGrade = "perfect" | "good" | "early" | "late";
export const stopGrade = (err: number): StopGrade => (Math.abs(err) <= 0.75 ? "perfect" : Math.abs(err) <= 2.5 ? "good" : err < 0 ? "early" : "late");
