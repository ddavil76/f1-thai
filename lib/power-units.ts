import { unstable_cache } from "next/cache";
import {
  fetchPuData, PU_KEYS, type PuData, type PuDriver, type PuKey, type PuUsed,
} from "./pu-parse";
import { PU_FALLBACK } from "./pu-fallback";

export { PU_KEYS };
export type { PuData, PuDriver, PuKey, PuUsed };

/**
 * โควตาต่อนักขับต่อฤดูกาล (FIA F1 Regulations B8.2.2)
 * ตัวเลขยืนยันจากรายงาน Technical Delegate — ยกเว้น PU-CE ที่อิงบทความ formula1.com
 */
export const PU_INFO: Record<PuKey, { th: string; en: string; limit: number }> = {
  ICE: { th: "เครื่องยนต์", en: "Internal Combustion Engine", limit: 4 },
  TC: { th: "เทอร์โบ", en: "Turbocharger", limit: 4 },
  EXH: { th: "ท่อไอเสีย", en: "Exhaust set", limit: 4 },
  "MGU-K": { th: "มอเตอร์ไฟฟ้า", en: "Motor Generator Unit – Kinetic", limit: 3 },
  ES: { th: "แบตเตอรี่", en: "Energy Store", limit: 3 },
  "PU-CE": { th: "กล่องควบคุม", en: "Control Electronics", limit: 3 },
  "PU-ANC": { th: "อุปกรณ์เสริม", en: "Power Unit Ancillary", limit: 6 },
};

export type PuUsage = PuData & { live: boolean };

// อ่าน PDF หลายไฟล์ค่อนข้างหนัก → แคชผลลัพธ์ที่แยกแล้ว ไม่ต้องอ่านใหม่ทุกครั้งที่หน้า regenerate
const cachedFetch = unstable_cache(fetchPuData, ["pu-data-v1"], {
  revalidate: 6 * 60 * 60,
});

/** ยอดใช้ชิ้นส่วน — ดึงจาก FIA ไม่ได้ก็ใช้สแนปช็อต, ไม่ throw */
export async function getPuUsage(season: number): Promise<PuUsage | null> {
  try {
    const d = await cachedFetch(season);
    if (d) return { ...d, live: true };
  } catch (err) {
    console.error("[pu] FIA fetch failed, using snapshot:", err);
  }
  const snap = PU_FALLBACK[String(season)];
  return snap ? { ...snap, live: false } : null;
}

/** ใช้เกินโควตารวมกี่ชิ้น */
export const overBy = (used: PuUsed) =>
  PU_KEYS.reduce((n, k) => n + Math.max(0, used[k] - PU_INFO[k].limit), 0);

/** ตัวย่อที่ใช้แสดง (ตัด "PU-" ออก) */
export const puLabel = (k: PuKey) => k.replace("PU-", "");

export type PuStatus = "penalized" | "edge" | "safe";
export const PU_STATUS_ORDER: PuStatus[] = ["penalized", "edge", "safe"];

/** โดนโทษแล้ว = เคยใช้เกินโควตา · ใกล้โดน = มีชิ้นที่ครบโควตาพอดี · ปลอดภัย = ทุกชิ้นยังเหลือ */
export function puStatus(used: PuUsed): PuStatus {
  if (PU_KEYS.some((k) => used[k] > PU_INFO[k].limit)) return "penalized";
  if (PU_KEYS.some((k) => used[k] === PU_INFO[k].limit)) return "edge";
  return "safe";
}

/**
 * ถ้าเปลี่ยนอีก 1 ชิ้นจะโดนเท่าไหร่ — เกินโควตาครั้งแรกของชิ้นนั้นถอย 10, ครั้งต่อ ๆ ไป 5
 * (ตรงกับคำตัดสิน FIA 2026: Stroll −40, Lawson −35, Antonelli −30, Albon −20)
 */
export function nextChange(used: PuUsed): { penalty: 10 | 5; keys: PuKey[] }[] {
  const atQuota = PU_KEYS.filter((k) => used[k] === PU_INFO[k].limit);
  const over = PU_KEYS.filter((k) => used[k] > PU_INFO[k].limit);
  return [
    ...(atQuota.length ? [{ penalty: 10 as const, keys: atQuota }] : []),
    ...(over.length ? [{ penalty: 5 as const, keys: over }] : []),
  ];
}

/** ชิ้นที่เหลือเผื่อน้อยที่สุด */
export const minSpare = (used: PuUsed) =>
  Math.min(...PU_KEYS.map((k) => PU_INFO[k].limit - used[k]));

// ชื่อทีมใน FIA พ่วงชื่อผู้ผลิตเครื่อง ("Haas Ferrari") → เช็คชื่อทีมก่อนชื่อเครื่อง
const TEAM_IDS: [RegExp, string][] = [
  [/racing bulls|visa cash app|vcarb/i, "rb"],
  [/red bull/i, "red_bull"],
  [/mclaren/i, "mclaren"],
  [/aston martin/i, "aston_martin"],
  [/williams/i, "williams"],
  [/alpine/i, "alpine"],
  [/haas/i, "haas"],
  [/audi|sauber/i, "audi"],
  [/cadillac/i, "cadillac"],
  [/ferrari/i, "ferrari"],
  [/mercedes/i, "mercedes"],
];

export const teamIdOf = (fiaTeam: string) =>
  TEAM_IDS.find(([re]) => re.test(fiaTeam))?.[1] ?? "";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** จับคู่นักขับจาก Jolpica กับแถวในเอกสาร FIA (ชื่อ → นามสกุล → เลขรถ) */
export function findUsage(
  data: PuData,
  d: { givenName: string; familyName: string; permanentNumber?: string },
): PuDriver | undefined {
  const full = norm(d.givenName + d.familyName);
  const family = norm(d.familyName);
  return (
    data.drivers.find((r) => norm(r.driver) === full) ??
    data.drivers.find((r) => norm(r.driver).endsWith(family)) ??
    (d.permanentNumber
      ? data.drivers.find((r) => Number(r.number) === Number(d.permanentNumber))
      : undefined)
  );
}

export function decisionTh(decision: string): string {
  const drop = decision.match(/drop of (\d+) grid (?:positions|places)/i);
  if (drop) return `ถอยกริด ${drop[1]} อันดับ`;
  if (/pit ?lane/i.test(decision)) return "ออกสตาร์ทจากพิทเลน";
  if (/back of the grid/i.test(decision)) return "ออกสตาร์ทท้ายกริด";
  if (/reprimand/i.test(decision)) return "ตักเตือน";
  if (/no further action/i.test(decision)) return "ไม่มีโทษเพิ่ม";
  return decision;
}

export const sessionTh = (s: string) =>
  s
    .replace(/Free Practice (\d)/i, "FP$1")
    .replace(/Sprint Qualifying/i, "สปรินต์ควอลิฟาย")
    .replace(/^Qualifying$/i, "ควอลิฟาย")
    .replace(/^Sprint$/i, "สปรินต์")
    .replace(/^Race$/i, "เรซ");
