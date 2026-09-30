"use client";

import { useState, useSyncExternalStore } from "react";
import type { TrackPath } from "@/lib/circuits";
import type { LapPick } from "@/lib/replay";
import type { TelemetrySession } from "@/lib/telemetry-sessions";
import ReplayLoader from "./replay/ReplayLoader";
import type { ReplayJump } from "./replay/ReplayPlayer";
import TelemetryCompare, { type LapPreset } from "./telemetry/TelemetryCompare";

type Tab = "race" | "lap";

const noSubscribe = () => () => {};

/** แท็บตาม URL (?v=lap) — แชร์ลิงก์ตรงไปแท็บเทียบรอบได้ · ลิงก์เก่า /telemetry ก็ redirect มาที่นี่ */
function writeTab(tab: Tab) {
  const q = new URLSearchParams(window.location.search);
  if (tab === "lap") q.set("v", "lap");
  else q.delete("v");
  const s = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
}

/**
 * รีเพลย์ทั้งการแข่ง + เทียบเทเลเมทรีรายรอบ ในหน้าเดียว
 * · สลับแท็บไม่โหลดใหม่ (แท็บที่เคยเปิดคงอยู่ แค่ซ่อนและหยุดเล่น) · แท็บที่ยังไม่เคยเปิดยังไม่ดึงข้อมูล
 * · รีเพลย์ → "ดูเทเลเมทรีรอบนี้" (คนที่ตาม/ผู้นำ กับคันข้างหน้า) · เทียบรอบ → "ดูรอบนี้ในรีเพลย์"
 */
export default function RaceAnalysis({
  replay,
  telemetry,
}: {
  /** null = ยังไม่ได้แข่ง / ปีที่ไม่มีข้อมูล */
  replay: { season: number; raceStart: string | null; track: TrackPath | null; circuitId: string } | null;
  telemetry: {
    season: number;
    sessions: TelemetrySession[];
    circuitId: string;
    ground?: [number, number][];
  } | null;
}) {
  const fromUrl = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("v"),
    () => null,
  );
  // ตอน render ฝั่งเซิร์ฟเวอร์/hydrate ยังไม่รู้แท็บจาก URL → ยังไม่วางเนื้อหา
  // (ไม่งั้นแท็บที่ไม่ได้เลือกจะเริ่มดึงข้อมูลจาก openf1 ไปเปล่า ๆ ก่อนสลับ)
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const fallback: Tab = replay ? "race" : "lap";
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (fromUrl === "lap" && telemetry ? "lap" : fallback);
  // แท็บที่เคยเปิดแล้ว (คงไว้ ไม่ต้องโหลดซ้ำ)
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set());
  const [preset, setPreset] = useState<(LapPreset & { nonce: number }) | null>(null);
  const [jump, setJump] = useState<ReplayJump | null>(null);

  const go = (t: Tab) => {
    setPicked(t);
    setOpened((s) => new Set(s).add(tab).add(t));
    writeTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const isOpen = (t: Tab) => ready && (tab === t || opened.has(t));

  const raceSession = telemetry?.sessions.some((s) => s.code === "RACE") ?? false;
  const onCompare =
    telemetry && raceSession
      ? (a: LapPick, b: LapPick) => {
          setPreset({ code: "RACE", a, b, nonce: Date.now() });
          go("lap");
        }
      : undefined;
  const onShowInReplay = replay
    ? (num: number, lap: number) => {
        setJump({ num, lap, nonce: Date.now() });
        go("race");
      }
    : undefined;

  const tabs: [Tab, string, boolean][] = [
    ["race", "ทั้งการแข่ง", !!replay],
    ["lap", "เทียบรอบ", !!telemetry],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-white/5 p-1 text-sm" role="tablist" aria-label="มุมมอง">
        {tabs.map(([k, label, ok]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            disabled={!ok}
            onClick={() => go(k)}
            className={`flex-1 rounded-full px-4 py-2 font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
              tab === k ? "bg-(--color-f1) text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {replay && isOpen("race") && (
        <div hidden={tab !== "race"}>
          <ReplayLoader
            season={replay.season}
            raceStart={replay.raceStart}
            track={replay.track}
            circuitId={replay.circuitId}
            jump={jump}
            active={tab === "race"}
            onCompare={onCompare}
          />
        </div>
      )}
      {!replay && tab === "race" && <p className="card p-6 text-sm text-white/60">สนามนี้ยังไม่ได้แข่ง</p>}

      {telemetry && isOpen("lap") && (
        <div hidden={tab !== "lap"} className="space-y-4">
          <TelemetryCompare
            key={preset?.nonce ?? 0}
            season={telemetry.season}
            sessions={telemetry.sessions}
            circuitId={telemetry.circuitId}
            ground={telemetry.ground}
            preset={preset}
            active={tab === "lap"}
            onShowInReplay={onShowInReplay}
          />
          <p className="text-xs text-white/35">
            ข้อมูลรถ ~3–4 ครั้งต่อวินาที เบรกมีแค่เหยียบ/ไม่เหยียบ · ระยะทางคำนวณจากความเร็ว
            จึงอาจคลาดจากความยาวสนามจริงเล็กน้อย
          </p>
        </div>
      )}
      {!telemetry && tab === "lap" && (
        <p className="card p-6 text-sm text-white/60">ยังไม่มีควอลิฟายหรือเรซของสนามนี้ — กลับมาดูหลังแข่ง</p>
      )}
    </div>
  );
}
