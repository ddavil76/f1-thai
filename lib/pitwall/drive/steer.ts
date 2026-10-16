/**
 * พวงมาลัยของโหมดนักขับ (ขับอิสระ): ปุ่ม/คีย์ซ้ายขวา หรือลากนิ้ว → ค่าพวงมาลัย −1..1
 * รถหมุนพวงมาลัยตามทีละน้อยและผู้ช่วยดึงเข้าหา racing line ตามระดับ (car.ts → stepFree)
 */
export type Assist = 0 | 1 | 2;

/** ระดับช่วยขับ → น้ำหนักผู้ช่วยเลี้ยว: ง่าย = เลี้ยวตาม racing line เองเมื่อปล่อยมือ · ปกติ = ช่วยครึ่งหนึ่ง · โปร = ไม่ช่วย */
export const ASSIST_STEER: Record<Assist, number> = { 0: 0, 1: 0.5, 2: 1 };

/** แกนเลี้ยวจากปุ่ม (−1 ซ้าย · 1 ขวา) หรือจากการลากนิ้ว (ทศนิยม) */
export function steerAxis(left: boolean, right: boolean, drag: number | null): number {
  if (drag !== null) return Math.max(-1, Math.min(1, drag));
  return (right ? 1 : 0) - (left ? 1 : 0);
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
