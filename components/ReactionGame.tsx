"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Zap } from "lucide-react";

type Phase = "idle" | "arming" | "go" | "result" | "foul" | "quick";

const HISTORY_KEY = "rt-history";
const LIGHT_MS = 850; // เว้นช่วงไฟแต่ละดวง
const MIN_HUMAN_MS = 100; // ต่ำกว่านี้ = เดาจังหวะไฟ ไม่นับ
const KEEP = 20; // เก็บประวัติกี่ครั้ง

const BENCH = [
  { ms: 200, label: "นักแข่ง F1" },
  { ms: 250, label: "คนทั่วไป" },
  { ms: 350, label: "มือใหม่" },
];

/** ระดับตามเวลาตอบสนอง (ms) — อ้างอิงเวลาออกตัวจริงในสนาม F1 (~0.2 วิ) */
function grade(ms: number): { label: string; tone: string } {
  if (ms < 170) return { label: "ระดับแชมป์โลก 🏆", tone: "text-(--color-f1)" };
  if (ms < 210) return { label: "ระดับนักแข่ง F1", tone: "text-(--color-f1)" };
  if (ms < 260) return { label: "เร็วมาก", tone: "text-green-400" };
  if (ms < 330) return { label: "ดี", tone: "text-green-400" };
  if (ms < 420) return { label: "พอใช้", tone: "text-yellow-400" };
  return { label: "ช้าไปนิด ลองอีกที", tone: "text-white/60" };
}

const secs = (ms: number) => `${(ms / 1000).toFixed(3)}`;

/** เทียบเวลาของเรากับเกณฑ์อ้างอิง — แถบแนวนอน อ่านง่าย */
function CompareBars({ ms }: { ms: number }) {
  // สเกลให้เกณฑ์ที่ช้าสุด (มือใหม่ 0.35) เห็นเกือบเต็มเสมอ
  const axisMax = Math.min(Math.max(ms * 1.1, 380), 800);
  const w = (v: number) =>
    `${Math.max(5, Math.min(100, (v / axisMax) * 100))}%`;

  const rows = [
    { label: "คุณ", ms, you: true },
    ...BENCH.map((b) => ({ ...b, you: false })),
  ];

  return (
    <section className="card p-4">
      <p className="mb-3 text-xs font-medium text-white/50">เทียบเวลาตอบสนอง</p>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[4.5rem_1fr_3.25rem] items-center gap-2.5"
          >
            <span
              className={`text-xs ${
                r.you ? "font-bold text-white" : "text-white/50"
              }`}
            >
              {r.label}
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-white/10">
              <span
                className={`block h-full rounded-full ${
                  r.you ? "bg-(--color-f1)" : "bg-white/25"
                }`}
                style={{ width: w(r.ms) }}
              />
            </span>
            <span
              className={`display text-right text-xs tabular-nums ${
                r.you ? "font-bold text-white" : "text-white/45"
              }`}
            >
              {secs(r.ms)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** แท่งประวัติ 10 ครั้งหลัง (เตี้ย = เร็ว) */
function History({ times }: { times: number[] }) {
  if (times.length < 2) return null;
  const recent = times.slice(0, 10).reverse();
  const max = Math.max(...recent, 400);
  return (
    <div className="flex h-9 items-end gap-1 px-1">
      {recent.map((t, i) => {
        const tone =
          t < 260 ? "bg-green-500/70" : t < 360 ? "bg-yellow-500/70" : "bg-red-500/55";
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${tone}`}
            style={{ height: `${25 + (t / max) * 75}%` }}
            title={`${secs(t)} วิ`}
          />
        );
      })}
    </div>
  );
}

export default function ReactionGame() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState(0); // จำนวนไฟที่ติด 0..5
  const [rt, setRt] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]); // ใหม่สุดก่อน, เฉพาะครั้งที่นับ

  const goAt = useRef(0);
  const timers = useRef<number[]>([]);

  const best = history.length ? Math.min(...history) : null;
  const avg5 =
    history.length >= 3
      ? Math.round(
          history.slice(0, 5).reduce((a, b) => a + b, 0) /
            Math.min(5, history.length),
        )
      : null;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? (JSON.parse(raw) as number[]) : [];
      if (Array.isArray(arr) && arr.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory(arr.filter((n) => typeof n === "number").slice(0, KEEP));
      }
    } catch {
      /* ไม่มี localStorage ก็ไม่เป็นไร */
    }
    return clearTimers;
  }, [clearTimers]);

  const record = useCallback((ms: number) => {
    setHistory((h) => {
      const next = [ms, ...h].slice(0, KEEP);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* เมิน */
      }
      return next;
    });
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setPhase("arming");
    setLit(0);
    setRt(null);

    for (let i = 1; i <= 5; i++) {
      timers.current.push(window.setTimeout(() => setLit(i), i * LIGHT_MS));
    }
    // ไฟครบ 5 ดวงแล้วหน่วงแบบสุ่ม 0.2–3 วิ ก่อนดับ
    const hold = 200 + Math.random() * 2800;
    timers.current.push(
      window.setTimeout(() => {
        setLit(0);
        setPhase("go");
        goAt.current = performance.now();
      }, 5 * LIGHT_MS + hold),
    );
  }, [clearTimers]);

  const tap = useCallback(() => {
    if (phase === "idle" || phase === "result" || phase === "foul" || phase === "quick") {
      start();
      return;
    }
    if (phase === "arming") {
      clearTimers();
      setLit(0);
      setPhase("foul");
      return;
    }
    if (phase === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      setRt(ms);
      if (ms < MIN_HUMAN_MS) {
        setPhase("quick"); // เร็วเกินมนุษย์ = เดาไฟ ไม่บันทึก
        return;
      }
      setPhase("result");
      record(ms);
    }
  }, [phase, start, clearTimers, record]);

  // เล่นด้วยสเปซบาร์ / Enter ได้ด้วย
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  const clearStats = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* เมิน */
    }
  };

  const g = rt != null ? grade(rt) : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={tap}
        aria-label="พื้นที่เล่นเกมออกตัว"
        className={`card relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center transition-colors sm:aspect-[16/9] ${
          phase === "go"
            ? "go-flash bg-green-500/15"
            : phase === "foul" || phase === "quick"
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
        <div className="flex min-h-[5rem] flex-col items-center justify-center">
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
          {phase === "quick" && (
            <p className="text-lg font-bold text-(--color-f1)">
              เร็วเกินไป — เดาจังหวะไฟ
              <span className="mt-1 block text-sm font-normal text-white/50">
                รอให้ไฟดับก่อนแล้วค่อยแตะ · แตะเพื่อลองใหม่
              </span>
            </p>
          )}
          {phase === "result" && g && rt != null && (
            <div className="flex flex-col items-center">
              <p className="display text-4xl font-black tabular-nums sm:text-5xl">
                {secs(rt)}
                <span className="ml-1 text-lg font-bold text-white/40">วิ</span>
              </p>
              <p className={`mt-1 text-sm font-semibold ${g.tone}`}>{g.label}</p>
              <p className="mt-2 text-xs text-white/40">แตะเพื่อเล่นอีกครั้ง</p>
            </div>
          )}
        </div>
      </button>

      {phase === "result" && rt != null && <CompareBars ms={rt} />}

      {/* สถิติ */}
      <div className="flex items-center justify-between px-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-white/50">
            <Zap className="h-3.5 w-3.5 text-(--color-f1)" fill="currentColor" />
            ดีสุด{" "}
            <span className="display font-bold text-white">
              {best != null ? `${secs(best)} วิ` : "—"}
            </span>
          </span>
          {avg5 != null && (
            <span className="text-white/40">
              เฉลี่ย 5 ครั้ง{" "}
              <span className="display font-semibold text-white/70">
                {secs(avg5)} วิ
              </span>
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={clearStats}
            className="flex shrink-0 items-center gap-1 text-white/40 transition hover:text-white/70"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            ล้างสถิติ
          </button>
        )}
      </div>

      <History times={history} />

      <p className="px-1 text-xs leading-relaxed text-white/40">
        เวลาตอบสนองเฉลี่ยของคนทั่วไปราว 0.25 วินาที · นักแข่ง F1 ออกตัวได้เร็วราว
        0.2 วินาที · ต่ำกว่า 0.1 วินาทีถือว่าเดาจังหวะไฟ
      </p>
    </div>
  );
}
