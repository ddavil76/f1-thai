// ช่วงเวลารอบ ๆ การแข่ง — แยกไฟล์เพื่อให้ client component ใช้ได้โดยไม่ลาก lib/f1 ทั้งก้อน

/** race ถือว่ายังแข่งอยู่ ~2 ชม.หลังสตาร์ท */
export const RACE_TAIL_MS = 2 * 60 * 60 * 1000;

/** รอผลจาก Jolpica ได้นานสุดเท่านี้หลังสตาร์ท — เกินนี้ถือว่าไม่มีผล (เช่นยกเลิกการแข่ง) */
export const RESULTS_WAIT_MS = 3 * 24 * 60 * 60 * 1000;

/** ช่วงเวลาของหนึ่ง session เป็น epoch ms — ส่งข้าม server → client ได้ตรง ๆ */
export type SessionWindow = { label: string; start: number; end: number };

/** session แรกที่ยังไม่จบ ณ เวลา now (null = จบหมดแล้ว) — windows ต้องเรียงตามเวลาเริ่ม */
export function pickSession<W extends SessionWindow>(windows: W[], now: number): W | null {
  return windows.find((w) => w.end > now) ?? null;
}
