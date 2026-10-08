"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Timer } from "lucide-react";
import Car from "@/components/boardgame/Car";
import TrackView from "@/components/boardgame/TrackView";
import { look } from "@/components/boardgame/look";
import { TyreBadge } from "@/components/boardgame/icons";
import { sfx } from "@/components/boardgame/sound";
import type { Board } from "@/lib/boardgame/board";
import { COMPOUNDS, newGame, type AiLevel, type CarSpec, type Compound, type Track } from "@/lib/boardgame/engine";
import {
  BASE_LAP, COMBO_GAIN, COMBO_STEP, LEAD_BEATS, LEVEL, PENALTY, WINDOW, aiLap, beatMsFor, buildChart, fmtLap, judge, median,
  judgeCount, noteDelta, round3, sectorColor, tyreDelta, type Grade, type Lane, type LapResult, type Note,
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
        track={track}
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
      <Head title="ควอลิฟาย" sub="วิ่งรอบเดียวให้เร็วที่สุด · ทางตรงเหยียบคันเร่งค้าง · ก่อนเข้าโค้งเหยียบเบรกค้าง · โน้ตฟ้า = DRS" />
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
        <li>คันเร่งกับเบรกต้อง<b className="text-white">กดค้าง</b>ตามแถบ แล้วปล่อยตอนแถบจบ (ตัดสินทั้งตอนกดและตอนปล่อย) · พลาดเบรกก่อนโค้งความเร็วต่ำ = ออกนอกโค้ง +{PENALTY.offTrack} วิ</li>
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

/** หนึ่งรอบจับจังหวะ: แผนที่สนามแบบตอนแข่งด้านบน โน้ตเลื่อนลงมาด้านล่าง เต็มจอ */
function RhythmLap({
  car, board, track, chart, compound, level, others, sectorMed, onFinish,
}: {
  car: CarSpec;
  board: Board;
  track: Track;
  chart: Note[];
  compound: Compound;
  level: AiLevel;
  others: LapResult[];
  sectorMed: number[];
  onFinish: (r: LapDone) => void;
}) {
  const lapCells = track.lapCells;
  const beatMs = beatMsFor(level, compound);
  const win = LEVEL[level].win;
  const judgments = judgeCount(chart);
  const endBeat = Math.max(LEAD_BEATS + lapCells, ...chart.map((n) => n.beat + n.hold)) + 1;
  const bounds = [1, 2, 3].map((k) => LEAD_BEATS + Math.ceil((k * lapCells) / 3));
  const sectorBase = (BASE_LAP + tyreDelta(compound)) / 3;
  // สถานะเกมจำลองที่มีรถคันเดียว ไว้ให้แผนที่สนามวาด
  const [base] = useState(() => {
    const g0 = newGame([{ ...car, compound }], Array.from({ length: car.team + 1 }, () => ""), track, 1, Math.random, [0], { rules: "ours" });
    return { ...g0, drivers: g0.drivers.map((d) => ({ ...d, progress: 0, lane: 0 as const })) };
  });

  const g = useRef({
    t0: 0,
    /** ผลตอนกด / ตอนปล่อย ของแต่ละโน้ต */
    pressed: new Map<number, Grade>(),
    released: new Set<number>(),
    holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>,
    down: { brake: false, throttle: false, drs: false } as Record<Lane, boolean>,
    deltas: [0, 0, 0],
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, early: 0, late: 0, miss: 0, off: 0 } as Counts,
    done: false,
  });
  // ภาพบนจอ: สำเนาของข้อมูลใน g ทุกเฟรม (ห้ามอ่าน ref ตอนวาด)
  const [view, setView] = useState({
    now: -LEAD_BEATS,
    pressed: new Map<number, Grade>(),
    holding: { brake: -1, throttle: -1, drs: -1 } as Record<Lane, number>,
    down: { brake: false, throttle: false, drs: false } as Record<Lane, boolean>,
    deltas: [0, 0, 0],
    combo: 0,
    mapPos: 0,
  });
  const [fb, setFb] = useState<{ t: string; c: string; k: number } | null>(null);

  const sectorOf = (beat: number) => Math.max(0, bounds.findIndex((b) => beat < b)) as 0 | 1 | 2;
  const feedback = (t: string, c: string) => setFb({ t, c, k: performance.now() });
  const beatNow = () => (performance.now() - g.current.t0) / beatMs;
  const score = (n: Note, grade: Grade, part: "press" | "release") => {
    const s = g.current;
    s.deltas[n.sector] += noteDelta(n, grade, judgments, part);
    if (n.lane === "drs") return;
    s.counts[grade]++;
    if (grade === "perfect" || grade === "good") {
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      if (s.combo % COMBO_STEP === 0) s.deltas[n.sector] -= COMBO_GAIN;
    } else s.combo = 0;
  };

  /** ไม่ได้กดโน้ตนี้เลย: พลาดทั้งตอนกดและตอนปล่อย */
  const missNote = (n: Note) => {
    const s = g.current;
    s.pressed.set(n.id, "miss");
    if (n.lane === "drs") return; // DRS ไม่บังคับ พลาดไม่เสียอะไร
    s.released.add(n.id);
    score(n, "miss", "press");
    score(n, "miss", "release");
    if (n.slow) {
      s.counts.off++;
      sfx.offTrack();
      feedback("OFF TRACK!", "#ff3b2f");
    } else {
      sfx.miss();
      feedback("MISS", GRADE_TEXT.miss.c);
    }
  };

  /** ปล่อยแป้น (หรือค้างเลยจุดปล่อยจนหมดช่วง) */
  const finishHold = (n: Note, grade: Grade, text?: string) => {
    const s = g.current;
    s.released.add(n.id);
    if (s.holding[n.lane] === n.id) s.holding[n.lane] = -1;
    score(n, grade, "release");
    feedback(text ?? GRADE_TEXT[grade].t, GRADE_TEXT[grade].c);
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
      // เหยียบผิดจังหวะ (ไม่มีโน้ตใกล้ ๆ)
      s.deltas[sectorOf(Math.max(LEAD_BEATS, b))] += PENALTY.wrong;
      s.combo = 0;
      feedback("WRONG", "#9ca3af");
      return;
    }
    const n = cand.n;
    s.pressed.set(n.id, grade);
    score(n, grade, "press");
    if (n.hold > 0) s.holding[lane] = n.id;
    if (n.lane === "drs") feedback(grade === "perfect" || grade === "good" ? "DRS OPEN!" : "DRS LATE", "#38bdf8");
    else feedback(GRADE_TEXT[grade].t, GRADE_TEXT[grade].c);
  };

  const release = (lane: Lane) => {
    const s = g.current;
    s.down[lane] = false;
    const id = s.holding[lane];
    if (id < 0) return;
    const n = chart.find((x) => x.id === id)!;
    const dt = (beatNow() - (n.beat + n.hold)) * beatMs;
    const grade = judge(dt, win);
    // ปล่อยเร็วเกินช่วง = ถอนคันเร่ง/เบรกก่อนเวลา
    finishHold(n, grade ?? "miss", grade ? undefined : n.lane === "brake" ? "เบรกสั้นไป!" : "ถอนเร็วไป!");
  };

  // ลูปเวลา: โน้ตที่เลยช่วงกด = MISS · ค้างเลยจุดปล่อยเกินช่วง = ปล่อยช้า · จบรอบ
  useEffect(() => {
    g.current.t0 = performance.now() + LEAD_BEATS * beatMs;
    let raf = 0;
    let lastCount = -LEAD_BEATS - 1;
    let lastMap = 0;
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
        else if (s.holding[n.lane] === n.id && (b - n.beat - n.hold) * beatMs > late)
          finishHold(n, "miss", n.lane === "brake" ? "เบรกนานไป!" : "เบรกไม่ทัน!");
      }
      // แผนที่วาดหนัก อัปเดตราว 20 ครั้ง/วินาที
      const t = performance.now();
      const mapPos = t - lastMap > 50 ? ((lastMap = t), Math.min(lapCells, Math.max(0, b - LEAD_BEATS))) : null;
      setView((v) => ({
        now: b,
        pressed: new Map(s.pressed),
        holding: { ...s.holding },
        down: { ...s.down },
        deltas: [...s.deltas],
        combo: s.combo,
        mapPos: mapPos ?? v.mapPos,
      }));
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
  // เต็มจอ: กันหน้าเว็บข้างหลังเลื่อน
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const s = view;
  const now = view.now;
  const mapState = { ...base, drivers: base.drivers.map((d) => ({ ...d, progress: view.mapPos % lapCells })) };
  const H = 230;
  const HIT = 195;
  const PX = 56;
  const lanes: { k: Lane; x: number; w: number; color: string; label: string }[] = [
    { k: "brake", x: 0, w: 40, color: "#E10600", label: "เบรก" },
    { k: "drs", x: 40, w: 20, color: "#38bdf8", label: "DRS" },
    { k: "throttle", x: 60, w: 40, color: "#22c55e", label: "คันเร่ง" },
  ];
  const lapNow = s.deltas.reduce((a, d) => a + d, 0);
  const doneSectors = bounds.filter((b) => now >= b).length;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#08080A] text-white select-none" role="application" aria-label="ควอลิฟายจับจังหวะ">
      {/* แผนที่สนามแบบตอนแข่ง */}
      <div className="relative min-h-0 flex-1">
        <TrackView board={board} state={mapState} focus={mapState.drivers[0]} ghost={null} zoomed instant onToggle={() => {}} />
        <div className="absolute inset-x-2 top-2 flex items-start gap-2">
          <div className="rounded-xl bg-[#08080A]/85 px-3 py-1.5">
            <p className="flex items-center gap-1 text-[11px] text-white/65">
              <Timer className="h-3.5 w-3.5" /> {car.name} · ยาง {COMPOUNDS[compound].short}
            </p>
            <p className={`poster text-2xl leading-tight tabular-nums ${lapNow <= 0 ? "text-[#22c55e]" : "text-(--color-f1-text)"}`}>
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
          <div className="ml-auto rounded-xl bg-[#08080A]/85 px-3 py-1.5 text-right">
            <p className="poster text-3xl leading-none tabular-nums">{s.combo}</p>
            <p className="text-[10px] text-white/60">คอมโบ</p>
          </div>
        </div>
        {now < 0 && <p className="poster absolute inset-x-0 top-1/3 text-center text-7xl text-white drop-shadow-lg">{Math.ceil(-now)}</p>}
        {fb && (
          <p key={fb.k} className="bg-pop poster pointer-events-none absolute inset-x-0 bottom-4 text-center text-3xl drop-shadow-lg" style={{ color: fb.c }}>
            {fb.t}
          </p>
        )}
      </div>

      <div className="flex-none space-y-2 border-t border-white/10 bg-[#121216] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:mx-auto md:w-[560px] md:rounded-t-2xl md:border-x">
        {/* ทางวิ่งของโน้ต */}
        <div className="relative overflow-hidden rounded-xl bg-[#0d0d10]" style={{ height: H }}>
          {lanes.map((l) => (
            <div
              key={l.k}
              className="absolute inset-y-0 border-x border-white/5"
              style={{ left: `${l.x}%`, width: `${l.w}%`, background: s.down[l.k] ? `${l.color}22` : undefined }}
            />
          ))}
          {chart.map((n) => {
            const head = HIT - (n.beat - now) * PX;
            const tail = HIT - (n.beat + n.hold - now) * PX;
            if (head < -20 || tail > H + 20) return null;
            const j = s.pressed.get(n.id);
            const held = s.holding[n.lane] === n.id;
            if (j && !held && (n.hold === 0 || j !== "miss")) {
              // กดแล้วปล่อยแล้ว: เหลือแค่แถบจาง ๆ
              if (n.hold === 0 || tail > H) return null;
            }
            const l = lanes.find((x) => x.k === n.lane)!;
            const top = Math.min(tail, head) - 9;
            const bottom = held ? HIT : head + 9;
            const missed = j === "miss";
            return (
              <div key={n.id} className="absolute" style={{ left: `calc(${l.x}% + 6px)`, width: `calc(${l.w}% - 12px)`, top, height: Math.max(18, bottom - top) }}>
                {n.hold > 0 && (
                  <div
                    className="absolute inset-x-[22%] rounded-md"
                    style={{ top: 9, bottom: held ? 0 : 9, background: l.color, opacity: missed ? 0.3 : held ? 0.95 : j ? 0.25 : 0.5 }}
                  />
                )}
                {/* จุดปล่อย */}
                {n.hold > 0 && <div className="absolute inset-x-0 top-0 h-[6px] rounded-sm" style={{ background: missed ? "#444" : l.color, opacity: held ? 1 : 0.8 }} />}
                {/* จุดกด */}
                {!held && !j && (
                  <div
                    className="absolute inset-x-0 bottom-0 flex h-[18px] items-center justify-center rounded-md text-[9px] font-black text-white"
                    style={{ background: l.color, boxShadow: n.slow ? "0 0 0 2px #fff" : undefined }}
                  >
                    {n.slow ? "×3" : ""}
                  </div>
                )}
              </div>
            );
          })}
          <div className="absolute inset-x-0 h-[3px] bg-white/80" style={{ top: HIT }} />
        </div>

        {/* แป้น: กดค้างเหมือนเหยียบจริง */}
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
              className="poster min-h-24 touch-none rounded-2xl border-2 text-lg text-white transition-transform active:scale-95"
              style={{ borderColor: l.color, background: s.down[l.k] ? l.color : `${l.color}33` }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
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
