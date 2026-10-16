/**
 * การเลี้ยวของผู้เล่นในโหมดนักขับ: ปุ่ม ◀ ▶ / ลูกศร / A D / ลากนิ้ว = แกนเลี้ยว −1..1
 * แกนเลี้ยวเลื่อน "เลนเป้าหมาย" (−1 ซ้าย · 0 racing line · 1 ขวา) ทีละน้อย แล้วรถค่อย ๆ ตามไปตาม LANE_RATE
 * — ไม่ต้องมีฟิสิกส์ขับอิสระ: บอท การแซง พิท รีเพลย์ และออนไลน์ใช้ตำแหน่งเลนแบบเดิมได้ทั้งหมด
 * — ตัวช่วยประคองพวงมาลัย: ไม่ได้เลี้ยว → เลนเป้าหมายไหลกลับ racing line เอง (ง่าย = แรง · ปกติ = เบา · โปร = ไม่มี)
 */

/** ระดับช่วยขับ: 0 โปร · 1 ปกติ · 2 ง่าย */
export type Assist = 0 | 1 | 2;

/** เลี้ยวสุดแกน เลนเป้าหมายเลื่อนกี่เลนต่อวินาที */
export const STEER_RATE = 1.6;
/** ตัวช่วยดึงกลับ racing line (เลนต่อวินาที) ตามระดับ */
export const ASSIST_RETURN: Record<Assist, number> = { 0: 0, 1: 0.35, 2: 1.1 };

/** แกนเลี้ยวจากปุ่มซ้าย/ขวา + ลากนิ้ว (ลากนิ้วชนะเมื่อกำลังลาก) */
export function steerAxis(left: boolean, right: boolean, drag: number | null): number {
  if (drag !== null) return Math.max(-1, Math.min(1, drag));
  return (right ? 1 : 0) - (left ? 1 : 0);
}

/** เลนเป้าหมายถัดไปหลังเวลา dt วินาที */
export function steerTarget(target: number, axis: number, assist: Assist, dt: number): number {
  let t = target + axis * STEER_RATE * dt;
  // ประคอง: ยิ่งเลี้ยวน้อย ยิ่งดึงกลับแรง (เลี้ยวเต็มแกน = ไม่ดึง)
  const pull = ASSIST_RETURN[assist] * (1 - Math.min(1, Math.abs(axis))) * dt;
  t -= Math.sign(t) * Math.min(Math.abs(t), pull);
  return Math.max(-1, Math.min(1, t));
}

/** ลากนิ้ว: ระยะลาก (px) → แกนเลี้ยว · ลากเกินขอบ = เลื่อนจุดอ้างอิงตามนิ้ว (กลับทิศได้ทันที) */
export const DRAG_PX = 70;
export function dragAxis(x0: number, x: number): { axis: number; x0: number } {
  let dx = x - x0;
  if (Math.abs(dx) > DRAG_PX) {
    x0 = x - Math.sign(dx) * DRAG_PX;
    dx = Math.sign(dx) * DRAG_PX;
  }
  return { axis: dx / DRAG_PX, x0 };
}
