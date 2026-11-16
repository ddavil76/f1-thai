/**
 * จอยเกม (Gamepad API แบบ "standard" — Xbox / PlayStation / จอยทั่วไปที่เบราว์เซอร์รู้จัก)
 * สติ๊กซ้าย = เลี้ยว · RT/R2 = คันเร่ง · LT/L2 = เบรก (กดได้ตามแรง) · ปุ่มอื่นดู PAD_HELP
 * ฟังก์ชันในไฟล์นี้ไม่แตะ DOM (ทดสอบได้) — การอ่านจอยจริงอยู่ที่ components/pitwall/driver/gamepad.ts
 */

/** ลำดับปุ่มของ standard mapping */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** สติ๊กกลางที่ไม่นับ (จอยเก่าค้างไม่ตรงศูนย์) · ไกปืนที่ไม่นับ */
const STICK_DEAD = 0.08;
const TRIGGER_DEAD = 0.04;
/** โค้งพวงมาลัย: > 1 = กลางสติ๊กละเอียด (แก้ทิศเล็ก ๆ บนทางตรงง่าย) ปลายสติ๊กยังเลี้ยวสุดได้ */
const STEER_GAMMA = 1.5;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** แกนสติ๊ก −1..1 → พวงมาลัย −1..1 (ตัดกลาง + โค้ง) */
export function stickSteer(x: number): number {
  const a = clamp01((Math.abs(x) - STICK_DEAD) / (1 - STICK_DEAD));
  return Math.sign(x) * a ** STEER_GAMMA;
}

/** แรงกดไก 0..1 → คันเร่ง/เบรก 0..1 (ตัดปลายที่ไม่นับ) */
export function trigger(v: number): number {
  return clamp01((v - TRIGGER_DEAD) / (1 - TRIGGER_DEAD));
}

/** ค่าจากจอยหนึ่งเฟรม */
export type PadRead = { steer: number; thr: number; brk: number; ot: boolean; pressed: boolean[] };

/** แปลงจอย (หรือของปลอมในเทสต์) → ค่าบังคับ */
export function readPad(gp: { axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] }): PadRead {
  const b = (k: number) => gp.buttons[k];
  return {
    steer: stickSteer(gp.axes[0] ?? 0),
    thr: trigger(b(BTN.RT)?.value ?? 0),
    brk: trigger(b(BTN.LT)?.value ?? 0),
    ot: !!(b(BTN.RB)?.pressed || b(BTN.X)?.pressed),
    pressed: gp.buttons.map((x) => x.pressed),
  };
}

/** ปุ่มที่เพิ่งกด (เฟรมนี้กด เฟรมก่อนยังไม่กด) */
export const justPressed = (now: boolean[], before: boolean[], k: number) => !!now[k] && !before[k];

/** คำอธิบายปุ่ม (ชื่อแบบ Xbox / PlayStation) */
export const PAD_HELP =
  "จอย: สติ๊กซ้าย = เลี้ยว · RT/R2 = คันเร่ง · LT/L2 = เบรก (กดได้ตามแรง) · LB/L1 = Straight Mode · Y/△ = สลับกล้อง · Start = หยุดชั่วคราว · แข่ง: RB/R1 หรือ X/□ (ค้าง) = OT · B/○ = ขอ/ยกเลิกเข้าพิท · ปุ่มลูกศร ← ↑ → = ยาง S/M/H · A/✕ = จอด / ไป";
