"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Timer } from "lucide-react";
import Car from "@/components/boardgame/Car";
import { look } from "@/components/boardgame/look";
import { TyreBadge } from "@/components/boardgame/icons";
import { sfx } from "@/components/boardgame/sound";
import type { Board } from "@/lib/boardgame/board";
import { COMPOUNDS, type AiLevel, type CarSpec, type Compound, type Track } from "@/lib/boardgame/engine";
import {
  BASE_LAP, COMBO_GAIN, COMBO_STEP, LEAD_BEATS, LEVEL, PENALTY, WINDOW, aiLap, beatMsFor, buildChart, fmtLap, judge, median,
  noteDelta, round3, sectorColor, tyreDelta, type Grade, type Lane, type LapResult, type Note,
} from "@/lib/boardgame/rhythm";

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SECTOR_COLOR = { purple: "#a855f7", green: "#22c55e", yellow: "#facc15" } as const;
const GRADE_TEXT: Record<Grade, { t: string; c: string }> = {
  perfect: { t: "PERFECT", c: "#a855f7" },
  good: { t: "GOOD", c: "#22c55e" },
  early: { t: "EARLY", c: "#facc15" },
  late: { t: "LATE", c: "#facc15" },
  miss: { t: "MISS", c: "#ff3b2f" },
};
type Counts = Record<Grade, number> & { off: number };
/** ผลรอบของรถผู้เล่น (ข้ามมินิเกม = ไม่มี counts) */
type LapDone = LapResult & { counts?: Counts; maxCombo?: number; compound?: Compound };

/** ควอลิฟายรอบเดียวแบบจับจังหวะ: ผู้เล่นทีละคน แล้วเรียงกริดตามเวลา */
export default function RhythmQuali({
  cars, board, track, level, onDone,
}: {
  cars: CarSpec[];
  board: Board;
  track: Track;
  level: AiLevel;
  onDone: (grid: number[], wear: number[]) => void;
}) {
  const humans = cars.map((c, id) => ({ c, id })).filter((x) => !x.c.ai);
  const [laps, setLaps] = useState<(LapResult | LapDone | null)[]>(() =>
    cars.map((c) => (c.ai ? aiLap(level, Math.random) : null)),
  );
  const [who, setWho] = useState(0);
  const [stage, setStage] = useState<"intro" | "play" | "done" | "results">("intro");
  const [tyre, setTyre] = useState<Compound>("yellow");
  const [chart] = useState(() => buildChart(track));

  const me = humans[who];
  const others = laps.filter((l): l is LapResult => l !== null);
  const aiOnly = laps.filter((l, id) => l && cars[id].ai) as LapResult[];
  const sectorMed = [0, 1, 2].map((k) => median(aiOnly.map((l) => l.sectors[k])));

  /** ข้าม: เวลาระดับกลาง ๆ */
  const auto = () => aiLap("normal", Math.random);
  const save = (id: number, res: LapResult | LapDone) => {
    setLaps((ls) => ls.map((l, i) => (i === id ? res : l)));
    setStage("done");
  };
  const next = () => {
    if (who + 1 < humans.length) {
      setWho(who + 1);
      setTyre("yellow");
      setStage("intro");
    } else setStage("results");
  };

  if (stage === "results" || !me) {
    const order = laps
      .map((l, id) => ({ l: l ?? auto(), id }))
      .sort((a, b) => a.l.lap - b.l.lap || a.id - b.id);
    const best = order[0].l.lap;
    const all = order.map((x) => x.l);
    return (
      <section className="card space-y-3 p-4" aria-label="ผลควอลิฟาย">
        <Head title="ผลควอลิฟาย" sub="เรียงกริดตามเวลาต่อรอบ · สีเซกเตอร์ ม่วง = เร็วสุด เขียว = เร็วกว่าค่ากลาง เหลือง = ช้ากว่า" />
        <ol className="space-y-1">
          {order.map(({ l, id }, rank) => {
            const c = cars[id];
            return (
              <li key={id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${c.ai ? "bg-white/[0.03]" : "bg-(--color-f1)/15"}`}>
                <span className="poster w-7 flex-none text-sm tabular-nums">P{rank + 1}</span>
                <Car {...look(c)} num={c.num} width={24} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                <span className="flex gap-0.5" aria-label="เซกเตอร์">
                  {l.sectors.map((s, k) => (
                    <span
                      key={k}
                      className="h-2 w-2 rounded-sm"
                      style={{ background: SECTOR_COLOR[sectorColor(s, all.map((x) => x.sectors[k]), sectorMed[k])] }}
                    />
                  ))}
                </span>
                <span className="text-right text-[13px] tabular-nums">{fmtLap(l.lap)}</span>
                <span className="w-11 text-right text-[10px] text-white/60 tabular-nums">{rank === 0 ? "POLE" : `+${(l.lap - best).toFixed(3)}`}</span>
              </li>
            );
          })}
        </ol>
        <Cta onClick={() => onDone(order.map((x) => x.id), cars.map(() => 0))}>เริ่มเรซ</Cta>
      </section>
    );
  }

  if (stage === "play")
    return (
      <RhythmLap
        key={me.id}
        car={me.c}
        board={board}
        chart={chart}
        compound={tyre}
        level={level}
        lapCells={track.lapCells}
        others={others}
        sectorMed={sectorMed}
        onFinish={(res) => save(me.id, res)}
      />
    );

  if (stage === "done") {
    const res = laps[me.id] as LapDone;
    const pos = laps.filter((l) => l && l.lap < res.lap).length + 1;
    return (
      <section className="card space-y-3 p-4" aria-label="จบรอบ">
        <Head title="จบรอบ" sub={`${me.c.name} · ${res.compound ? `ยาง ${COMPOUNDS[res.compound].label}` : "ควอลิฟายอัตโนมัติ"}`} />
        <p className="poster text-center text-5xl tabular-nums">{fmtLap(res.lap)}</p>
        <p className="text-center text-sm text-white/75">อันดับตอนนี้ P{pos} จาก {cars.length} คัน</p>
        <div className="flex justify-center gap-2">
          {res.sectors.map((s, k) => (
            <span
              key={k}
              className="rounded-md px-2 py-1 text-xs font-bold text-[#08080A] tabular-nums"
              style={{ background: SECTOR_COLOR[sectorColor(s, others.map((x) => x.sectors[k]), sectorMed[k])] }}
            >
              S{k + 1} {s.toFixed(3)}
            </span>
          ))}
        </div>
        {res.counts && (
          <p className="text-center text-xs text-white/70 tabular-nums">
            PERFECT {res.counts.perfect} · GOOD {res.counts.good} · EARLY/LATE {res.counts.early + res.counts.late} · MISS {res.counts.miss}
            {res.counts.off > 0 ? ` · ออกนอกโค้ง ${res.counts.off}` : ""} · คอมโบสูงสุด {res.maxCombo}
          </p>
        )}
        <Cta onClick={next}>{who + 1 < humans.length ? "คันถัดไป" : "ดูผลควอลิฟาย"}</Cta>
      </section>
    );
  }

  // intro: เลือกยางแล้วเริ่ม
  return (
    <section className="card space-y-4 p-4" aria-label="ควอลิฟาย">
      <Head title="ควอลิฟาย" sub="วิ่งรอบเดียวให้เร็วที่สุด · ทางตรงกดคันเร่ง (ค้างตามแถบ) · ก่อนเข้าโค้งกดเบรก · โน้ตฟ้า = DRS" />
      <div className="flex items-center gap-2">
        <Car {...look(me.c)} num={me.c.num} width={40} />
        <p className="text-sm font-bold">
          {me.c.name}
          {humans.length > 1 && <span className="block text-xs font-normal text-white/60">ผู้เล่น {who + 1}/{humans.length}</span>}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["red", "yellow"] as Compound[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={tyre === k}
            onClick={() => setTyre(k)}
            className={`flex items-center gap-2 rounded-xl border-2 p-2.5 text-left ${tyre === k ? "border-white bg-white/10" : "border-white/15"}`}
          >
            <TyreBadge compound={k} className="h-8 w-8 flex-none" />
            <span className="text-xs leading-snug text-white/80">
              <b className="block text-sm text-white">{COMPOUNDS[k].label}</b>
              {k === "red" ? `เร็วกว่า ${tyreDelta("red").toFixed(2).slice(1)} วิ แต่โน้ตมาเร็วขึ้น` : "โน้ตช้ากว่า เล่นง่ายกว่า"}
            </span>
          </button>
        ))}
      </div>
      <ul className="space-y-1 text-xs text-white/70">
        <li>กดตรงจังหวะ: PERFECT / GOOD ลดเวลา · EARLY / LATE / MISS เพิ่มเวลา · คอมโบทุก {COMBO_STEP} ลดอีก {COMBO_GAIN} วิ</li>
        <li>พลาดเบรกก่อนโค้งความเร็วต่ำ = ออกนอกโค้ง +{PENALTY.offTrack} วิ · ปล่อยคันเร่งก่อนจบแถบ +{PENALTY.lift} วิ</li>
        <li>คอม: ← หรือ A = เบรก · → หรือ D = คันเร่ง · ↑ / W / Space = DRS</li>
      </ul>
      <div className="flex flex-col gap-2">
        <Cta onClick={() => (calm() ? save(me.id, auto()) : setStage("play"))}>เริ่มวิ่ง</Cta>
        <button type="button" onClick={() => save(me.id, auto())} className="min-h-10 rounded-full border border-white/20 text-sm text-white/75">
          ข้าม (ควอลิฟายอัตโนมัติ)
        </button>
      </div>
    </section>
  );
}

/** หนึ่งรอบจับจังหวะ: โน้ตเลื่อนลงมาหาเส้นตัดสิน */
function RhythmLap({
  car, board, chart, compound, level, lapCells, others, sectorMed, onFinish,
}: {
  car: CarSpec;
  board: Board;
  chart: Note[];
  compound: Compound;
  level: AiLevel;
  lapCells: number;
  others: LapResult[];
  sectorMed: number[];
  onFinish: (r: LapDone) => void;
}) {
  const beatMs = beatMsFor(level, compound);
  const win = LEVEL[level].win;
  const scored = chart.filter((n) => n.lane !== "drs").length;
  const endBeat = Math.max(LEAD_BEATS + lapCells, ...chart.map((n) => n.beat + n.hold)) + 1;
  const bounds = [1, 2, 3].map((k) => LEAD_BEATS + Math.ceil((k * lapCells) / 3));
  const sectorBase = (BASE_LAP + tyreDelta(compound)) / 3;

  const g = useRef({
    t0: 0,
    judged: new Map<number, Grade>(),
    holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>,
    deltas: [0, 0, 0],
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, early: 0, late: 0, miss: 0, off: 0 } as Counts,
    done: false,
  });
  // ภาพบนจอ: สำเนาของข้อมูลใน g ทุกเฟรม (ห้ามอ่าน ref ตอนวาด)
  const [view, setView] = useState({
    now: -LEAD_BEATS,
    judged: new Map<number, Grade>(),
    holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>,
    deltas: [0, 0, 0],
    combo: 0,
  });
  const [fb, setFb] = useState<{ t: string; c: string; k: number } | null>(null);
  const [down, setDown] = useState<Record<Lane, boolean>>({ brake: false, throttle: false, drs: false });

  const sectorOf = (beat: number) => Math.max(0, bounds.findIndex((b) => beat < b)) as 0 | 1 | 2;
  const feedback = (t: string, c: string) => setFb({ t, c, k: performance.now() });
  const breakCombo = () => {
    g.current.combo = 0;
  };
  const addCombo = (beat: number) => {
    const s = g.current;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    if (s.combo % COMBO_STEP === 0) s.deltas[sectorOf(beat)] -= COMBO_GAIN;
  };
  const beatNow = () => (performance.now() - g.current.t0) / beatMs;

  const miss = (n: Note) => {
    const s = g.current;
    s.judged.set(n.id, "miss");
    if (n.lane === "drs") return; // DRS ไม่บังคับ พลาดไม่เสียอะไร
    s.counts.miss++;
    s.deltas[n.sector] += noteDelta(n, "miss", scored);
    breakCombo();
    if (n.slow) {
      s.counts.off++;
      sfx.offTrack();
      feedback("OFF TRACK!", "#ff3b2f");
    } else {
      sfx.miss();
      feedback("MISS", GRADE_TEXT.miss.c);
    }
  };

  const press = (lane: Lane) => {
    const s = g.current;
    if (s.done) return;
    setDown((d) => ({ ...d, [lane]: true }));
    if (lane === "brake") sfx.brake();
    else if (lane === "throttle") sfx.throttle();
    else sfx.drs();
    const b = beatNow();
    const cand = chart
      .filter((n) => n.lane === lane && !s.judged.has(n.id))
      .map((n) => ({ n, dt: (b - n.beat) * beatMs }))
      .sort((x, y) => Math.abs(x.dt) - Math.abs(y.dt))[0];
    const grade = cand ? judge(cand.dt, win) : null;
    if (!cand || !grade) {
      // กดผิดจังหวะ (ไม่มีโน้ตใกล้ ๆ)
      s.deltas[sectorOf(Math.max(LEAD_BEATS, b))] += PENALTY.wrong;
      breakCombo();
      feedback("WRONG", "#9ca3af");
      return;
    }
    const n = cand.n;
    s.judged.set(n.id, grade);
    s.deltas[n.sector] += noteDelta(n, grade, scored);
    if (n.lane !== "drs") s.counts[grade]++;
    if (grade === "perfect" || grade === "good") addCombo(n.beat);
    else if (n.lane !== "drs") breakCombo();
    if (n.hold > 0) s.holding[lane] = n.id;
    feedback(n.lane === "drs" ? (grade === "perfect" || grade === "good" ? "DRS OPEN!" : "DRS LATE") : GRADE_TEXT[grade].t, n.lane === "drs" ? "#38bdf8" : GRADE_TEXT[grade].c);
  };

  const release = (lane: Lane) => {
    const s = g.current;
    setDown((d) => ({ ...d, [lane]: false }));
    const id = s.holding[lane];
    if (id < 0) return;
    s.holding[lane] = -1;
    const n = chart.find((x) => x.id === id)!;
    if (beatNow() < n.beat + n.hold - 0.5) {
      s.deltas[n.sector] += PENALTY.lift;
      breakCombo();
      feedback("LIFT!", "#facc15");
    }
  };

  // ลูปเวลา: ไล่โน้ตที่เลยช่วงตัดสินเป็น MISS แล้วจบรอบ
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
      for (const n of chart) if (!s.judged.has(n.id) && (b - n.beat) * beatMs > WINDOW.late * win) miss(n);
      setView({ now: b, judged: new Map(s.judged), holding: { ...s.holding }, deltas: [...s.deltas], combo: s.combo });
      if (b >= endBeat && !s.done) {
        s.done = true;
        const sectors = s.deltas.map((d) => round3(sectorBase + d)) as [number, number, number];
        onFinish({ lap: round3(sectors[0] + sectors[1] + sectors[2]), sectors, counts: s.counts, maxCombo: s.maxCombo, compound });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // คีย์บอร์ด
  useEffect(() => {
    const map: Record<string, Lane> = {
      ArrowLeft: "brake", KeyA: "brake", ArrowRight: "throttle", KeyD: "throttle", ArrowUp: "drs", KeyW: "drs", Space: "drs",
    };
    const kd = (e: KeyboardEvent) => {
      const l = map[e.code];
      if (!l) return;
      e.preventDefault();
      if (!e.repeat) press(l);
    };
    const ku = (e: KeyboardEvent) => {
      const l = map[e.code];
      if (l) release(l);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  });

  const s = view;
  const now = view.now;
  const H = 300;
  const HIT = 255;
  const PX = 64;
  const lanes: { k: Lane; x: number; w: number; color: string; label: string }[] = [
    { k: "brake", x: 0, w: 40, color: "#E10600", label: "เบรก" },
    { k: "drs", x: 40, w: 20, color: "#38bdf8", label: "DRS" },
    { k: "throttle", x: 60, w: 40, color: "#22c55e", label: "คันเร่ง" },
  ];
  const lapNow = s.deltas.reduce((a, d) => a + d, 0);
  const pos = Math.min(lapCells, Math.max(0, now - LEAD_BEATS));
  const doneSectors = bounds.filter((b) => now >= b).length;
  const p0 = board.cells[Math.floor(pos) % board.cells.length];
  const p1 = board.cells[(Math.floor(pos) + 1) % board.cells.length];
  const fr = pos - Math.floor(pos);
  const dot = { x: p0.x + (p1.x - p0.x) * fr, y: p0.y + (p1.y - p0.y) * fr };

  return (
    <section className="card space-y-3 p-3 select-none" aria-label="ควอลิฟายจับจังหวะ">
      <div className="flex items-center gap-3">
        <svg viewBox={`0 0 ${board.w} ${board.h}`} className="h-16 w-16 flex-none" aria-hidden>
          <path d={board.d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={board.w / 40} strokeLinejoin="round" />
          <circle cx={dot.x} cy={dot.y} r={board.w / 22} fill={look(car).color} stroke="#fff" strokeWidth={board.w / 80} />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs text-white/60">
            <Timer className="h-3.5 w-3.5" /> {car.name} · ยาง {COMPOUNDS[compound].short}
          </p>
          <p className={`poster text-2xl tabular-nums ${lapNow <= 0 ? "text-[#22c55e]" : "text-(--color-f1-text)"}`}>
            {lapNow <= 0 ? "−" : "+"}
            {Math.abs(lapNow).toFixed(3)}
          </p>
          <div className="flex gap-1">
            {[0, 1, 2].map((k) => {
              const t = round3(sectorBase + s.deltas[k]);
              const c = k < doneSectors ? SECTOR_COLOR[sectorColor(t, others.map((x) => x.sectors[k]), sectorMed[k])] : "rgba(255,255,255,0.12)";
              return (
                <span key={k} className="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: c, color: k < doneSectors ? "#08080A" : "rgba(255,255,255,0.6)" }}>
                  S{k + 1}
                  {k < doneSectors ? ` ${t.toFixed(3)}` : ""}
                </span>
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <p className="poster text-3xl leading-none tabular-nums">{s.combo}</p>
          <p className="text-[10px] text-white/60">คอมโบ</p>
        </div>
      </div>

      {/* ทางวิ่งของโน้ต */}
      <div className="relative overflow-hidden rounded-xl bg-[#0d0d10]" style={{ height: H }}>
        {lanes.map((l) => (
          <div
            key={l.k}
            className="absolute inset-y-0 border-x border-white/5"
            style={{ left: `${l.x}%`, width: `${l.w}%`, background: down[l.k] ? `${l.color}22` : undefined }}
          />
        ))}
        {chart.map((n) => {
          const y = HIT - (n.beat - now) * PX;
          const len = n.hold * PX;
          if (y < -20 || y - len > H + 20) return null;
          const j = s.judged.get(n.id);
          const held = s.holding[n.lane] === n.id;
          if (j && n.hold === 0) return null;
          const l = lanes.find((x) => x.k === n.lane)!;
          return (
            <div key={n.id} className="absolute" style={{ left: `calc(${l.x}% + 6px)`, width: `calc(${l.w}% - 12px)`, top: y - len - 9 }}>
              {n.hold > 0 && (
                <div
                  className="mx-auto w-1/2 rounded-t-md"
                  style={{ height: len, background: l.color, opacity: j === "miss" ? 0.15 : held ? 0.9 : 0.45 }}
                />
              )}
              <div
                className="flex h-[18px] items-center justify-center rounded-md text-[9px] font-black text-white"
                style={{ background: j === "miss" ? "#444" : l.color, boxShadow: n.slow ? "0 0 0 2px #fff" : undefined }}
              >
                {n.slow ? "×3" : ""}
              </div>
            </div>
          );
        })}
        <div className="absolute inset-x-0 h-[3px] bg-white/80" style={{ top: HIT }} />
        {now < 0 && (
          <p className="poster absolute inset-x-0 top-1/3 text-center text-6xl text-white">{Math.ceil(-now)}</p>
        )}
        {fb && (
          <p key={fb.k} className="bg-pop poster pointer-events-none absolute inset-x-0 top-[38%] text-center text-3xl" style={{ color: fb.c }}>
            {fb.t}
          </p>
        )}
      </div>

      {/* ปุ่มกด */}
      <div className="grid grid-cols-[2fr_1fr_2fr] gap-2">
        {lanes.map((l) => (
          <button
            key={l.k}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              press(l.k);
            }}
            onPointerUp={() => release(l.k)}
            onPointerCancel={() => release(l.k)}
            onContextMenu={(e) => e.preventDefault()}
            className="poster min-h-20 touch-none rounded-2xl border-2 text-lg text-white transition-transform active:scale-95"
            style={{ borderColor: l.color, background: down[l.k] ? l.color : `${l.color}33` }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1">
      <h2 className="poster text-xl text-white">{title}</h2>
      <p className="text-xs text-white/65">{sub}</p>
    </div>
  );
}

function Cta({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-12 w-full rounded-full bg-(--color-f1) text-base font-bold text-white">
      {children}
    </button>
  );
}
