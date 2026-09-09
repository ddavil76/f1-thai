"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { TrackPath } from "@/lib/circuits";
import type { Cell, RaceReplay, ReplayRow } from "@/lib/replay";
import TrackMap from "./TrackMap";

const ROW_H = 34; // px ต่อแถว
const SPEEDS = [1, 2, 4, 8] as const;

const fmtLap = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(3);
  return m > 0 ? `${m}:${sec.padStart(6, "0")}` : sec;
};

const tierClass = (tier: 0 | 1 | 2) =>
  tier === 2 ? "text-fuchsia-400" : tier === 1 ? "text-green-400" : "text-white/70";

const TYRE_COLOR: Record<string, string> = {
  S: "#e0203a",
  M: "#e6c74d",
  H: "#e8e8e8",
  I: "#43b02a",
  W: "#3a8dde",
};

function Time({ cell }: { cell: Cell }) {
  return (
    <span className={`tabular-nums ${tierClass(cell.tier)}`}>
      {cell.t == null ? "—" : fmtLap(cell.t)}
    </span>
  );
}

export default function ReplayPlayer({
  replay,
  track,
}: {
  replay: RaceReplay;
  track?: TrackPath | null;
}) {
  const { totalLaps, frames } = replay;
  const meta = Object.fromEntries(replay.drivers.map((d) => [d.num, d]));

  const [lap, setLap] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const timer = useRef<number | null>(null);
  const stepMs = 1400 / speed;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setLap((l) => {
        if (l >= totalLaps) {
          setPlaying(false);
          return l;
        }
        return l + 1;
      });
    }, stepMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, stepMs, totalLaps]);

  const frame = frames[Math.min(lap, totalLaps) - 1];

  return (
    <div className="space-y-3">
      {track && (
        <TrackMap
          track={track}
          rows={frame.rows}
          drivers={meta}
          playing={playing}
          stepMs={stepMs}
        />
      )}
      {/* แถบควบคุม */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setLap(1);
          }}
          className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="ไปรอบแรก"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-full bg-(--color-f1) p-2 text-white transition active:scale-95"
          aria-label={playing ? "หยุด" : "เล่น"}
        >
          {playing ? (
            <Pause className="h-4 w-4" fill="currentColor" />
          ) : (
            <Play className="h-4 w-4" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setLap(totalLaps);
          }}
          className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="ไปรอบสุดท้าย"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <span className="display shrink-0 text-sm font-bold tabular-nums">
          LAP {lap}
          <span className="text-white/40"> / {totalLaps}</span>
        </span>

        <input
          type="range"
          min={1}
          max={totalLaps}
          value={lap}
          onChange={(e) => {
            setPlaying(false);
            setLap(Number(e.target.value));
          }}
          className="h-1 min-w-[8rem] flex-1 accent-(--color-f1)"
          aria-label="เลื่อนรอบ"
        />

        <div className="flex shrink-0 gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition ${
                speed === s
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        {frame.flag && (
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
              frame.flag === "SC" || frame.flag === "VSC"
                ? "bg-yellow-400/20 text-yellow-300"
                : frame.flag === "RED"
                  ? "bg-red-500/25 text-red-300"
                  : "bg-white/10 text-white/70"
            }`}
          >
            {frame.flag}
          </span>
        )}
      </div>

      {/* ตารางไทม์มิ่ง */}
      <div className="card overflow-x-auto p-2 sm:p-3">
        <div className="min-w-[560px]">
          {/* หัวตาราง */}
          <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
            <span className="w-6 text-center">P</span>
            <span className="w-16">นักแข่ง</span>
            <span className="w-20 text-right">Gap</span>
            <span className="w-10 text-center">ยาง</span>
            <span className="w-20 text-right">รอบล่าสุด</span>
            <span className="hidden w-14 text-right lg:inline">Best</span>
            <span className="hidden flex-1 justify-end gap-3 lg:flex">
              <span className="w-12 text-right">S1</span>
              <span className="w-12 text-right">S2</span>
              <span className="w-12 text-right">S3</span>
            </span>
          </div>

          {/* แถว */}
          <div
            className="relative"
            style={{ height: frame.rows.length * ROW_H }}
          >
            {frame.rows.map((r: ReplayRow) => {
              const d = meta[r.num];
              return (
                <div
                  key={r.num}
                  className="absolute inset-x-0 flex items-center gap-2 rounded-md px-2 text-sm transition-[transform,opacity] ease-[cubic-bezier(.3,.9,.3,1)]"
                  style={{
                    height: ROW_H,
                    transform: `translateY(${(r.pos - 1) * ROW_H}px)`,
                    opacity: r.out ? 0.4 : 1,
                    background: "var(--color-surface)",
                    transitionDuration: `${playing ? Math.min(420, stepMs * 0.55) : 300}ms`,
                  }}
                >
                  <span className="w-6 text-center font-bold tabular-nums text-white/50">
                    {r.pos}
                  </span>
                  <span className="flex w-16 items-center gap-1.5">
                    <span
                      className="h-3.5 w-1 shrink-0 rounded-full"
                      style={{ background: d?.colour }}
                    />
                    <span className="font-bold">{d?.code}</span>
                  </span>
                  <span className="w-20 text-right leading-tight">
                    <span className="block tabular-nums">
                      {r.gapAhead}
                    </span>
                    <span className="block text-[10px] tabular-nums text-white/35">
                      {r.gapLeader}
                    </span>
                  </span>
                  <span className="flex w-10 justify-center">
                    {r.compound ? (
                      <span className="flex items-center gap-0.5">
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-black"
                          style={{
                            background: TYRE_COLOR[r.compound] ?? "#aaa",
                          }}
                        >
                          {r.compound}
                        </span>
                        <span className="text-[10px] tabular-nums text-white/40">
                          {r.tyreAge}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="w-20 text-right text-xs">
                    {r.inPit ? (
                      <span className="font-bold text-cyan-300">PIT</span>
                    ) : (
                      <Time cell={r.lastLap} />
                    )}
                  </span>
                  <span className="hidden w-14 text-right text-xs tabular-nums text-white/50 lg:inline">
                    {fmtLap(r.bestLap)}
                  </span>
                  <span className="hidden flex-1 justify-end gap-3 text-xs lg:flex">
                    {r.s.map((c, i) => (
                      <span key={i} className="w-12 text-right">
                        <Time cell={c} />
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="px-1 text-xs text-white/35">
        <span className="text-fuchsia-400">■</span> เร็วสุดในสนาม ·{" "}
        <span className="text-green-400">■</span> เร็วสุดของตัวเอง · ระยะห่าง
        ประมาณจากเวลาข้ามเส้นต่อรอบ
      </p>
    </div>
  );
}
