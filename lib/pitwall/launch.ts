import type { LaunchKind } from "./types";

/** ผลออกตัวจากเวลาตอบสนองตอนไฟดับ */
export const LAUNCH: Record<LaunchKind, { title: string; good: number }> = {
  great: { title: "ออกตัวสุดยอด", good: 2 },
  good: { title: "ออกตัวดี", good: 1 },
  ok: { title: "ออกตัวปกติ", good: 0 },
  slow: { title: "ล้อฟรี", good: -1 },
  jump: { title: "Jump start", good: -2 },
};

/** เวลา (ms) ตั้งแต่ไฟดับถึงแตะจอ — "jump" = แตะก่อนไฟดับ */
export function launchKind(ms: number | "jump"): LaunchKind {
  if (ms === "jump") return "jump";
  if (ms < 200) return "great";
  if (ms < 300) return "good";
  if (ms <= 450) return "ok";
  return "slow";
}
