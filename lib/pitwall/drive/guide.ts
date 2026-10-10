/**
 * เส้นช่วยแบบไดนามิก (แบบเกมแข่งรถ): สีของแต่ละช่วงข้างหน้าคิดจากความเร็วตอนนี้เทียบกับความเร็วที่ช่วงนั้นรับได้
 * — ความเร็วอ้างอิง (vref) ของเลนที่รถอยู่รวมระยะเบรกไว้แล้ว: ถ้าเร็วกว่า vref ตรงไหน แปลว่าต้องเริ่มเบรก/ผ่อนก่อนถึงตรงนั้น
 * — เขียว = ความเร็วนี้ผ่านได้ · เหลือง→ส้ม = เสี่ยง (ไถล) ควรผ่อน/เบรก · แดง = เร็วเกิน ไม่เบรกตอนนี้หลุดโค้งแน่
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (ทดสอบได้)
 */
import { laneValue, laneZone, type DriveTrack } from "./line";

/** เร็วกว่าความเร็วอ้างอิงเกินกี่ส่วน = แดงเต็ม (ฟิสิกส์หลุดโค้งที่ราว 10% เหนือขีดเกาะถนน) */
export const GUIDE_RED = 0.08;

/** ความเสี่ยง 0..1 ของจุด s (เลน lat) ถ้ายังวิ่งความเร็ว v · grip = ตัวคูณการเกาะถนน (ทีม × อากาศเสีย) */
export function guideRisk(t: DriveTrack, s: number, lat: number, v: number, grip = 1) {
  const ref = laneValue(t, "vref", s, lat) * grip;
  return Math.max(0, Math.min(1, (v / Math.max(1, ref) - 1) / GUIDE_RED));
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
