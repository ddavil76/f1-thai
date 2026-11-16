/**
 * พื้นผิวสนาม: ถนน · ขอบทาง (kerb แดงขาวในโค้ง) · หญ้า (ข้างทางตรง) · กรวด/ทราย (นอกขอบทางในโค้ง)
 * ใช้ทั้งฟิสิกส์ (การเกาะ/ความฝืด) และฉาก 3D (วาดตรงกับที่รถรู้สึก)
 */
import { DS, type DriveTrack } from "./line";

export type Surface = "road" | "kerb" | "grass" | "gravel";

/** ช่วงโค้ง (มีขอบทาง + กรวด) — racing line เลี้ยวแรงกว่านี้ */
export const isCorner = (t: DriveTrack, i: number) => Math.abs(t.curve[i]) > 0.006;
/** ความกว้างขอบทาง (ม.) — สนามกำแพงชิดมีแค่แคบ ๆ */
export const kerbWidth = (t: DriveTrack) => Math.max(0.3, Math.min(1.4, t.runoff - 0.1));
/** ความสูงสันขอบทาง (ม.) */
export const KERB_H = 0.06;

/** ผิวแต่ละแบบ: เกาะได้กี่ส่วน · ความฝืด (ตัวคูณแรงต้านล้อ) · ขรุขระ (สั่น/เสียง) */
export const SURFACES: Record<Surface, { grip: number; drag: number; rough: number }> = {
  road: { grip: 1, drag: 0, rough: 0 },
  kerb: { grip: 0.94, drag: 0.08, rough: 1 },
  grass: { grip: 0.5, drag: 1, rough: 0.35 },
  gravel: { grip: 0.42, drag: 2.4, rough: 0.7 },
};

/** ผิวใต้จุดที่ระยะ s เยื้อง d (ม., บวก = ขวา) */
export function surfaceOf(t: DriveTrack, s: number, d: number): Surface {
  const i = Math.floor((((s / DS) % t.n) + t.n) % t.n);
  const beyond = d >= 0 ? d - t.wr[i] : -t.wl[i] - d;
  if (beyond <= 0) return "road";
  if (!isCorner(t, i)) return "grass";
  return beyond <= kerbWidth(t) ? "kerb" : "gravel";
}
