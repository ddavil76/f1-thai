/**
 * การ์ดของโหมดคุมนักขับ AI (roguelite autobattler)
 * — การ์ดเลเวลอัป: ได้ระหว่างเรซเมื่อหลอด XP เต็ม (เกมหยุดให้เลือก) · มีผลถึงจบเรซนั้น
 * — ชิ้นส่วน: ได้หลังเรซ/ซื้อที่โรงงาน · ติดรถถาวรทั้งรัน · คำสาปได้จากอีเวนต์
 * — การ์ดเสี่ยง: ค่าพุ่งแรง แต่มีโอกาสเครื่องพัง (ต้องเข้าพิทซ่อม) หรือหมุนในโค้ง
 * ผลทั้งหมดเป็นตัวคูณ/ตัวบวกของ Boost (lib/pitwall/drive/race.ts) · ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { NO_BOOST, type Boost } from "../drive/race";

export type Rarity = "common" | "rare" | "legend" | "curse";
export type Stat = "engine" | "accel" | "grip" | "corner" | "tyre" | "driver" | "attack" | "pit";
/** ความเสี่ยง (มี risk = การ์ดเสี่ยง แม้จะเป็น {} ก็ตาม): engine = โอกาสเครื่องพังต่อรอบ · spin = โอกาสหมุนต่อการเข้าโค้งช้า */
export type Risk = { engine?: number; spin?: number };
export type Card = { id: string; name: string; text: string; rarity: Rarity; stat: Stat; boost: Partial<Boost>; risk?: Risk };

export const STAT_NAME: Record<Stat, string> = {
  engine: "เครื่อง",
  accel: "อัตราเร่ง",
  grip: "การเกาะถนน",
  corner: "เข้าโค้ง",
  tyre: "ยาง",
  driver: "นักขับ",
  attack: "การแซง",
  pit: "พิท",
};

/** การ์ดเลเวลอัป (ระหว่างเรซ) */
export const RACE_CARDS: Card[] = [
  { id: "r_top", name: "จูนเครื่องด่วน", text: "ความเร็วปลาย +1%", rarity: "common", stat: "engine", boost: { top: 1.01 } },
  { id: "r_acc", name: "แผนที่เครื่องดุ", text: "อัตราเร่ง +5%", rarity: "common", stat: "accel", boost: { accel: 1.05 } },
  { id: "r_grip", name: "ปรับปีก", text: "การเกาะถนน +2.5%", rarity: "common", stat: "grip", boost: { grip: 1.025 } },
  { id: "r_corner", name: "สายเบรกลึก", text: "เข้าโค้งเร็วขึ้น 2.5%", rarity: "common", stat: "corner", boost: { corner: 1.025 } },
  { id: "r_tyre", name: "ถนอมยาง", text: "ยางสึกช้าลง 20%", rarity: "common", stat: "tyre", boost: { wear: 0.8 } },
  { id: "r_focus", name: "สมาธินักขับ", text: "ขับแม่นขึ้น (ช้ากว่าเส้นอ้างอิงน้อยลง)", rarity: "common", stat: "driver", boost: { slack: -0.008 } },
  { id: "r_hunt", name: "สัญชาตญาณนักล่า", text: "ออกแซงเร็วขึ้น 45%", rarity: "common", stat: "attack", boost: { patience: 0.55 } },
  { id: "r_crew", name: "ช่างตื่นตัว", text: "จอดเปลี่ยนยางเร็วขึ้น 0.5 วิ", rarity: "common", stat: "pit", boost: { pitTime: -0.5, crew: 0.7 } },
  { id: "r_top2", name: "โหมดควอลิฟาย", text: "ความเร็วปลาย +1.8%", rarity: "rare", stat: "engine", boost: { top: 1.018 } },
  { id: "r_grip2", name: "แพ็กแอโร่", text: "การเกาะถนน +4% · เข้าโค้ง +1.5%", rarity: "rare", stat: "grip", boost: { grip: 1.04, corner: 1.015 } },
  { id: "r_zone", name: "อยู่ในโซน", text: "ขับแม่นขึ้นมาก · ออกแซงเร็วขึ้น 30%", rarity: "rare", stat: "driver", boost: { slack: -0.014, patience: 0.7 } },
  { id: "r_tyre2", name: "มือถนอมยาง", text: "ยางสึกช้าลง 40%", rarity: "rare", stat: "tyre", boost: { wear: 0.6 } },
  { id: "r_god", name: "วันของเขา", text: "ทุกอย่างดีขึ้นนิดหน่อย", rarity: "legend", stat: "driver", boost: { top: 1.01, accel: 1.03, grip: 1.025, corner: 1.015, slack: -0.008 } },
  // การ์ดเสี่ยง
  { id: "x_oc", name: "โอเวอร์คล็อก ⚠", text: "ความเร็วปลาย +2% · อัตราเร่ง +5% · เครื่องอาจพัง (12%/รอบ) ต้องเข้าพิทซ่อม", rarity: "rare", stat: "engine", boost: { top: 1.02, accel: 1.05 }, risk: { engine: 0.12 } },
  { id: "x_dive", name: "เข้าโค้งดุ ⚠", text: "เข้าโค้งเร็วขึ้น 4% · อาจหมุนในโค้งช้า (5%/โค้ง)", rarity: "rare", stat: "corner", boost: { corner: 1.04 }, risk: { spin: 0.05 } },
  { id: "x_thin", name: "ยางบางพิเศษ ⚠", text: "การเกาะถนน +4% · ยางสึกเร็วขึ้น 50%", rarity: "rare", stat: "tyre", boost: { grip: 1.04, wear: 1.5 }, risk: {} },
];

/** ชิ้นส่วนถาวร (ระหว่างเรซต่อเรซ) */
export const PARTS: Card[] = [
  { id: "p_engine", name: "เครื่องยนต์ใหม่", text: "ความเร็วปลาย +0.5%", rarity: "common", stat: "engine", boost: { top: 1.005 } },
  { id: "p_turbo", name: "เทอร์โบชาร์จ", text: "อัตราเร่ง +2.5%", rarity: "common", stat: "accel", boost: { accel: 1.025 } },
  { id: "p_floor", name: "พื้นรถใหม่", text: "การเกาะถนน +1.2%", rarity: "common", stat: "grip", boost: { grip: 1.012 } },
  { id: "p_brake", name: "เบรกคาร์บอน", text: "เข้าโค้งเร็วขึ้น 1.2%", rarity: "common", stat: "corner", boost: { corner: 1.012 } },
  { id: "p_susp", name: "ช่วงล่างนุ่ม", text: "ยางสึกช้าลง 12%", rarity: "common", stat: "tyre", boost: { wear: 0.88 } },
  { id: "p_gun", name: "ปืนลมพิท", text: "จอดเปลี่ยนยางเร็วขึ้น 0.4 วิ", rarity: "common", stat: "pit", boost: { pitTime: -0.4, crew: 0.8 } },
  { id: "p_coach", name: "โค้ชนักขับ", text: "นักขับแม่นขึ้น", rarity: "common", stat: "driver", boost: { slack: -0.004 } },
  { id: "p_aero", name: "ชุดแอโร่ทั้งคัน", text: "การเกาะถนน +2% · ความเร็วปลาย +0.4%", rarity: "rare", stat: "grip", boost: { grip: 1.02, top: 1.004 } },
  { id: "p_hybrid", name: "ไฮบริดรุ่นใหม่", text: "อัตราเร่ง +4% · ความเร็วปลาย +0.5%", rarity: "rare", stat: "accel", boost: { accel: 1.04, top: 1.005 } },
  { id: "p_ace", name: "นักขับดาวรุ่งตัวจริง", text: "นักขับแม่นขึ้นมาก · ออกแซงเร็วขึ้น 25%", rarity: "rare", stat: "driver", boost: { slack: -0.008, patience: 0.75 } },
  { id: "p_crew", name: "ทีมพิทแชมป์โลก", text: "จอดเร็วขึ้น 0.8 วิ · แม่นขึ้นมาก", rarity: "rare", stat: "pit", boost: { pitTime: -0.8, crew: 0.4 } },
  { id: "p_proto", name: "รถต้นแบบ", text: "ความเร็วปลาย +1% · เกาะถนน +2% · ยางสึกเพิ่ม 10%", rarity: "legend", stat: "engine", boost: { top: 1.01, grip: 1.02, wear: 1.1 } },
  { id: "c_old", name: "เครื่องเก่า", text: "ความเร็วปลาย −0.6%", rarity: "curse", stat: "engine", boost: { top: 0.994 } },
  { id: "c_tyre", name: "ยางล็อตเสีย", text: "ยางสึกเร็วขึ้น 20%", rarity: "curse", stat: "tyre", boost: { wear: 1.2 } },
  { id: "c_rookie", name: "ช่างมือใหม่", text: "จอดช้าลง 1 วิ", rarity: "curse", stat: "pit", boost: { pitTime: 1, crew: 1.4 } },
];

export const cardOf = (id: string): Card => RACE_CARDS.find((c) => c.id === id) ?? PARTS.find((c) => c.id === id)!;

/** รวมผลหลายใบ: คูณ (accel/grip/top/corner/wear/patience/crew) · บวก (slack/pitTime) */
export function combine(ids: string[], base: Boost = NO_BOOST): Boost {
  const b = { ...base };
  for (const id of ids) {
    const x = cardOf(id)?.boost ?? {};
    b.accel *= x.accel ?? 1;
    b.grip *= x.grip ?? 1;
    b.top *= x.top ?? 1;
    b.corner *= x.corner ?? 1;
    b.wear *= x.wear ?? 1;
    b.patience *= x.patience ?? 1;
    b.crew *= x.crew ?? 1;
    b.slack += x.slack ?? 0;
    b.pitTime += x.pitTime ?? 0;
  }
  return b;
}

/** ความเสี่ยงรวม (รวมแบบ 1 − Π(1 − p)) */
export function riskOf(ids: string[]): Required<Risk> {
  let e = 1;
  let s = 1;
  for (const id of ids) {
    const r = cardOf(id)?.risk;
    if (r?.engine) e *= 1 - r.engine;
    if (r?.spin) s *= 1 - r.spin;
  }
  return { engine: 1 - e, spin: 1 - s };
}

/** XP: แซงได้ · จบรอบ · รอบสะอาด (ไม่หลุดโค้ง) — เลเวลถัดไปต้องการ XP มากขึ้นเรื่อย ๆ */
export const XP = { pass: 30, lap: 20, clean: 15 };
export const xpNeed = (level: number) => 40 + level * 20;
