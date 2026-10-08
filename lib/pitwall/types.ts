/**
 * Pit Wall — ชนิดข้อมูลที่ใช้ร่วมกันทั้งในเบราว์เซอร์และบนเซิร์ฟเวอร์ห้องออนไลน์
 * ไฟล์ใน lib/pitwall ใช้ import แบบ relative เท่านั้น (เซิร์ฟเวอร์ Cloudflare ไม่รู้จัก "@/")
 */

export type Compound = "soft" | "medium" | "hard";
export const COMPOUNDS: Compound[] = ["soft", "medium", "hard"];
export const COMPOUND_INFO: Record<Compound, { label: string; short: string; color: string }> = {
  soft: { label: "Soft", short: "S", color: "#E10600" },
  medium: { label: "Medium", short: "M", color: "#facc15" },
  hard: { label: "Hard", short: "H", color: "#f4f4f5" },
};

export type AiLevel = "easy" | "normal" | "hard";
export type DriveMode = "save" | "normal" | "push";
export type ErsMode = "harvest" | "auto" | "boost";
export type Fight = "defend" | "none" | "attack";
export type TeamOrder = "free" | "hold" | "swap";
export type QualiFormat = "knockout" | "single" | "none";
export type LaunchKind = "great" | "good" | "ok" | "slow" | "jump";

/** โซนบนสนาม: ช่วงช่องในรอบ (รวมปลาย) อาจคร่อมเส้นชัยได้ (start > end) */
export type Zone = { start: number; end: number; slow?: boolean };

export type TyreSet = { compound: Compound; wear: number; used: boolean };

/** ข้อมูลรถหนึ่งคันที่ใช้ทั้งควอลิฟายและเรซ */
export type Car = {
  id: number;
  num: number;
  name: string;
  team: number;
  /** ความเก่งของนักขับ (วินาทีต่อรอบ ลบ = เร็วกว่า) */
  skill: number;
  /** แรงกดอากาศ 0 = ทางตรงเร็ว · 1 = เข้าโค้งเร็ว */
  downforce: number;
  /** ชุดยางของสุดสัปดาห์ */
  sets: TyreSet[];
};

export type Neutral = { kind: "sc" | "vsc"; laps: number; ending: boolean };

/** ข้อความวิทยุทีม / ประกาศ */
export type Radio = { id: number; at: number; team: number | null; car: number | null; text: string; tone: "info" | "good" | "bad" | "warn" };
