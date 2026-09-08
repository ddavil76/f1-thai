"use client";

import { formatInTz, type TimeKind } from "@/lib/f1";
import { circuitTz } from "@/lib/tz";
import { useTz } from "./TzProvider";

/**
 * แสดงวันเวลาในโซนตามที่ผู้ใช้เลือก (ไทย / เวลาสนาม)
 * SSR + first paint = เวลาไทยเสมอ → ไม่มี hydration mismatch
 */
export default function LocalTime({
  iso,
  kind,
  circuitId,
}: {
  iso: string;
  kind: TimeKind;
  circuitId?: string;
}) {
  const { pref } = useTz();
  const tz = pref === "circuit" ? circuitTz(circuitId) : undefined;
  return <>{formatInTz(new Date(iso), kind, tz)}</>;
}
