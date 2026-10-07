import type { Compound, Driver } from "@/lib/boardgame/engine";
import { TEAM_COLOR } from "@/lib/teams";

/**
 * สีรถอิงสีประจำทีมในฤดูกาลปัจจุบัน (ใช้แค่สีพื้น ไม่ใช่ลายลิเวอรีหรือโลโก้)
 * ชื่อทีม/นักขับยังเป็นชื่อสมมติ
 */
export const HUMAN_TEAMS = [
  { name: "เมเทียร์ เรซซิ่ง", color: TEAM_COLOR.mclaren, ink: "#08080A", drivers: [{ name: "ภูมิ", num: 7 }, { name: "นาวิน", num: 17 }] },
  { name: "ไอซ์ไบรท์ เรซซิ่ง", color: TEAM_COLOR.mercedes, ink: "#08080A", drivers: [{ name: "มีนา", num: 21 }, { name: "ธาม", num: 27 }] },
] as const;

/** ทีม AI สมมติ เติมให้กริดครบ 12 คัน */
export const AI_TEAMS = [
  { name: "ไลท์สปีด", nums: [3, 4], color: TEAM_COLOR.ferrari, ink: "#ffffff" },
  { name: "ทาสคาน", nums: [11, 12], color: TEAM_COLOR.red_bull, ink: "#ffffff" },
  { name: "โอไรออน", nums: [19, 20], color: TEAM_COLOR.aston_martin, ink: "#ffffff" },
  { name: "บลูเฟิร์น", nums: [24, 25], color: TEAM_COLOR.williams, ink: "#ffffff" },
  { name: "ซันเดอร์", nums: [38, 39], color: TEAM_COLOR.haas, ink: "#08080A" },
];

const AI_FALLBACK = { color: "#4a4a55", ink: "#DEDEDE" };
export const look = (d: Pick<Driver, "ai" | "team" | "num">) =>
  d.ai ? (AI_TEAMS.find((t) => t.nums.includes(d.num)) ?? AI_FALLBACK) : HUMAN_TEAMS[d.team];

export const COMPOUND_COLOR: Record<Compound, string> = { yellow: "#facc15", red: "#E10600" };
export const WET_COLOR = "#60a5fa";
export const tyreOf = (d: Driver) => (d.wet ? WET_COLOR : d.ai ? "#3a3a40" : COMPOUND_COLOR[d.compound]);
