import type { Compound, Driver } from "@/lib/boardgame/engine";
import { TEAM_COLOR } from "@/lib/teams";

/**
 * ทีมในเกม — สีพื้นอิงสีประจำทีมฤดูกาลปัจจุบัน (ไม่ใช่ลายลิเวอรีหรือโลโก้)
 * ชื่อทีม/นักขับเป็นชื่อสมมติแนวล้อ อ่านแล้วนึกออกแต่ไม่ใช่ชื่อจริง และเลขรถเป็นเลขสมมติ
 * เลขรถไม่ซ้ำกันทั้งกริด — ใช้หาทีมจากเลขได้
 */
export const TEAMS = [
  {
    id: "papaya",
    name: "ปาปายา เรซซิ่ง",
    color: TEAM_COLOR.mclaren,
    ink: "#08080A",
    drivers: [
      { name: "ลันโด นอร์ธเวย์", num: 9 },
      { name: "ออสซี่ ปีสตาร์", num: 15 },
    ],
  },
  {
    id: "silver",
    name: "ซิลเวอร์สตาร์",
    color: TEAM_COLOR.mercedes,
    ink: "#08080A",
    drivers: [
      { name: "จอร์แดน รัสส์เวล", num: 19 },
      { name: "คิโม่ อันเตลโล", num: 24 },
    ],
  },
  {
    id: "rosso",
    name: "รอสโซ คอร์เซ",
    color: TEAM_COLOR.ferrari,
    ink: "#ffffff",
    drivers: [
      { name: "ชาร์ลี เลอแกลง", num: 26 },
      { name: "ลูกัส แฮมป์ตัน", num: 28 },
    ],
  },
  {
    id: "bull",
    name: "บูลรัน",
    color: TEAM_COLOR.red_bull,
    ink: "#ffffff",
    drivers: [
      { name: "แม็คส์ เวอร์สตรีม", num: 29 },
      { name: "อิซัค ฮาร์ดเลน", num: 34 },
    ],
  },
  {
    id: "green",
    name: "บริติชกรีน",
    color: TEAM_COLOR.aston_martin,
    ink: "#ffffff",
    drivers: [
      { name: "เฟอร์ดี้ อลอนเต้", num: 36 },
      { name: "ลีออน สโตรมเบิร์ก", num: 37 },
    ],
  },
  {
    id: "grove",
    name: "โกรฟ เรซซิ่ง",
    color: TEAM_COLOR.williams,
    ink: "#ffffff",
    drivers: [
      { name: "อเล็ก อัลบาโน่", num: 38 },
      { name: "คาร์โล ซานเชส", num: 39 },
    ],
  },
  {
    id: "stripe",
    name: "สตาร์สไตรป์",
    color: TEAM_COLOR.haas,
    ink: "#08080A",
    drivers: [
      { name: "เอสตาบัน โอโคโร", num: 42 },
      { name: "โอลิน แบร์ด", num: 46 },
    ],
  },
] as const;

export type GameTeam = (typeof TEAMS)[number];

export const NAMES_NOTE = "ชื่อทีมและนักขับในเกมเป็นชื่อสมมติเพื่อความสนุก ไม่เกี่ยวข้องกับ Formula 1 ทีม หรือนักขับคนใดอย่างเป็นทางการ";

const FALLBACK = { name: "", color: "#4a4a55", ink: "#DEDEDE" };
export const teamOfNum = (num: number) => TEAMS.find((t) => t.drivers.some((d) => d.num === num));
export const look = (d: Pick<Driver, "num">) => teamOfNum(d.num) ?? FALLBACK;

export const COMPOUND_COLOR: Record<Compound, string> = { yellow: "#facc15", red: "#E10600" };
export const WET_COLOR = "#60a5fa";
export const tyreOf = (d: Driver) => (d.wet ? WET_COLOR : d.ai ? "#3a3a40" : COMPOUND_COLOR[d.compound]);
