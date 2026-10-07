"use client";

import { useState } from "react";
import { Dices, Flag, RotateCcw } from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import type { Board } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  EVENTS, STRATEGIES, TYRES, WORN_AT, canPlay, newGame, playTurn, standings,
  type GameState, type Strategy, type Tyre,
} from "@/lib/boardgame/engine";

const LAPS = 3;
const TOTAL = CELLS_PER_LAP * LAPS;

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

function Chip({
  active, disabled, onClick, children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-(--color-f1) bg-(--color-f1)/15 text-white"
          : "border-white/10 bg-white/5 text-white/70 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}

export default function BoardGame({ board }: { board: Board }) {
  const [state, setState] = useState<GameState>(() => newGame(SEATS.map((s) => s.name), TOTAL));
  const [tyre, setTyre] = useState<Tyre>("medium");
  const [strategy, setStrategy] = useState<Strategy | null>(null);

  const me = state.players[state.turn];
  const seat = SEATS[me.id];
  const worn = me.wear >= WORN_AT;
  const over = state.winner !== null;
  const log = state.lastTurn;

  function roll() {
    setState((s) => playTurn(s, tyre, strategy, Math.random));
    setStrategy(null);
  }

  function restart() {
    setState(newGame(SEATS.map((s) => s.name), TOTAL));
    setTyre("medium");
    setStrategy(null);
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
                รอบ {lapOf(p.progress)}/{LAPS} · ยางสึก {p.wear}/{WORN_AT}
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
          <p className="poster text-2xl">
            {state.players[state.winner!].name} ชนะ!
          </p>
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
            <span className="text-white/55 tabular-nums">รอบเทิร์นที่ {state.round}</span>
            {worn && <span className="font-medium text-yellow-400">ยางหมดสภาพ −2 ช่อง</span>}
          </p>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">1 · เลือกยาง</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYRES) as Tyre[]).map((t) => (
                <Chip key={t} active={tyre === t} onClick={() => setTyre(t)}>
                  <span className="block font-bold">{TYRES[t].label}</span>
                  <span className="block text-xs tabular-nums text-white/55">
                    +{TYRES[t].move} ช่อง · สึก +{TYRES[t].wear}
                  </span>
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">2 · การ์ดกลยุทธ์ (ไม่ใช้ก็ได้)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Chip active={strategy === null} onClick={() => setStrategy(null)}>
                <span className="block font-bold">ไม่ใช้</span>
                <span className="block text-xs text-white/55">เก็บการ์ดไว้</span>
              </Chip>
              {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
                <Chip
                  key={s}
                  active={strategy === s}
                  disabled={!canPlay(me, s)}
                  onClick={() => setStrategy(s)}
                >
                  <span className="block font-bold">
                    {STRATEGIES[s].label}{" "}
                    <span className="tabular-nums text-white/55">×{me.cards[s]}</span>
                  </span>
                  <span className="block text-xs text-white/55">{STRATEGIES[s].desc}</span>
                </Chip>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={roll}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white"
          >
            <Dices className="h-5 w-5" aria-hidden /> ทอยเต๋า
          </button>
        </section>
      )}

      {log && (
        <p className="text-center text-sm text-white/65" aria-live="polite">
          {state.players[log.player].name} ทอยได้{" "}
          <span className="tabular-nums font-bold text-white">{log.die}</span> · ยาง{TYRES[log.tyre].label}
          {log.strategy ? ` + ${STRATEGIES[log.strategy].label}` : ""} · เดิน{" "}
          <span className="tabular-nums font-bold text-white">{log.moved}</span> ช่อง
        </p>
      )}

      <details className="card p-4 text-sm text-white/75">
        <summary className="cursor-pointer font-bold text-white">วิธีเล่น (1 นาที)</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>
            ผลัดกันเล่นบนเครื่องเดียว ใครไปครบ {LAPS} รอบ ({TOTAL} ช่อง) ก่อนชนะ — จบเมื่อทุกคนเล่นครบรอบเทิร์น
          </li>
          <li>เลือกยาง 1 ใบ (นิ่มเดินไกลแต่สึกเร็ว) และจะใช้การ์ดกลยุทธ์หรือไม่ก็ได้ แล้วทอยเต๋า</li>
          <li>ก้าว = เต๋า + โบนัสยาง + โบนัสการ์ด ยางสึกถึง {WORN_AT} จะหมดสภาพ ก้าวลด 2 — เข้าพิทเปลี่ยนยางก่อนจะสาย</li>
          <li>ต้นแต่ละรอบเทิร์นอาจเกิดเซฟตี้คาร์ ฝนตก หรือธงแดง ช่วยให้คนที่ตามหลังกลับมาสู้ได้</li>
        </ol>
      </details>
    </div>
  );
}
