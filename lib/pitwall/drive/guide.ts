/**
 * เส้นช่วยแบบไดนามิก (แบบเกมแข่งรถ): สีของแต่ละช่วงข้างหน้าคิดจากความเร็วตอนนี้เทียบกับความเร็วที่ช่วงนั้นรับได้
 * — ความเร็วอ้างอิง (vref) ของเลนที่รถอยู่รวมระยะเบรกไว้แล้ว: ถ้าเร็วกว่า vref ตรงไหน แปลว่าต้องเริ่มเบรก/ผ่อนก่อนถึงตรงนั้น
 * — เขียว = ต่ำกว่าความเร็วเป้าหมาย เร่งได้ · เหลือง = ใกล้/เกินเป้าหมายเล็กน้อย ยกคันเร่ง เตรียมเบรก · แดง = เกินมาก ไม่เบรกหลุดโค้งแน่
 * — ช่วงโค้ง/โซนเบรก: เหลืองเริ่มตั้งแต่ใกล้เป้าหมาย (GUIDE_WARN) · ทางตรง: ความเร็วเป้าหมายคือความเร็วสูงสุดของรถ ไม่ต้องเตือนตอนวิ่งเต็มที่
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (ทดสอบได้)
 */
import { laneValue, laneZone, type DriveTrack } from "./line";

/** เร็วกว่าความเร็วเป้าหมายเกินกี่ส่วน = แดงเต็ม (ฟิสิกส์หลุดโค้งที่ราว 10% เหนือขีดเกาะถนน) */
export const GUIDE_RED = 0.08;
/** ช่วงโค้ง/โซนเบรก: ต่ำกว่าความเร็วเป้าหมายไม่เกินกี่ส่วน = เริ่มเหลือง (ใกล้ขีดแล้ว) */
export const GUIDE_WARN = 0.03;

/** ความเสี่ยง 0..1 ของจุด s (เลน lat) ถ้ายังวิ่งความเร็ว v · grip = ตัวคูณการเกาะถนน (ทีม × อากาศเสีย) */
export function guideRisk(t: DriveTrack, s: number, lat: number, v: number, grip = 1) {
  const ref = laneValue(t, "vref", s, lat) * grip;
  const r = v / Math.max(1, ref);
  // ทางตรง (โซนคันเร่ง): เตือนเฉพาะเมื่อเกินเป้าหมาย · โค้ง/โซนเบรก: เตือนตั้งแต่ใกล้เป้าหมาย
  const warn = laneZone(t, s, lat) === "throttle" ? 0 : GUIDE_WARN;
  return Math.max(0, Math.min(1, (r - 1 + warn) / (GUIDE_RED + warn)));
}

/** สีตามความเสี่ยง: เขียว → เหลือง → แดง (ไล่สีต่อเนื่อง) */
export function guideColor(risk: number) {
  const lerp = (a: number, b: number, f: number) => Math.round(a + (b - a) * f);
  // เขียว #22c55e · เหลือง #facc15 · แดง #ef4444
  const [r, g, b] = risk < 0.5 ? [lerp(0x22, 0xfa, risk * 2), lerp(0xc5, 0xcc, risk * 2), lerp(0x5e, 0x15, risk * 2)] : [lerp(0xfa, 0xef, risk * 2 - 1), lerp(0xcc, 0x44, risk * 2 - 1), lerp(0x15, 0x44, risk * 2 - 1)];
  return (r << 16) | (g << 8) | b;
}

/** โหมด "เฉพาะโค้ง": ซ่อนช่วงทางตรงที่ไม่มีอะไรต้องระวัง */
export const guideNeeded = (t: DriveTrack, s: number, lat: number, risk: number) => risk > 0 || laneZone(t, s, lat) !== "throttle";

/**
 * ความเร็วที่จะมีตอนไปถึงระยะ d ข้างหน้า ถ้ายังทำแบบเดิม (เร่งต่อ/ผ่อน/เบรกด้วยอัตราเร่งตอนนี้) · ไม่เกิน vtop
 * — กำลังเร่ง: ไปถึงโค้งจะเร็วกว่าตอนนี้ เส้นแดงเร็วขึ้น · กำลังเบรก: เส้นค่อย ๆ กลับเป็นเขียว
 */
export function projectedSpeed(v: number, accel: number, d: number, vtop: number) {
  const a = Math.max(-45, Math.min(15, accel));
  return Math.min(Math.max(v, vtop), Math.sqrt(Math.max(0, v * v + 2 * a * d)));
}

/**
 * แบ่งสนามเป็นช่วงโค้ง (ใช้กับโหมดฝึก): แต่ละจุดได้เลขของโค้งที่กำลังจะถึง/อยู่ในโค้งนั้น
 * — โค้ง = ช่วงที่ไม่ใช่โซนคันเร่งของ racing line · ทางตรงก่อนโค้งนับรวมกับโค้งนั้น (จุดเบรกอยู่บนทางตรง)
 */
export function cornerMap(t: DriveTrack): Int16Array {
  const zone = t.lanes[1].zone;
  const n = t.n;
  const id = new Int16Array(n).fill(-1);
  // หาจุดเริ่มที่เป็นทางตรง จะได้ไม่เริ่มกลางโค้ง
  let start = 0;
  while (start < n && zone[start] !== "throttle") start++;
  if (start >= n) return id.fill(0);
  let c = 0;
  let inCorner = false;
  const ends: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const corner = zone[i] !== "throttle";
    if (inCorner && !corner) {
      ends.push(i);
      c++;
    }
    inCorner = corner;
    id[i] = c;
  }
  if (inCorner) c++;
  // ทางตรงหลังโค้งสุดท้ายวนกลับไปเป็นของโค้งแรก
  const count = Math.max(1, c);
  for (let i = 0; i < n; i++) id[i] = id[i] % count;
  return id;
}

/** ความจำโค้ง 0..1 ต่อโค้ง: ผ่านดี (ไม่หลุด) +1/3 · หลุดโค้ง = เริ่มใหม่ */
export type Mastery = Record<number, number>;
export const MASTERY_STEP = 1 / 3;
export function learnCorner(m: Mastery, corner: number, clean: boolean): Mastery {
  return { ...m, [corner]: clean ? Math.min(1, (m[corner] ?? 0) + MASTERY_STEP) : 0 };
}
/** เส้นจางลงตามความจำ (เหลือเห็นราง ๆ) — แต่ถ้าเร็วเกินมาก (เสี่ยงหลุด) แสดงเต็มเสมอ */
export const guideFade = (mastery: number, risk: number) => (risk > 0.6 ? 0 : Math.max(0, Math.min(1, mastery)) * 0.85);
