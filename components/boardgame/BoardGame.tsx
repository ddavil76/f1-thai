"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleHelp, CloudRain, Flag, Info, List, RotateCcw, X, Zap } from "lucide-react";
import Car from "@/components/boardgame/Car";
import Qualifying from "@/components/boardgame/Qualifying";
import TrackView from "@/components/boardgame/TrackView";
import LaunchScreen from "@/components/boardgame/Launch";
import {
  ActionCard3D, Coin, DieFace, HandCard, Meter, MoveCard3D, PitwallChip, SimpleCard,
} from "@/components/boardgame/Cards";
import { COMPOUND_COLOR, NAMES_NOTE, TEAMS, WET_COLOR, look, tyreOf } from "@/components/boardgame/look";
import { BACK_TEXT, helpText, type HelpKey } from "@/components/boardgame/help";
import type { Board } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  ACTION_INFO, ACTION_TEXT_OURS, BACK_CELLS, BASE_MOVE, COMPOUNDS, ERS_BASE_CHARGE, ERS_BONUS, ERS_DRS_BONUS, ERS_MAX, FLAG_LEN,
  DAMP, GRID_SIZE, INCIDENT_INFO, MOVE_DECK, OFFLINE_PENALTY, PENALTY_PLACES, PITWALL_DECK, PITWALL_INFO,
  NEUTRAL_ROUNDS, PASS_NEED, PASS_NEED_DRS, PIT_SPEED, RAIN_AT, TOKEN_USES, WEAR_MAX, WORN_MOVE,
  LAUNCH, activeDriver, aiLaunch, aiStep, applyLaunch, aiTurnPending, attackTarget, canPitwall, choose, commit, drsTarget, ersBonus, isRain, limits, newGame,
  moveFor, offlinePenalty, options, playPitwall, reportTarget, runAI, slipTargetOf, standings, travel,
  type CarSpec, type Choice, type LaunchKind, type Compound, type Driver, type GameEvent, type GameState, type Lane, type Rules,
  type TurnLog,
} from "@/lib/boardgame/engine";

const LAP_CHOICES = [4, 2, 1];
/** ความยาวแอนิเมชันไพ่ลอยขึ้นตอนกดเดิน (ตรงกับ .bg-play ใน globals.css) */
const PLAY_MS = 550;
/** รถ AI ขยับทีละคัน ห่างกันเท่านี้ (ms) — รอให้คันก่อนวิ่งถึงที่ (DRIVE_MAX_MS ใน TrackView) */
const AI_STEP_MS = 1000;
/** โชว์ช่อง "จะเข้าพิท" เมื่ออยู่ห่างโซนเข้าพิทไม่เกินเท่านี้ */
const PIT_HINT_CELLS = 12;

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- หน้าตั้งค่า ---------- */

type Setup = {
  players: number;
  laps: number;
  quali: boolean;
  rules: Rules;
  /** ทีม (ลำดับใน TEAMS) ของผู้เล่นแต่ละคน */
  teams: number[];
  compounds: Compound[][];
};

/** ค่าของปุ่ม "เล่นเลย" — คนเดียว 2 รอบ กติกาของเรา */
const QUICK: Setup = {
  players: 1,
  laps: 2,
  quali: false,
  rules: "ours",
  teams: [0, 1],
  compounds: [
    ["yellow", "red"],
    ["yellow", "red"],
  ],
};

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors ${
        on ? "border-(--color-f1) bg-(--color-f1)/15 text-white" : "border-white/15 bg-white/5 text-white/75 hover:border-white/35"
      }`}
    >
      {children}
    </button>
  );
}

function SetupForm({ onStart }: { onStart: (s: Setup) => void }) {
  const [custom, setCustom] = useState(false);
  const [s, set] = useState<Setup>({ ...QUICK, players: 2, laps: 4, quali: true });
  const up = (p: Partial<Setup>) => set((cur) => ({ ...cur, ...p }));
  return (
    <section className="card space-y-4 p-4" aria-label="เริ่มเกม">
      <div className="space-y-3">
        <div>
          <h2 className="poster text-lg text-white">เล่นครั้งแรก?</h2>
          <p className="text-sm text-white/65">คุมทีม 2 คันแข่งกับรถ AI · 2 รอบสนาม · กติกาของเรา (ง่าย) — ใช้เวลาราว 10 นาที</p>
        </div>
        <button type="button" onClick={() => onStart(QUICK)} className="min-h-14 w-full rounded-full bg-(--color-f1) px-5 text-lg font-bold text-white">
          เล่นเลย
        </button>
        <button
          type="button"
          onClick={() => setCustom((v) => !v)}
          aria-expanded={custom}
          className="flex w-full items-center justify-center gap-1 rounded-full border border-white/15 py-2.5 text-sm font-bold text-white/80 hover:border-white/40"
        >
          ตั้งค่าเอง
          <ChevronDown className={`h-4 w-4 transition-transform ${custom ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      <p className="text-[11px] leading-snug text-white/55">{NAMES_NOTE}</p>
      {custom && (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <Group label="กติกา">
            <div className="grid grid-cols-2 gap-2">
              <Toggle on={s.rules === "ours"} onClick={() => up({ rules: "ours" })}>
                <b>กติกาของเรา</b> <span className="block text-[11px] text-white/55">ง่าย ตัดสินใจไว (แนะนำ)</span>
              </Toggle>
              <Toggle on={s.rules === "full"} onClick={() => up({ rules: "full" })}>
                <b>เต็มรูปแบบ</b> <span className="block text-[11px] text-white/55">ATTACK BLOCK SLIP DRS โทษ</span>
              </Toggle>
            </div>
          </Group>
          <Group label={`จำนวนผู้เล่น (ทีมละ 2 คัน ที่เหลือเป็นรถ AI จนครบ ${GRID_SIZE} คัน)`}>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((n) => (
                <Toggle key={n} on={s.players === n} onClick={() => up({ players: n })}>
                  <b>{n} คน</b> <span className="text-white/55">· AI {GRID_SIZE - n * 2} คัน</span>
                </Toggle>
              ))}
            </div>
          </Group>
          <Group label="ระยะเรซ">
            <div className="grid grid-cols-3 gap-2">
              {LAP_CHOICES.map((n) => (
                <Toggle key={n} on={s.laps === n} onClick={() => up({ laps: n })}>
                  <b>{n} รอบ</b>
                  {n === 4 && <span className="block text-[11px] text-white/55">เต็มรูปแบบ</span>}
                </Toggle>
              ))}
            </div>
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Group label="กริดออกสตาร์ท">
              <div className="grid gap-2">
                <Toggle on={s.quali} onClick={() => up({ quali: true })}>
                  <b>ควอลิฟาย</b> <span className="block text-[11px] text-white/55">Q1 + Q2 ด้วยไพ่</span>
                </Toggle>
                <Toggle on={!s.quali} onClick={() => up({ quali: false })}>
                  <b>สุ่มกริด</b>
                </Toggle>
              </div>
            </Group>
          </div>
          {s.teams.slice(0, s.players).map((teamIdx, ti) => {
            const team = TEAMS[teamIdx];
            return (
              <div key={ti} className="space-y-2">
                <p className="text-xs font-medium text-white/55">ผู้เล่น {ti + 1} เลือกทีม</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEAMS.map((t, k) => {
                    const taken = s.teams.slice(0, s.players).some((x, j) => j !== ti && x === k);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={teamIdx === k}
                        disabled={taken}
                        onClick={() => up({ teams: s.teams.map((x, j) => (j === ti ? k : x)) })}
                        className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold disabled:opacity-30 ${teamIdx === k ? "border-white" : "border-transparent"}`}
                        style={{ background: t.color, color: t.ink }}
                      >
                        {t.name}
                      </button>
            );
                })}
              </div>
              <p className="text-xs text-white/55">เลือกยางออกตัว</p>
              {team.drivers.map((dr, di) => (
                <div key={di} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-bold">
                    <Car color={team.color} ink={team.ink} num={dr.num} tyre={COMPOUND_COLOR[s.compounds[ti][di]]} width={40} />
                    <span className="truncate">{dr.name}</span>
                  </span>
                  {(["yellow", "red"] as Compound[]).map((k) => (
                    <Toggle
                      key={k}
                      on={s.compounds[ti][di] === k}
                      onClick={() =>
                        up({ compounds: s.compounds.map((row, r) => (r === ti ? row.map((v, c) => (c === di ? k : v)) : row)) })
                      }
                    >
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COMPOUND_COLOR[k] }} aria-hidden />
                      {COMPOUNDS[k].label}
                      <span className="block text-[11px] text-white/55">{k === "red" ? "เร็ว สึกเร็ว" : "ช้ากว่า ทน"}</span>
                    </Toggle>
                  ))}
                </div>
              ))}
            </div>
            );
          })}
          <button type="button" onClick={() => onStart(s)} className="w-full rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white">
            {s.quali ? "ไปควอลิฟาย" : "ออกสตาร์ท"}
          </button>
        </div>
      )}
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-white/55">{label}</p>
      {children}
    </div>
  );
}

function buildCars(setup: Setup): { cars: CarSpec[]; teams: string[] } {
  const cars: CarSpec[] = [];
  const mine = setup.teams.slice(0, setup.players);
  mine.forEach((k, ti) =>
    TEAMS[k].drivers.forEach((dr, di) => cars.push({ ...dr, team: ti, ai: false, compound: setup.compounds[ti][di] })),
  );
  // ทีมที่เหลือเป็นรถ AI จนครบกริด
  for (const [k, team] of TEAMS.entries()) {
    if (mine.includes(k)) continue;
    for (const dr of team.drivers) {
      if (cars.length >= GRID_SIZE) break;
      cars.push({ ...dr, team: -1, ai: true });
    }
  }
  return { cars, teams: mine.map((k) => TEAMS[k].name) };
}

/* ---------- ข้อความเหตุการณ์ ---------- */

const carName = (s: GameState, id: number) => `#${s.drivers[id].num} ${s.drivers[id].name}`;

const weatherName = (w: number) => (w >= RAIN_AT ? "ฝนตก" : w === DAMP ? "ทางหมาด" : w >= 3 ? "เมฆครึ้ม" : "แดดออก");

function eventText(s: GameState, e: GameEvent): string {
  switch (e.t) {
    case "action":
      return `${carName(s, e.driver)} เปิดไพ่ ACTION: ${ACTION_INFO[e.card].title}${e.ok ? "" : " (ไม่มีผล)"}`;
    case "pitwall":
      return `${s.teams[e.team]?.name} ได้ไพ่ PITWALL เพิ่ม`;
    case "spin":
      return `${carName(s, e.driver)} ลื่นหมุนออกนอกสนาม!`;
    case "incident":
      return `เฉี่ยวชน: ${e.rolls.map((r) => `#${s.drivers[r.driver].num} ${INCIDENT_INFO[r.face].title}`).join(" · ")}`;
    case "sc":
      return "SAFETY CAR ออก! จัดแถวใหม่ทุกคัน";
    case "weather":
      return s.rules === "ours"
        ? `อากาศเปลี่ยน: ${weatherName(e.from)} → ${weatherName(e.to)}`
        : `อากาศเปลี่ยน: ขั้น ${e.from} → ${e.to} (${e.to >= RAIN_AT ? "ฝนตก" : e.to >= 3 ? "เมฆครึ้ม" : "แดดออก"})`;
    case "vbox":
      return `${carName(s, e.driver)} ผ่าน V-BOX เปลี่ยนเป็นยาง${e.wet ? "ฝน" : "แห้ง"}`;
    case "warn":
      return `${carName(s, e.driver)} โดนใบเตือน`;
    case "penalty":
      return `${carName(s, e.driver)} โดนโทษ ต้องจอดเพิ่มในพิท`;
    case "paceEnd":
      return `${carName(s, e.driver)} หลุดจังหวะ จบโหมด PACE`;
    case "served":
      return `${carName(s, e.driver)} จอดรับโทษในพิท`;
    case "back":
      return `${carName(s, e.driver)} ${BACK_TEXT}`;
    case "vsc":
      return "VSC! มีรถเสียหาย ทุกคันได้แค่ BASE";
    case "green":
      return `จบ ${e.kind === "sc" ? "SAFETY CAR" : "VSC"} — ธงเขียว กลับมาแข่งเต็มที่`;
  }
}

function logText(s: GameState, l: TurnLog) {
  const how: Record<TurnLog["kind"], string> = {
    base: "เดินพื้นฐาน",
    card: l.ai ? "เดิน" : "เปิดไพ่ MOVE",
    drs: "ใช้ DRS",
    slip: "สลิปสตรีม",
    worn: "เดินเอง",
    push: "PUSH",
    pace: "PACE",
    rejoin: "กลับเข้าสนาม",
    pitIn: "เข้าเลนพิท",
    pitLane: "วิ่งในเลนพิท",
    box: "จอดพิท",
  };
  const bits = [`${carName(s, l.driver)} ${how[l.kind]}${l.moved ? ` ${l.moved} ช่อง` : ""}`];
  if (l.ers) bits.push("ERS");
  if (l.passed.length) bits.push(`แซง ${l.passed.map((id) => `#${s.drivers[id].num}`).join(" ")}`);
  if (l.attacked !== null) bits.push(`ATTACK ดัน #${s.drivers[l.attacked].num} ออก`);
  if (l.block) bits.push("BLOCK");
  if (l.corner) bits.push("หยุดในโค้ง");
  if (l.blocked) bits.push("ติดรถ");
  if (l.wear) bits.push(`ยางสึก ${l.wear}`);
  if (l.nowWorn) bits.push("ยางพัง!");
  if (l.charged) bits.push(`ชาร์จ ERS +${l.charged}`);
  if (l.finished) bits.push(`เข้าเส้นชัย P${s.drivers[l.driver].finished}`);
  return bits.join(" · ");
}

/** เหตุการณ์ที่ควรหยุดเกมให้ดู: เกี่ยวกับรถผู้เล่น หรือกระทบทุกคัน (เซฟตี้คาร์ อากาศ) */
function worthPopup(s: GameState, e: GameEvent): boolean {
  const human = (id: number) => !s.drivers[id].ai;
  switch (e.t) {
    case "sc":
    case "vsc":
    case "weather":
      return true;
    case "action":
    case "spin":
    case "penalty":
    case "back":
      return human(e.driver);
    case "incident":
      return e.rolls.some((r) => human(r.driver));
    default:
      return false;
  }
}

/** แถบสถานะใต้หัวจอ: เซฟตี้คาร์ / VSC */
function StatusStrip({ s, onHelp }: { s: GameState; onHelp: (k: HelpKey) => void }) {
  const n = s.neutral;
  if (!n) return null;
  return (
    <div className="flex flex-none items-center gap-2 border-b border-white/10 px-2 py-1">
      <button
        type="button"
        onClick={() => onHelp(n.kind)}
        className={`poster flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] ${n.left > 1 ? "bg-[#facc15] text-[#08080A]" : "bg-[#facc15]/20 text-[#facc15]"}`}
        aria-live="polite"
      >
        {n.kind === "sc" ? "SAFETY CAR" : "VSC"}
        {n.left > 1 ? <span className="font-sans text-[10px] font-bold normal-case">ได้แค่ BASE</span> : <span className="font-sans text-[10px] font-bold">ENDING · จบเทิร์นนี้</span>}
      </button>
    </div>
  );
}

/* ---------- ชั้นเหตุการณ์ (ทับแผนที่) ---------- */

function EventLayer({ s, events, onClose }: { s: GameState; events: GameEvent[]; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]" role="dialog" aria-label="เหตุการณ์ในสนาม">
      <div className="bg-pop max-h-full w-full max-w-sm space-y-2.5 overflow-y-auto rounded-2xl border border-white/15 bg-[#121216] p-3">
        {events.map((e, i) => (
          <div key={i}>
            {e.t === "action" ? (
              <div className="flex items-center gap-3">
                <ActionCard3D kind={e.card} ok={e.ok} text={s.rules === "ours" ? ACTION_TEXT_OURS[e.card] : undefined} />
                <p className="text-sm text-white">
                  <b>{carName(s, e.driver)}</b>
                  <br />
                  <span className="text-white/70">เปิดไพ่เหตุการณ์</span>
                </p>
              </div>
            ) : e.t === "incident" ? (
              <div className="space-y-1.5">
                <p className="poster text-sm text-(--color-f1-text)">เฉี่ยวชน! ทอยเต๋าอุบัติเหตุ</p>
                {e.rolls.map((r, k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <DieFace face={r.face} delay={k * 0.25} />
                    <Car {...look(s.drivers[r.driver])} num={s.drivers[r.driver].num} width={30} />
                    <span className="font-bold" style={{ color: INCIDENT_INFO[r.face].color }}>
                      {INCIDENT_INFO[r.face].title}
                    </span>
                  </div>
                ))}
              </div>
            ) : e.t === "vsc" ? (
              <div className="rounded-xl border-2 border-[#facc15] px-3 py-2 text-center text-white">
                <p className="poster text-2xl text-[#facc15]">VSC</p>
                <p className="text-xs font-bold">มีรถเสียหาย — ทุกคันได้แค่ BASE ห้ามไพ่ MOVE/ERS/เหรียญ จนจบ VSC</p>
              </div>
            ) : e.t === "sc" ? (
              <div className="rounded-xl bg-[#facc15] px-3 py-2 text-center text-[#08080A]">
                <p className="poster text-2xl">SAFETY CAR</p>
                <p className="text-xs font-bold">รถทุกคันเรียงแถวบนเส้นแข่ง รถในพิทเปลี่ยนยางเสร็จทันที</p>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-white">
                {e.t === "weather" ? <CloudRain className="h-4 w-4 flex-none text-[#60a5fa]" aria-hidden /> : <Flag className="h-4 w-4 flex-none text-yellow-400" aria-hidden />}
                {eventText(s, e)}
              </p>
            )}
          </div>
        ))}
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-full bg-white px-4 text-sm font-bold text-[#08080A]">
          ไปต่อ
        </button>
      </div>
    </div>
  );
}

/** สรุปผลออกตัว: ใครขึ้นใครหล่น แล้วกดเริ่มเรซ */
function LaunchSummary({ s, rows, onStart }: { s: GameState; rows: { id: number; kind: LaunchKind; from: number; to: number }[]; onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#08080A]/90 p-3" role="dialog" aria-label="ผลออกตัว">
      <div className="bg-pop flex max-h-full w-full max-w-sm flex-col gap-2 rounded-2xl border border-white/15 bg-[#121216] p-3">
        <p className="poster text-lg text-white">ผลออกตัว</p>
        <ol className="min-h-0 space-y-1 overflow-y-auto text-xs">
          {rows.map((r) => {
            const d = s.drivers[r.id];
            const moved = r.from - r.to;
            return (
              <li key={r.id} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${d.ai ? "text-white/65" : "bg-white/5 font-bold text-white"}`}>
                <span className="poster w-7 tabular-nums text-white/60">P{r.to + 1}</span>
                <Car {...look(d)} num={d.num} width={26} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className={r.kind === "great" || r.kind === "good" ? "text-[#22c55e]" : r.kind === "ok" ? "text-white/55" : "text-(--color-f1-text)"}>
                  {LAUNCH[r.kind].title}
                </span>
                <span className="w-8 text-right tabular-nums">{moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}</span>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={onStart} className="min-h-12 rounded-full bg-(--color-f1) text-base font-bold text-white">
          เริ่มเรซ
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#121216] p-4 md:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="poster text-lg text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** ป้ายคำศัพท์ที่แตะแล้วขึ้นคำอธิบาย */
function Term({ k, ask, children, className = "" }: { k: HelpKey; ask: (k: HelpKey) => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={() => ask(k)} className={`inline-flex items-center gap-0.5 underline decoration-white/30 decoration-dotted underline-offset-2 ${className}`}>
      {children}
    </button>
  );
}

/* ---------- เกม ---------- */

type Phase =
  | { at: "setup" }
  | { at: "quali"; setup: Setup; cars: CarSpec[]; teams: string[] }
  | { at: "race" };

export default function BoardGame({ board }: { board: Board }) {
  const [phase, setPhase] = useState<Phase>({ at: "setup" });
  const [state, setState] = useState<GameState | null>(null);
  const [box, setBox] = useState(false);
  const [ers, setErs] = useState(false);
  const [attack, setAttack] = useState(false);
  const [block, setBlock] = useState(false);
  const [lane, setLane] = useState<Lane>(0);
  const [playing, setPlaying] = useState(false);
  const [zoomed, setZoomed] = useState(true);
  const [seen, setSeen] = useState<TurnLog[] | null>(null);
  const [pw, setPw] = useState<number | null>(null);
  /** ช่วงออกตัว: คิวรถผู้เล่นที่ยังไม่ได้กด และผลที่ได้แล้ว · summary = สรุปหลังจัดกริดใหม่ */
  const [launch, setLaunch] = useState<{
    queue: number[];
    kinds: Record<number, LaunchKind>;
    summary: { id: number; kind: LaunchKind; from: number; to: number }[] | null;
  } | null>(null);
  const lights = launch !== null;
  const [modal, setModal] = useState<"rules" | "log" | null>(null);
  const [help, setHelp] = useState<HelpKey | null>(null);

  const racing = phase.at === "race" && state !== null;
  // ระหว่างแข่งหน้าเกมเต็มจอ — กันหน้าเว็บข้างหลังเลื่อน
  useEffect(() => {
    if (!racing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [racing]);

  // รถ AI เดินทีละคันจนถึงคันที่ผู้เล่นคุม (ลดการเคลื่อนไหว = เดินรวดเดียว)
  const aiBusy = phase.at === "race" && !!state && aiTurnPending(state);
  useEffect(() => {
    if (!aiBusy || lights) return;
    const t = setTimeout(
      () => setState((s) => (s ? (calm() ? runAI(s, Math.random) : aiStep(s, Math.random)) : s)),
      calm() ? 0 : AI_STEP_MS,
    );
    return () => clearTimeout(t);
  }, [state, aiBusy, lights]);

  const track = { lapCells: CELLS_PER_LAP, corners: board.corners, drs: board.drs, pitEntry: board.pitEntry, vbox: board.vbox };

  const startRace = (setup: Setup, cars: CarSpec[], teams: string[], grid?: number[], wear?: number[]) => {
    const spec = wear ? cars.map((c, i) => ({ ...c, wear: wear[i] })) : cars;
    const g = newGame(spec, teams, track, setup.laps, Math.random, grid, { rules: setup.rules, stepAI: true });
    setState(g);
    setPhase({ at: "race" });
    setSeen(null);
    setZoomed(true);
    setHelp(null);
    // ไฟดับ: รถผู้เล่นทุกคันเล่นมินิเกมออกตัวตามลำดับกริด (ลดการเคลื่อนไหว = ข้าม ออกตัวปกติ)
    setLaunch(calm() ? null : { queue: g.order.filter((id) => !g.drivers[id].ai), kinds: {}, summary: null });
  };

  if (phase.at === "setup" || !state || phase.at === "quali") {
    if (phase.at === "quali") {
      return (
        <div className="space-y-4">
          <Qualifying
            cars={phase.cars}
            extra={phase.setup.rules === "full"}
            onDone={(grid, wear) => startRace(phase.setup, phase.cars, phase.teams, grid, wear)}
          />
          <RulesCard rules={phase.setup.rules} />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <SetupForm
          onStart={(setup) => {
            const { cars, teams } = buildCars(setup);
            if (setup.quali) setPhase({ at: "quali", setup, cars, teams });
            else startRace(setup, cars, teams);
          }}
        />
        <RulesCard rules="ours" />
      </div>
    );
  }

  const ours = state.rules === "ours";
  const order = standings(state);
  const resetExtras = () => {
    setBox(false);
    setErs(false);
    setAttack(false);
    setBlock(false);
    setLane(0);
    setPw(null);
  };
  const pick = (c: Choice) => {
    setState((s) => (s ? choose(s, { ...c, box }, Math.random) : s));
    setPw(null);
    setHelp(null);
  };
  const go = () => {
    if (playing) return;
    const extras = { ers, attack, block, lane };
    const apply = () => {
      setState((s) => (s ? commit(s, extras, Math.random) : s));
      resetExtras();
      setPlaying(false);
    };
    setHelp(null);
    if (calm()) apply();
    else {
      setPlaying(true);
      setTimeout(apply, PLAY_MS);
    }
  };
  const exit = () => {
    if (!state.over && !window.confirm("ออกจากการแข่งนี้?")) return;
    setState(null);
    setPhase({ at: "setup" });
    resetExtras();
  };
  const ask = (k: HelpKey) => setHelp((cur) => (cur === k ? null : k));

  /** รถผู้เล่นคันหนึ่งออกตัวเสร็จ — ครบทุกคันแล้วสุ่มให้รถ AI แล้วจัดกริดใหม่ */
  const launched = (id: number, kind: LaunchKind) => {
    if (!launch) return;
    const kinds = { ...launch.kinds, [id]: kind };
    const queue = launch.queue.filter((x) => x !== id);
    if (queue.length > 0) {
      setLaunch({ ...launch, queue, kinds });
      return;
    }
    for (const x of state.order) if (state.drivers[x].ai) kinds[x] = aiLaunch(Math.random);
    const next = applyLaunch(state, kinds);
    const summary = next.order.map((x, to) => ({ id: x, kind: kinds[x] ?? "ok", from: state.order.indexOf(x), to }));
    setState(next);
    setLaunch({ queue, kinds, summary });
  };

  const d = state.over || aiBusy ? null : activeDriver(state);
  // ระหว่างรถ AI เดิน กล้องตามคันที่เพิ่งขยับ
  const lastMover = state.feed.at(-1)?.driver;
  const focusCar = d ?? (state.over ? null : lastMover !== undefined ? state.drivers[lastMover] : activeDriver(state));
  const pos = d ? order.findIndex((x) => x.id === d.id) + 1 : 0;
  const o = d ? options(state, d) : null;
  const p = state.pending;
  const lim = d ? limits(state, d) : null;
  const free = !!lim && !lim.slow && !lim.limp;
  const rain = isRain(state);
  const ersAdd = d ? ersBonus(state, d) : ERS_BONUS;

  // พรีวิวขั้นที่ 2: จะไปถึงไหน และ ATTACK ได้ไหม
  let preview: ReturnType<typeof travel> | null = null;
  let canAttack = false;
  const useErs = ers && free && !!d && d.ers >= 1;
  let goal = 0;
  if (d && p) {
    const bonus = p.kind === "drs" ? 0 : d.bonus;
    goal = p.value + bonus + (useErs ? ersAdd : 0);
    preview = travel(state, d, goal, lane);
    canAttack = !ours && free && attackTarget(state, d, preview) !== null;
  }
  const atk = attack && canAttack;
  const landing = preview && atk ? { progress: preview.progress + 1, lane: 0 as Lane } : preview;
  const canBlock = !ours && free && !!d && d.tokens.block > 0 && state.order[state.turn + 1] !== undefined;
  const lap = (x: Driver) => Math.min(state.laps, Math.max(1, Math.floor(x.progress / CELLS_PER_LAP) + 1));
  const leader = order[0];

  const popups = state.feed.flatMap((l) => l.events).filter((e) => worthPopup(state, e));
  const showEvents = state.feed !== seen && popups.length > 0 && !lights && !aiBusy;
  const hand = d ? (state.teams[d.team]?.pitwall ?? []) : [];

  // ช่วงระยะของไพ่ MOVE ก่อนเปิด
  const moveRange = (() => {
    if (!d) return null;
    const off = offlinePenalty(state, d);
    const vals = MOVE_DECK.map((c) => Math.max(0, moveFor(state, c, d) - off));
    const risk = ours
      ? rain && !d.wet
        ? "ยางแห้งในฝน −2 · บางใบหมุน"
        : state.weather === DAMP && !d.wet
          ? "ทางหมาด ยางแห้ง −1"
          : d.wet && !rain && state.weather !== DAMP
            ? "ยางฝนบนทางแห้ง ช้าลง"
            : rain
              ? "ฝน ยางไม่สึก"
              : "บางใบยางสึก"
      : rain && !d.wet
        ? "บางใบลื่นหมุน"
        : rain
          ? "ฝน ยางไม่สึก"
          : "บางใบยางสึก";
    return { min: Math.min(...vals), max: Math.max(...vals), risk, off };
  })();
  const toPit = d ? (state.track.pitEntry.start - (((d.progress % CELLS_PER_LAP) + CELLS_PER_LAP) % CELLS_PER_LAP) + CELLS_PER_LAP) % CELLS_PER_LAP : 99;

  const slowWhy = state.neutral
    ? state.neutral.kind === "sc"
      ? "SAFETY CAR: ได้แค่ BASE ห้ามแซง — เข้าพิทตอนนี้เสียเวลาน้อย"
      : "VSC: ได้แค่ BASE ห้ามไพ่ MOVE/ERS/เหรียญ"
    : lim?.limp
    ? d?.damage
      ? "รถเสียหาย เดินเองช่องละ 3 — ผ่าน V-BOX หรือเข้าพิทเพื่อซ่อม"
      : "ยางพัง เดินเองช่องละ 3 — ต้องเข้าพิท"
    : lim?.flag
      ? "ธงเหลือง: ได้แค่ BASE ห้ามไพ่/เหรียญ/ERS"
      : d?.brakes
        ? "เบรกร้อน: ได้แค่ BASE จนกว่าจะผ่าน V-BOX หรือเข้าพิท"
        : !ours && d?.wet && !rain
          ? "แดดออกแล้วแต่ใส่ยางฝน: ได้แค่ BASE — ผ่าน V-BOX เพื่อเปลี่ยนยาง"
          : null;

  // ทำไมระยะจริงน้อยกว่าที่ไพ่บอก
  const moved = landing && d ? landing.progress - d.progress : 0;
  const cutWhy = preview && moved < goal ? (preview.corner ? "ติดโค้ง ต้องหยุดในโค้ง" : preview.blocked ? "ติดรถข้างหน้า" : "") : "";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#08080A] text-white md:flex-row">
      {/* ฝั่งสนาม */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 flex-none items-center gap-1.5 border-b border-white/10 px-2">
          <button type="button" onClick={exit} aria-label="ออกจากเกม" className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
          <span className="poster min-w-0 flex-1 truncate text-[11px] text-(--color-f1-text)">{board.name}</span>
          <span className="poster rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums">
            LAP {lap(leader)}/{state.laps}
          </span>
          {d && <span className="poster rounded-full bg-(--color-f1) px-2.5 py-1 text-[12px] tabular-nums">P{pos}</span>}
          <button type="button" onClick={() => setModal("rules")} aria-label="วิธีเล่น" className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <CircleHelp className="h-5 w-5" />
          </button>
        </header>
        <StatusStrip s={state} onHelp={ask} />

        <div className="relative min-h-0 flex-1">
          <TrackView board={board} state={state} focus={focusCar} ghost={landing} zoomed={zoomed && !!focusCar} onToggle={() => setZoomed((z) => !z)} onHelp={ask} />
          {state.feed.length > 0 && (
            <button
              type="button"
              onClick={() => setModal("log")}
              className="absolute inset-x-2 bottom-7 flex items-start gap-1.5 rounded-lg bg-[#08080A]/80 px-2 py-1 text-left text-[11px] text-white/80 backdrop-blur"
            >
              <List className="mt-0.5 h-3 w-3 flex-none" aria-hidden />
              <span className="line-clamp-2">
                {state.feed
                  .slice(-2)
                  .map((l) => logText(state, l))
                  .join(" / ")}
              </span>
            </button>
          )}
          {help && (
            <div className="bg-pop absolute inset-x-2 bottom-16 z-10 rounded-xl border border-white/20 bg-[#1a1a20] p-3 shadow-lg" role="status">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-none text-white/70" aria-hidden />
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-white">
                  <b>{helpText(help, state.rules).title}</b> — {helpText(help, state.rules).text}
                </p>
                <button type="button" onClick={() => setHelp(null)} aria-label="ปิดคำอธิบาย" className="-m-1 rounded-full p-1 text-white/60 hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {showEvents && <EventLayer s={state} events={popups} onClose={() => setSeen(state.feed)} />}
          {launch && launch.queue.length > 0 && (
            <LaunchScreen
              key={launch.queue[0]}
              car={state.drivers[launch.queue[0]]}
              team={state.teams[state.drivers[launch.queue[0]].team]?.name ?? ""}
              onDone={(kind) => launched(launch.queue[0], kind)}
            />
          )}
          {launch?.summary && <LaunchSummary s={state} rows={launch.summary} onStart={() => setLaunch(null)} />}
        </div>

        <section aria-label="อันดับ" className="flex h-9 flex-none items-center gap-1 overflow-x-auto border-t border-white/10 px-2">
          {order.map((x, rank) => {
            const c = look(x);
            const me = d?.id === x.id;
            return (
              <span
                key={x.id}
                className={`flex flex-none items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[10px] ${me ? "bg-(--color-f1)/25 font-extrabold" : x.ai ? "bg-[#141418] text-white/70" : "bg-[#1a1a20] font-bold"}`}
              >
                <span className="poster pl-1 text-white/60 tabular-nums">P{rank + 1}</span>
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold" style={{ background: c.color, color: c.ink }}>
                  {x.num}
                </span>
                {x.out ? "ชนออก" : x.finished !== null ? "จบ" : x.pit ? "พิท" : x.off ? "ข้างสนาม" : rank === 0 ? "นำ" : `+${leader.progress - x.progress}`}
              </span>
            );
          })}
        </section>
      </div>

      {/* แผงนักขับ */}
      <section
        aria-label="ตานักขับ"
        className="max-h-[54dvh] min-h-[16rem] flex-none space-y-2.5 overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#121216] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0"
      >
        {state.over ? (
          <Results state={state} order={order} onRestart={exit} />
        ) : launch ? (
          <p className="poster py-6 text-center text-sm text-white/70">เตรียมออกตัว…</p>
        ) : aiBusy ? (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <p className="poster text-sm text-white">รถคันอื่นกำลังเดิน…</p>
              <button
                type="button"
                onClick={() => setState((s) => (s ? runAI(s, Math.random) : s))}
                className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white hover:border-white/60"
              >
                ข้าม ▸▸
              </button>
            </div>
            <ul className="space-y-1 text-xs text-white/75">
              {state.feed.slice(-6).map((l, i) => {
                const c = state.drivers[l.driver];
                return (
                  <li key={i} className="flex items-center gap-2">
                    <Car {...look(c)} num={c.num} tyre={tyreOf(c)} width={28} />
                    <span className="min-w-0 flex-1 truncate">{logText(state, l)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : d && o ? (
          <>
            <div className="flex items-center gap-2">
              <span className="bg-live flex-none rounded-xl bg-[#1a1a20] p-1">
                <Car {...look(d)} num={d.num} tyre={tyreOf(d)} width={46} label={`รถหมายเลข ${d.num}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">
                  ถึงตา {d.name} · {state.teams[d.team]?.name}
                </p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <Chip k={d.pit ? "pit" : d.off ? "off" : "line"} ask={ask}>
                    {d.pit ? (d.pit.inBox ? "จอดในช่องพิท" : "เลนพิท") : d.off ? "ข้างสนาม" : d.lane === 0 ? "เส้นแข่ง" : "นอกเส้น"}
                  </Chip>
                  {d.wet && <Chip k="wet" ask={ask} tone="blue">ยางฝน</Chip>}
                  {lim?.flag && <Chip k="flag" ask={ask} tone="yellow">ธงเหลือง</Chip>}
                  {d.brakes && <Chip k="brakes" ask={ask} tone="orange">เบรกร้อน</Chip>}
                  {d.damage && <Chip k="damage" ask={ask} tone="orange">รถเสียหาย</Chip>}
                  {d.penalty ? <Chip k="penalty" ask={ask} tone="red">ค้างโทษ</Chip> : d.warn ? <Chip k="warn" ask={ask}>ใบเตือน</Chip> : null}
                  {d.mode && <Chip k={d.mode.kind} ask={ask} tone="orange">{d.mode.kind === "push" ? "PUSH" : `PACE ${d.mode.value}`}</Chip>}
                  {d.bonus > 0 && <Chip k="bonus" ask={ask} tone="orange">+{d.bonus} ช่อง</Chip>}
                  {d.quick && <Chip k="quick" ask={ask} tone="orange">พิทเร็ว</Chip>}
                </div>
              </div>
              <span className="poster text-2xl tabular-nums">P{pos}</span>
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-xl bg-[#1a1a20] px-2.5 py-2">
              <div className="min-w-0">
                <Term k="tyre" ask={ask} className="text-[10px] text-white/60">
                  ยาง{COMPOUNDS[d.compound].label} {d.worn ? "พัง!" : `${WEAR_MAX - d.wear}/${WEAR_MAX}`}
                </Term>
                <Meter value={d.worn ? 0 : WEAR_MAX - d.wear} max={WEAR_MAX} color={d.wet ? WET_COLOR : COMPOUND_COLOR[d.compound]} label="ยางเหลือ" />
              </div>
              <div className="min-w-0">
                <Term k="ers" ask={ask} className="text-[10px] text-white/60">
                  <Zap className="h-2.5 w-2.5" aria-hidden /> ERS {d.ers}/{ERS_MAX}
                </Term>
                <Meter value={d.ers} max={ERS_MAX} color="#DEDEDE" label="ERS" />
              </div>
              {ours ? (
                <button type="button" onClick={() => ask("pass")} className="flex flex-col items-center gap-0.5 rounded-lg px-1 text-white/70">
                  <Info className="h-4 w-4" aria-hidden />
                  <span className="text-[9px]">กฎแซง</span>
                </button>
              ) : (
                <div className="flex gap-1">
                  {(
                    [
                      ["attack", "ATK", d.tokens.attack, "2px solid #E10600"],
                      ["block", "BLK", d.tokens.block, "2px solid #DEDEDE"],
                      ["slip", "SLIP", d.tokens.slip, "2px dashed #DEDEDE"],
                    ] as const
                  ).map(([k, label, n, border]) => (
                    <button key={k} type="button" onClick={() => ask(k)} className="flex flex-col items-center gap-0.5">
                      <Coin n={n} label={label} style={{ border }} />
                      <span className="text-[9px] text-white/60">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ไพ่ PITWALL ของทีม */}
            <div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <Term k="pitwall" ask={ask} className="poster flex-none pr-1 text-[10px] text-[#fb923c]">
                  PITWALL
                </Term>
                {hand.length === 0 && <span className="text-[11px] text-white/55">ยังไม่มีไพ่ — ได้จากไพ่ MOVE ป้าย PIT</span>}
                {hand.map((id, i) => (
                  <PitwallChip
                    key={`${id}-${i}`}
                    id={id}
                    selected={pw === i}
                    disabled={!canPitwall(state, PITWALL_DECK[id].kind, d)}
                    onClick={() => setPw((cur) => (cur === i ? null : i))}
                  />
                ))}
              </div>
              {pw !== null && hand[pw] !== undefined && (
                <PitwallDetail
                  state={state}
                  d={d}
                  cardId={hand[pw]}
                  onPlay={(set) => {
                    setState((s) => (s ? playPitwall(s, pw, Math.random, set) : s));
                    setPw(null);
                  }}
                />
              )}
            </div>

            {slowWhy && !p && <p className="rounded-lg bg-yellow-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-yellow-300">{slowWhy}</p>}

            {!p && (
              <>
                <p className="text-[11px] text-white/60">เลือกวิธีเดิน — แตะชื่อที่ขีดเส้นประเพื่อดูคำอธิบาย</p>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 pt-1">
                  {o.inBox ? (
                    d.pit?.served ? (
                      <HandCard i={0} tone="dark" kicker="PIT" big="→" foot="รับโทษครบ ออกจากพิท" onClick={() => pick({ kind: "box" })} />
                    ) : (
                      <>
                        {[...new Set(d.sets)].map((k, i) => (
                          <HandCard key={k} i={i} tone={k === "red" ? "red" : "yellow"} kicker="PIT" big={<span className="text-xl">{COMPOUNDS[k].label}</span>} foot={rain ? "ยางใหม่ (ใส่แบบฝน)" : "ใส่ยางใหม่ชุดนี้"} onClick={() => pick({ kind: "box", set: k })} />
                        ))}
                        {!d.worn && (
                          <HandCard i={3} tone="dark" kicker="PIT" big={<span className="text-xl">เดิม</span>} foot={d.penalty ? "ยางเดิม · จอดรับโทษ" : "ยางเดิม ซ่อมรถ"} onClick={() => pick({ kind: "box", set: "keep" })} />
                        )}
                      </>
                    )
                  ) : o.pitLane ? (
                    <HandCard i={0} tone="yellow" kicker="PIT LANE" big={PIT_SPEED} foot="วิ่งในเลนพิท แซงไม่ได้" onClick={() => pick({ kind: "pitLane" })} />
                  ) : o.rejoin ? (
                    <HandCard i={0} tone="yellow" kicker="กลับสนาม" big="↩" foot="ช่องข้างว่างก็กลับได้ (จบตา)" onClick={() => pick({ kind: "rejoin" })} />
                  ) : (
                    <>
                      {o.worn ? (
                        <HandCard i={0} tone="yellow" kicker={d.damage ? "เสียหาย" : "ยางพัง"} big={WORN_MOVE} foot="เดินเอง ใช้ไพ่/เหรียญไม่ได้" onClick={() => pick({ kind: "worn" })} />
                      ) : (
                        <HandCard i={0} tone="dark" kicker="BASE" big={BASE_MOVE} foot={d.mode && free ? "ทิ้งโหมด · ไม่สึกยาง" : ours && d.ers < ERS_MAX ? `${BASE_MOVE} ช่องชัวร์ · ERS +${ERS_BASE_CHARGE}` : `${BASE_MOVE} ช่องแน่นอน ไม่สึกยาง`} onClick={() => pick({ kind: "base" })} />
                      )}
                      {o.push && <HandCard i={1} tone="orange" kicker="PUSH" big={<span className="text-2xl">»»</span>} foot="วิ่งสุด ยางสึก" onClick={() => pick({ kind: "push" })} />}
                      {o.pace && d.mode?.kind === "pace" && (
                        <HandCard i={1} tone="orange" kicker="PACE" big={d.mode.value} foot="คงที่ ไม่สึกยาง" onClick={() => pick({ kind: "pace" })} />
                      )}
                      {!o.worn && moveRange && (
                        <HandCard
                          i={2}
                          tone="red"
                          kicker="MOVE"
                          big={<span className="text-2xl tabular-nums">{`${moveRange.min}–${moveRange.max}`}</span>}
                          foot={
                            o.card
                              ? `สุ่ม · ${moveRange.risk}${moveRange.off ? ` · นอกเส้น −${moveRange.off}` : ""}`
                              : !free
                                ? "ติดข้อจำกัด"
                                : "ต้องอยู่บนเส้นแข่ง"
                          }
                          disabled={!o.card}
                          peek
                          onClick={() => pick({ kind: "card" })}
                        />
                      )}
                      {o.drs && <HandCard i={3} tone="light" kicker="DRS" big={<span className="text-xl">แซง</span>} foot={`ขึ้นหน้า #${drsTarget(state, d)?.num}`} onClick={() => pick({ kind: "drs" })} />}
                      {o.slip && <HandCard i={4} tone="dark" kicker="SLIP" big="→" foot={`ตามติด #${slipTargetOf(state, d)?.num} ฟรี`} onClick={() => pick({ kind: "slip" })} />}
                      {o.pitIn && <HandCard i={5} tone="yellow" kicker="PIT" big={PIT_SPEED} foot="เข้าเลนพิทเปลี่ยนยาง" onClick={() => pick({ kind: "pitIn" })} />}
                    </>
                  )}
                </div>
                {!o.worn && !d.pit && !d.off && !o.pitIn && toPit > 0 && toPit <= PIT_HINT_CELLS && (
                  <label className="flex min-h-9 items-center gap-2 rounded-xl bg-[#1a1a20] px-3 text-xs text-white/75">
                    <input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} className="h-4 w-4 accent-[#E10600]" />
                    จะเข้าพิท (อีก {toPit} ช่อง) — หยุดในโซนเข้าพิท
                  </label>
                )}
              </>
            )}

            {p && preview && landing && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  {p.card !== null ? (
                    <MoveCard3D key={p.card + state.round * 100} id={p.card} compound={d.compound} playing={playing} />
                  ) : (
                    <SimpleCard kicker={p.kind === "drs" ? "DRS" : p.kind === "push" ? "PUSH" : p.kind === "pace" ? "PACE" : "BASE"} value={p.value} playing={playing} />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="poster text-xs text-white/70">เดินได้</p>
                    <p className="poster text-5xl leading-none tabular-nums">
                      {moved}
                      <span className="pl-1 text-base text-white/60">ช่อง</span>
                    </p>
                    <p className="text-[11px] leading-snug text-white/70">
                      {[
                        `ไพ่ ${p.value}`,
                        p.kind !== "drs" && d.bonus > 0 ? `ทีมเวิร์ก +${d.bonus}` : "",
                        useErs ? `ERS +${ersAdd}` : "",
                        ours && p.kind === "base" && !useErs && d.ers < ERS_MAX ? `ชาร์จ ERS +${ERS_BASE_CHARGE}` : "",
                        atk ? "ATTACK" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {p.kind === "card" && offlinePenalty(state, d) > 0 && ` (นอกเส้น −${OFFLINE_PENALTY} แล้ว)`}
                    </p>
                    {ours && preview.passed.length > 0 && (
                      <p className="text-xs font-semibold text-[#22c55e]">แซง {preview.passed.map((id) => `#${state.drivers[id].num}`).join(" ")} ได้!</p>
                    )}
                    {ours && preview.stuck ? (
                      <p className="text-xs font-semibold text-yellow-400">
                        แซง #{state.drivers[preview.stuck.id].num} ไม่ได้ — ถึงหลังมันเหลือ {preview.stuck.left} ต้องมากกว่า {preview.stuck.need}
                      </p>
                    ) : (
                      cutWhy && (
                        <p className="text-xs font-semibold text-yellow-400">
                          เหลือ {moved} จาก {goal} — {cutWhy}
                        </p>
                      )
                    )}
                    {slowWhy && <p className="text-[11px] text-yellow-300">{slowWhy}</p>}
                  </div>
                </div>
                {ours ? (
                  <Extra on={useErs} disabled={!free || d.ers < 1 || playing} onClick={() => setErs((v) => !v)} title={`ERS +${ersAdd}`} foot={`เหลือ ${d.ers}/${ERS_MAX}${ersAdd > ERS_BONUS ? " · โซน DRS!" : ""} · เพิ่มแรงไว้แซง`} />
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <Extra on={useErs} disabled={!free || d.ers < 1 || playing} onClick={() => setErs((v) => !v)} title={`ERS +${ERS_BONUS}`} foot={`เหลือ ${d.ers}/${ERS_MAX}`} />
                    <Extra on={atk} disabled={!canAttack || playing} onClick={() => setAttack((v) => !v)} title={`ATTACK ${d.tokens.attack}`} foot={canAttack ? "ดันคันหน้าออก" : "ต้องจบติดท้าย"} />
                    <Extra on={block && canBlock} disabled={!canBlock || playing} onClick={() => setBlock((v) => !v)} title={`BLOCK ${d.tokens.block}`} foot="คันถัดไปแซงไม่ได้" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {!ours && (
                    <label className="flex min-h-12 flex-none items-center gap-1.5 rounded-xl bg-[#1a1a20] px-2.5 text-[11px] text-white/75">
                      <input type="checkbox" checked={lane === 1} onChange={(e) => setLane(e.target.checked ? 1 : 0)} className="h-4 w-4 accent-[#E10600]" />
                      จบนอกเส้น
                    </label>
                  )}
                  <button type="button" onClick={go} disabled={playing} className="min-h-12 flex-1 rounded-full bg-(--color-f1) px-4 text-base font-bold disabled:opacity-70">
                    เดิน {moved} ช่อง{block && canBlock ? " + BLOCK" : ""}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </section>

      {modal === "rules" && (
        <Modal title="วิธีเล่น" onClose={() => setModal(null)}>
          <RulesList rules={state.rules} />
        </Modal>
      )}
      {modal === "log" && (
        <Modal title="การเดินล่าสุด" onClose={() => setModal(null)}>
          <ul className="space-y-1.5 text-sm text-white/80">
            {state.feed.map((l, i) => (
              <li key={i}>
                {logText(state, l)}
                {l.events.map((e, k) => (
                  <span key={k} className="block pl-3 text-xs text-yellow-300">
                    {eventText(state, e)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>,
    document.body,
  );
}

function Chip({ children, tone, k, ask }: { children: ReactNode; tone?: "blue" | "yellow" | "orange" | "red"; k: HelpKey; ask: (k: HelpKey) => void }) {
  const c = {
    blue: "bg-[#60a5fa]/20 text-[#93c5fd]",
    yellow: "bg-yellow-400/20 text-yellow-300",
    orange: "bg-[#fb923c]/20 text-[#fdba74]",
    red: "bg-(--color-f1)/25 text-(--color-f1-text)",
  };
  return (
    <button type="button" onClick={() => ask(k)} className={`rounded-full px-1.5 py-px text-[10px] font-bold ${tone ? c[tone] : "bg-white/10 text-white/75"}`}>
      {children}
    </button>
  );
}

function Extra({ on, disabled, onClick, title, foot }: { on: boolean; disabled: boolean; onClick: () => void; title: string; foot: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-(--color-f1) bg-(--color-f1)/15" : "border-white/15 bg-[#1a1a20] hover:border-white/35"
      }`}
    >
      <span className="text-xs font-extrabold">{title}</span>
      <span className="text-center text-[10px] leading-tight text-white/60">{foot}</span>
    </button>
  );
}

function PitwallDetail({ state, d, cardId, onPlay }: { state: GameState; d: Driver; cardId: number; onPlay: (set?: Compound | "keep") => void }) {
  const c = PITWALL_DECK[cardId];
  const info = PITWALL_INFO[c.kind];
  const ok = canPitwall(state, c.kind, d);
  const why: Partial<Record<typeof c.kind, string>> = {
    attack: `เหรียญ ATTACK เต็ม ${TOKEN_USES} แล้ว`,
    block: `เหรียญ BLOCK เต็ม ${TOKEN_USES} แล้ว`,
    slip: `เหรียญ SLIP เต็ม ${TOKEN_USES} แล้ว`,
    charge: "ERS เต็มแล้ว",
    tires: d.worn ? "ยางพังแล้ว" : "ยางยังใหม่",
    report: "ต้องอยู่ติดท้ายรถต่างทีมในเลนเดียวกัน",
    quickBox: "ใช้ตอนอยู่ในโซนเข้าพิทหรือเลนพิท",
    push: "ใช้ได้ก่อนเลือกวิธีเดิน และไม่ติดข้อจำกัด",
    pace: "ใช้ได้ก่อนเลือกวิธีเดิน และไม่ติดข้อจำกัด",
    teamSpeed: "ใช้ได้ตอนอยู่บนสนาม",
  };
  const target = c.kind === "report" ? reportTarget(state, d) : null;
  return (
    <div className="mt-1 space-y-2 rounded-xl border border-[#fb923c]/40 bg-[#1f160f] p-2.5">
      <p className="text-xs text-white">
        <b className="text-[#fdba74]">
          {info.title}
          {c.value ? ` ${c.value}` : ""}
        </b>{" "}
        — {info.text}
        {target && ` (เป้า #${target.num})`}
      </p>
      {!ok ? (
        <p className="text-[11px] text-white/60">ตอนนี้ใช้ไม่ได้: {why[c.kind] ?? "ไม่เข้าเงื่อนไข"}</p>
      ) : c.kind === "quickBox" ? (
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(d.sets)].map((k) => (
            <button key={k} type="button" onClick={() => onPlay(k)} className="rounded-full bg-[#fb923c] px-3 py-1.5 text-xs font-bold text-[#08080A]">
              เปลี่ยนเป็นยาง{COMPOUNDS[k].label}
            </button>
          ))}
          {!d.worn && (
            <button type="button" onClick={() => onPlay("keep")} className="rounded-full border border-[#fb923c] px-3 py-1.5 text-xs font-bold text-[#fdba74]">
              ยางเดิม
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => onPlay()} className="min-h-9 rounded-full bg-[#fb923c] px-4 text-xs font-bold text-[#08080A]">
          ใช้ไพ่ใบนี้
        </button>
      )}
    </div>
  );
}

function Results({ state, order, onRestart }: { state: GameState; order: Driver[]; onRestart: () => void }) {
  const win = order[0];
  return (
    <div className="card-poster space-y-3 rounded-2xl p-3 text-center" role="status">
      <div className="flex justify-center">
        <Car {...look(win)} num={win.num} tyre={tyreOf(win)} width={110} label={`รถหมายเลข ${win.num}`} />
      </div>
      <p className="poster text-2xl">
        #{win.num} {win.name} ชนะ!
      </p>
      <ol className="mx-auto max-w-xs space-y-0.5 text-left text-sm">
        {order.map((x, i) => (
          <li key={x.id} className={x.ai ? "text-white/60" : "font-bold text-white"}>
            <span className="inline-block w-9 tabular-nums">{x.out ? "DNF" : `P${i + 1}`}</span>#{x.num} {x.name}
            {x.penalty && x.finished !== null && <span className="text-xs text-(--color-f1-text)"> · โทษ +{PENALTY_PLACES} อันดับ</span>}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onRestart} className="inline-flex items-center gap-2 rounded-full bg-(--color-f1) px-5 py-2.5 text-sm font-bold">
        <RotateCcw className="h-4 w-4" aria-hidden /> แข่งใหม่
      </button>
      <p className="text-[11px] text-white/55">ใช้ไป {state.round} เทิร์น</p>
    </div>
  );
}

function RulesCard({ rules }: { rules: Rules }) {
  return (
    <details className="card p-4 text-sm text-white/75">
      <summary className="cursor-pointer font-bold text-white">วิธีเล่น{rules === "ours" ? " (กติกาของเรา)" : " (เต็มรูปแบบ)"}</summary>
      <div className="mt-3">
        <RulesList rules={rules} />
      </div>
    </details>
  );
}

function RulesList({ rules }: { rules: Rules }) {
  if (rules === "ours") {
    return (
      <div className="space-y-3 text-sm text-white/75">
        <RuleBlock title="เป้าหมาย">
          คุมทีม 2 คันแข่งกับรถ AI ข้ามเส้นชัยก่อนชนะ — แต่ละเทิร์นรถเดินตามอันดับ คันนำก่อน
        </RuleBlock>
        <RuleBlock title="ทุกตาเลือก 1 อย่าง">
          <b>BASE {BASE_MOVE} ช่อง</b> ชัวร์ ไม่สึกยาง · หรือ <b>เปิดไพ่ MOVE</b> ได้ระยะสุ่ม (ดูช่วงบนไพ่) เร็วกว่าแต่บางใบทำยางสึก — อยู่นอกเส้นแข่งระยะ −{OFFLINE_PENALTY}
        </RuleBlock>
        <RuleBlock title="เห็นระยะแล้วเสริมได้">
          <b>ERS</b> +{ERS_BONUS} ช่อง (ทางตรง DRS +{ERS_DRS_BONUS}) มี {ERS_MAX} ขั้น — เดิน BASE โดยไม่ใช้ ERS ชาร์จคืน +{ERS_BASE_CHARGE} ขั้น
        </RuleBlock>
        <RuleBlock title="แซงและโค้ง">
          เดินถึงช่องหลังคันหน้าแล้วต้อง<b>เหลือระยะมากกว่า {PASS_NEED} ช่อง</b> (ทางตรง DRS มากกว่า {PASS_NEED_DRS}) ถึงแซงได้ แล้ววิ่งต่อจนครบ ไม่พอก็จอดหลังมัน · เข้าโค้ง (แดง) ต้องหยุดในโค้งก่อน
        </RuleBlock>
        <RuleBlock title="ออกตัว">
          ไฟแดงครบ 5 ดวงแล้วดับ แตะจอให้เร็ว: ต่ำกว่า 0.2 วิ แซง 2 อันดับ · 0.2–0.3 วิ แซง 1 · ช้ากว่า 0.45 วิ หล่น 1 · แตะก่อนไฟดับ หล่น 3
        </RuleBlock>
        <RuleBlock title="ยางและพิท">
          ยางสึกจาก {WEAR_MAX} ขั้น (เหลือง 1 แดง 2 ต่อใบ “สึก”) หมดแล้วยางพัง เดินเองช่องละ {WORN_MOVE} · ใกล้ทางเข้าพิทติ๊ก “จะเข้าพิท” แล้วเปลี่ยนยาง
        </RuleBlock>
        <RuleBlock title="เหตุการณ์">
          ไพ่ป้าย ACT เปิดเหตุการณ์ (ยางช้ำ ERS ดับ เบรกร้อน ออกนอกขอบสนามถอย {BACK_CELLS} ช่อง เฉี่ยวชน) · ป้าย PIT ได้ไพ่ PITWALL ของทีม · รถเสียหาย = VSC (ผ่าน V-BOX หรือเข้าพิทเพื่อซ่อม) · ชนออก = SAFETY CAR (ทุกคันได้แค่ BASE {NEUTRAL_ROUNDS} เทิร์น เทิร์นสุดท้ายขึ้น ENDING)
        </RuleBlock>
      </div>
    );
  }
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-white/75">
      <li>ทีมละ 2 คัน แข่งกับรถ AI จนครบ {GRID_SIZE} คัน เดินตามอันดับ คันนำก่อน · ควอลิฟาย: ไพ่ 2 ใบ เลือกใบ Q1 อีกใบใช้ Q2 (เลขน้อยเร็ว) รอบพิเศษได้คันละครั้งแต่ยางสึกครึ่งราง</li>
      <li>
        ทุกตาเลือก <b>BASE {BASE_MOVE} ช่อง</b> (ไม่สึกยาง) หรือ <b>เปิดไพ่ MOVE</b> (เร็วกว่า ค่าตามยาง เหลือง/แดง) — เปิดได้เฉพาะรถบนเส้นแข่ง ยกเว้นตาแรก
      </li>
      <li>ไพ่ป้าย “สึก” ทำยางเสื่อม (เหลือง 1 แดง 2 จาก {WEAR_MAX} ขั้น) สุดรางแล้วเจออีก = ยางพัง เดินเองช่องละ {WORN_MOVE} ต้องเข้าพิท</li>
      <li>เปิดไพ่แล้วเลือกเสริม: ERS +{ERS_BONUS} · ATTACK (ดันคันหน้าออก) · BLOCK (คันถัดไปแซงไม่ได้) · SLIP ตามติดคันหน้าฟรี · DRS ในโซนแซงขึ้นหน้า</li>
      <li>เข้าโค้ง (แดง) ต้องหยุดในโค้งก่อน ช่องหนึ่งจุ 2 คัน แซงทแยงผ่านรถเยื้องกันไม่ได้</li>
      <li>
        ไพ่ป้าย <b>ACT</b> เปิดไพ่เหตุการณ์: พลาดเอง ยางช้ำ ERS ดับ เสียสมาธิ ออกนอกขอบสนาม (ใบเตือน 2 ใบ = โทษจอดพิทเพิ่ม 1 ตา ไม่ชดใช้ถอย {PENALTY_PLACES} อันดับ) เบรกร้อน และเฉี่ยวชน (ทอยเต๋าทุกคันที่อยู่ติดกัน)
      </li>
      <li>หลุดนอกสนาม/รถเสียหาย = ธงเหลือง {FLAG_LEN} ช่อง 1 รอบ (ในเขตได้แค่ BASE) · ชนออก = SAFETY CAR จัดแถวใหม่ทุกคัน</li>
      <li>ผ่าน V-BOX หรือเข้าพิท ซ่อมรถเสียหายและเบรกร้อน</li>
      <li>ไพ่ป้าย <b>PIT</b> จั่ว PITWALL ของทีม (เริ่ม 3 ใบ): เติมเหรียญ ชาร์จแบต ถนอมยาง ร้องเรียน ทีมเวิร์ก พิทสต็อปเร็ว โหมด PUSH/PACE</li>
      <li>พิท: ติ๊ก “จะเข้าพิท” หยุดในโซนเข้าพิท ตาถัดไปเข้าเลน (ช่องละ {PIT_SPEED}) ถึงช่องพิทจอด ตาหน้าเปลี่ยนยางแล้ววิ่งออก</li>
      <li>ข้ามเส้นชัยแล้วไม่ถูกแซง จบเมื่อทุกคันเข้าเส้น</li>
    </ol>
  );
}

function RuleBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="poster pb-0.5 text-xs text-(--color-f1-text)">{title}</p>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
