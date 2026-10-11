/**
 * การ์ดของโหมด Roguelike
 * — การ์ดอัปเกรด (ติดรถถาวรทั้งรัน): ปรับตัวเลขของการจำลอง (CarMods) · สะสมสายเดียวกันครบ 3 ใบได้โบนัสสาย
 * — การ์ดคำสาป: ได้จากอีเวนต์ที่เลือกเสี่ยง · ลบได้ที่โรงงาน
 * — การ์ดกลยุทธ์ (กองการ์ดที่จั่วระหว่างแข่ง): ใช้พลังทีม ผลชั่วคราว (lib/pitwall/race.ts playStrategy)
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import type { CarMods, StrategyKind } from "../race";
import { STRATEGY_COST } from "../race";

export type Rarity = "common" | "rare" | "legend" | "curse";
export type Tag = "tyre" | "battery" | "attack" | "pit" | "pace";

export type UpgradeId =
  | "pitcrew" | "drs" | "tyre_eng" | "engine_map" | "battery" | "launch" | "suspension"
  | "hybrid" | "aggressive" | "wall" | "aero_pkg" | "strategist" | "whisperer"
  | "proto_engine" | "data_center" | "energy_core"
  | "old_engine" | "bad_tyres" | "rookie_crew";

/** การ์ดอัปเกรด: mods = ตัวปรับรถ · energy/maxEnergy = พลังทีมตอนเริ่มเรซ/สูงสุดเพิ่ม */
export type Upgrade = { id: UpgradeId; name: string; text: string; rarity: Rarity; tag?: Tag; mods?: CarMods; energy?: number; maxEnergy?: number };

export const UPGRADES: Record<UpgradeId, Upgrade> = {
  pitcrew: { id: "pitcrew", name: "ช่างพิทสายฟ้า", text: "จอดเปลี่ยนยางเร็วขึ้น 0.6 วิ", rarity: "common", tag: "pit", mods: { pitStop: -0.6 } },
  drs: { id: "drs", name: "ปีกหลังใหม่", text: "DRS แรงขึ้น 40%", rarity: "common", tag: "attack", mods: { drs: 1.4 } },
  tyre_eng: { id: "tyre_eng", name: "วิศวกรยาง", text: "ยางสึกช้าลง 12%", rarity: "common", tag: "tyre", mods: { wear: 0.88 } },
  engine_map: { id: "engine_map", name: "จูนเครื่อง", text: "เร็วขึ้น 0.12 วิ/รอบ", rarity: "common", tag: "pace", mods: { pace: -0.12 } },
  battery: { id: "battery", name: "แบตจุใหญ่", text: "ชาร์จแบตเร็วขึ้น 25%", rarity: "common", tag: "battery", mods: { ersCharge: 1.25 } },
  launch: { id: "launch", name: "โค้ชออกตัว", text: "ออกตัวดีขึ้นหนึ่งขั้น (ok → good)", rarity: "common", tag: "attack", mods: { launch: 1 } },
  suspension: { id: "suspension", name: "ช่วงล่างใหม่", text: "เร็วขึ้น 0.08 วิ/รอบ · ยางสึกช้าลง 5%", rarity: "common", tag: "pace", mods: { pace: -0.08, wear: 0.95 } },
  hybrid: { id: "hybrid", name: "ERS ไฮบริด", text: "ปุ่มแซงเลยใช้แบตน้อยลง 40%", rarity: "rare", tag: "battery", mods: { ersCost: 0.6 } },
  aggressive: { id: "aggressive", name: "นักขับดุดัน", text: "โอกาสแซงผ่าน +12% · ยางสึกเพิ่ม 5%", rarity: "rare", tag: "attack", mods: { attack: 0.12, wear: 1.05 } },
  wall: { id: "wall", name: "กำแพงเหล็ก", text: "คันอื่นแซงเราผ่านยากขึ้น 40%", rarity: "rare", tag: "attack", mods: { defend: 0.6 } },
  aero_pkg: { id: "aero_pkg", name: "แพ็กแอโร่", text: "เร็วขึ้น 0.22 วิ/รอบ", rarity: "rare", tag: "pace", mods: { pace: -0.22 } },
  strategist: { id: "strategist", name: "นักวางกลยุทธ์", text: "พลังทีมสูงสุด +1", rarity: "rare", maxEnergy: 1 },
  whisperer: { id: "whisperer", name: "มือถนอมยาง", text: "ยางสึกช้าลง 25% · ช้าลง 0.05 วิ/รอบ", rarity: "rare", tag: "tyre", mods: { wear: 0.75, pace: 0.05 } },
  proto_engine: { id: "proto_engine", name: "เครื่องยนต์ทดลอง", text: "เร็วขึ้น 0.35 วิ/รอบ · ยางสึกเพิ่ม 10%", rarity: "legend", tag: "pace", mods: { pace: -0.35, wear: 1.1 } },
  data_center: { id: "data_center", name: "ศูนย์ข้อมูล", text: "แซงผ่าน +8% · โดนแซงยากขึ้น 20% · ชาร์จแบต +15%", rarity: "legend", tag: "battery", mods: { attack: 0.08, defend: 0.8, ersCharge: 1.15 } },
  energy_core: { id: "energy_core", name: "แกนพลังทีม", text: "เริ่มเรซพลังทีม +1 · สูงสุด +1", rarity: "legend", energy: 1, maxEnergy: 1 },
  old_engine: { id: "old_engine", name: "เครื่องเก่า", text: "ช้าลง 0.25 วิ/รอบ", rarity: "curse", mods: { pace: 0.25 } },
  bad_tyres: { id: "bad_tyres", name: "ยางล็อตเสีย", text: "ยางสึกเร็วขึ้น 20%", rarity: "curse", mods: { wear: 1.2 } },
  rookie_crew: { id: "rookie_crew", name: "ช่างมือใหม่", text: "จอดเปลี่ยนยางช้าลง 1 วิ", rarity: "curse", mods: { pitStop: 1 } },
};

/** โบนัสสาย: มีการ์ดสายเดียวกันครบ 3 ใบ */
export const SET_BONUS: Record<Tag, { name: string; text: string; mods: CarMods }> = {
  tyre: { name: "สายยาง", text: "ยางสึกช้าลงอีก 10%", mods: { wear: 0.9 } },
  battery: { name: "สายแบต", text: "ปุ่มแซงใช้แบตน้อยลงอีก 20%", mods: { ersCost: 0.8 } },
  attack: { name: "สายแซง", text: "โอกาสแซงผ่าน +6%", mods: { attack: 0.06 } },
  pit: { name: "สายพิท", text: "จอดเร็วขึ้นอีก 0.4 วิ", mods: { pitStop: -0.4 } },
  pace: { name: "สายความเร็ว", text: "เร็วขึ้นอีก 0.1 วิ/รอบ", mods: { pace: -0.1 } },
};
export const SET_SIZE = 3;

/** การ์ดกลยุทธ์: ชื่อ · คำอธิบาย (ผลชั่วคราว) */
export const STRATEGY: Record<StrategyKind, { name: string; text: string; cost: number }> = {
  attack: { name: "แซงเลย+", text: "พุ่งแซงคันหน้า โอกาส +15% ไม่ใช้แบต (ต้องห่าง ≤ 0.8 วิ)", cost: STRATEGY_COST.attack },
  push: { name: "รอบดันสุด", text: "เร็วขึ้น 0.9 วิ/รอบ หนึ่งรอบ", cost: STRATEGY_COST.push },
  shield: { name: "ป้องกันเหล็ก", text: "หนึ่งรอบ คันหลังแซงผ่านยากมาก", cost: STRATEGY_COST.shield },
  ers: { name: "ชาร์จด่วน", text: "แบต +40% ทันที", cost: STRATEGY_COST.ers },
  save: { name: "ถนอมยางพิเศษ", text: "หนึ่งรอบ ยางไม่สึกเลย", cost: STRATEGY_COST.save },
  drs: { name: "DRS ทั้งรอบ", text: "หนึ่งรอบ ได้แรง DRS บนทางตรงทุกช่วง", cost: STRATEGY_COST.drs },
  pitcrew: { name: "พิทสต็อปเทพ", text: "จอดครั้งถัดไปเร็วขึ้น 1.2 วิ + ยางใหม่วอร์มแล้ว เร็วขึ้นสองรอบ", cost: STRATEGY_COST.pitcrew },
  undercut: { name: "Undercut", text: "เข้าพิทรอบนี้ (ยางแนะนำ) + พิทเทพ", cost: STRATEGY_COST.undercut },
};

/** ชุดเริ่มต้น */
export type StarterId = "tyre" | "battery" | "pit" | "attack";
export const STARTERS: Record<StarterId, { name: string; text: string; card: UpgradeId; extra: StrategyKind; unlock: number }> = {
  tyre: { name: "สายยาง", text: "ยางทน จอดน้อยครั้ง", card: "tyre_eng", extra: "save", unlock: 0 },
  battery: { name: "สายแบต", text: "แบตเยอะ แซงบ่อย", card: "battery", extra: "ers", unlock: 0 },
  pit: { name: "สายพิท", text: "พิทสต็อปไว ชิงจังหวะ undercut", card: "pitcrew", extra: "pitcrew", unlock: 0 },
  attack: { name: "สายดุดัน", text: "ออกตัวดี แซงเก่ง", card: "launch", extra: "attack", unlock: 60 },
};
/** กองการ์ดกลยุทธ์ตั้งต้น (บวกการ์ดของชุดเริ่มต้นอีก 1 ใบ) */
export const BASE_DECK: StrategyKind[] = ["attack", "push", "shield", "undercut"];

/** รวมตัวปรับหลายชุด: บวก (pace, pitStop, attack, launch) · คูณ (wear, defend, ersCost, ersCharge, drs) */
export function combineMods(list: (CarMods | undefined)[]): CarMods {
  const out: Required<CarMods> = { pace: 0, wear: 1, pitStop: 0, attack: 0, defend: 1, ersCost: 1, ersCharge: 1, drs: 1, launch: 0 };
  for (const m of list) {
    if (!m) continue;
    out.pace += m.pace ?? 0;
    out.pitStop += m.pitStop ?? 0;
    out.attack += m.attack ?? 0;
    out.launch += m.launch ?? 0;
    out.wear *= m.wear ?? 1;
    out.defend *= m.defend ?? 1;
    out.ersCost *= m.ersCost ?? 1;
    out.ersCharge *= m.ersCharge ?? 1;
    out.drs *= m.drs ?? 1;
  }
  return out;
}

/** สายที่ครบแล้ว */
export function activeSets(cards: UpgradeId[]): Tag[] {
  const n: Partial<Record<Tag, number>> = {};
  for (const c of cards) {
    const t = UPGRADES[c].tag;
    if (t) n[t] = (n[t] ?? 0) + 1;
  }
  return (Object.keys(n) as Tag[]).filter((t) => (n[t] ?? 0) >= SET_SIZE);
}
