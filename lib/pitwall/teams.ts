import { TEAM_COLOR } from "../teams";

/**
 * ทีมในเกม — สีพื้นอิงสีประจำทีมฤดูกาลปัจจุบัน (ไม่ใช่ลายลิเวอรีหรือโลโก้)
 * ชื่อทีม/นักขับเป็นชื่อสมมติแนวล้อ อ่านแล้วนึกออกแต่ไม่ใช่ชื่อจริง และเลขรถเป็นเลขสมมติ
 * pace = ความเร็วของรถ (วินาทีต่อรอบเทียบทีมเร็วสุด) · skill = ฝีมือนักขับ (ลบ = เร็วกว่า)
 */
export const TEAMS = [
  {
    id: "papaya",
    name: "ปาปายา เรซซิ่ง",
    color: TEAM_COLOR.mclaren,
    ink: "#08080A",
    pace: 0,
    drivers: [
      { name: "ลันโด นอร์ธเวย์", num: 9, skill: -0.05 },
      { name: "ออสซี่ ปีสตาร์", num: 15, skill: 0 },
    ],
  },
  {
    id: "bull",
    name: "บูลรัน",
    color: TEAM_COLOR.red_bull,
    ink: "#ffffff",
    pace: 0.12,
    drivers: [
      { name: "แม็คส์ เวอร์สตรีม", num: 29, skill: -0.15 },
      { name: "อิซัค ฮาร์ดเลน", num: 34, skill: 0.12 },
    ],
  },
  {
    id: "silver",
    name: "ซิลเวอร์สตาร์",
    color: TEAM_COLOR.mercedes,
    ink: "#08080A",
    pace: 0.18,
    drivers: [
      { name: "จอร์แดน รัสส์เวล", num: 19, skill: -0.04 },
      { name: "คิโม่ อันเตลโล", num: 24, skill: 0.08 },
    ],
  },
  {
    id: "rosso",
    name: "รอสโซ คอร์เซ",
    color: TEAM_COLOR.ferrari,
    ink: "#ffffff",
    pace: 0.22,
    drivers: [
      { name: "ชาร์ลี เลอแกลง", num: 26, skill: -0.08 },
      { name: "ลูกัส แฮมป์ตัน", num: 28, skill: -0.02 },
    ],
  },
  {
    id: "green",
    name: "บริติชกรีน",
    color: TEAM_COLOR.aston_martin,
    ink: "#ffffff",
    pace: 0.85,
    drivers: [
      { name: "เฟอร์ดี้ อลอนเต้", num: 36, skill: -0.08 },
      { name: "ลีออน สโตรมเบิร์ก", num: 37, skill: 0.15 },
    ],
  },
  {
    id: "grove",
    name: "โกรฟ เรซซิ่ง",
    color: TEAM_COLOR.williams,
    ink: "#ffffff",
    pace: 1.05,
    drivers: [
      { name: "อเล็ก อัลบาโน่", num: 38, skill: -0.02 },
      { name: "คาร์โล ซานเชส", num: 39, skill: 0 },
    ],
  },
  {
    id: "stripe",
    name: "สตาร์สไตรป์",
    color: TEAM_COLOR.haas,
    ink: "#08080A",
    pace: 1.2,
    drivers: [
      { name: "เอสตาบัน โอโคโร", num: 42, skill: 0.02 },
      { name: "โอลิน แบร์ด", num: 46, skill: 0.05 },
    ],
  },
] as const;

export type GameTeam = (typeof TEAMS)[number];

export const NAMES_NOTE =
  "ชื่อทีมและนักขับในเกมเป็นชื่อสมมติเพื่อความสนุก ไม่เกี่ยวข้องกับ Formula 1 ทีม หรือนักขับคนใดอย่างเป็นทางการ";

/** สนามที่เล่นได้ (ชื่อภาษาไทย) — รูปสนามมาจากข้อมูล OSM ใน lib/circuits */
export const CIRCUITS = [
  { id: "spa", name: "สปา-ฟรังโคชองส์" },
  { id: "monza", name: "มอนซา" },
  { id: "silverstone", name: "ซิลเวอร์สโตน" },
  { id: "suzuka", name: "ซูซูกะ" },
  { id: "interlagos", name: "อินเตอร์ลากอส" },
  { id: "bahrain", name: "บาห์เรน" },
  { id: "zandvoort", name: "ซานด์วูร์ต" },
  { id: "hungaroring", name: "ฮังการอริง" },
  { id: "catalunya", name: "บาร์เซโลนา" },
  { id: "albert_park", name: "อัลเบิร์ตพาร์ก" },
  { id: "americas", name: "ออสติน" },
  { id: "monaco", name: "โมนาโก" },
] as const;
export const circuitName = (id: string) => CIRCUITS.find((c) => c.id === id)?.name ?? id;
