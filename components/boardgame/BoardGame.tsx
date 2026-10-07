"use client";

import { useState } from "react";
import { Dices, Flag, RotateCcw, X } from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import type { Board } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  ACTIONS, EVENTS, MAX_PER_COMPOUND, TYRES, TYRE_SLOTS, canPlay, newGame, playTurn,
  standings, validTyres,
  type Action, type GameState, type Tyre,
} from "@/lib/boardgame/engine";

const LAPS = 3;
const TOTAL = CELLS_PER_LAP * LAPS;
const COMPOUNDS = Object.keys(TYRES) as Tyre[];

/** ผู้เล่นสมมติ — ไม่ใช้ชื่อทีม/นักขับจริง สีแดงกับขาวให้ตัดกันบนพื้นดำ */
const SEATS = [
  { name: "เมเทียร์ เรซซิ่ง", color: "#E10600", ink: "#fff" },
  { name: "ไอซ์ไบรท์ เรซซิ่ง", color: "#DEDEDE", ink: "#08080A" },
] as const;

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
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === 0 ? r * 0.9 : r * 0.55}
            fill={i === 0 ? "#fff" : "#08080A"}
            stroke={i === 0 ? "#E10600" : "#5a5a64"}
            strokeWidth={i === 0 ? 0.8 : 0.4}
          />
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
              <circle r={r * 0.95} fill={seat.color} stroke="#08080A" strokeWidth={0.6} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={r * 1.1}
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

const TYRE_TONE: Record<Tyre, string> = {
  soft: "border-red-500/60",
  medium: "border-yellow-400/60",
  hard: "border-white/50",
};

/** การ์ดยาง — ใช้ทั้งตอนเลือกและตอนแสดงยางที่ใส่ไว้ */
function TyreCard({
  tyre, label, life, active = false, onClick, disabled,
}: {
  tyre: Tyre;
  label?: string;
  /** อายุที่เหลือ (ถ้าไม่ส่ง = แสดงอายุเต็ม) */
  life?: number;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const t = TYRES[tyre];
  const body = (
    <>
      {label && <span className="mb-1 block text-[10px] font-bold text-white/55">{label}</span>}
      <span className="block font-bold">ยาง{t.label}</span>
      <span className="block text-xs tabular-nums text-white/60">
        +{t.move} ช่อง · อายุ {life ?? t.life}/{t.life}
      </span>
    </>
  );
  const cls = `rounded-xl border-2 bg-white/5 px-3 py-2 text-left text-sm ${TYRE_TONE[tyre]} ${
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
function TyreSetup({ onDone }: { onDone: (tyres: Tyre[][]) => void }) {
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
      <p className="text-xs text-white/55">ยางแต่ละชนิดเลือกได้ไม่เกิน {MAX_PER_COMPOUND} ใบ</p>

      <div>
        <p className="mb-2 text-xs font-medium text-white/55">ยางที่ใส่ไว้ (ใบแรกใช้ออกตัว ที่เหลือเป็นยางสำรอง)</p>
        <div className="grid grid-cols-3 gap-2">
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
                className="flex min-h-[4.25rem] items-center justify-center rounded-xl border-2 border-dashed border-white/15 text-xs text-white/40"
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
  action, selected, disabled, onClick,
}: {
  action: Action;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
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
      <span className="mt-1 text-xs leading-snug text-white/65">{a.desc}</span>
    </button>
  );
}

export default function BoardGame({ board }: { board: Board }) {
  const [state, setState] = useState<GameState | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  if (!state) {
    return (
      <div className="space-y-4">
        <TyreSetup
          onDone={(tyres) => setState(newGame(SEATS.map((s) => s.name), TOTAL, tyres, Math.random))}
        />
        <Rules />
      </div>
    );
  }

  const me = state.players[state.turn];
  const seat = SEATS[me.id];
  const worn = me.life <= 0;
  const over = state.winner !== null;
  const log = state.lastTurn;

  function roll() {
    setState((s) => (s ? playTurn(s, action, Math.random) : s));
    setAction(null);
  }

  function restart() {
    setState(null);
    setAction(null);
  }

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
                รอบ {lapOf(p.progress)}/{LAPS} · ยาง{TYRES[p.tyres[0]].label} {p.life}/{TYRES[p.tyres[0]].life}
              </p>
            </div>
          </div>
        ))}
      </section>

      {state.event && !over && (
        <p role="status" className="card-poster rounded-xl border border-(--color-f1)/40 px-4 py-3 text-sm">
          <span className="poster text-(--color-f1-text)">{EVENTS[state.event].label}</span>{" "}
          <span className="text-white/75">{EVENTS[state.event].desc}</span>
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
            <span className="tabular-nums text-white/55">รอบเทิร์นที่ {state.round}</span>
            {worn && <span className="font-medium text-yellow-400">ยางหมดอายุ −2 ช่อง</span>}
            {me.debuff > 0 && (
              <span className="font-medium text-yellow-400">โดนขวางทาง −{me.debuff} ช่อง</span>
            )}
          </p>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">ยางของคุณ (ใบที่ใช้อยู่ + สำรอง)</p>
            <div className="grid grid-cols-3 gap-2">
              {me.tyres.map((t, i) => (
                <TyreCard
                  key={i}
                  tyre={t}
                  active={i === 0}
                  label={i === 0 ? "ใช้อยู่" : `สำรอง ${i}`}
                  life={i === 0 ? me.life : undefined}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">
              การ์ดในมือ — เลือกเล่นได้ 1 ใบ (ไม่เล่นก็ได้) · สำรับเหลือ {me.deck.length} ใบ
            </p>
            <div className="grid grid-cols-3 gap-2">
              {me.hand.map((c, i) => (
                <ActionCard
                  key={`${c}-${i}`}
                  action={c}
                  selected={action === c && me.hand.indexOf(c) === i}
                  disabled={!canPlay(me, c)}
                  onClick={() => setAction((cur) => (cur === c ? null : c))}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={roll}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white"
          >
            <Dices className="h-5 w-5" aria-hidden />
            {action ? `เล่น “${ACTIONS[action].label}” แล้วทอยเต๋า` : "ไม่เล่นการ์ด ทอยเต๋าเลย"}
          </button>
        </section>
      )}

      {log && (
        <p className="text-center text-sm text-white/65" aria-live="polite">
          {state.players[log.player].name} ทอยได้{" "}
          <span className="font-bold tabular-nums text-white">{log.die}</span>
          {log.action ? ` · ใช้ “${ACTIONS[log.action].label}”` : ""} · เดิน{" "}
          <span className="font-bold tabular-nums text-white">{log.moved}</span> ช่อง
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
          ใครพารถไปครบ {LAPS} รอบ ({TOTAL} ช่อง) ก่อนชนะ — จบเมื่อทุกคนเล่นครบรอบเทิร์นนั้น
        </li>
        <li>
          ก่อนแข่ง เลือกการ์ดยาง {TYRE_SLOTS} ใบ ใบแรกใช้ออกตัว อีก 2 ใบเป็นสำรองไว้เข้าพิท
          ยางนิ่มเดินไกลแต่หมดอายุเร็ว ยางแข็งเดินช้าแต่ทน
        </li>
        <li>
          ในมือมีการ์ด action 3 ใบ แต่ละเทิร์นเล่นได้ 1 ใบ (หรือไม่เล่นก็ได้) แล้วทอยเต๋า แล้วจั่วเติมให้ครบ 3 ใบ
        </li>
        <li>
          ก้าว = เต๋า + โบนัสยาง + โบนัสการ์ด ยางหมดอายุแล้วก้าวลด 2 ช่อง — ใช้การ์ดเข้าพิทเพื่อเปลี่ยนยางสำรอง
        </li>
        <li>ต้นแต่ละรอบเทิร์นอาจเกิดเซฟตี้คาร์ ฝนตก หรือธงแดง ช่วยให้คนตามหลังกลับมาสู้ได้</li>
      </ol>
    </details>
  );
}
