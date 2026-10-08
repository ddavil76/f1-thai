"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/components/pitwall/sound";
import { teamOf } from "@/components/pitwall/ui";
import {
  COMBO_GAIN, COMBO_STEP, LEAD_BEATS, LEVEL, PENALTY, WINDOW, beatMsFor, buildChart, judge, judgeCount, noteDelta, type Grade, type Lane, type Note,
} from "@/lib/pitwall/rhythm";
import { buildTrack } from "@/lib/pitwall/track";
import type { AiLevel, Car, Compound } from "@/lib/pitwall/types";

const GRADE: Record<Grade, { t: string; c: string }> = {
  perfect: { t: "PERFECT", c: "#a855f7" },
  good: { t: "GOOD", c: "#22c55e" },
  early: { t: "EARLY", c: "#facc15" },
  late: { t: "LATE", c: "#facc15" },
  miss: { t: "MISS", c: "#ff3b2f" },
};

/** ผลการขับเอง → เวลาที่ได้/เสียในรอบเร่งจริง (วินาที) */
export const driveToDelta = (rhythmDelta: number) => Math.max(-0.8, Math.min(1.2, (rhythmDelta + 1.6) * 0.45));

/**
 * ขับเองในรอบเร่งควอลิฟาย: เหยียบคันเร่งค้างบนทางตรง เบรกค้างก่อนโค้ง แตะ DRS
 * แผงนี้ลอยทับด้านล่างของจอ แผนที่ด้านบนยังเห็นรถวิ่งอยู่
 */
export default function DriveLap({ car, circuit, level, compound, onDone }: { car: Car; circuit: string; level: AiLevel; compound: Compound; onDone: (delta: number) => void }) {
  const track = useMemo(() => buildTrack(circuit)!, [circuit]);
  const chart = useMemo(() => buildChart(track), [track]);
  const beatMs = beatMsFor(level, compound);
  const win = LEVEL[level].win;
  const judgments = judgeCount(chart);
  const endBeat = Math.max(LEAD_BEATS + track.lapCells, ...chart.map((n) => n.beat + n.hold)) + 1;

  const g = useRef({
    t0: 0,
    pressed: new Map<number, Grade>(),
    holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>,
    down: { brake: false, throttle: false, drs: false } as Record<Lane, boolean>,
    delta: 0,
    combo: 0,
    done: false,
  });
  const [view, setView] = useState({ now: -LEAD_BEATS, pressed: new Map<number, Grade>(), holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>, down: { brake: false, throttle: false, drs: false } as Record<Lane, boolean>, delta: 0, combo: 0 });
  const [fb, setFb] = useState<{ t: string; c: string; k: number } | null>(null);
  const feedback = (t: string, c: string) => setFb({ t, c, k: performance.now() });
  const beatNow = () => (performance.now() - g.current.t0) / beatMs;

  const score = (n: Note, grade: Grade, part: "press" | "release") => {
    const s = g.current;
    s.delta += noteDelta(n, grade, judgments, part);
    if (n.lane === "drs") return;
    if (grade === "perfect" || grade === "good") {
      s.combo++;
      if (s.combo % COMBO_STEP === 0) s.delta -= COMBO_GAIN;
    } else s.combo = 0;
  };
  const missNote = (n: Note) => {
    const s = g.current;
    s.pressed.set(n.id, "miss");
    if (n.lane === "drs") return;
    score(n, "miss", "press");
    score(n, "miss", "release");
    if (n.slow) {
      sfx.offTrack();
      feedback("OFF TRACK!", "#ff3b2f");
    } else {
      sfx.miss();
      feedback("MISS", GRADE.miss.c);
    }
  };
  const finishHold = (n: Note, grade: Grade, text?: string) => {
    const s = g.current;
    if (s.holding[n.lane] === n.id) s.holding[n.lane] = -1;
    score(n, grade, "release");
    feedback(text ?? GRADE[grade].t, GRADE[grade].c);
  };
  const press = (lane: Lane) => {
    const s = g.current;
    if (s.done || s.down[lane]) return;
    s.down[lane] = true;
    if (lane === "brake") sfx.brake();
    else if (lane === "throttle") sfx.throttle();
    else sfx.drs();
    const b = beatNow();
    const cand = chart
      .filter((n) => n.lane === lane && !s.pressed.has(n.id))
      .map((n) => ({ n, dt: (b - n.beat) * beatMs }))
      .sort((x, y) => Math.abs(x.dt) - Math.abs(y.dt))[0];
    const grade = cand ? judge(cand.dt, win) : null;
    if (!cand || !grade) {
      s.delta += PENALTY.wrong;
      s.combo = 0;
      feedback("WRONG", "#9ca3af");
      return;
    }
    s.pressed.set(cand.n.id, grade);
    score(cand.n, grade, "press");
    if (cand.n.hold > 0) s.holding[lane] = cand.n.id;
    feedback(cand.n.lane === "drs" ? (grade === "perfect" || grade === "good" ? "DRS OPEN!" : "DRS LATE") : GRADE[grade].t, cand.n.lane === "drs" ? "#38bdf8" : GRADE[grade].c);
  };
  const release = (lane: Lane) => {
    const s = g.current;
    s.down[lane] = false;
    const id = s.holding[lane];
    if (id < 0) return;
    const n = chart.find((x) => x.id === id)!;
    const grade = judge((beatNow() - (n.beat + n.hold)) * beatMs, win);
    finishHold(n, grade ?? "miss", grade ? undefined : n.lane === "brake" ? "เบรกสั้นไป!" : "ถอนเร็วไป!");
  };

  useEffect(() => {
    g.current.t0 = performance.now() + LEAD_BEATS * beatMs;
    let raf = 0;
    let lastCount = -LEAD_BEATS - 1;
    const tick = () => {
      const s = g.current;
      const b = beatNow();
      if (b < 0 && Math.floor(b) > lastCount) {
        lastCount = Math.floor(b);
        sfx.light();
      }
      const late = WINDOW.late * win;
      for (const n of chart) {
        if (!s.pressed.has(n.id) && (b - n.beat) * beatMs > late) missNote(n);
        else if (s.holding[n.lane] === n.id && (b - n.beat - n.hold) * beatMs > late) finishHold(n, "miss", n.lane === "brake" ? "เบรกนานไป!" : "เบรกไม่ทัน!");
      }
      setView({ now: b, pressed: new Map(s.pressed), holding: { ...s.holding }, down: { ...s.down }, delta: s.delta, combo: s.combo });
      if (b >= endBeat && !s.done) {
        s.done = true;
        onDone(driveToDelta(s.delta));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map: Record<string, Lane> = { ArrowLeft: "brake", KeyA: "brake", ArrowRight: "throttle", KeyD: "throttle", ArrowUp: "drs", KeyW: "drs", Space: "drs" };
    const kd = (e: KeyboardEvent) => {
      const l = map[e.code];
      if (!l) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) press(l);
    };
    const ku = (e: KeyboardEvent) => {
      const l = map[e.code];
      if (l) release(l);
    };
    window.addEventListener("keydown", kd, true);
    window.addEventListener("keyup", ku, true);
    return () => {
      window.removeEventListener("keydown", kd, true);
      window.removeEventListener("keyup", ku, true);
    };
  });

  const { now } = view;
  const H = 210;
  const HIT = 178;
  const PX = 52;
  const lanes: { k: Lane; x: number; w: number; color: string; label: string }[] = [
    { k: "brake", x: 0, w: 40, color: "#E10600", label: "เบรก" },
    { k: "drs", x: 40, w: 20, color: "#38bdf8", label: "DRS" },
    { k: "throttle", x: 60, w: 40, color: "#22c55e", label: "คันเร่ง" },
  ];
  const est = driveToDelta(view.delta);
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] space-y-2 border-t border-white/15 bg-[#121216]/97 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] select-none md:right-[440px]" role="application" aria-label="ขับเองในรอบเร่ง">
      <div className="flex items-center gap-2 px-1 text-xs">
        <span className="h-3 w-1 rounded-full" style={{ background: teamOf(car).color }} />
        <b className="text-white">ขับเอง #{car.num}</b>
        <span className="text-white/60">เหยียบค้างตามแถบ ปล่อยตอนแถบจบ</span>
        <span className={`poster ml-auto text-lg tabular-nums ${est <= 0 ? "text-[#22c55e]" : "text-(--color-f1-text)"}`}>
          {est <= 0 ? "−" : "+"}
          {Math.abs(est).toFixed(2)}
        </span>
        <span className="poster text-lg tabular-nums text-white">{view.combo}×</span>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-[#0d0d10]" style={{ height: H }}>
        {lanes.map((l) => (
          <div key={l.k} className="absolute inset-y-0 border-x border-white/5" style={{ left: `${l.x}%`, width: `${l.w}%`, background: view.down[l.k] ? `${l.color}22` : undefined }} />
        ))}
        {chart.map((n) => {
          const head = HIT - (n.beat - now) * PX;
          const tail = HIT - (n.beat + n.hold - now) * PX;
          if (head < -20 || tail > H + 20) return null;
          const j = view.pressed.get(n.id);
          const held = view.holding[n.lane] === n.id;
          if (j && !held && (n.hold === 0 || tail > H)) return null;
          const l = lanes.find((x) => x.k === n.lane)!;
          const top = Math.min(tail, head) - 9;
          const bottom = held ? HIT : head + 9;
          const missed = j === "miss";
          return (
            <div key={n.id} className="absolute" style={{ left: `calc(${l.x}% + 6px)`, width: `calc(${l.w}% - 12px)`, top, height: Math.max(18, bottom - top) }}>
              {n.hold > 0 && <div className="absolute inset-x-[22%] rounded-md" style={{ top: 9, bottom: held ? 0 : 9, background: l.color, opacity: missed ? 0.3 : held ? 0.95 : j ? 0.25 : 0.5 }} />}
              {n.hold > 0 && <div className="absolute inset-x-0 top-0 h-[6px] rounded-sm" style={{ background: missed ? "#444" : l.color }} />}
              {!held && !j && (
                <div className="absolute inset-x-0 bottom-0 flex h-[18px] items-center justify-center rounded-md text-[9px] font-black text-white" style={{ background: l.color, boxShadow: n.slow ? "0 0 0 2px #fff" : undefined }}>
                  {n.slow ? "×3" : ""}
                </div>
              )}
            </div>
          );
        })}
        <div className="absolute inset-x-0 h-[3px] bg-white/80" style={{ top: HIT }} />
        {now < 0 && <p className="poster absolute inset-x-0 top-1/4 text-center text-6xl text-white">{Math.ceil(-now)}</p>}
        {fb && (
          <p key={fb.k} className="bg-pop poster pointer-events-none absolute inset-x-0 top-[35%] text-center text-3xl" style={{ color: fb.c }}>
            {fb.t}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[2fr_1fr_2fr] gap-2">
        {lanes.map((l) => (
          <button
            key={l.k}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              press(l.k);
            }}
            onPointerUp={() => release(l.k)}
            onPointerCancel={() => release(l.k)}
            onContextMenu={(e) => e.preventDefault()}
            className="poster min-h-20 touch-none rounded-2xl border-2 text-lg text-white active:scale-95"
            style={{ borderColor: l.color, background: view.down[l.k] ? l.color : `${l.color}33` }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
