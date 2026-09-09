"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Zap } from "lucide-react";

type Phase = "idle" | "arming" | "go" | "result" | "foul";

const BEST_KEY = "rt-best";

/** ระดับตามเวลาตอบสนอง (ms) — อ้างอิงเวลาออกตัวจริงในสนาม F1 (~0.2 วิ) */
function grade(ms: number): { label: string; tone: string } {
  if (ms < 150) return { label: "ระดับแชมป์โลก 🏆", tone: "text-(--color-f1)" };
  if (ms < 200) return { label: "ระดับนักแข่ง F1", tone: "text-(--color-f1)" };
  if (ms < 250) return { label: "เร็วมาก", tone: "text-green-400" };
  if (ms < 320) return { label: "ดี", tone: "text-green-400" };
  if (ms < 400) return { label: "พอใช้", tone: "text-yellow-400" };
  return { label: "ช้าไปนิด ลองอีกที", tone: "text-white/60" };
}

export default function ReactionGame() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState(0); // จำนวนไฟที่ติด 0..5
  const [rt, setRt] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);

  const goAt = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(BEST_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v) setBest(Number(v));
    } catch {
      /* ไม่มี localStorage ก็ไม่เป็นไร */
    }
    return clearTimers;
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setPhase("arming");
    setLit(0);
    setRt(null);

    for (let i = 1; i <= 5; i++) {
      timers.current.push(window.setTimeout(() => setLit(i), i * 1000));
    }
    // ไฟครบ 5 ดวงแล้วหน่วงแบบสุ่ม 0.2–3 วิ ก่อนดับ
    const hold = 200 + Math.random() * 2800;
    timers.current.push(
      window.setTimeout(() => {
        setLit(0);
        setPhase("go");
        goAt.current = performance.now();
      }, 5000 + hold),
    );
  }, [clearTimers]);

  const tap = useCallback(() => {
    if (phase === "idle" || phase === "result" || phase === "foul") {
      start();
      return;
    }
    if (phase === "arming") {
      // แตะก่อนไฟดับ = ออกตัวเกิน
      clearTimers();
      setLit(0);
      setPhase("foul");
      return;
    }
    if (phase === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      setRt(ms);
      setPhase("result");
      setBest((b) => {
        const next = b == null ? ms : Math.min(b, ms);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch {
          /* เมิน */
        }
        return next;
      });
    }
  }, [phase, start, clearTimers]);

  // เล่นด้วยสเปซบาร์ได้ด้วย
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  const g = rt != null ? grade(rt) : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={tap}
        aria-label="พื้นที่เล่นเกมออกตัว"
        className={`card relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center transition-colors sm:aspect-[16/9] ${
          phase === "go"
            ? "bg-green-500/15"
            : phase === "foul"
              ? "bg-(--color-f1)/12"
              : ""
        }`}
    >
      {/* แผงไฟสตาร์ท 5 คอลัมน์ (คอลัมน์ละ 2 ดวง) */}
        <div className="flex gap-2 sm:gap-3">
          {[0, 1, 2, 3, 4].map((col) => {
            const on = col < lit;
            return (
              <div
                key={col}
                className="flex flex-col gap-1.5 rounded-lg bg-black/60 p-1.5 ring-1 ring-white/10"
              >
                {[0, 1].map((row) => (
                  <span
                    key={row}
                    className={`h-5 w-5 rounded-full transition-all duration-150 sm:h-7 sm:w-7 ${
                      on
                        ? "bg-red-500 shadow-[0_0_16px_4px_rgba(255,40,20,0.8)]"
                        : "bg-red-950/80 ring-1 ring-red-900/50"
                    }`}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* ข้อความสถานะ */}
        <div className="min-h-[3.5rem]">
          {phase === "idle" && (
            <p className="text-lg font-bold">
              แตะเพื่อเริ่ม
              <span className="mt-1 block text-sm font-normal text-white/50">
                รอไฟแดงดับทั้ง 5 ดวง แล้วแตะให้เร็วที่สุด
              </span>
            </p>
          )}
          {phase === "arming" && (
            <p className="display text-xl font-bold text-white/70">เตรียมตัว…</p>
          )}
          {phase === "go" && (
            <p className="display text-3xl font-black text-green-400">แตะเลย!</p>
          )}
          {phase === "foul" && (
            <p className="text-lg font-bold text-(--color-f1)">
              ออกตัวก่อนไฟดับ!
              <span className="mt-1 block text-sm font-normal text-white/50">
                แตะเพื่อลองใหม่
              </span>
            </p>
          )}
          {phase === "result" && g && rt != null && (
            <div>
              <p className="display text-4xl font-black tabular-nums sm:text-5xl">
                {(rt / 1000).toFixed(3)}
                <span className="ml-1 text-lg font-bold text-white/40">วิ</span>
              </p>
              <p className={`mt-1 text-sm font-semibold ${g.tone}`}>{g.label}</p>
              <p className="mt-0.5 text-xs text-white/40">แตะเพื่อเล่นอีกครั้ง</p>
            </div>
          )}
        </div>
      </button>

      <div className="flex items-center justify-between px-1 text-sm">
        <span className="flex items-center gap-1.5 text-white/50">
          <Zap className="h-3.5 w-3.5 text-(--color-f1)" fill="currentColor" />
          สถิติดีสุด:{" "}
          <span className="display font-bold text-white">
            {best != null ? `${(best / 1000).toFixed(3)} วิ` : "—"}
          </span>
        </span>
        {best != null && (
          <button
            type="button"
            onClick={() => {
              setBest(null);
              try {
                localStorage.removeItem(BEST_KEY);
              } catch {
                /* เมิน */
              }
            }}
            className="flex items-center gap-1 text-white/40 transition hover:text-white/70"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            ล้างสถิติ
          </button>
        )}
      </div>

      <p className="px-1 text-xs leading-relaxed text-white/40">
        เวลาตอบสนองเฉลี่ยของคนทั่วไปราว 0.25 วินาที · นักแข่ง F1 ออกตัวได้เร็วราว
        0.2 วินาที · ต่ำกว่า 0.1 วินาทีถือว่าเดาจังหวะไฟ
      </p>
    </div>
  );
}
