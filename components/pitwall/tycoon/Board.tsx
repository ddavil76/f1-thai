"use client";

import type { ReactNode } from "react";
import { Building2, CircleDot, CloudRain, Cog, Crown, Flag, Gavel, Radio, Receipt, Siren, Truck, Tv, Wrench } from "lucide-react";
import { BOARD, cellOf, GROUPS, isOwnable, LEVEL_NAME, MAX_LEVEL } from "@/lib/pitwall/tycoon/board";
import { money, type Game, type LogLine } from "@/lib/pitwall/tycoon/game";

export const ME = 0;
export const tokenLabel = (k: number) => (k === ME ? "★" : String(k));

const ICON: Record<string, ReactNode> = {
  start: <Flag className="h-5 w-5" />,
  jail: <Gavel className="h-5 w-5" />,
  pit: <Wrench className="h-5 w-5" />,
  gojail: <Siren className="h-5 w-5" />,
  radio: <Radio className="h-4 w-4" />,
  weather: <CloudRain className="h-4 w-4" />,
  tax: <Receipt className="h-4 w-4" />,
};
const BIZ_ICON: Record<string, ReactNode> = {
  ซัพพลายเออร์ยาง: <CircleDot className="h-4 w-4" />,
  ผู้ผลิตเครื่องยนต์: <Cog className="h-4 w-4" />,
  สถานีถ่ายทอดสด: <Tv className="h-4 w-4" />,
  ทีมโลจิสติกส์: <Truck className="h-4 w-4" />,
};

/** กระดาน 9×9: ช่องรอบนอก · หมากเดินทับเป็นเลเยอร์ (เลื่อนนุ่ม + กระโดดทีละช่อง) · กลางกระดานมีลูกเต๋าและข่าวล่าสุด */
export function Board({
  game, shown, stepMs, roll, flash, onCell,
}: {
  game: Game;
  shown: number[];
  stepMs: number;
  roll: { n: number; dice: [number, number] | null };
  flash: { sq: number; id: number } | null;
  onCell: (i: number) => void;
}) {
  const cur = game.players[game.turn];
  const last = [...game.log].reverse().find((l) => l.tone) ?? game.log[game.log.length - 1];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px] select-none">
      <div className="grid h-full w-full gap-[2px] rounded-2xl bg-[#08080A] p-[2px]" style={{ gridTemplateColumns: "repeat(9, minmax(0, 1fr))", gridTemplateRows: "repeat(9, minmax(0, 1fr))" }}>
        {BOARD.map((_, i) => (
          <Cell key={`${i}-${flash?.sq === i ? flash.id : 0}`} i={i} game={game} flash={flash?.sq === i ? flash.id : null} onClick={() => onCell(i)} />
        ))}
        <div className="relative flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[#121216] p-2 text-center sm:gap-2.5" style={{ gridColumn: "2 / 9", gridRow: "2 / 9" }}>
          <span className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "repeating-conic-gradient(#fff 0 25%, transparent 0 50%)", backgroundSize: "28px 28px" }} aria-hidden />
          <RaceWeek game={game} />
          <p className="poster text-base leading-none text-white sm:text-3xl">
            เจ้าพ่อ<span className="text-(--color-f1)">พิทเลน</span>
          </p>
          <div className="flex gap-3 sm:gap-5" style={{ perspective: 600 }} aria-live="polite" aria-label={roll.dice ? `ลูกเต๋า ${roll.dice[0]} และ ${roll.dice[1]}` : "ยังไม่ทอย"}>
            <Die3D value={roll.dice?.[0] ?? 1} n={roll.n} d={0} idle={!roll.dice} />
            <Die3D value={roll.dice?.[1] ?? 1} n={roll.n} d={1} idle={!roll.dice} />
          </div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold sm:text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: cur.color }} aria-hidden />
            {game.phase.k === "over" ? "จบฤดูกาล" : game.turn === ME ? "ตาของคุณ" : `ตาของ ${cur.name}`}
          </p>
          {last && <Toast key={last.id} line={last} />}
        </div>
      </div>
      <Tokens game={game} shown={shown} stepMs={stepMs} />
    </div>
  );
}

function RaceWeek({ game }: { game: Game }) {
  const now = GROUPS[game.spot];
  const nx = GROUPS[game.next];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 text-[8px] font-bold leading-none sm:text-[11px]">
      <span className="rounded-full bg-(--color-f1) px-1.5 py-0.5 text-white sm:px-2 sm:py-1">🏁 RACE WEEK</span>
      <span className="rounded-full px-1.5 py-0.5 text-[#08080A] sm:px-2 sm:py-1" style={{ background: now.color }}>
        {now.name} ×2
      </span>
      <span className="text-white/60">ถัดไป</span>
      <span className="rounded-full border px-1.5 py-0.5 sm:px-2 sm:py-1" style={{ borderColor: nx.color, color: nx.color }}>
        {nx.name}
      </span>
    </div>
  );
}

function Toast({ line }: { line: LogLine }) {
  return (
    <p
      className={`bg-pop max-w-[95%] rounded-lg px-2 py-1 text-[9px] font-bold leading-snug sm:px-3 sm:py-1.5 sm:text-[13px] ${
        line.tone === "good" ? "bg-[#22c55e]/15 text-[#86efac]" : line.tone === "bad" ? "bg-[#ef4444]/15 text-[#fca5a5]" : "bg-white/5 text-white/80"
      }`}
    >
      {line.text}
    </p>
  );
}

function Cell({ i, game, flash, onClick }: { i: number; game: Game; flash: number | null; onClick: () => void }) {
  const sq = BOARD[i];
  const { row, col } = cellOf(i);
  const owner = game.owner[i];
  const lv = game.level[i];
  const corner = i % 8 === 0;
  const color = sq.kind === "circuit" ? GROUPS[sq.group].color : null;
  const spot = sq.kind === "circuit" && sq.group === game.spot;
  const next = sq.kind === "circuit" && sq.group === game.next;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ gridRow: row, gridColumn: col, boxShadow: spot ? `inset 0 0 0 2px ${color}` : undefined }}
      aria-label={`${sq.name}${owner !== null ? ` เจ้าของ ${game.players[owner].name}` : isOwnable(sq) ? ` ราคา ${money(sq.price)}` : ""}${spot ? " Race Week ค่าตั๋วสองเท่า" : ""}`}
      className={`relative flex min-w-0 flex-col items-center overflow-hidden rounded-[5px] text-center leading-none ${corner ? "justify-center bg-[#1F1F24]" : "bg-[#17171b]"} ${flash !== null ? "tc-flash" : ""}`}
    >
      {color && <span className="h-[18%] w-full flex-none" style={{ background: color }} aria-hidden />}
      {spot && <span className="absolute right-0 top-0 rounded-bl-[4px] bg-(--color-f1) px-[2px] text-[6px] font-black text-white sm:text-[8px]">×2</span>}
      {next && <span className="absolute right-[2px] top-[2px] h-1.5 w-1.5 rounded-full border border-white/80" style={{ background: color ?? undefined }} aria-hidden />}
      <span className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 px-[1px] pb-[22%] ${corner ? "text-white" : "text-white/85"}`}>
        {ICON[sq.kind] && <span className={sq.kind === "gojail" ? "text-(--color-f1-text)" : "text-white/70"}>{ICON[sq.kind]}</span>}
        {sq.kind === "biz" && <span className="text-white/70">{BIZ_ICON[sq.name] ?? <Building2 className="h-4 w-4" />}</span>}
        <span className={`line-clamp-2 break-words ${corner ? "text-[7px] font-bold sm:text-[10px]" : "text-[6.5px] sm:text-[9px]"}`}>{sq.name}</span>
        {isOwnable(sq) && owner === null && <span className="text-[6.5px] text-white/50 tabular-nums sm:text-[8px]">{money(sq.price)}</span>}
        {lv > 0 && (
          <span className="flex gap-[1px]" aria-label={LEVEL_NAME[lv]}>
            {lv === MAX_LEVEL ? <Crown className="h-2.5 w-2.5 text-[#facc15]" /> : Array.from({ length: lv }, (_, k) => <span key={k} className="h-1 w-1 rounded-[1px] bg-white" />)}
          </span>
        )}
      </span>
      {owner !== null && <span className="absolute inset-x-0 bottom-0 h-[4px]" style={{ background: game.players[owner].color }} aria-hidden />}
    </button>
  );
}

/** หมากทุกตัวเป็นเลเยอร์ทับกระดาน: เลื่อนตำแหน่งนุ่ม ๆ และกระโดดทุกช่องที่ผ่าน */
function Tokens({ game, shown, stepMs }: { game: Game; shown: number[]; stepMs: number }) {
  const at = (k: number) => {
    const { row, col } = cellOf(shown[k]);
    const same = game.players.map((p, j) => j).filter((j) => !game.players[j].out && shown[j] === shown[k]);
    const idx = same.indexOf(k);
    const off = (idx - (same.length - 1) / 2) * 3.4;
    return { left: `${((col - 0.5) / 9) * 100 + off}%`, top: `${((row - 0.5) / 9) * 100 + 2.2}%` };
  };
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {game.players.map((p, k) =>
        p.out ? null : (
          <div
            key={k}
            className="absolute"
            style={{ ...at(k), width: "5.6%", aspectRatio: "1", transform: "translate(-50%, -50%)", transition: `left ${stepMs}ms ease-in-out, top ${stepMs}ms ease-in-out`, zIndex: game.turn === k ? 20 : 10 }}
          >
            <span
              key={shown[k]}
              className="tc-hop flex h-full w-full items-center justify-center rounded-full border-2 text-[7px] font-black shadow-[0_3px_6px_rgb(0_0_0/0.6)] sm:text-[11px]"
              style={{ background: p.color, color: p.ink, borderColor: game.turn === k ? "#fff" : "rgb(0 0 0 / 0.6)", ["--hop" as string]: `${stepMs}ms` }}
            >
              {tokenLabel(k)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/* ---------------- ลูกเต๋า 3 มิติ ---------------- */

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** หน้าลูกเต๋า: ตำแหน่งบนลูกบาศก์ · การหมุนลูกบาศก์ให้หน้านั้นหันมาด้านหน้า */
const FACE: Record<number, { face: string; rx: number; ry: number }> = {
  1: { face: "rotateY(0deg)", rx: 0, ry: 0 },
  6: { face: "rotateY(180deg)", rx: 0, ry: 180 },
  3: { face: "rotateY(90deg)", rx: 0, ry: -90 },
  4: { face: "rotateY(-90deg)", rx: 0, ry: 90 },
  5: { face: "rotateX(90deg)", rx: -90, ry: 0 },
  2: { face: "rotateX(-90deg)", rx: 90, ry: 0 },
};

function Die3D({ value, n, d, idle }: { value: number; n: number; d: number; idle: boolean }) {
  const f = FACE[value] ?? FACE[1];
  // หมุนเพิ่มทีละหลายรอบทุกครั้งที่ทอย (เลขเพิ่มตลอด = หมุนไปข้างหน้าเสมอ)
  const rx = f.rx + 360 * (n * 2 + d);
  const ry = f.ry + 360 * (n * 2 + (1 - d));
  return (
    <span key={n} className={`block h-10 w-10 [--half:1.25rem] sm:h-14 sm:w-14 sm:[--half:1.75rem] ${n > 0 ? "tc-toss" : ""} ${idle ? "opacity-40" : ""}`}>
      <span className="die3d relative block h-full w-full" style={{ transform: `rotateX(${rx}deg) rotateY(${ry}deg)` }}>
        {[1, 2, 3, 4, 5, 6].map((v) => (
          <span
            key={v}
            className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-[2px] rounded-[22%] border border-black/10 bg-white p-[18%] shadow-[inset_0_-3px_6px_rgb(0_0_0/0.18)]"
            style={{ transform: `${FACE[v].face} translateZ(var(--half))`, backfaceVisibility: "hidden" }}
          >
            {Array.from({ length: 9 }, (_, k) => (
              <span key={k} className={`rounded-full ${PIPS[v].includes(k) ? (v === 1 ? "bg-(--color-f1)" : "bg-[#08080A]") : ""}`} />
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
