/**
 * พวงมาลัยของโหมดนักขับ (ขับอิสระ): คีย์ซ้ายขวา (หรือแกนอนาล็อก) → ค่าพวงมาลัย −1..1
 * รถหมุนพวงมาลัยตามทีละน้อยและผู้ช่วยดึงเข้าหา racing line ตามระดับ (car.ts → stepFree)
 */
export type Assist = 0 | 1 | 2;

/** ระดับช่วยขับ → น้ำหนักผู้ช่วยเลี้ยว: ง่าย = เลี้ยวตาม racing line เองเมื่อปล่อยมือ · ปกติ = ช่วยครึ่งหนึ่ง · โปร = ไม่ช่วย */
export const ASSIST_STEER: Record<Assist, number> = { 0: 0, 1: 0.5, 2: 1 };
/** ระดับช่วยขับ → ตัวช่วยทรงตัว (กันล้อฟรี/ล็อก · กันท้ายปัด) — โปรเหลือนิดหน่อย เพราะคีย์บอร์ดกดได้แค่เต็ม/ปล่อย */
export const ASSIST_STAB: Record<Assist, number> = { 0: 0.3, 1: 0.65, 2: 1 };

/** แกนเลี้ยวจากปุ่ม (−1 ซ้าย · 1 ขวา) หรือจากแกนอนาล็อก (ทศนิยม · null = ใช้ปุ่ม) */
export function steerAxis(left: boolean, right: boolean, drag: number | null): number {
  if (drag !== null) return Math.max(-1, Math.min(1, drag));
  return (right ? 1 : 0) - (left ? 1 : 0);
}
