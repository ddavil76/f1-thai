"use client";

import { useEffect, useState } from "react";
import StartLights from "../StartLights";
import type { TrackPath } from "@/lib/circuits";
import { getRaceReplay, type RaceReplay } from "@/lib/replay";
import type { LapPick } from "@/lib/replay";
import ReplayPlayer, { type ReplayJump } from "./ReplayPlayer";

type State =
  | { s: "loading" }
  | { s: "ok"; data: RaceReplay }
  | { s: "err" };

/** โหลด openf1 ฝั่ง client (Vercel โดนบล็อก) แล้วส่งให้ ReplayPlayer */
export default function ReplayLoader({
  season,
  raceStart,
  track,
  circuitId,
  jump = null,
  active = true,
  onCompare,
}: {
  season: number;
  /** เวลาออกสตาร์ทตามปฏิทิน (ISO) — null = ไม่รู้เวลา */
  raceStart: string | null;
  track?: TrackPath | null;
  /** สนามไนต์เรซ → ฉาก 3D กลางคืน */
  circuitId?: string;
  jump?: ReplayJump | null;
  active?: boolean;
  onCompare?: (a: LapPick, b: LapPick) => void;
}) {
  const [state, setState] = useState<State>(
    raceStart ? { s: "loading" } : { s: "err" },
  );

  useEffect(() => {
    if (!raceStart) return;
    let alive = true;
    const key = `replay:v5:${season}:${raceStart}`; // bump เมื่อรูปข้อมูลเปลี่ยน
    Promise.resolve()
      .then((): RaceReplay | null | Promise<RaceReplay | null> => {
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) return JSON.parse(cached) as RaceReplay;
        } catch {
          /* เมิน */
        }
        return getRaceReplay(season, raceStart);
      })
      .then((data) => {
        if (!alive) return;
        if (data) {
          setState({ s: "ok", data });
          try {
            sessionStorage.setItem(key, JSON.stringify(data));
          } catch {
            /* quota */
          }
        } else {
          setState({ s: "err" });
        }
      })
      .catch(() => alive && setState({ s: "err" }));
    return () => {
      alive = false;
    };
  }, [season, raceStart]);

  if (state.s === "loading") {
    return (
      <div className="card p-6">
        <StartLights label="กำลังโหลดข้อมูลรีเพลย์…" sub="ดึงจาก openf1 ทีละส่วน · ครั้งแรกอาจ ~10 วิ" />
      </div>
    );
  }
  if (state.s === "err") {
    return (
      <p className="card p-6 text-sm text-white/60">
        ยังไม่มีข้อมูลรีเพลย์สำหรับสนามนี้ — รองรับตั้งแต่ปี 2023 และข้อมูลจาก
        openf1 อาจใช้เวลาหลังแข่งจบสักพัก
      </p>
    );
  }
  return (
    // กระโดดมาจากแท็บเทียบรอบ → เริ่ม player ใหม่ที่ต้นรอบนั้น (ข้อมูลที่โหลดแล้วใช้ต่อ)
    <ReplayPlayer
      key={jump?.nonce ?? 0}
      replay={state.data}
      track={track}
      circuitId={circuitId}
      jump={jump}
      active={active}
      onCompare={onCompare}
    />
  );
}
