/**
 * อ่านจอยจริงจากเบราว์เซอร์ + สั่น (dual-rumble — Chrome/Edge รองรับ Xbox/PlayStation · เบราว์เซอร์ที่ไม่รองรับ = เงียบไปเอง)
 */
type Rumble = { playEffect?: (type: string, p: { duration: number; strongMagnitude: number; weakMagnitude: number }) => Promise<unknown> };

/** จอยตัวแรกที่เสียบอยู่ (เลือกตัวที่เป็น standard mapping ก่อน) */
export function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const all = [...navigator.getGamepads()].filter((g): g is Gamepad => !!g && g.connected);
  return all.find((g) => g.mapping === "standard") ?? all[0] ?? null;
}

/** สั่นจอย: strong = มอเตอร์หนัก (ชน/หลุดโค้ง) · weak = มอเตอร์เบา (ยางลื่น/ขอบทาง) 0..1 */
export function rumble(strong: number, weak: number, ms: number) {
  const act = (firstPad() as (Gamepad & { vibrationActuator?: Rumble }) | null)?.vibrationActuator;
  act?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch(() => {});
}
