"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Cloud, CloudRain, Flag, List, RotateCcw, Sun, X, Zap } from "lucide-react";
import Car from "@/components/boardgame/Car";
import Qualifying from "@/components/boardgame/Qualifying";
import TrackView from "@/components/boardgame/TrackView";
import {
  ActionCard3D, Coin, DieFace, HandCard, Meter, MoveCard3D, PitwallChip, SimpleCard,
} from "@/components/boardgame/Cards";
import { AI_TEAMS, COMPOUND_COLOR, HUMAN_TEAMS, WET_COLOR, look, tyreOf } from "@/components/boardgame/look";
import type { Board } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  ACTION_INFO, BASE_MOVE, COMPOUNDS, ERS_BONUS, ERS_MAX, FLAG_LEN, GRID_SIZE, INCIDENT_INFO, PENALTY_PLACES,
  PITWALL_DECK, PITWALL_INFO, PIT_SPEED, RAIN_AT, TOKEN_USES, WEAR_MAX, WEATHER_MAX, WORN_MOVE,
  activeDriver, attackTarget, canPitwall, choose, commit, drsTarget, isRain, lapCell, limits, newGame,
  options, playPitwall, reportTarget, slipTargetOf, standings, travel,
  type CarSpec, type Choice, type Compound, type Driver, type GameEvent, type GameState, type Lane, type TurnLog,
} from "@/lib/boardgame/engine";

const LAP_CHOICES = [4, 2, 1];
/** ความยาวแอนิเมชันไพ่ลอยขึ้นตอนกดเดิน (ตรงกับ .bg-play ใน globals.css) */
const PLAY_MS = 550;
/** ไฟสตาร์ท 5 ดวงแล้วดับ (ตรงกับ .bg-lights ใน globals.css) */
const LIGHTS_MS = 3400;

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- หน้าตั้งค่า ---------- */

type Setup = {
  players: number;
  laps: number;
  quali: boolean;
  weather: "dry" | "random";
  compounds: Compound[][];
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
  const [s, set] = useState<Setup>({
    players: 2,
    laps: 4,
    quali: true,
    weather: "dry",
    compounds: [
      ["yellow", "red"],
      ["yellow", "red"],
    ],
  });
  const up = (p: Partial<Setup>) => set((cur) => ({ ...cur, ...p }));
  return (
    <section className="card space-y-4 p-4" aria-label="ตั้งค่าการแข่ง">
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
        <Group label="อากาศตอนเริ่ม">
          <div className="grid gap-2">
            <Toggle on={s.weather === "dry"} onClick={() => up({ weather: "dry" })}>
              <b>แดดออก</b> <span className="block text-[11px] text-white/55">เหมาะกับรอบแรก</span>
            </Toggle>
            <Toggle on={s.weather === "random"} onClick={() => up({ weather: "random" })}>
              <b>ทอยเต๋าอากาศ</b>
            </Toggle>
          </div>
        </Group>
      </div>
      {HUMAN_TEAMS.slice(0, s.players).map((team, ti) => (
        <div key={ti} className="space-y-2">
          <p className="text-sm">
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: team.color, color: team.ink }}>
              {team.name}
            </span>{" "}
            <span className="text-white/55">เลือกยางออกตัว</span>
          </p>
          {team.drivers.map((dr, di) => (
            <div key={di} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-bold">
                <Car color={team.color} ink={team.ink} num={dr.num} tyre={COMPOUND_COLOR[s.compounds[ti][di]]} width={40} />
                {dr.name}
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
      ))}
      <button type="button" onClick={() => onStart(s)} className="w-full rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white">
        {s.quali ? "ไปควอลิฟาย" : "ออกสตาร์ท"}
      </button>
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
  HUMAN_TEAMS.slice(0, setup.players).forEach((team, ti) =>
    team.drivers.forEach((dr, di) => cars.push({ ...dr, team: ti, ai: false, compound: setup.compounds[ti][di] })),
  );
  for (const team of AI_TEAMS) {
    for (const num of team.nums) {
      if (cars.length >= GRID_SIZE) break;
      cars.push({ name: team.name, num, team: -1, ai: true });
    }
  }
  return { cars, teams: HUMAN_TEAMS.slice(0, setup.players).map((t) => t.name) };
}

/* ---------- ข้อความเหตุการณ์ ---------- */

const carName = (s: GameState, id: number) => `#${s.drivers[id].num} ${s.drivers[id].name}`;

function eventText(s: GameState, e: GameEvent): string {
  switch (e.t) {
    case "action":
      return `${carName(s, e.driver)} เปิดไพ่ ACTION: ${ACTION_INFO[e.card].title}${e.ok ? "" : " (ไม่มีผล)"}`;
    case "pitwall":
      return `${HUMAN_TEAMS[e.team]?.name} ได้ไพ่ PITWALL เพิ่ม`;
    case "spin":
      return `${carName(s, e.driver)} ลื่นหมุนออกนอกสนาม!`;
    case "incident":
      return `เฉี่ยวชน: ${e.rolls.map((r) => `#${s.drivers[r.driver].num} ${INCIDENT_INFO[r.face].title}`).join(" · ")}`;
    case "sc":
      return "SAFETY CAR ออก! จัดแถวใหม่ทุกคัน";
    case "weather":
      return `อากาศเปลี่ยน: ขั้น ${e.from} → ${e.to} (${weatherName(e.to)})`;
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
  if (l.ers) bits.push("ERS +2");
  if (l.attacked !== null) bits.push(`ATTACK ดัน #${s.drivers[l.attacked].num} ออก`);
  if (l.block) bits.push("BLOCK");
  if (l.corner) bits.push("หยุดในโค้ง");
  if (l.blocked) bits.push("ติดรถ");
  if (l.wear) bits.push(`ยางสึก ${l.wear}`);
  if (l.nowWorn) bits.push("ยางพัง!");
  if (l.recharge) bits.push("ชาร์จ ERS");
  if (l.finished) bits.push(`เข้าเส้นชัย P${s.drivers[l.driver].finished}`);
  return bits.join(" · ");
}

const MAJOR = new Set<GameEvent["t"]>(["action", "incident", "sc", "weather", "spin", "penalty"]);

const weatherName = (w: number) => (w >= RAIN_AT ? "ฝนตก" : w >= 3 ? "เมฆครึ้ม" : "แดดออก");

function WeatherGauge({ w }: { w: number }) {
  const Icon = w >= RAIN_AT ? CloudRain : w >= 3 ? Cloud : Sun;
  return (
    <span className="flex items-center gap-1 rounded-full bg-[#1F1F24] px-2 py-1" role="img" aria-label={`อากาศ ${weatherName(w)} ขั้น ${w}/${WEATHER_MAX}`}>
      <Icon className={`h-3.5 w-3.5 ${w >= RAIN_AT ? "text-[#60a5fa]" : w >= 3 ? "text-white/70" : "text-yellow-300"}`} aria-hidden />
      <span className="flex gap-px">
        {Array.from({ length: WEATHER_MAX }, (_, i) => (
          <i
            key={i}
            className="h-2.5 w-1.5 rounded-sm"
            style={{ background: i + 1 === w ? "#fff" : i + 1 >= RAIN_AT ? "rgba(96,165,250,.35)" : "rgba(255,255,255,.15)" }}
          />
        ))}
      </span>
    </span>
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
                <ActionCard3D kind={e.card} ok={e.ok} />
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

function Lights() {
  return (
    <div className="bg-lights pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70" aria-live="polite">
      <div className="flex gap-2 rounded-2xl bg-[#121216] p-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="bg-light h-8 w-8 rounded-full bg-[#2a0a0a]" style={{ animationDelay: `${i * 0.5}s` }} />
        ))}
      </div>
      <p className="bg-go poster text-3xl text-white">ไฟดับ! ออกตัว</p>
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
  const [lights, setLights] = useState(false);
  const [modal, setModal] = useState<"rules" | "log" | null>(null);
  const [startNote, setStartNote] = useState<string | null>(null);

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

  const track = { lapCells: CELLS_PER_LAP, corners: board.corners, drs: board.drs, pitEntry: board.pitEntry, vbox: board.vbox };

  const startRace = (setup: Setup, cars: CarSpec[], teams: string[], grid?: number[], wear?: number[]) => {
    const roll = setup.weather === "random" ? 1 + Math.floor(Math.random() * WEATHER_MAX) : 1;
    const spec = wear ? cars.map((c, i) => ({ ...c, wear: wear[i] })) : cars;
    setState(newGame(spec, teams, track, setup.laps, Math.random, grid, { weather: roll }));
    setStartNote(setup.weather === "random" ? `ทอยเต๋าอากาศได้ ${roll} — ${weatherName(roll)}${roll >= RAIN_AT ? " ทุกคันออกตัวด้วยยางฝน" : ""}` : null);
    setPhase({ at: "race" });
    setSeen(null);
    setZoomed(true);
    if (!calm()) {
      setLights(true);
      setTimeout(() => setLights(false), LIGHTS_MS);
    }
  };

  if (phase.at === "setup" || !state || phase.at === "quali") {
    if (phase.at === "quali") {
      return (
        <div className="space-y-4">
          <Qualifying cars={phase.cars} onDone={(grid, wear) => startRace(phase.setup, phase.cars, phase.teams, grid, wear)} />
          <RulesCard />
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
        <RulesCard />
      </div>
    );
  }

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
  };
  const go = () => {
    if (playing) return;
    const extras = { ers, attack, block, lane };
    const apply = () => {
      setState((s) => (s ? commit(s, extras, Math.random) : s));
      resetExtras();
      setPlaying(false);
    };
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

  const d = state.over ? null : activeDriver(state);
  const pos = d ? order.findIndex((x) => x.id === d.id) + 1 : 0;
  const o = d ? options(state, d) : null;
  const p = state.pending;
  const lim = d ? limits(state, d) : null;
  const free = !!lim && !lim.slow && !lim.limp;

  // พรีวิวขั้นที่ 2: จะไปถึงไหน และ ATTACK ได้ไหม
  let preview: ReturnType<typeof travel> | null = null;
  let canAttack = false;
  if (d && p) {
    const bonus = p.kind === "drs" ? 0 : d.bonus;
    preview = travel(state, d, p.value + bonus + (ers && free && d.ers > 0 ? ERS_BONUS : 0), lane);
    canAttack = free && attackTarget(state, d, preview) !== null;
  }
  const atk = attack && canAttack;
  const landing = preview && atk ? { progress: preview.progress + 1, lane: 0 as Lane } : preview;
  const canBlock = free && !!d && d.tokens.block > 0 && state.order[state.turn + 1] !== undefined;
  const lap = (x: Driver) => Math.min(state.laps, Math.max(1, Math.floor(x.progress / CELLS_PER_LAP) + 1));
  const leader = order[0];

  const events = state.feed.flatMap((l) => l.events);
  const majors = events.filter((e) => MAJOR.has(e.t));
  const showEvents = state.feed !== seen && majors.length > 0 && !lights;
  const rain = isRain(state);
  const hand = d ? (state.teams[d.team]?.pitwall ?? []) : [];

  const slowWhy = lim?.limp
    ? d?.damage
      ? "รถเสียหาย เดินเองช่องละ 3 — ผ่าน V-BOX หรือเข้าพิทเพื่อซ่อม"
      : "ยางพัง เดินเองช่องละ 3 — ต้องเข้าพิท"
    : lim?.flag
      ? `ธงเหลือง: ได้แค่ BASE ห้ามไพ่/เหรียญ/ERS`
      : d?.brakes
        ? "เบรกร้อน: ได้แค่ BASE จนกว่าจะผ่าน V-BOX หรือเข้าพิท"
        : d?.wet && !rain
          ? "แดดออกแล้วแต่ใส่ยางฝน: ได้แค่ BASE — ผ่าน V-BOX เพื่อเปลี่ยนยาง"
          : null;

  // วาดลง body ตรง ๆ — หน้าเว็บมี transform จาก PageTransition ซึ่งทำให้ fixed ไม่เต็มจอและแถบเมนูล่างทับ
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
          <WeatherGauge w={state.weather} />
          {d && <span className="poster rounded-full bg-(--color-f1) px-2.5 py-1 text-[12px] tabular-nums">P{pos}</span>}
          <button type="button" onClick={() => setModal("rules")} aria-label="วิธีเล่น" className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <CircleHelp className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          <TrackView board={board} state={state} focus={d} ghost={landing} zoomed={zoomed && !!d} onToggle={() => setZoomed((z) => !z)} />
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
          {showEvents && <EventLayer s={state} events={majors} onClose={() => setSeen(state.feed)} />}
          {lights && <Lights />}
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
        className="max-h-[54dvh] flex-none space-y-2.5 overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#121216] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0"
      >
        {state.over ? (
          <Results state={state} order={order} onRestart={exit} />
        ) : d && o ? (
          <>
            <div className="flex items-center gap-2">
              <span className="bg-live flex-none rounded-xl bg-[#1a1a20] p-1">
                <Car {...look(d)} num={d.num} tyre={tyreOf(d)} width={46} label={`รถหมายเลข ${d.num}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">
                  {d.name} · {HUMAN_TEAMS[d.team]?.name}
                </p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <Chip>{d.pit ? (d.pit.inBox ? "จอดในช่องพิท" : "เลนพิท") : d.off ? "ข้างสนาม" : d.lane === 0 ? "เส้นแข่ง" : "นอกเส้น"}</Chip>
                  {d.wet && <Chip tone="blue">ยางฝน</Chip>}
                  {lim?.flag && <Chip tone="yellow">ธงเหลือง</Chip>}
                  {d.brakes && <Chip tone="orange">เบรกร้อน</Chip>}
                  {d.damage && <Chip tone="orange">รถเสียหาย</Chip>}
                  {d.penalty ? <Chip tone="red">ค้างโทษ</Chip> : d.warn ? <Chip>ใบเตือน</Chip> : null}
                  {d.mode && <Chip tone="orange">{d.mode.kind === "push" ? "PUSH" : `PACE ${d.mode.value}`}</Chip>}
                  {d.bonus > 0 && <Chip tone="orange">+{d.bonus} ช่อง</Chip>}
                  {d.quick && <Chip tone="orange">พิทเร็ว</Chip>}
                </div>
              </div>
              <span className="poster text-2xl tabular-nums">P{pos}</span>
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-xl bg-[#1a1a20] px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[10px] text-white/60">
                  ยาง{COMPOUNDS[d.compound].label} {d.worn ? "พัง!" : `${WEAR_MAX - d.wear}/${WEAR_MAX}`}
                  {rain && " · ฝนไม่สึก"}
                </p>
                <Meter value={d.worn ? 0 : WEAR_MAX - d.wear} max={WEAR_MAX} color={d.wet ? WET_COLOR : COMPOUND_COLOR[d.compound]} label="ยางเหลือ" />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-0.5 text-[10px] text-white/60">
                  <Zap className="h-2.5 w-2.5" aria-hidden /> ERS {d.ers}/{ERS_MAX}
                </p>
                <Meter value={d.ers} max={ERS_MAX} color="#DEDEDE" label="ERS" />
              </div>
              <div className="flex gap-1">
                <Coin n={d.tokens.attack} label="ATTACK" style={{ border: "2px solid #E10600" }} />
                <Coin n={d.tokens.block} label="BLOCK" style={{ border: "2px solid #DEDEDE" }} />
                <Coin n={d.tokens.slip} label="SLIP" style={{ border: "2px dashed #DEDEDE" }} />
              </div>
            </div>

            {/* ไพ่ PITWALL ของทีม */}
            <div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="poster flex-none pr-1 text-[10px] text-[#fb923c]">PITWALL</span>
                {hand.length === 0 && <span className="text-[11px] text-white/55">ยังไม่มีไพ่ — จั่วได้จากไพ่ MOVE ป้าย PIT</span>}
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
                        <HandCard i={0} tone="dark" kicker="BASE" big={BASE_MOVE} foot={d.mode && free ? "ทิ้งโหมด · ไม่สึกยาง" : "ไม่สึกยาง"} onClick={() => pick({ kind: "base" })} />
                      )}
                      {o.push && <HandCard i={1} tone="orange" kicker="PUSH" big={<span className="text-2xl">»»</span>} foot="วิ่งสุด ยางสึก" onClick={() => pick({ kind: "push" })} />}
                      {o.pace && d.mode?.kind === "pace" && (
                        <HandCard i={1} tone="orange" kicker="PACE" big={d.mode.value} foot="คงที่ ไม่สึกยาง" onClick={() => pick({ kind: "pace" })} />
                      )}
                      {!o.worn && (
                        <HandCard
                          i={2}
                          tone="red"
                          kicker="MOVE"
                          big={<span className="text-2xl">»»»</span>}
                          foot={o.card ? `แตะเพื่อเปิด · เหลือ ${state.teams[d.team]?.moveDeck.length ?? 0}` : !free ? "ติดข้อจำกัด" : "ต้องอยู่บนเส้นแข่ง"}
                          disabled={!o.card}
                          peek
                          onClick={() => pick({ kind: "card" })}
                        />
                      )}
                      {o.drs && <HandCard i={3} tone="light" kicker="DRS" big={<span className="text-xl">แซง</span>} foot={`ขึ้นหน้า #${drsTarget(state, d)?.num}`} onClick={() => pick({ kind: "drs" })} />}
                      {o.slip && <HandCard i={4} tone="dark" kicker="SLIP" big="→" foot={`ตามติด #${slipTargetOf(state, d)?.num} ฟรี`} onClick={() => pick({ kind: "slip" })} />}
                      {o.pitIn && <HandCard i={5} tone="yellow" kicker="PIT" big={PIT_SPEED} foot="เข้าเลนพิท" onClick={() => pick({ kind: "pitIn" })} />}
                    </>
                  )}
                </div>
                {!o.worn && !d.pit && !d.off && (
                  <label className="flex min-h-9 items-center gap-2 rounded-xl bg-[#1a1a20] px-3 text-xs text-white/75">
                    <input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} className="h-4 w-4 accent-[#E10600]" />
                    จะเข้าพิท — หยุดในโซนเข้าพิทถ้าวิ่งผ่าน
                  </label>
                )}
              </>
            )}

            {p && preview && landing && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  {p.card !== null ? (
                    <MoveCard3D key={p.card + state.round * 100} id={p.card} compound={d.compound} wet={d.wet} rain={rain} playing={playing} />
                  ) : (
                    <SimpleCard kicker={p.kind === "drs" ? "DRS" : p.kind === "push" ? "PUSH" : p.kind === "pace" ? "PACE" : "BASE"} value={p.value} playing={playing} />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="poster text-xs text-white/70">ระยะเดิน</p>
                    <p className="poster text-5xl leading-none tabular-nums">{landing.progress - d.progress}</p>
                    <p className="text-xs leading-snug text-white/70">
                      ไปช่อง {lapCell(state.track, landing.progress)}
                      {atk && " · ดันคันหน้าออก"}
                      {d.bonus > 0 && p.kind !== "drs" && ` · ทีมเวิร์ก +${d.bonus}`}
                    </p>
                    {preview.corner && <p className="text-xs font-semibold text-yellow-400">ติดโค้ง — ต้องหยุดในโค้ง</p>}
                    {preview.blocked && <p className="text-xs font-semibold text-yellow-400">ติดรถข้างหน้า</p>}
                    {slowWhy && <p className="text-[11px] text-yellow-300">{slowWhy}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Extra on={ers && free && d.ers > 0} disabled={!free || d.ers <= 0 || playing} onClick={() => setErs((v) => !v)} title={`ERS +${ERS_BONUS}`} foot={`เหลือ ${d.ers}/${ERS_MAX}`} />
                  <Extra on={atk} disabled={!canAttack || playing} onClick={() => setAttack((v) => !v)} title={`ATTACK ${d.tokens.attack}`} foot={canAttack ? "ดันคันหน้าออก" : "ต้องจบติดท้าย"} />
                  <Extra on={block && canBlock} disabled={!canBlock || playing} onClick={() => setBlock((v) => !v)} title={`BLOCK ${d.tokens.block}`} foot="คันถัดไปแซงไม่ได้" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex min-h-12 flex-none items-center gap-1.5 rounded-xl bg-[#1a1a20] px-2.5 text-[11px] text-white/75">
                    <input type="checkbox" checked={lane === 1} onChange={(e) => setLane(e.target.checked ? 1 : 0)} className="h-4 w-4 accent-[#E10600]" />
                    จบนอกเส้น
                  </label>
                  <button type="button" onClick={go} disabled={playing} className="min-h-12 flex-1 rounded-full bg-(--color-f1) px-4 text-base font-bold disabled:opacity-70">
                    เดิน {landing.progress - d.progress} ช่อง{block && canBlock ? " + BLOCK" : ""}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
        {startNote && state.round === 1 && <p className="text-[11px] text-white/60">{startNote}</p>}
      </section>

      {modal === "rules" && (
        <Modal title="วิธีเล่น" onClose={() => setModal(null)}>
          <RulesList />
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

function Chip({ children, tone }: { children: ReactNode; tone?: "blue" | "yellow" | "orange" | "red" }) {
  const c = {
    blue: "bg-[#60a5fa]/20 text-[#93c5fd]",
    yellow: "bg-yellow-400/20 text-yellow-300",
    orange: "bg-[#fb923c]/20 text-[#fdba74]",
    red: "bg-(--color-f1)/25 text-(--color-f1-text)",
  };
  return <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${tone ? c[tone] : "bg-white/10 text-white/75"}`}>{children}</span>;
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

function RulesCard() {
  return (
    <details className="card p-4 text-sm text-white/75">
      <summary className="cursor-pointer font-bold text-white">วิธีเล่น</summary>
      <div className="mt-3">
        <RulesList />
      </div>
    </details>
  );
}

function RulesList() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-white/75">
      <li>ทีมละ 2 คัน แข่งกับรถ AI จนครบ {GRID_SIZE} คัน เดินตามอันดับ คันนำก่อน · ควอลิฟาย: ไพ่ 2 ใบ เลือกใบ Q1 อีกใบใช้ Q2 (เลขน้อยเร็ว) รอบพิเศษได้คันละครั้งแต่ยางสึกครึ่งราง</li>
      <li>
        ทุกตาเลือก <b>BASE {BASE_MOVE} ช่อง</b> (ไม่สึกยาง) หรือ <b>เปิดไพ่ MOVE</b> (เร็วกว่า ค่าตามยาง เหลือง/แดง/ฝน) — เปิดได้เฉพาะรถบนเส้นแข่ง ยกเว้นตาแรก
      </li>
      <li>ไพ่ป้าย “สึก” ทำยางเสื่อม (เหลือง 1 แดง 2 จาก {WEAR_MAX} ขั้น) สุดรางแล้วเจออีก = ยางพัง เดินเองช่องละ {WORN_MOVE} ต้องเข้าพิท</li>
      <li>เปิดไพ่แล้วเลือกเสริม: ERS +{ERS_BONUS} · ATTACK (ดันคันหน้าออก) · BLOCK (คันถัดไปแซงไม่ได้) · SLIP ตามติดคันหน้าฟรี · DRS ในโซนแซงขึ้นหน้า</li>
      <li>เข้าโค้ง (แดง) ต้องหยุดในโค้งก่อน ช่องหนึ่งจุ 2 คัน แซงทแยงผ่านรถเยื้องกันไม่ได้</li>
      <li>
        ไพ่ป้าย <b>ACT</b> เปิดไพ่เหตุการณ์: พลาดเอง อากาศเปลี่ยน ยางช้ำ ERS ดับ เสียสมาธิ ออกนอกขอบสนาม (ใบเตือน 2 ใบ = โทษจอดพิทเพิ่ม 1 ตา ไม่ชดใช้ถอย {PENALTY_PLACES} อันดับ) เบรกร้อน และเฉี่ยวชน (ทอยเต๋าทุกคันที่อยู่ติดกัน)
      </li>
      <li>หลุดนอกสนาม/รถเสียหาย = ธงเหลือง {FLAG_LEN} ช่อง 1 รอบ (ในเขตได้แค่ BASE) · ชนออก = SAFETY CAR จัดแถวใหม่ทุกคัน</li>
      <li>ฝน (มาตรอากาศขั้น {RAIN_AT}–{WEATHER_MAX}): ยางไม่สึก ไพ่รูปเมฆทำให้หมุน — ผ่าน V-BOX เปลี่ยนเป็นยางฝน แดดออกต้องผ่าน V-BOX อีกครั้ง V-BOX/พิทซ่อมรถและเบรกด้วย</li>
      <li>ไพ่ป้าย <b>PIT</b> จั่ว PITWALL ของทีม (เริ่ม 3 ใบ): เติมเหรียญ ชาร์จแบต ถนอมยาง เรดาร์ฝน ร้องเรียน ทีมเวิร์ก พิทสต็อปเร็ว โหมด PUSH/PACE</li>
      <li>พิท: ติ๊ก “จะเข้าพิท” หยุดในโซนเข้าพิท ตาถัดไปเข้าเลน (ช่องละ {PIT_SPEED}) ถึงช่องพิทจอด ตาหน้าเปลี่ยนยางแล้ววิ่งออก</li>
      <li>ข้ามเส้นชัยแล้วไม่ถูกแซง จบเมื่อทุกคันเข้าเส้น</li>
    </ol>
  );
}
