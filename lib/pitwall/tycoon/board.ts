/**
 * กระดานเกมเศรษฐีสายแข่งรถ "เจ้าพ่อพิทเลน" — 32 ช่อง วนเป็นสนาม (9×9 รอบนอก)
 * มุม: 0 เส้นสตาร์ท · 8 ห้องสจ๊วต · 16 พิทสต็อป · 24 โดนโทษ (ไปห้องสจ๊วต)
 * สนาม 18 แห่ง (6 กลุ่ม กลุ่มละ 3) · ธุรกิจ 4 · การ์ดวิทยุทีม 2 · การ์ดสภาพอากาศ 2 · ภาษี 2
 * ชื่อสนามเป็นชื่อสถานที่ ไม่ใช้โลโก้/ชื่อทางการ · ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */

export type GroupId = "me" | "us" | "asia" | "latam" | "eu" | "legend";
export type Square =
  | { kind: "start"; name: string }
  | { kind: "jail"; name: string }
  | { kind: "pit"; name: string }
  | { kind: "gojail"; name: string }
  | { kind: "circuit"; name: string; group: GroupId; price: number }
  | { kind: "biz"; name: string; price: number }
  | { kind: "radio"; name: string }
  | { kind: "weather"; name: string }
  | { kind: "tax"; name: string; tax: "freight" | "cap" };

export const GROUPS: Record<GroupId, { name: string; color: string; build: number }> = {
  me: { name: "ตะวันออกกลาง", color: "#a16207", build: 50 },
  us: { name: "อเมริกา", color: "#38bdf8", build: 50 },
  asia: { name: "เอเชีย", color: "#ec4899", build: 100 },
  latam: { name: "ละตินอเมริกา", color: "#f97316", build: 100 },
  eu: { name: "ยุโรป", color: "#22c55e", build: 150 },
  legend: { name: "สนามตำนาน", color: "#6366f1", build: 150 },
};

const c = (name: string, group: GroupId, price: number): Square => ({ kind: "circuit", name, group, price });
const biz = (name: string): Square => ({ kind: "biz", name, price: 200 });

export const BOARD: Square[] = [
  { kind: "start", name: "เส้นสตาร์ท" },
  c("บาห์เรน", "me", 60),
  { kind: "radio", name: "วิทยุทีม" },
  c("เจดดาห์", "me", 60),
  c("อาบูดาบี", "me", 80),
  biz("ซัพพลายเออร์ยาง"),
  c("ไมอามี", "us", 100),
  { kind: "tax", name: "ค่าขนส่งรถ", tax: "freight" },
  { kind: "jail", name: "ห้องสจ๊วต" },
  c("ลาสเวกัส", "us", 100),
  c("ออสติน", "us", 120),
  { kind: "weather", name: "สภาพอากาศ" },
  c("เซี่ยงไฮ้", "asia", 140),
  biz("ผู้ผลิตเครื่องยนต์"),
  c("สิงคโปร์", "asia", 140),
  c("ซูซูกะ", "asia", 160),
  { kind: "pit", name: "พิทสต็อป" },
  c("มอนทรีออล", "latam", 180),
  { kind: "radio", name: "วิทยุทีม" },
  c("เม็กซิโกซิตี", "latam", 180),
  c("อินเตอร์ลากอส", "latam", 200),
  biz("สถานีถ่ายทอดสด"),
  c("ฮังการอริง", "eu", 220),
  c("ซานด์วูร์ต", "eu", 220),
  { kind: "gojail", name: "โดนโทษ!" },
  c("ซิลเวอร์สโตน", "eu", 240),
  { kind: "weather", name: "สภาพอากาศ" },
  c("สปา", "legend", 260),
  biz("ทีมโลจิสติกส์"),
  c("มอนซา", "legend", 280),
  { kind: "tax", name: "เกินเพดานงบ", tax: "cap" },
  c("โมนาโก", "legend", 350),
];

export const SIZE = BOARD.length;
export const START = 0;
export const JAIL = 8;
export const PIT = 16;
export const GO_JAIL = 24;

export const PASS_START = 200;
export const START_CASH = 1500;
export const JAIL_FINE = 50;
export const FREIGHT_TAX = 100;
/** เกินเพดานงบ: จ่าย 10% ของเงินสด (อย่างน้อยเท่านี้) */
export const CAP_MIN = 50;

/** ระดับสิ่งปลูกสร้าง: 0 ว่าง · 1–3 อัฒจันทร์ · 4 แพดด็อกคลับ VIP */
export const MAX_LEVEL = 4;
export const LEVEL_NAME = ["ว่าง", "อัฒจันทร์ 1", "อัฒจันทร์ 2", "อัฒจันทร์ 3", "แพดด็อก VIP"];
/** ตัวคูณค่าตั๋วตามระดับ (เทียบค่าตั๋วพื้นฐาน) */
const LEVEL_MULT = [1, 5, 15, 40, 60];

export const isOwnable = (sq: Square): sq is Extract<Square, { kind: "circuit" | "biz" }> => sq.kind === "circuit" || sq.kind === "biz";
export const priceOf = (i: number) => {
  const sq = BOARD[i];
  return isOwnable(sq) ? sq.price : 0;
};
export const groupSquares = (g: GroupId) => BOARD.flatMap((sq, i) => (sq.kind === "circuit" && sq.group === g ? [i] : []));
export const BIZ_SQUARES = BOARD.flatMap((sq, i) => (sq.kind === "biz" ? [i] : []));

/** ค่าตั๋วพื้นฐานของสนาม (ยังไม่มีอัฒจันทร์ ยังไม่ครบกลุ่ม) */
export const baseRent = (price: number) => Math.max(4, Math.round((price * 0.08) / 2) * 2);

/** ค่าตั๋วสนามตามระดับ · ครบกลุ่มแต่ยังไม่สร้าง = ×2 */
export function circuitRent(price: number, level: number, fullGroup: boolean) {
  const b = baseRent(price);
  if (level > 0) return b * LEVEL_MULT[level];
  return fullGroup ? b * 2 : b;
}

/** ค่าบริการธุรกิจตามจำนวนที่เจ้าของถือ: 25 · 50 · 100 · 200 */
export const bizRent = (count: number) => (count <= 0 ? 0 : 25 * 2 ** (count - 1));

/** ตำแหน่งในตาราง 9×9 (แถว, คอลัมน์ เริ่ม 1) — ช่อง 0 อยู่มุมขวาล่าง เดินทวนเข็มแบบกระดานเศรษฐี */
export function cellOf(i: number): { row: number; col: number } {
  if (i <= 8) return { row: 9, col: 9 - i };
  if (i <= 16) return { row: 9 - (i - 8), col: 1 };
  if (i <= 24) return { row: 1, col: 1 + (i - 16) };
  return { row: 1 + (i - 24), col: 9 };
}
