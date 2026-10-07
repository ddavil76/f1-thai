/**
 * ชุดไพ่และลูกเต๋าของเกม — ตัวเลข ชื่อ และคำอธิบายเป็นของเราเอง
 * MOVE (ทีมผู้เล่น) · AI (รถ AI) · ACTION (เหตุการณ์) · PITWALL (กลยุทธ์ทีม) · ลูกเต๋าอุบัติเหตุ · ไพ่ควอลิฟาย
 */

const times = <T>(n: number, x: T) => Array.from({ length: n }, () => x);

/* ---------- ไพ่ MOVE ---------- */

/**
 * y/r = ระยะเมื่อใส่ยางเหลือง/แดง · w = ระยะเมื่อใส่ยางฝน
 * tires = ป้ายสึก (ไพ่ความเร็วสูงสุด) · ers = สายฟ้าชาร์จ ERS
 * action = เปิดไพ่ ACTION หลังเดิน · pitwall = จั่ว PITWALL เพิ่ม 1 ใบ
 * spinDry / spinWet = ฝนตกแล้วหมุนออกนอกสนามถ้าใส่ยางแห้ง / ยางฝน
 */
export type MoveCard = {
  y: number;
  r: number;
  w: number;
  tires: boolean;
  ers: boolean;
  action: boolean;
  pitwall: boolean;
  spinDry: boolean;
  spinWet: boolean;
};

/** ป้ายของไพ่: T สึก · E สายฟ้า · A ACTION · P PITWALL · D หมุนบนยางแห้ง · W หมุนบนยางฝน */
const mc = (y: number, r: number, w: number, tags = ""): MoveCard => ({
  y,
  r,
  w,
  tires: tags.includes("T"),
  ers: tags.includes("E"),
  action: tags.includes("A"),
  pitwall: tags.includes("P"),
  spinDry: tags.includes("D"),
  spinWet: tags.includes("W"),
});

/** สำรับ MOVE ของแต่ละทีม (36 ใบ) — ไพ่ที่เร็วสุดคือไพ่ที่ทำให้ยางสึก */
export const MOVE_DECK: MoveCard[] = [
  mc(7, 9, 6, "TED"),
  mc(7, 9, 6, "TEAD"),
  mc(7, 9, 6, "TD"),
  mc(7, 9, 5, "TPDW"),
  mc(7, 8, 6, "TED"),
  mc(7, 8, 5, "TAD"),
  mc(7, 8, 5, "TD"),
  mc(6, 9, 5, "TEP"),
  mc(6, 9, 5, "TD"),
  mc(6, 9, 5, "TAD"),
  mc(6, 7, 5, "P"),
  mc(6, 7, 5),
  mc(6, 7, 5, "A"),
  mc(6, 7, 5, "D"),
  mc(6, 7, 5),
  mc(6, 7, 5, "W"),
  mc(6, 8, 5),
  mc(6, 8, 5, "D"),
  mc(6, 8, 5, "P"),
  mc(6, 8, 5, "A"),
  mc(6, 6, 5),
  mc(6, 6, 5, "P"),
  mc(6, 6, 5, "D"),
  mc(6, 6, 5),
  mc(5, 7, 4, "A"),
  mc(5, 7, 4),
  mc(5, 7, 4, "D"),
  mc(5, 7, 4, "P"),
  mc(5, 6, 4),
  mc(5, 6, 4, "W"),
  mc(5, 6, 4, "D"),
  mc(5, 6, 4),
  mc(5, 5, 4),
  mc(5, 5, 4, "D"),
  mc(4, 5, 4, "A"),
  mc(4, 5, 4, "P"),
];

/* ---------- ไพ่ AI ---------- */

/** v = ระยะ (ยางกลาง) · w = ระยะบนยางฝน · box = ถึงเวลาเข้าพิท · attack/block = ใช้เหรียญนั้นอัตโนมัติ */
export type AiCard = {
  v: number;
  w: number;
  box: boolean;
  attack: boolean;
  block: boolean;
  action: boolean;
  spinDry: boolean;
  spinWet: boolean;
};
const ac = (v: number, f: Partial<AiCard> = {}): AiCard => ({
  v,
  w: v - 1,
  box: false,
  attack: false,
  block: false,
  action: false,
  spinDry: false,
  spinWet: false,
  ...f,
});

export const AI_DECK: AiCard[] = [
  ac(7, { spinDry: true }),
  ac(7),
  ac(7, { action: true, spinDry: true }),
  ac(7, { attack: true }),
  ac(7, { box: true }),
  ac(6),
  ac(6, { spinDry: true }),
  ac(6),
  ac(6, { action: true }),
  ac(6, { spinDry: true, spinWet: true }),
  ac(6),
  ac(6),
  ac(6, { attack: true, spinDry: true }),
  ac(6, { block: true }),
  ac(6, { box: true }),
  ac(5),
  ac(5, { spinDry: true }),
  ac(5),
  ac(5, { attack: true }),
  ac(5, { block: true, action: true }),
  ac(5, { spinWet: true }),
  ac(6, { box: true, spinDry: true }),
];

/* ---------- ไพ่ ACTION (เหตุการณ์) ---------- */

export type ActionKind =
  | "mistake"
  | "weather"
  | "storm"
  | "tires"
  | "ersFail"
  | "focusAttack"
  | "focusBlock"
  | "focusSlip"
  | "focusAll"
  | "trackLimits"
  | "brakes"
  | "incident";

export const ACTION_INFO: Record<ActionKind, { title: string; text: string }> = {
  mistake: { title: "พลาดเอง", text: "หลุดไลน์ ถูกเบียดออกนอกเส้นแข่ง (ถ้าข้างว่าง)" },
  weather: { title: "ฟ้าเปลี่ยน", text: "สภาพอากาศเลื่อนไป 1 ขั้น" },
  storm: { title: "ฟ้าแปรปรวน", text: "ทอยเต๋าอากาศ ตั้งสภาพอากาศใหม่ทันที" },
  tires: { title: "ยางช้ำ", text: "ยางสึกเพิ่ม (เหลือง 1 · แดง 2)" },
  ersFail: { title: "ERS ดับ", text: "แบตเตอรี่หมดเกลี้ยง ชาร์จใหม่ได้ตามปกติ" },
  focusAttack: { title: "เสียสมาธิ", text: "ทิ้งเหรียญ ATTACK ทั้งหมด" },
  focusBlock: { title: "เสียสมาธิ", text: "ทิ้งเหรียญ BLOCK ทั้งหมด" },
  focusSlip: { title: "เสียสมาธิ", text: "ทิ้งเหรียญ SLIP ทั้งหมด" },
  focusAll: { title: "เสียสมาธิหนัก", text: "เหรียญทุกชนิดลดลง 1 ครั้ง" },
  trackLimits: { title: "ออกนอกขอบสนาม", text: "ไหลไปข้างหน้า 1 ช่อง (ถ้าว่าง) แล้วโดนใบเตือน" },
  brakes: { title: "เบรกร้อน", text: "เดินได้แค่ BASE จนกว่าจะผ่าน V-BOX หรือเข้าพิท" },
  incident: { title: "เฉี่ยวชน", text: "รถคันนี้และคันที่อยู่ติดกัน (หน้า หลัง ข้าง) ทอยเต๋าอุบัติเหตุ" },
};

/** คำอธิบายที่ต่างไปในกติกาของเรา */
export const ACTION_TEXT_OURS: Partial<Record<ActionKind, string>> = {
  weather: "อากาศเลื่อนไป 1 ขั้น (แดด → เมฆ → ฝน)",
  trackLimits: "ถอยหลัง 2 ช่องทันที",
  incident: "รถคันนี้และคันที่อยู่ติดกันทอยเต๋าอุบัติเหตุ (รถผู้เล่นไม่ชนออก แค่เสียหาย)",
};

/** ไพ่ ACTION ที่ใช้ในกติกาของเรา (ผลชัด เข้าใจทันที) */
export const ACTION_OURS: ActionKind[] = ["tires", "ersFail", "brakes", "trackLimits", "incident"];
/** ไพ่ที่เกี่ยวกับอากาศ — ตอนนี้เกมแข่งแดดออกอย่างเดียว จึงไม่ใส่ในกอง */
export const WEATHER_ACTIONS: ActionKind[] = ["weather", "storm"];

export const ACTION_DECK: ActionKind[] = [
  ...times(3, "mistake" as const),
  ...times(3, "weather" as const),
  "storm",
  ...times(3, "tires" as const),
  ...times(2, "ersFail" as const),
  "focusAttack",
  "focusBlock",
  "focusSlip",
  "focusAll",
  ...times(3, "trackLimits" as const),
  ...times(2, "brakes" as const),
  ...times(3, "incident" as const),
];

/* ---------- ลูกเต๋าอุบัติเหตุ ---------- */

export type IncidentFace = "escape" | "warn" | "penalty" | "back" | "off" | "damage" | "crash";

export const INCIDENT_DIE: IncidentFace[] = ["escape", "warn", "penalty", "off", "damage", "crash"];
/** ลูกเต๋าของกติกาของเรา — ไม่มีใบเตือน/โทษ รอดง่ายขึ้น */
export const INCIDENT_DIE_OURS: IncidentFace[] = ["escape", "escape", "back", "off", "damage", "crash"];

export const INCIDENT_INFO: Record<IncidentFace, { title: string; color: string }> = {
  escape: { title: "รอดหวุดหวิด", color: "#22c55e" },
  warn: { title: "ใบเตือน", color: "#DEDEDE" },
  penalty: { title: "โดนลงโทษ", color: "#ff3b2f" },
  off: { title: "หลุดออกนอกสนาม", color: "#facc15" },
  damage: { title: "รถเสียหาย", color: "#fb923c" },
  back: { title: "เสียจังหวะ ถอย 2 ช่อง", color: "#DEDEDE" },
  crash: { title: "ชนออกจากเรซ", color: "#E10600" },
};

/* ---------- ไพ่ PITWALL (กลยุทธ์ทีม) ---------- */

export type PitwallKind =
  | "attack"
  | "block"
  | "slip"
  | "charge"
  | "tires"
  | "radar"
  | "report"
  | "teamSpeed"
  | "quickBox"
  | "push"
  | "pace";

export type PitwallCard = { kind: PitwallKind; value?: number };

export const PITWALL_INFO: Record<PitwallKind, { title: string; text: string }> = {
  attack: { title: "สั่งบุก", text: "เหรียญ ATTACK +1 ใช้ได้ทันที" },
  block: { title: "สั่งตั้งรับ", text: "เหรียญ BLOCK +1 ใช้ได้ทันที" },
  slip: { title: "วิทยุทีม", text: "เหรียญ SLIP +1 ใช้ได้ทันที" },
  charge: { title: "ชาร์จแบต", text: "ERS +1 ขั้น" },
  tires: { title: "ถนอมยาง", text: "ยางฟื้น (เหลือง 1 · แดง 2 ขั้น) ใช้กับยางพังไม่ได้" },
  radar: { title: "เรดาร์ฝน", text: "สภาพอากาศเลื่อนไป 2 ขั้น" },
  report: { title: "ร้องเรียน", text: "รถที่อยู่ติดหน้าในเลนเดียวกันโดนใบเตือน" },
  teamSpeed: { title: "ทีมเวิร์ก", text: "ตานี้ +1 ช่อง และเพื่อนร่วมทีมขยับไป 1 ช่อง" },
  quickBox: { title: "พิทสต็อปเร็ว", text: "ถึงช่องพิทแล้วเปลี่ยนยางออกได้ในตาเดียว" },
  push: { title: "ดันสุด", text: "โหมด: วิ่งเท่าไพ่เร็วสุดทุกตา ยางสึกทุกตา" },
  pace: { title: "รักษาจังหวะ", text: "โหมด: วิ่งระยะคงที่ไม่สึกยาง หลุดจังหวะ = จบโหมด" },
};

/** ไพ่ PITWALL ที่ใช้ในกติกาของเรา */
export const PITWALL_OURS: PitwallKind[] = ["charge", "tires", "teamSpeed", "quickBox", "push"];
export const WEATHER_PITWALL: PitwallKind[] = ["radar"];

export const PITWALL_DECK: PitwallCard[] = [
  ...times(2, { kind: "attack" as const }),
  ...times(2, { kind: "block" as const }),
  ...times(2, { kind: "slip" as const }),
  ...times(2, { kind: "charge" as const }),
  ...times(2, { kind: "tires" as const }),
  ...times(2, { kind: "radar" as const }),
  ...times(2, { kind: "report" as const }),
  ...times(2, { kind: "teamSpeed" as const }),
  ...times(2, { kind: "quickBox" as const }),
  ...times(2, { kind: "push" as const }),
  { kind: "pace", value: 5 },
  { kind: "pace", value: 6 },
];

/* ---------- ไพ่ควอลิฟาย ---------- */

/** ไพ่ควอลิฟายเลข 1..36 — เลขน้อย = รอบเร็ว */
export const QUALI_CARDS = 36;

/** แปลงเลขไพ่เป็นเวลาต่อรอบสมมติ ให้อ่านแล้วรู้สึกเป็นรอบจับเวลา */
export function lapTime(card: number): string {
  const ms = 103_000 + card * 137;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}
