"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getRaceReplay, type RaceReplay } from "@/lib/replay";
import ReplayPlayer from "./ReplayPlayer";

type State =
  | { s: "loading" }
  | { s: "ok"; data: RaceReplay }
  | { s: "err" };

/** โหลด openf1 ฝั่ง client (Vercel โดนบล็อก) แล้วส่งให้ ReplayPlayer */
export default function ReplayLoader({
  season,
  raceDate,
}: {
  season: number;
  raceDate: string | null;
}) {
  const [state, setState] = useState<State>(
    raceDate ? { s: "loading" } : { s: "err" },
  );

  useEffect(() => {
    if (!raceDate) return;
    let alive = true;
    const key = `replay:${season}:${raceDate}`;
    Promise.resolve()
      .then((): RaceReplay | null | Promise<RaceReplay | null> => {
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) return JSON.parse(cached) as RaceReplay;
        } catch {
          /* เมิน */
        }
        return getRaceReplay(season, raceDate);
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
  }, [season, raceDate]);

  if (state.s === "loading") {
    return (
      <div className="card flex items-center gap-3 p-6 text-sm text-white/55">
        <Loader2 className="h-4 w-4 animate-spin text-(--color-f1)" />
        กำลังโหลดข้อมูลรีเพลย์…
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
  return <ReplayPlayer replay={state.data} />;
}
