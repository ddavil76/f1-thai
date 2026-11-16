/**
 * พวงมาลัยของโหมดนักขับ (ขับอิสระ): คีย์ซ้ายขวา (หรือแกนอนาล็อก) → ค่าพวงมาลัย −1..1
 * ตัวช่วยพวงมาลัย (steerAssist.ts) แปลงเป็นมุมล้อตามระดับช่วยขับ (car.ts → stepFree)
 */
import { STEER_TUNE, type SteerTune } from "./steerAssist";
export type Assist = 0 | 1 | 2;

/** ระดับช่วยขับ → ค่าปรับตัวช่วยพวงมาลัย (steerAssist.ts): ง่าย = นิ่ง · ปกติ = สมดุล · โปร = หลวม */
export const ASSIST_TUNE: Record<Assist, SteerTune> = { 0: STEER_TUNE.loose, 1: STEER_TUNE.balanced, 2: STEER_TUNE.stable };
/** ระดับช่วยขับ → ตัวช่วยทรงตัว (กันล้อฟรี/ล็อก · กันท้ายปัด) — โปรเหลือนิดหน่อย เพราะคีย์บอร์ดกดได้แค่เต็ม/ปล่อย */
export const ASSIST_STAB: Record<Assist, number> = { 0: 0.3, 1: 0.65, 2: 1 };

/** แกนเลี้ยวจากปุ่ม (−1 ซ้าย · 1 ขวา) หรือจากแกนอนาล็อก (ทศนิยม · null = ใช้ปุ่ม) */
export function steerAxis(left: boolean, right: boolean, drag: number | null): number {
  if (drag !== null) return Math.max(-1, Math.min(1, drag));
  return (right ? 1 : 0) - (left ? 1 : 0);
}
