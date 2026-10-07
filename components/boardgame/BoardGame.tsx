"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CloudDrizzle, CloudRain, Droplets, Flag, Gauge, RotateCcw, Sun, TriangleAlert, X, Zap,
} from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import type { Board } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  ACTIONS, CARD_EVENTS, COL_LABEL, CRUISE_MOVE, EVENTS, MAX_PER_COMPOUND, PIT_COST, SURE_AHEAD, TYRES, TYRE_SLOTS,
  SPEED_CARDS, WEATHER, WORN_MOVE, YELLOW_TO_SC, activePlayer, canPlay, canSwap, columnAvg,
  forecastAt, isWorn, makeWeatherPlan, mustCruise, newGame, pitCost, playTurn, standings, validTyres, weatherEffect,
  weatherNow,
  type Action, type Col, type GameState, type Mode, type SkyShift, type Tyre, type Weather,
  type WeatherPlan,
} from "@/lib/boardgame/engine";

const LAPS = 3;
const TOTAL = CELLS_PER_LAP * LAPS;
const COMPOUNDS = Object.keys(TYRES) as Tyre[];
const COLS: Col[] = ["soft", "medium", "hard"];

/** ผู้เล่นสมมติ — ไม่ใช้ชื่อทีม/นักขับจริง สีแดงกับขาวให้ตัดกันบนพื้นดำ */
const SEATS = [
  { name: "เมเทียร์ เรซซิ่ง", color: "#E10600", ink: "#fff" },
  { name: "ไอซ์ไบรท์ เรซซิ่ง", color: "#DEDEDE", ink: "#08080A" },
] as const;

/**
 * แผนอากาศที่ยังไม่เริ่มเกม เก็บไว้นอก React เพื่อให้ฝั่งเซิร์ฟเวอร์ไม่ต้องสุ่ม (ผลคงที่ต่อ build)
 * แล้ว client ค่อยสุ่มของจริงตอน hydrate — `resetPlan` ใช้ตอนเริ่มเกมใหม่
 */
let planCache: WeatherPlan | null = null;
const planListeners = new Set<() => void>();
const subscribePlan = (cb: () => void) => {
  planListeners.add(cb);
  return () => {
    planListeners.delete(cb);
  };
};
const getPlan = (): WeatherPlan | null => (planCache ??= makeWeatherPlan(Math.random));
const getServerPlan = (): WeatherPlan | null => null;
function resetPlan() {
  planCache = null;
  planListeners.forEach((l) => l());
}

const lapOf = (progress: number) => Math.min(LAPS, Math.floor(progress / CELLS_PER_LAP) + 1);

function BoardView({ board, state }: { board: Board; state: GameState }) {
  const pad = 7;
  const r = 2.1;
  return (
    <div className="card-poster relative rounded-2xl border border-white/10 p-3">
      <svg
        viewBox={`${-pad} ${-pad} ${board.w + pad * 2} ${board.h + pad * 2}`}
        className="mx-auto block max-h-[22rem] w-full"
        role="img"
        aria-label={`กระดานสนาม${board.name} ${CELLS_PER_LAP} ช่องต่อรอบ`}
      >
        <path d={board.d} fill="none" stroke="#1F1F24" strokeWidth={r * 3.2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={board.d} fill="none" stroke="#3a3a42" strokeWidth={0.5} strokeLinejoin="round" />
        {board.cells.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.x}
              cy={c.y}
              r={r * 1.05}
              fill={i === 0 ? "#fff" : "#08080A"}
              stroke={i === 0 ? "#E10600" : "#5a5a64"}
              strokeWidth={i === 0 ? 0.8 : 0.4}
            />
            {/* เลขช่องในรอบ: 0 = เส้นสตาร์ท/เส้นชัย */}
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={r * 1.15}
              fontWeight={700}
              fill={i === 0 ? "#E10600" : "#b4b4bc"}
              className="tabular-nums"
            >
              {i === 0 ? "S" : i}
            </text>
          </g>
        ))}
        {state.players.map((p) => {
          const cell = board.cells[p.progress % CELLS_PER_LAP];
          // เลื่อนเล็กน้อยกันรถซ้อนกันพอดีเมื่ออยู่ช่องเดียวกัน
          const off = (p.id - (state.players.length - 1) / 2) * r * 1.1;
          const seat = SEATS[p.id];
          return (
            <g
              key={p.id}
              className="transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `translate(${cell.x + off}px, ${cell.y - off}px)` }}
            >
              <circle r={r * 0.7} fill={seat.color} stroke="#08080A" strokeWidth={0.6} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={r * 0.95}
                fontWeight={800}
                fill={seat.ink}
              >
                {p.id + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <OsmCredit className="bottom-2 right-2" />
    </div>
  );
}

/**
 * ไพ่เร่ง — หงายแล้วเห็นค่าก้าวสามแถว (แถวของยางที่ใส่อยู่ไฮไลต์) กับสัญลักษณ์:
 * สึก = ยางเสื่อม, หยดน้ำ = เสี่ยงหมุนในฝน, ทีม/เหตุการณ์ = ผลพิเศษหลังเดิน
 * id = null แสดงไพ่คว่ำก่อนพลิกครั้งแรก, tilt ใช้เอียงตอนกำลังพลิก
 */
function SpeedCardView({ id, col, tilt }: { id: number | null; col: Col; tilt: number }) {
  const c = id === null ? null : SPEED_CARDS[id];
  return (
    <div
      role="img"
      aria-label={
        c
          ? `ไพ่เร่ง ค่านิ่ม ${c.v[0]} กลาง ${c.v[1]} แข็ง ${c.v[2]}`
          : "ยังไม่ได้พลิกไพ่เร่ง"
      }
      className="flex h-24 w-28 shrink-0 flex-col justify-between rounded-xl border-2 border-white/25 bg-[#17171c] p-2 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.7)] transition-transform duration-75 motion-reduce:transition-none"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {c ? (
        <>
          <div className="grid grid-cols-3 gap-1 text-center">
            {COLS.map((k, i) => (
              <div
                key={k}
                className={`rounded-md py-1 ${
                  k === col ? "bg-[#DEDEDE] text-[#08080A]" : "bg-white/10 text-white/70"
                }`}
              >
                <span className="block text-[9px] leading-none">{COL_LABEL[k]}</span>
                <span className="poster block text-lg leading-tight tabular-nums">{c.v[i]}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
            {c.wear && <span className="rounded bg-red-500/80 px-1 text-white">สึก</span>}
            {c.risk > 0 && (
              <span className="flex items-center gap-0.5 rounded bg-sky-500/30 px-1 text-sky-200">
                <Droplets className="h-3 w-3" aria-hidden />
                {c.risk}
              </span>
            )}
            {c.icon === "team" && <span className="rounded bg-yellow-400/80 px-1 text-black">ทีม</span>}
            {c.icon === "event" && <span className="rounded bg-white/25 px-1 text-white">เหตุการณ์</span>}
          </div>
        </>
      ) : (
        <span className="poster m-auto text-3xl text-white/25">?</span>
      )}
    </div>
  );
}

/** สีขอบตามชนิดยาง (ตามธรรมเนียมสีแถบยางในการแข่งจริง) */
const TYRE_TONE: Record<Tyre, string> = {
  soft: "border-red-500/70",
  medium: "border-yellow-400/70",
  hard: "border-white/60",
  inter: "border-green-500/70",
  wet: "border-sky-400/70",
};

function WeatherIcon({ weather, className = "h-5 w-5" }: { weather: Weather; className?: string }) {
  if (weather === "dry") return <Sun className={`${className} text-yellow-300`} aria-hidden />;
  if (weather === "light_rain") return <CloudDrizzle className={`${className} text-sky-300`} aria-hidden />;
  return <CloudRain className={`${className} text-sky-400`} aria-hidden />;
}

/** แถบพยากรณ์อากาศ 5 รอบเทิร์น — ใกล้แม่น ไกลคลาดเคลื่อนได้ (เส้นประ) */
function ForecastStrip({ plan, round }: { plan: WeatherPlan; round: number }) {
  return (
    <section className="space-y-2" aria-label="พยากรณ์อากาศ">
      <p className="text-xs font-medium text-white/55">
        พยากรณ์อากาศ · แม่นใน {SURE_AHEAD} รอบแรก ไกลกว่านั้นคลาดเคลื่อนได้
      </p>
      <ul className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, ahead) => {
          const f = forecastAt(plan, round, ahead);
          return (
            <li
              key={ahead}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center ${
                f.sure ? "border-white/20 bg-white/5" : "border-dashed border-white/20"
              }`}
            >
              <span className="text-[10px] font-bold tabular-nums text-white/55">
                {ahead === 0 ? "ตอนนี้" : `R${round + ahead}`}
              </span>
              <WeatherIcon weather={f.weather} />
              <span className="text-[11px] leading-tight text-white/75">
                {f.sure ? "" : "~"}
                {WEATHER[f.weather].label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** การ์ดยาง — ใช้ทั้งตอนเลือกและตอนแสดงยางที่ใส่ไว้ */
function TyreCard({
  tyre, label, life, hint, active = false, onClick, disabled,
}: {
  tyre: Tyre;
  label?: string;
  /** อายุที่เหลือ (ถ้าไม่ส่ง = แสดงอายุเต็ม) */
  life?: number;
  /** ข้อความผลของอากาศปัจจุบันต่อยางใบนี้ */
  hint?: { text: string; good: boolean } | null;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const t = TYRES[tyre];
  const body = (
    <>
      {label && <span className="mb-1 block text-[10px] font-bold text-white/55">{label}</span>}
      <span className="block font-bold">{t.label}</span>
      <span className="block text-xs tabular-nums text-white/60">
        ~{columnAvg(t.col)} · {life ?? t.life}/{t.life}
      </span>
      <span className="block text-[10px] text-white/50">เหมาะ: {t.best}</span>
      {hint && (
        <span className={`block text-[10px] font-bold ${hint.good ? "text-green-400" : "text-yellow-400"}`}>
          {hint.text}
        </span>
      )}
    </>
  );
  const cls = `rounded-xl border-2 bg-white/5 px-2.5 py-2 text-left text-sm ${TYRE_TONE[tyre]} ${
    active ? "bg-white/10 ring-2 ring-white/40" : ""
  }`;
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${cls} transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {body}
    </button>
  );
}

/** ขั้นเลือกยางก่อนแข่ง — ผู้เล่นทีละคน */
function TyreSetup({
  plan, onDone,
}: {
  plan: WeatherPlan;
  onDone: (tyres: Tyre[][]) => void;
}) {
  const [picked, setPicked] = useState<Tyre[][]>([]);
  const [draft, setDraft] = useState<Tyre[]>([]);
  const who = picked.length;
  const seat = SEATS[who];

  const count = (t: Tyre) => draft.filter((x) => x === t).length;

  function confirm() {
    const all = [...picked, draft];
    if (all.length === SEATS.length) onDone(all);
    else {
      setPicked(all);
      setDraft([]);
    }
  }

  return (
    <section className="card space-y-4 p-4" aria-label="เลือกยางก่อนแข่ง">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ background: seat.color, color: seat.ink }}
        >
          {seat.name}
        </span>
        <span className="text-white/60">เลือกการ์ดยาง {TYRE_SLOTS} ใบ ใส่ไว้ก่อนออกตัว</span>
      </p>

      <ForecastStrip plan={plan} round={1} />

      <div className="grid grid-cols-3 gap-2">
        {COMPOUNDS.map((t) => (
          <TyreCard
            key={t}
            tyre={t}
            onClick={() => setDraft((d) => [...d, t])}
            disabled={draft.length >= TYRE_SLOTS || count(t) >= MAX_PER_COMPOUND}
          />
        ))}
      </div>
      <p className="text-xs text-white/55">
        ตัวเลขบนการ์ด = โบนัสก้าวตอนเร่ง · อายุ (จำนวนเทิร์นที่เร่งได้) · ยางแต่ละชนิดเลือกได้ไม่เกิน {MAX_PER_COMPOUND} ใบ
      </p>

      <div>
        <p className="mb-2 text-xs font-medium text-white/55">ยางที่ใส่ไว้ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรองไว้เข้าพิท)</p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: TYRE_SLOTS }, (_, i) => {
            const t = draft[i];
            return t ? (
              <div key={i} className="relative">
                <TyreCard tyre={t} label={i === 0 ? "ออกตัว" : `สำรอง ${i}`} />
                <button
                  type="button"
                  aria-label={`เอายางใบที่ ${i + 1} ออก`}
                  onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:text-white"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            ) : (
              <div
                key={i}
                className="flex min-h-[5.5rem] items-center justify-center rounded-xl border-2 border-dashed border-white/15 text-xs text-white/40"
              >
                {i === 0 ? "ออกตัว" : `สำรอง ${i}`}
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={!validTyres(draft)}
        onClick={confirm}
        className="w-full rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {who + 1 < SEATS.length ? `ยืนยัน แล้วให้ ${SEATS[who + 1].name} เลือก` : "ยืนยัน เริ่มแข่ง"}
      </button>
    </section>
  );
}

function ActionCard({
  action, selected, disabled, onClick, note,
}: {
  action: Action;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  /** ข้อความกำกับพิเศษ เช่นการเข้าพิทฉุกเฉินที่ไม่ต้องใช้การ์ด */
  note?: string;
}) {
  const a = ACTIONS[action];
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-28 flex-col rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-(--color-f1) bg-(--color-f1)/15"
          : "border-white/15 bg-white/5 hover:border-white/35"
      }`}
    >
      <span className="poster text-sm">{a.label}</span>
      {note && <span className="text-[10px] font-bold text-yellow-400">{note}</span>}
      <span className="mt-1 text-xs leading-snug text-white/65">{a.desc}</span>
    </button>
  );
}

export default function BoardGame({ board }: { board: Board }) {
  const [state, setState] = useState<GameState | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  /** ผลเทิร์นที่คำนวณไว้แล้ว รอให้ไพ่พลิกจบก่อนค่อยใช้จริง */
  const [rolling, setRolling] = useState<{ next: GameState; settled: boolean } | null>(null);
  /** ไพ่เร่งที่โชว์ระหว่างพลิก (ลำดับใน SPEED_CARDS) */
  const [face, setFace] = useState<number | null>(null);
  const [tilt, setTilt] = useState(0);
  /** แผนอากาศของเรซนี้ — เซิร์ฟเวอร์ได้ null (ยังไม่สุ่ม) ฝั่ง client สุ่มหลัง hydrate */
  const plan = useSyncExternalStore(subscribePlan, getPlan, getServerPlan);
  /** ยางสำรองที่จะเปลี่ยนไปใช้เมื่อเล่นการ์ดเข้าพิท (ลำดับใน me.tyres) */
  const [pitTo, setPitTo] = useState(1);
  const [mode, setMode] = useState<Mode>("push");
  const [sky, setSky] = useState<SkyShift>("earlier");
  /** สลับยางด่วน (ลำดับยางสำรอง) ในรอบที่อากาศพลิก */
  const [swap, setSwap] = useState<number | null>(null);

  useEffect(() => {
    if (!rolling) return;
    if (rolling.settled) {
      // หยุดที่ค่าจริงแป๊บหนึ่งให้เห็นผล แล้วค่อยเดินรถ
      const t = setTimeout(() => {
        setState(rolling.next);
        setRolling(null);
      }, 650);
      return () => clearTimeout(t);
    }
    const tick = setInterval(() => {
      setFace(Math.floor(Math.random() * SPEED_CARDS.length));
      setTilt((Math.random() - 0.5) * 70);
    }, 90);
    const stop = setTimeout(() => {
      setFace(rolling.next.lastTurn?.card ?? 0);
      setTilt(0);
      setRolling({ next: rolling.next, settled: true });
    }, 850);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [rolling]);

  if (!state) {
    return (
      <div className="space-y-4">
        {plan ? (
          <TyreSetup
            plan={plan}
            onDone={(tyres) =>
              setState(newGame(SEATS.map((s) => s.name), TOTAL, tyres, plan, Math.random))
            }
          />
        ) : (
          <p className="card p-4 text-center text-sm text-white/60">กำลังเตรียมพยากรณ์อากาศ…</p>
        )}
        <Rules />
      </div>
    );
  }

  const me = activePlayer(state);
  const seat = SEATS[me.id];
  const worn = isWorn(me);
  /** ยางพังหรือเบรกร้อน = เทิร์นนี้ขับคุมเท่านั้น */
  const forced = mustCruise(me);
  const over = state.winner !== null;
  const log = state.lastTurn;
  /** โหมดจริง: ยางพังหรือเข้าพิทบังคับขับคุม */
  const effMode: Mode = forced || action === "pit" ? "cruise" : mode;
  const weather = weatherNow(state);
  const swapSpots = me.tyres.map((_, i) => canSwap(state, me, i));
  const canSwapNow = swapSpots.some(Boolean);

  /** ในมือ + การ์ดเข้าพิทฉุกเฉินเมื่อยางพังและไม่มีการ์ดพิท (ไม่ต้องใช้การ์ด) */
  const hand: { card: Action; emergency: boolean }[] = me.hand.map((card) => ({
    card,
    emergency: false,
  }));
  if (worn && me.tyres.length > 1 && !me.hand.includes("pit")) {
    hand.push({ card: "pit", emergency: true });
  }

  function pickAction(next: Action | null) {
    setAction(next);
    // เข้าพิทกับสลับยางด่วนใช้ด้วยกันไม่ได้
    if (next === "pit") setSwap(null);
  }

  function pickMode(next: Mode) {
    setMode(next);
    // การ์ดที่ใช้ได้เฉพาะตอนเร่ง ต้องถอดออกเมื่อสลับไปขับคุม
    if (next === "cruise" && (action === "boost" || action === "save" || action === "reroll")) {
      setAction(null);
    }
  }

  function clickTyre(i: number) {
    if (i < 1) return;
    if (action === "pit") setPitTo(i);
    else if (swapSpots[i]) setSwap((cur) => (cur === i ? null : i));
  }

  function roll() {
    if (rolling || !state) return;
    const next = playTurn(state, { mode, action, pitTo, sky, swap }, Math.random);
    if (next === state) return; // ไม่ถูกกติกา (ปุ่มควรกันไว้แล้ว)
    setAction(null);
    setPitTo(1);
    setSwap(null);
    setSky("earlier");
    const calm =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // ขับคุมไม่พลิกไพ่ — ไม่ต้องรอแอนิเมชัน
    if (calm || next.lastTurn?.card == null) {
      setState(next);
    } else {
      setRolling({ next, settled: false });
    }
  }

  function restart() {
    setState(null);
    resetPlan();
    setAction(null);
    setPitTo(1);
    setSwap(null);
    setSky("earlier");
    setMode("push");
    setFace(null);
  }

  const shownCard = rolling ? face : (state.lastTurn?.card ?? null);

  return (
    <div className="space-y-4">
      <BoardView board={board} state={state} />

      <section className="grid grid-cols-2 gap-3" aria-label="อันดับ">
        {standings(state).map((p, rank) => (
          <div key={p.id} className="card flex items-center gap-3 p-3">
            <span
              className="poster flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
              style={{ background: SEATS[p.id].color, color: SEATS[p.id].ink }}
              aria-hidden
            >
              {p.id + 1}
            </span>
            <div className="min-w-0 text-xs">
              <p className="truncate font-bold text-white">
                P{rank + 1} · {p.name}
              </p>
              <p className="tabular-nums text-white/60">
                รอบ {lapOf(p.progress)}/{LAPS} · ช่อง {p.progress}/{TOTAL}
              </p>
              <p className="tabular-nums text-white/60">
                ยาง{TYRES[p.tyres[0]].label} {p.life}/{TYRES[p.tyres[0]].life}
              </p>
            </div>
          </div>
        ))}
      </section>

      {!over && (
        <div className="card p-3">
          <ForecastStrip plan={state} round={state.round} />
        </div>
      )}

      {state.event && !over && (
        <p role="status" className="card-poster rounded-xl border border-(--color-f1)/40 px-4 py-3 text-sm">
          <span className="poster text-(--color-f1-text)">{EVENTS[state.event].label}</span>{" "}
          <span className="text-white/75">{EVENTS[state.event].desc}</span>
        </p>
      )}

      {state.yellow && !over && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-4 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" aria-hidden />
          <span className="text-white/80">
            <span className="poster text-yellow-400">ธงเหลือง</span> รอบหน้ามีโอกาสราว{" "}
            {Math.round(YELLOW_TO_SC * 100)}% เป็นเซฟตี้คาร์ — ถ้าเกิดขึ้นเข้าพิทฟรี
            แต่ถ้าพลาดช่วงนั้นต้องเสียเวลา {PIT_COST} ช่องตามปกติ
          </span>
        </p>
      )}

      {over ? (
        <section className="card-poster space-y-3 rounded-2xl border border-white/10 p-5 text-center" role="status">
          <Flag className="mx-auto h-6 w-6 text-(--color-f1-text)" aria-hidden />
          <p className="poster text-2xl">{state.players[state.winner!].name} ชนะ!</p>
          <p className="text-sm text-white/60">แข่งครบ {state.round} รอบเทิร์น</p>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-full bg-(--color-f1) px-5 py-2.5 text-sm font-bold text-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> เล่นอีกรอบ
          </button>
        </section>
      ) : (
        <section className="card space-y-4 p-4" aria-label="เทิร์นของคุณ">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{ background: seat.color, color: seat.ink }}
            >
              ตา {me.name}
            </span>
            <span className="tabular-nums text-white/55">
              รอบเทิร์นที่ {state.round} · เดินที่ {state.turn + 1}/{state.order.length}
            </span>
            {me.debuff > 0 && (
              <span className="font-medium text-yellow-400">โดนขวางทาง −{me.debuff} ช่อง</span>
            )}
          </p>
          <p className="text-xs text-white/55">
            ลำดับเดินรอบนี้ (คนนำเดินก่อน):{" "}
            {state.order.map((id) => `P${standings(state).findIndex((p) => p.id === id) + 1}`).join(" → ")}
          </p>

          {worn && (
            <p
              role="status"
              className="rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-3 py-2 text-sm text-white/85"
            >
              <span className="poster text-yellow-400">ยางพัง!</span> ขับได้แค่ {WORN_MOVE} ช่อง ใช้การ์ดไม่ได้
              นอกจากเข้าพิท (ไม่ต้องมีการ์ด)
            </p>
          )}

          {me.limp && !worn && (
            <p
              role="status"
              className="rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-3 py-2 text-sm text-white/85"
            >
              <span className="poster text-yellow-400">เบรกร้อน!</span> เทิร์นนี้ขับคุมเท่านั้น
            </p>
          )}

          {canSwapNow && (
            <p
              role="status"
              className="rounded-xl border border-sky-400/50 bg-sky-400/10 px-3 py-2 text-sm text-white/85"
            >
              <span className="poster text-sky-300">อากาศเปลี่ยน!</span> ยางสำรองที่เหมาะกับสภาพใหม่
              สลับด่วนได้ฟรี 1 ครั้งโดยไม่ต้องเข้าพิท (ยางเดิมถูกทิ้ง) — แตะยางสำรองที่มีป้าย “สลับด่วน”
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">ยางของคุณ (ใบที่ใช้อยู่ + สำรอง)</p>
            <div className="grid grid-cols-4 gap-2">
              {me.tyres.map((t, i) => {
                const fx = weatherEffect(weather, t);
                const picking = action === "pit" && i >= 1;
                const swapping = !picking && swapSpots[i];
                return (
                  <TyreCard
                    key={i}
                    tyre={t}
                    active={i === 0 || (picking && pitTo === i) || (swapping && swap === i)}
                    label={
                      i === 0
                        ? "ใช้อยู่"
                        : picking
                          ? `เปลี่ยนเป็น ${i}`
                          : swapping
                            ? "สลับด่วน"
                            : `สำรอง ${i}`
                    }
                    life={i === 0 ? me.life : undefined}
                    hint={
                      fx.spin > 0
                        ? { text: `เร่งเสี่ยงหมุน ${Math.round(fx.spin * 100)}%`, good: false }
                        : fx.move === 0
                          ? null
                          : { text: `${fx.move > 0 ? "+" : ""}${fx.move} ตอนเร่ง`, good: fx.move > 0 }
                    }
                    onClick={picking || swapping ? () => clickTyre(i) : undefined}
                  />
                );
              })}
            </div>
            {action === "pit" && (
              <p className="mt-2 text-xs text-white/65">
                แตะยางสำรองที่จะเปลี่ยนไปใช้ ·{" "}
                {pitCost(state) === 0 ? (
                  <span className="font-bold text-green-400">เซฟตี้คาร์: เข้าพิทฟรี</span>
                ) : (
                  <span>เสียเวลา {PIT_COST} ช่อง</span>
                )}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">เลือกจังหวะเทิร์นนี้</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={effMode === "cruise"}
                disabled={forced || action === "pit"}
                onClick={() => pickMode("cruise")}
                className={`rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  effMode === "cruise"
                    ? "border-(--color-f1) bg-(--color-f1)/15"
                    : "border-white/15 bg-white/5 hover:border-white/35"
                }`}
              >
                <span className="poster flex items-center gap-1.5 text-sm">
                  <Gauge className="h-4 w-4" aria-hidden /> ขับคุม
                </span>
                <span className="mt-1 block text-xs leading-snug text-white/65">
                  เดิน {worn ? WORN_MOVE : CRUISE_MOVE} ช่องคงที่ ไม่พลิกไพ่ ยางไม่สึก
                </span>
              </button>
              <button
                type="button"
                aria-pressed={effMode === "push"}
                disabled={forced || action === "pit"}
                onClick={() => pickMode("push")}
                className={`rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  effMode === "push"
                    ? "border-(--color-f1) bg-(--color-f1)/15"
                    : "border-white/15 bg-white/5 hover:border-white/35"
                }`}
              >
                <span className="poster flex items-center gap-1.5 text-sm">
                  <Zap className="h-4 w-4" aria-hidden /> เร่ง
                </span>
                <span className="mt-1 block text-xs leading-snug text-white/65">
                  พลิกไพ่เร่ง ค่าตามแถวยาง ยางสึกถ้าไพ่มีสัญลักษณ์สึก (ฝนไม่สึกแต่ไพ่หยดน้ำเสี่ยงหมุน)
                </span>
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">
              การ์ดในมือ — เลือกเล่นได้ 1 ใบ (ไม่เล่นก็ได้) · สำรับเหลือ {me.deck.length} ใบ
            </p>
            <div className="grid grid-cols-3 gap-2">
              {hand.map(({ card, emergency }, i) => (
                <ActionCard
                  key={`${card}-${i}`}
                  action={card}
                  note={emergency ? "ฉุกเฉิน ไม่ใช้การ์ด" : undefined}
                  selected={action === card && hand.findIndex((h) => h.card === card) === i}
                  disabled={!canPlay(state, me, card, forced ? "cruise" : mode)}
                  onClick={() => pickAction(action === card ? null : card)}
                />
              ))}
            </div>
            {action === "sky" && (
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="ทิศทางการปรับฟ้า">
                {(
                  [
                    ["earlier", "ลัดฟ้า", "อากาศถัดไปมาเร็วขึ้น 1 รอบ"],
                    ["later", "ยืดฟ้า", "อากาศตอนนี้อยู่ต่ออีก 1 รอบ"],
                  ] as const
                ).map(([k, label, desc]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={sky === k}
                    onClick={() => setSky(k)}
                    className={`rounded-xl border-2 p-2.5 text-left text-xs transition-colors ${
                      sky === k
                        ? "border-sky-400 bg-sky-400/15"
                        : "border-white/15 bg-white/5 hover:border-white/35"
                    }`}
                  >
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="text-white/65">{desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <SpeedCardView id={shownCard} col={TYRES[me.tyres[0]].col} tilt={rolling ? tilt : 0} />
            <button
              type="button"
              onClick={roll}
              disabled={rolling !== null}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {effMode === "push" ? (
                <Zap className="h-5 w-5 shrink-0" aria-hidden />
              ) : (
                <Gauge className="h-5 w-5 shrink-0" aria-hidden />
              )}
              {rolling
                ? "กำลังพลิกไพ่…"
                : effMode === "push"
                  ? action
                    ? `เล่น “${ACTIONS[action].label}” แล้วเร่ง พลิกไพ่`
                    : "เร่ง พลิกไพ่"
                  : action
                    ? `เล่น “${ACTIONS[action].label}” แล้วขับ`
                    : worn
                      ? "ขับต่อ (ยางพัง)"
                      : "ขับคุม"}
            </button>
          </div>
        </section>
      )}

      {log && (
        <p className="text-center text-sm text-white/65" aria-live="polite">
          {state.players[log.player].name}{" "}
          {log.card === null ? (
            log.worn ? "ขับต่อด้วยยางพัง" : log.mode === "cruise" ? "ขับคุม" : "ขับ"
          ) : (
            <>
              พลิกไพ่เร่ง{log.cardEvent ? ` · ${CARD_EVENTS[log.cardEvent].label}: ${CARD_EVENTS[log.cardEvent].desc}` : ""}
            </>
          )}
          {log.action ? ` · ใช้ “${ACTIONS[log.action].label}”` : ""} · เดิน{" "}
          <span className="font-bold tabular-nums text-white">{log.moved}</span> ช่อง
          {log.spun && <span className="font-bold text-yellow-400"> · หมุนในฝน! ธงเหลืองรอบหน้า</span>}
        </p>
      )}

      <Rules />
    </div>
  );
}

function Rules() {
  return (
    <details className="card p-4 text-sm text-white/75">
      <summary className="cursor-pointer font-bold text-white">วิธีเล่น (1 นาที)</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>
          ใครข้ามเส้นชัยก่อนชนะทันที — ครบ {LAPS} รอบ ({TOTAL} ช่อง) แต่ละรอบเทิร์นคนนำเดินก่อน คนตามหลังเดินทีหลัง
        </li>
        <li>
          ก่อนแข่ง ดูพยากรณ์อากาศแล้วเลือกการ์ดยาง {TYRE_SLOTS} ใบ ใบแรกใช้ออกตัว อีก {TYRE_SLOTS - 1} ใบเป็นสำรองไว้เข้าพิท
        </li>
        <li>
          ทุกเทิร์นเลือกจังหวะ: <b>ขับคุม</b> เดิน {CRUISE_MOVE} ช่องคงที่ ไม่พลิกไพ่ ยางไม่สึก หรือ <b>เร่ง</b>{" "}
          พลิกไพ่เร่งใบบนสุดของกองคุณ ใช้ค่าตามแถวยาง (นิ่ม/กลาง/แข็ง) ยางนิ่มแรงแต่หมดเร็ว ยางแข็งช้าแต่ทน
          ไพ่มี “สึก” (ยางเสื่อม 1) หยดน้ำ (เสี่ยงหมุนในฝน) และบางใบมีไอคอนทีม/เหตุการณ์
        </li>
        <li>
          ยางสึกถึง 0 = <b>ยางพัง</b>: ขับได้แค่ {WORN_MOVE} ช่อง ใช้การ์ดไม่ได้ ต้องเข้าพิทเท่านั้น
          (เข้าพิทฉุกเฉินได้โดยไม่ต้องมีการ์ด เสียเวลา {PIT_COST} ช่อง)
        </li>
        <li>
          ในมือมีการ์ด action 3 ใบ เทิร์นละเล่นได้ 1 ใบ (ไม่เล่นก็ได้) แล้วจั่วเติมให้ครบ — การ์ดบางใบใช้ได้เฉพาะตอนเร่ง
          การ์ด “ปรับฟ้า” ขยับตารางอากาศ: ลัดฟ้าให้อากาศถัดไปมาเร็วขึ้น หรือยืดฟ้าให้อากาศตอนนี้อยู่ต่อ
        </li>
        <li>
          ฝนตกตามพยากรณ์ (2 รอบแรกแม่นเสมอ ไกลกว่านั้นเส้นประอาจคลาดเคลื่อน) ในฝนยางไม่สึก
          แต่ถ้าเร่งด้วยยางที่ไม่เหมาะมีโอกาสหมุน — หมุนแล้วเดินแค่ 1 ช่องและรอบหน้าขึ้นธงเหลือง
          ยางอินเตอร์เหมาะกับฝนเบา เว็ทเหมาะกับฝนหนัก ส่วนขับคุมปลอดภัยเสมอ
        </li>
        <li>
          รอบที่อากาศพลิกระหว่างแห้งกับฝน ทุกทีมสลับเป็นยางสำรองที่เหมาะกับอากาศใหม่ได้ฟรี 1 ครั้งโดยไม่ต้องเข้าพิท
        </li>
        <li>
          เห็นธงเหลืองแปลว่ารอบหน้าอาจเกิดเซฟตี้คาร์: ช่องว่างจากผู้นำลดครึ่ง ไพ่เร่งมีค่าสูงสุด 5
          และเข้าพิทฟรีเฉพาะรอบนั้น ถ้ารอไว้แล้วพลาดต้องเสียเวลาเต็ม
        </li>
        <li>บางครั้งเกิดธงแดง: ทุกคนได้ยางที่ใช้อยู่กลับมาใหม่ และคันท้ายสุดได้ +3 ช่อง</li>
      </ol>
    </details>
  );
}
