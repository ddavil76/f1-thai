"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { TrackPath } from "@/lib/circuits";
import type { Cell, RaceReplay, ReplayDriver, ReplayFrame } from "@/lib/replay";
import TrackMap from "./TrackMap";
import TyreStrategy from "./TyreStrategy";

const ROW_H = 34;
const SPEEDS = [15, 40, 90, 200] as const; // ตัวคูณเวลาแข่ง

const fmtLap = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(3);
  return m > 0 ? `${m}:${sec.padStart(6, "0")}` : sec;
};
const fmtClock = (msVal: number) => {
  const t = Math.max(0, Math.floor(msVal / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** เฟรม (รอบ) ที่เวลา t อยู่ — binary search */
function frameIdxAt(frames: ReplayFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].atMs <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const tierClass = (tier: 0 | 1 | 2) =>
  tier === 2 ? "text-fuchsia-400" : tier === 1 ? "text-green-400" : "text-white/70";

const TYRE_COLOR: Record<string, string> = {
  S: "#e0203a",
  M: "#e6c74d",
  H: "#e8e8e8",
  I: "#43b02a",
  W: "#3a8dde",
};

function T({ cell }: { cell: Cell }) {
  return (
    <span className={`tabular-nums ${tierClass(cell.tier)}`}>
      {cell.t == null ? "—" : fmtLap(cell.t)}
    </span>
  );
}

/** ตารางไทม์มิ่ง — re-render เฉพาะตอนเฟรม (รอบ) เปลี่ยน */
const TimingTower = memo(function TimingTower({
  frame,
  drivers,
}: {
  frame: ReplayFrame;
  drivers: Record<number, ReplayDriver>;
}) {
  return (
    <div className="card overflow-x-auto p-2 sm:p-3">
      <div className="min-w-[560px]">
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

        <div className="relative" style={{ height: frame.rows.length * ROW_H }}>
          {frame.rows.map((r) => {
            const d = drivers[r.num];
            return (
              <div
                key={r.num}
                className="absolute inset-x-0 flex items-center gap-2 rounded-md px-2 text-sm transition-[transform,opacity] duration-500 ease-[cubic-bezier(.3,.9,.3,1)]"
                style={{
                  height: ROW_H,
                  transform: `translateY(${(r.pos - 1) * ROW_H}px)`,
                  opacity: r.out ? 0.4 : 1,
                  background: "var(--color-surface)",
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
                  <span className="block tabular-nums">{r.gapAhead}</span>
                  <span className="block text-[10px] tabular-nums text-white/35">
                    {r.gapLeader}
                  </span>
                </span>
                <span className="flex w-10 justify-center">
                  {r.compound ? (
                    <span className="flex items-center gap-0.5">
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-black"
                        style={{ background: TYRE_COLOR[r.compound] ?? "#aaa" }}
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
                    <T cell={r.lastLap} />
                  )}
                </span>
                <span className="hidden w-14 text-right text-xs tabular-nums text-white/50 lg:inline">
                  {fmtLap(r.bestLap)}
                </span>
                <span className="hidden flex-1 justify-end gap-3 text-xs lg:flex">
                  {r.s.map((c, i) => (
                    <span key={i} className="w-12 text-right">
                      <T cell={c} />
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default function ReplayPlayer({
  replay,
  track,
}: {
  replay: RaceReplay;
  track?: TrackPath | null;
}) {
  const { totalLaps, durationMs, frames } = replay;
  const meta = Object.fromEntries(replay.drivers.map((d) => [d.num, d]));

  const timeRef = useRef(0); // เวลาแข่งที่ผ่านไป (ms)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(40);
  const [frameIdx, setFrameIdx] = useState(0);

  const scrubRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (playing) {
        timeRef.current += dt * speed;
        if (timeRef.current >= durationMs) {
          timeRef.current = durationMs;
          setPlaying(false);
        }
      }
      const t = timeRef.current;
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(t);
      }
      const fi = frameIdxAt(frames, t);
      if (clockRef.current) {
        clockRef.current.textContent = `รอบ ${frames[fi].lap} · ${fmtClock(t)}`;
      }
      setFrameIdx((cur) => (cur === fi ? cur : fi));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs, frames]);

  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(durationMs, t));
    if (scrubRef.current) scrubRef.current.value = String(timeRef.current);
  };
  const stepLap = (dir: 1 | -1) => {
    setPlaying(false);
    const cur = frameIdxAt(frames, timeRef.current);
    const next = Math.max(0, Math.min(frames.length - 1, cur + dir));
    seek(frames[next].atMs + 1);
  };

  const frame = frames[frameIdx];

  return (
    <div className="space-y-3">
      {track && (
        <TrackMap
          track={track}
          frames={frames}
          drivers={meta}
          timeRef={timeRef}
        />
      )}

      {/* แถบควบคุม */}
      <div className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => stepLap(-1)}
          className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="รอบก่อนหน้า"
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
          onClick={() => stepLap(1)}
          className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="รอบถัดไป"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <span className="flex shrink-0 items-center gap-2">
          <span
            ref={clockRef}
            className="display text-sm font-bold tabular-nums"
          >
            รอบ 1 · 00:00
          </span>
          {frame.flag && (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                frame.flag === "RED"
                  ? "bg-red-500/25 text-red-300"
                  : frame.flag === "🏁"
                    ? "bg-white/10 text-white/70"
                    : "bg-yellow-400/20 text-yellow-300"
              }`}
              title={
                frame.flag === "SC"
                  ? "เซฟตี้คาร์"
                  : frame.flag === "VSC"
                    ? "เวอร์ชวลเซฟตี้คาร์"
                    : frame.flag === "RED"
                      ? "ธงแดง — ระงับการแข่ง"
                      : "ธงหมากรุก — จบการแข่ง"
              }
            >
              {frame.flag === "RED" ? "ธงแดง" : frame.flag}
            </span>
          )}
        </span>

        <input
          ref={scrubRef}
          type="range"
          min={0}
          max={durationMs}
          defaultValue={0}
          step={500}
          onChange={(e) => {
            setPlaying(false);
            timeRef.current = Number(e.target.value);
          }}
          onPointerDown={() => setPlaying(false)}
          className="h-1 min-w-[8rem] flex-1 accent-(--color-f1)"
          aria-label="เลื่อนเวลา"
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

        <span className="shrink-0 text-xs tabular-nums text-white/35">
          จาก {totalLaps} รอบ
        </span>
      </div>

      <TimingTower frame={frame} drivers={meta} />

      <TyreStrategy
        stints={replay.stints}
        totalLaps={totalLaps}
        finalOrder={frames[frames.length - 1].rows}
        drivers={meta}
      />

      <p className="px-1 text-xs text-white/35">
        <span className="text-fuchsia-400">■</span> เร็วสุดในสนาม ·{" "}
        <span className="text-green-400">■</span> เร็วสุดของตัวเอง · เล่นตามเวลาแข่งจริง
        (ตัวคูณ) · ระยะห่าง/ตำแหน่งเป็นค่าประมาณจากเวลาต่อรอบ
      </p>
    </div>
  );
}
