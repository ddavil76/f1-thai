"use client";

import { useEffect, useRef, useState } from "react";
import Car from "@/components/boardgame/Car";
import { look } from "@/components/boardgame/look";
import { LAUNCH, launchKind, type Driver, type LaunchKind } from "@/lib/boardgame/engine";

/** ไฟติดดวงละกี่ ms และไฟค้างครบ 5 ดวงก่อนดับนานแค่ไหน (สุ่ม) */
const LIGHT_MS = 600;
const HOLD_MIN = 400;
const HOLD_MAX = 2000;
/** โชว์ผลกี่ ms ก่อนไปคันถัดไป */
const RESULT_MS = 1400;

type Phase = "ready" | "lights" | "out" | "result";

/**
 * มินิเกมออกตัวของรถหนึ่งคัน: กด "พร้อม" → ไฟแดงติดทีละดวง → ไฟดับในจังหวะสุ่ม → แตะจอเร็วที่สุด
 * แตะก่อนไฟดับ = jump start · กด Space บนคีย์บอร์ดก็ได้
 */
export default function LaunchScreen({
  car, team, onDone,
}: {
  car: Driver;
  team: string;
  onDone: (kind: LaunchKind, ms: number | "jump" | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [lit, setLit] = useState(0);
  const [result, setResult] = useState<{ kind: LaunchKind; ms: number | "jump" } | null>(null);
  const timers = useRef<number[]>([]);
  const outAt = useRef(0);
  const phaseRef = useRef<Phase>("ready");

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const start = () => {
    go("lights");
    for (let i = 1; i <= 5; i++) later(() => setLit(i), LIGHT_MS * i);
    later(() => {
      setLit(0);
      outAt.current = performance.now();
      go("out");
    }, LIGHT_MS * 5 + HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN));
  };

  const tap = () => {
    const p = phaseRef.current;
    if (p !== "lights" && p !== "out") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const ms = p === "lights" ? ("jump" as const) : Math.round(performance.now() - outAt.current);
    const kind = launchKind(ms);
    setResult({ kind, ms });
    go("result");
    later(() => onDone(kind, ms), RESULT_MS);
  };

  // Space บนคีย์บอร์ด (ผูกใหม่ทุกครั้งที่วาด จะได้ใช้ tap ตัวล่าสุด)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && phaseRef.current !== "ready") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const c = look(car);
  const gain = result ? LAUNCH[result.kind].gain : 0;
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#08080A]/95 px-4 text-center"
      onPointerDown={phase === "lights" || phase === "out" ? tap : undefined}
      role="dialog"
      aria-label={`ออกตัว รถหมายเลข ${car.num}`}
    >
      <div className="space-y-1">
        <p className="poster text-sm text-(--color-f1-text)">LIGHTS OUT</p>
        <div className="flex items-center justify-center gap-2">
          <Car {...c} num={car.num} width={56} />
          <p className="text-left text-sm font-bold text-white">
            {car.name}
            <span className="block text-xs font-normal text-white/60">{team}</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2.5 rounded-2xl bg-[#121216] p-3" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-11 w-11 rounded-full transition-colors duration-75"
            style={{ background: i <= lit ? "#E10600" : "#2a0a0a", boxShadow: i <= lit ? "0 0 16px #E10600" : "none" }}
          />
        ))}
      </div>

      <div className="min-h-20" aria-live="assertive">
        {phase === "ready" && (
          <p className="max-w-xs text-sm text-white/75">
            กด “พร้อม” แล้วรอไฟแดงติดครบ 5 ดวง — <b className="text-white">ไฟดับเมื่อไรแตะจอทันที</b> ยิ่งเร็วยิ่งแซงได้ แตะก่อนไฟดับ = jump start
          </p>
        )}
        {phase === "lights" && <p className="poster text-xl text-white/70">รอ…</p>}
        {phase === "out" && <p className="poster text-4xl text-white">แตะเลย!</p>}
        {phase === "result" && result && (
          <div className="bg-pop space-y-1">
            <p className={`poster text-3xl ${gain > 0 ? "text-[#22c55e]" : gain < 0 ? "text-(--color-f1-text)" : "text-white"}`}>
              {LAUNCH[result.kind].title}
            </p>
            <p className="text-sm text-white/80 tabular-nums">
              {result.ms === "jump" ? "ออกก่อนไฟดับ" : `${(result.ms / 1000).toFixed(3)} วินาที`} ·{" "}
              {gain > 0 ? `แซงขึ้น ${gain} อันดับ` : gain < 0 ? `หล่น ${-gain} อันดับ` : "อยู่ที่เดิม"}
            </p>
          </div>
        )}
      </div>

      {phase === "ready" && (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button type="button" onClick={start} className="min-h-14 rounded-full bg-(--color-f1) text-lg font-bold text-white">
            พร้อม
          </button>
          <button type="button" onClick={() => onDone("ok", null)} className="min-h-10 rounded-full border border-white/20 text-sm text-white/75">
            ข้าม (ออกตัวปกติ)
          </button>
        </div>
      )}
    </div>
  );
}
