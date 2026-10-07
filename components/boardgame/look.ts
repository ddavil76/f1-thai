import type { Compound, Driver } from "@/lib/boardgame/engine";

/** ทีมของผู้เล่น — ชื่อทีม/นักขับสมมติ สีแดงกับขาวให้ตัดกันบนพื้นดำ */
export const HUMAN_TEAMS = [
  { name: "เมเทียร์ เรซซิ่ง", color: "#E10600", ink: "#fff", drivers: [{ name: "ภูมิ", num: 7 }, { name: "นาวิน", num: 17 }] },
  { name: "ไอซ์ไบรท์ เรซซิ่ง", color: "#DEDEDE", ink: "#08080A", drivers: [{ name: "มีนา", num: 21 }, { name: "ธาม", num: 27 }] },
] as const;

/** ทีม AI สมมติ เติมให้กริดครบ 12 คัน */
export const AI_TEAMS = [
  { name: "ไลท์สปีด", nums: [3, 4] },
  { name: "ทาสคาน", nums: [11, 12] },
  { name: "โอไรออน", nums: [19, 20] },
  { name: "บลูเฟิร์น", nums: [24, 25] },
  { name: "ซันเดอร์", nums: [38, 39] },
];

const AI_LOOK = { color: "#4a4a55", ink: "#DEDEDE" };
export const look = (d: Pick<Driver, "ai" | "team">) => (d.ai ? AI_LOOK : HUMAN_TEAMS[d.team]);

export const COMPOUND_COLOR: Record<Compound, string> = { yellow: "#facc15", red: "#E10600" };
export const WET_COLOR = "#60a5fa";
export const tyreOf = (d: Driver) => (d.wet ? WET_COLOR : d.ai ? "#3a3a40" : COMPOUND_COLOR[d.compound]);
