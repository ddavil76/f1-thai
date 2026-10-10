/**
 * พิทเลน (โหมดแข่ง): เลนขนานกับทางตรงเส้นชัย อยู่หลังกำแพงฝั่งหนึ่ง
 * — ทางเข้าก่อนเส้นชัย PIT_IN เมตร · ทางออกหลังเส้นชัย PIT_OUT เมตร · ช่วงเลี้ยวเข้า/ออก TAPER เมตร
 * — อู่ของแต่ละทีมเรียงตามลำดับทีม (ทีมแรกอยู่ใกล้ทางเข้า) · จังหวะกดจอดจึงต่างกันตามตำแหน่งอู่
 * — ในพิทเลนรถวิ่งเองด้วยความเร็วจำกัด · กด "จอด" ให้ตรงจังหวะ (รถเบรกหยุดห่างจากจุดกด STOP_DIST เมตร)
 *   หยุดตรงกรอบ = เปลี่ยนยางไว · ก่อน/เลยกรอบ = ช่างต้องขยับตาม ช้าลงตามระยะที่พลาด
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { DS, sample, type DriveTrack } from "./line";

/** ทางเข้าก่อนเส้นชัย · ทางออกหลังเส้นชัย · ช่วงเลี้ยวเข้า/ออก (เมตร) */
export const PIT_IN = 420;
export const PIT_OUT = 360;
export const TAPER = 150;
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
  /** ตำแหน่งกรอบจอดของทีม k เทียบเส้นชัย (เมตร, ลบ = ก่อนเส้น) */
  boxes: number[];
};

/** ตำแหน่งกรอบจอดของทีม k (เทียบเส้นชัย) — เรียงทีมแรกใกล้ทางเข้า กึ่งกลางแถวอยู่ที่เส้นชัย */
export const boxRel = (k: number, teams: number) => (k - (teams - 1) / 2) * BOX_GAP;

/** ความกว้างถนนฝั่ง side ที่ระยะ s */
const edgeAt = (t: DriveTrack, s: number, side: number) => sample(t, side > 0 ? t.wr : t.wl, s);

/**
 * วางพิทเลน: เลือกฝั่งที่ไม่ไปทับถนนช่วงอื่น (เทียบทั้งพิทเลนและอู่) · ทั้งสองฝั่งได้ = ฝั่งตรงข้ามอัฒจันทร์เส้นสตาร์ท
 */
export function pitLane(t: DriveTrack, teams: number): PitLane {
  const edge: Record<number, number> = { [-1]: 0, [1]: 0 };
  for (let d = -PIT_IN; d <= PIT_OUT; d += DS) for (const side of [-1, 1]) edge[side] = Math.max(edge[side], edgeAt(t, d, side));
  const innerOf = (side: number) => edge[side] + t.runoff + PIT_GAP;
  // ความเบียด: ระยะใกล้สุดจากจุดในพิท/อู่ ไปถึงขอบถนนช่วงอื่นของสนาม (ห่างตามสนามเกิน 600 ม.)
  const clearance = (side: number) => {
    let worst = Infinity;
    for (let d = -PIT_IN; d <= PIT_OUT; d += 12) {
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
  return { side, inner, offset: side * (inner + PIT_W / 2), boxes: Array.from({ length: teams }, (_, k) => boxRel(k, teams)) };
}

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

/**
 * ระยะเยื้อง (เมตร) ของรถในพิท ณ ระยะ rel เทียบเส้นชัย (−PIT_IN..PIT_OUT)
 * from = ระยะเยื้องตอนเริ่มเลี้ยวเข้า · to = ระยะเยื้องของเลนที่จะกลับเข้าสนาม
 */
export function pitLateral(p: PitLane, rel: number, from: number, to: number) {
  if (rel < -PIT_IN + TAPER) return from + (p.offset - from) * smooth((rel + PIT_IN) / TAPER);
  if (rel > PIT_OUT - TAPER) return p.offset + (to - p.offset) * smooth((rel - (PIT_OUT - TAPER)) / TAPER);
  return p.offset;
}

/** ช่วงพิทเลนที่มีกำแพงพิทกั้น (เทียบเส้นชัย) — นอกช่วงนี้คือทางเลี้ยวเข้า/ออก (กำแพงสนามเปิดช่อง) */
export const PIT_WALL_FROM = -PIT_IN + TAPER;
export const PIT_WALL_TO = PIT_OUT - TAPER;

/** เวลาเปลี่ยนยางที่เพิ่ม (วินาที) ตามระยะที่จอดพลาดกรอบ err (เมตร) */
export const stopExtra = (err: number) => {
  const e = Math.abs(err);
  return e <= 0.75 ? 0 : Math.min(4.5, 0.45 * (e - 0.75) ** 1.15);
};

export type StopGrade = "perfect" | "good" | "early" | "late";
export const stopGrade = (err: number): StopGrade => (Math.abs(err) <= 0.75 ? "perfect" : Math.abs(err) <= 2.5 ? "good" : err < 0 ? "early" : "late");
