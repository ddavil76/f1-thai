/* session ของสุดสัปดาห์ที่เทียบเทเลเมทรีได้ — ฝั่งเซิร์ฟเวอร์ (lib/telemetry.ts เป็นฝั่ง client) */

import { getSessions, type Race } from "./f1";
import type { TelemetrySessionCode } from "./telemetry";

export type TelemetrySession = {
  code: TelemetrySessionCode;
  label: string;
  /** เวลาเริ่มตามกำหนดการ (ISO) */
  start: string;
};

/** ป้ายจาก getSessions() → session ที่เทียบได้ (ซ้อมไม่รวม — รอบซ้อมเทียบกันไม่ค่อยได้ความ) */
const SESSION_OF: Record<string, [TelemetrySessionCode, string]> = {
  "Sprint Quali": ["SQ", "สปรินต์ควอลิฟาย"],
  Sprint: ["SPRINT", "สปรินต์"],
  Qualifying: ["Q", "ควอลิฟาย"],
  Race: ["RACE", "เรซ"],
};

/** session ที่เริ่มไปแล้ว เรียงตามเวลา — ว่าง = ยังไม่มีอะไรให้เทียบ */
export function telemetrySessions(race: Race, now = Date.now()): TelemetrySession[] {
  return getSessions(race)
    .filter((s) => SESSION_OF[s.label] && s.at.getTime() < now)
    .map((s) => ({ code: SESSION_OF[s.label][0], label: SESSION_OF[s.label][1], start: s.at.toISOString() }));
}
