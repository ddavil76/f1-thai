/**
 * ยางในโหมดนักขับ (แข่งกับ AI / ออนไลน์เท่านั้น — Time Trial ใช้ยางใหม่ตลอด)
 * — 3 ชนิด: Soft เกาะดีสุดแต่สึกเร็ว · Medium กลาง ๆ · Hard เกาะน้อยกว่าแต่ทน
 * — ระยะที่ยางใช้ได้ผูกกับจำนวนรอบที่แข่ง (แข่ง 3 หรือ 10 รอบก็เข้าพิทราว 1 ครั้งเหมือนกัน)
 * — สึกตามระยะทาง + วิธีขับ (ไถล/หลุดโค้งกินยางเพิ่ม) · ใกล้หมดเกาะถนนลดลงเร็ว (cliff)
 * — ยางใหม่จากพิทยังเย็น เกาะน้อยลงช่วงครึ่งรอบแรก
 */
import { COMPOUNDS, COMPOUND_INFO, type Compound } from "../types";

export { COMPOUNDS, COMPOUND_INFO, type Compound };

/** การเกาะถนนของยางใหม่ (เทียบ Medium) */
export const TYRE_GRIP: Record<Compound, number> = { soft: 1.03, medium: 1, hard: 0.975 };
/** ยางชุดหนึ่งวิ่งได้กี่ส่วนของระยะแข่งก่อนหมด (ขับปกติ) */
export const TYRE_LIFE: Record<Compound, number> = { soft: 0.42, medium: 0.66, hard: 1.0 };
/** เกาะถนนลดลงตามการสึก: ช่วงแรกค่อย ๆ ลด · เกิน CLIFF_AT ลดเร็ว */
const WEAR_GRIP = 0.04;
const CLIFF_AT = 0.75;
const CLIFF_GRIP = 0.32;
/** ยางเย็น: เกาะน้อยลงสุดกี่ส่วน · อุ่นเต็มที่หลังวิ่งกี่เมตร */
const COLD_GRIP = 0.04;
const WARM_DIST = 2500;
/** ไถลกินยางเพิ่ม (ต่อ "เร็วเกินโค้ง" 1 หน่วยต่อวินาที) · หลุดโค้งลงหญ้าครั้งหนึ่ง */
const SLIDE_WEAR = 0.25;
export const EXCURSION_WEAR = 0.015;

/** ยางที่ใส่อยู่: ชนิด · สึกไปแล้ว (0 = ใหม่, 1 = หมด) · ความเย็นที่เหลือ (1 = เพิ่งใส่) */
export type Tyre = { c: Compound; wear: number; cold: number };

export const newTyre = (c: Compound, cold = 0): Tyre => ({ c, wear: 0, cold });

/** ตัวคูณการเกาะถนนของยางตอนนี้ */
export function tyreGrip(ty: Tyre) {
  const w = Math.min(1, ty.wear);
  return TYRE_GRIP[ty.c] * (1 - WEAR_GRIP * w - CLIFF_GRIP * Math.max(0, w - CLIFF_AT)) * (1 - COLD_GRIP * ty.cold);
}

/** อัตราสึกต่อเมตรของยางชนิดนี้ ในการแข่ง laps รอบ บนสนามยาว trackLen เมตร */
export const wearPerMeter = (c: Compound, laps: number, trackLen: number) => 1 / (TYRE_LIFE[c] * Math.max(1, laps) * trackLen);

/** สึกตามระยะที่วิ่ง (dist เมตร) + ไถล (over = เร็วเกินโค้งกี่ส่วน, ช่วงเวลา dt) · อุ่นยาง */
export function wearTyre(ty: Tyre, dist: number, perMeter: number, slide = 0, dt = 0) {
  if (dist > 0) {
    ty.wear += dist * perMeter;
    ty.cold = Math.max(0, ty.cold - dist / WARM_DIST);
  }
  if (slide > 0) ty.wear += slide * SLIDE_WEAR * dt;
  ty.wear = Math.min(1.2, ty.wear);
}

/** ยางชนิดนี้วิ่งได้อีกกี่รอบ (ขับปกติ) */
export const lapsLeft = (ty: Tyre, laps: number) => Math.max(0, (CLIFF_AT + 0.15 - ty.wear) * TYRE_LIFE[ty.c] * laps);

/** ยางแนะนำสำหรับรอบที่เหลือ: ชนิดที่นุ่มที่สุดที่ยังวิ่งจนจบได้ (ไม่มีชนิดไหนพอ = Hard) */
export function suggestCompound(remainingLaps: number, laps: number): Compound {
  for (const c of COMPOUNDS) if (TYRE_LIFE[c] * laps * (CLIFF_AT + 0.15) >= remainingLaps) return c;
  return "hard";
}
