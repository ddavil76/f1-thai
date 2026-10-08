/**
 * ความเร็วรถ: เวลาต่อรอบ = เวลาพื้นฐานของสนาม + ส่วนต่าง (วินาที) จากรถ นักขับ การตั้งค่า ยาง โหมด
 */
import type { AiLevel, Compound, DriveMode, ErsMode } from "./types";

export const TYRE: Record<Compound, { offset: number; wear: number }> = {
  soft: { offset: -0.7, wear: 0.11 },
  medium: { offset: 0, wear: 0.07 },
  hard: { offset: 0.55, wear: 0.045 },
};

export const MODE: Record<DriveMode, { pace: number; wear: number; risk: number; label: string }> = {
  save: { pace: 0.6, wear: 0.6, risk: 0.5, label: "ถนอม" },
  normal: { pace: 0, wear: 1, risk: 1, label: "ปกติ" },
  push: { pace: -0.4, wear: 1.5, risk: 2, label: "ดันสุด" },
};

export const ERS: Record<ErsMode, { drain: number; charge: number; straight: number; label: string }> = {
  /** เก็บพลัง: ช้าลงนิดทั้งรอบ แบตเติมเร็ว */
  harvest: { drain: 0, charge: 0.05, straight: 0, label: "เก็บ" },
  /** ออโต้: ใช้บนทางตรงเมื่อแบตเหลือพอ */
  auto: { drain: 0.03, charge: 0.032, straight: 0.012, label: "ออโต้" },
  /** บูสต์: ใช้เต็มที่บนทางตรงจนแบตหมด */
  boost: { drain: 0.06, charge: 0.032, straight: 0.024, label: "บูสต์" },
};

/** ระดับ AI: บวกเวลาต่อรอบให้รถ AI */
export const AI_PACE: Record<AiLevel, number> = { easy: 0.6, normal: 0, hard: -0.3 };

/** ยางสึก (0 = ใหม่ · 1 = หมดสภาพ) → เวลาที่เสียต่อรอบ */
export const wearPenalty = (w: number) => 1.8 * w * w + (w > 0.8 ? (w - 0.8) * 12 : 0);

/** ตั้งแรงกดห่างจากที่เหมาะกับสนาม → เสียเวลาต่อรอบ */
export const setupPenalty = (d: number, ideal: number) => 3 * (d - ideal) ** 2;

/** น้ำมันเบาลงทุกรอบ */
export const FUEL_PER_LAP = 0.035;

/** เรซสั้นยางสึกเร็วขึ้น ให้ยังต้องคิดเรื่องเข้าพิท (12 รอบขึ้นไป = ปกติ) */
export const raceWear = (laps: number) => Math.max(1, 12 / Math.max(1, laps));

/** โอกาสยางรอดกี่รอบ (ใช้วางแผน) · scale = ตัวคูณการสึกของเรซ */
export const tyreLife = (c: Compound, mode: DriveMode = "normal", scale = 1) => 0.78 / (TYRE[c].wear * MODE[mode].wear * scale);
