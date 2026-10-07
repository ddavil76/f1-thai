"use client";

import { useState } from "react";
import { Flag, RotateCcw } from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import type { Board, Pt } from "@/lib/boardgame/board";
import { CELLS_PER_LAP } from "@/lib/boardgame/board";
import {
  BASE_MOVE, BOX_AT, COMPOUNDS, ERS_BONUS, ERS_MAX, GRID_SIZE, MOVE_DECK, PIT_LEN, PIT_SPEED,
  TOKEN_USES, WEAR_MAX, WORN_MOVE,
  activeDriver, attackTarget, choose, commit, drsTarget, inZone, lapCell, moveValue, newGame,
  onTrack, options, slipTargetOf, standings, travel, zoneAt,
  type CarSpec, type Choice, type Compound, type Driver, type GameState, type Lane, type TurnLog,
} from "@/lib/boardgame/engine";

/** ทีมของผู้เล่น — ชื่อทีม/นักขับสมมติ สีแดงกับขาวให้ตัดกันบนพื้นดำ */
const HUMAN_TEAMS = [
  { name: "เมเทียร์ เรซซิ่ง", color: "#E10600", ink: "#fff", drivers: [{ name: "ภูมิ", num: 7 }, { name: "นาวิน", num: 17 }] },
  { name: "ไอซ์ไบรท์ เรซซิ่ง", color: "#DEDEDE", ink: "#08080A", drivers: [{ name: "มีนา", num: 21 }, { name: "ธาม", num: 27 }] },
] as const;

/** ทีม AI สมมติ เติมให้กริดครบ 12 คัน */
const AI_TEAMS = [
  { name: "ไลท์สปีด", nums: [3, 4] },
  { name: "ทาสคาน", nums: [11, 12] },
  { name: "โอไรออน", nums: [19, 20] },
  { name: "บลูเฟิร์น", nums: [24, 25] },
  { name: "ซันเดอร์", nums: [38, 39] },
];
const AI_LOOK = { color: "#4a4a55", ink: "#DEDEDE" };
const look = (d: Driver) => (d.ai ? AI_LOOK : HUMAN_TEAMS[d.team]);
const COMPOUND_COLOR: Record<Compound, string> = { yellow: "#facc15", red: "#E10600" };

const LAP_CHOICES = [4, 2, 1];

/* ---------- กระดาน ---------- */

function lanePoints(cells: Pt[], off: number) {
  const n = cells.length;
  return cells.map((c, i) => {
    const a = cells[(i - 1 + n) % n];
    const b = cells[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const at = (k: number) => ({ x: c.x + nx * off * k, y: c.y + ny * off * k });
    return { lanes: [at(-1), at(1)] as const, edge: at(2.1), label: at(3.2), pit: at(-3.4) };
  });
}

function BoardView({ board, state }: { board: Board; state: GameState }) {
  const pad = 9;
  const off = 1.4;
  const geo = lanePoints(board.cells, off);
  const t = state.track;
  const racing = geo.map((g) => `${g.lanes[0].x},${g.lanes[0].y}`).join(" ");
  const pitCells = Array.from({ length: PIT_LEN }, (_, k) => lapCell(t, t.pitEntry.start + k));
  const pitLine = pitCells.map((c) => `${geo[c].pit.x},${geo[c].pit.y}`).join(" ");
  const pos = (d: Driver) => {
    if (d.pit) return geo[lapCell(t, d.pit.base + d.pit.pos)].pit;
    return geo[lapCell(t, d.progress)].lanes[d.lane];
  };
  const racers = state.drivers.filter((d) => d.finished === null);
  return (
    <div className="card-poster relative rounded-2xl border border-white/10 p-3">
      <svg
        viewBox={`${-pad} ${-pad} ${board.w + pad * 2} ${board.h + pad * 2}`}
        className="mx-auto block max-h-[26rem] w-full"
        role="img"
        aria-label={`กระดานสนาม${board.name} ${CELLS_PER_LAP} ช่องต่อรอบ 2 เลน มีรถ ${racers.length} คันบนสนาม`}
      >
        <path d={board.d} fill="none" stroke="#2a2a31" strokeWidth={off * 4.6} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={pitLine} fill="none" stroke="#DEDEDE" strokeOpacity={0.35} strokeWidth={0.6} strokeDasharray="1 0.8" />
        <text x={geo[pitCells[BOX_AT]].pit.x} y={geo[pitCells[BOX_AT]].pit.y - 1.6} textAnchor="middle" fontSize={1.6} fontWeight={800} fill="#DEDEDE" fillOpacity={0.7}>
          PIT
        </text>
        <polygon points={racing} fill="none" stroke="#E10600" strokeOpacity={0.4} strokeWidth={0.3} strokeDasharray="1.2 1" />
        {geo.map((g, i) => {
          const corner = zoneAt(t, t.corners, i) >= 0;
          const drs = zoneAt(t, t.drs, i) >= 0;
          const entry = inZone(t.pitEntry, i);
          return (
            <g key={i}>
              {corner && <circle cx={g.edge.x} cy={g.edge.y} r={0.8} fill="#E10600" stroke="#fff" strokeWidth={0.3} />}
              {drs && <rect x={g.edge.x - 0.6} y={g.edge.y - 0.6} width={1.2} height={1.2} fill="#DEDEDE" fillOpacity={0.8} />}
              {entry && <circle cx={g.edge.x} cy={g.edge.y} r={0.7} fill="none" stroke="#DEDEDE" strokeWidth={0.35} />}
              {g.lanes.map((l, k) => (
                <circle key={k} cx={l.x} cy={l.y} r={0.35} fill={i === 0 ? "#fff" : "#5a5a64"} />
              ))}
              {(i === 0 || i % 3 === 0) && (
                <text x={g.label.x} y={g.label.y} textAnchor="middle" dominantBaseline="central" fontSize={1.7} fontWeight={700} fill={i === 0 ? "#E10600" : "#8a8a94"}>
                  {i === 0 ? "S" : i}
                </text>
              )}
            </g>
          );
        })}
        {[...racers]
          .sort((a, b) => Number(b.ai) - Number(a.ai))
          .map((d) => {
            const p = pos(d);
            const c = look(d);
            const r = d.ai ? 1.05 : 1.35;
            return (
              <g
                key={d.id}
                className="transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              >
                <circle r={r} fill={c.color} stroke={d.ai ? "#08080A" : "#fff"} strokeWidth={d.ai ? 0.3 : 0.4} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} fontWeight={800} fill={c.ink}>
                  {d.num}
                </text>
              </g>
            );
          })}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-(--color-f1)" aria-hidden />โค้ง
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 bg-[#DEDEDE]" aria-hidden />โซน DRS
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full border border-[#DEDEDE]" aria-hidden />โซนเข้าพิท
        </span>
        <span>เส้นประแดง = เส้นแข่ง</span>
      </p>
      <OsmCredit className="bottom-2 right-2" />
    </div>
  );
}

/* ---------- ชิ้นส่วนแผงนักขับ ---------- */

function Meter({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label} ${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2.5 w-2 rounded-sm" style={{ background: i < value ? color : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

function DriverPanel({ d, pos }: { d: Driver; pos: number }) {
  const c = look(d);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: c.color, color: c.ink }}>
          #{d.num} {d.name}
        </span>
        <span className="text-white/60">{HUMAN_TEAMS[d.team]?.name}</span>
        <span className="poster tabular-nums text-white">P{pos}</span>
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-white/70">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: COMPOUND_COLOR[d.compound] }} aria-hidden />
          ยาง{COMPOUNDS[d.compound].label}
          {d.worn ? (
            <b className="text-yellow-400">พัง</b>
          ) : (
            <Meter value={WEAR_MAX - d.wear} max={WEAR_MAX} color={COMPOUND_COLOR[d.compound]} label="ยางเหลือ" />
          )}
        </span>
        <span className="flex items-center gap-1.5">
          ERS <Meter value={d.ers} max={ERS_MAX} color="#DEDEDE" label="ERS" />
        </span>
        <span className="tabular-nums">
          ATTACK {d.tokens.attack}/{TOKEN_USES} · BLOCK {d.tokens.block}/{TOKEN_USES} · SLIP {d.tokens.slip}/{TOKEN_USES}
        </span>
        <span>
          ยางสำรอง:{" "}
          {d.sets.length === 0
            ? "หมด"
            : d.sets.map((s, i) => (
                <span
                  key={i}
                  role="img"
                  aria-label={`ยาง${COMPOUNDS[s].label}`}
                  className="mr-0.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ background: COMPOUND_COLOR[s] }}
                />
              ))}
        </span>
      </div>
    </div>
  );
}

function MoveCardView({ id, compound }: { id: number; compound: Compound }) {
  const c = MOVE_DECK[id];
  return (
    <div role="img" aria-label={`ไพ่ MOVE ยางเหลือง ${c.y} ยางแดง ${c.r}`} className="w-28 shrink-0 space-y-1 rounded-xl border-2 border-white/25 bg-[#17171c] p-2">
      <p className="poster text-[10px] text-white/60">MOVE</p>
      {(["yellow", "red"] as Compound[]).map((k) => (
        <div
          key={k}
          className={`flex items-center justify-between rounded-md px-2 py-0.5 ${k === compound ? "bg-[#DEDEDE] text-[#08080A]" : "bg-white/10 text-white/60"}`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPOUND_COLOR[k] }} aria-hidden />
          <span className="poster text-lg tabular-nums">{moveValue(c, k)}</span>
        </div>
      ))}
      <div className="flex gap-1 text-[10px] font-bold">
        {c.tires && <span className="rounded bg-red-500/80 px-1 text-white">สึก</span>}
        {c.ers && <span className="rounded bg-white/25 px-1 text-white">⚡ ชาร์จ</span>}
      </div>
    </div>
  );
}

function Toggle({
  on, disabled, onClick, children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-(--color-f1) bg-(--color-f1)/15 text-white" : "border-white/15 bg-white/5 text-white/75 hover:border-white/35"
      }`}
    >
      {children}
    </button>
  );
}

function logText(s: GameState, l: TurnLog) {
  const d = s.drivers[l.driver];
  const how: Record<TurnLog["kind"], string> = {
    base: "เดินพื้นฐาน",
    card: l.ai ? "เดิน" : "เปิดไพ่ MOVE",
    drs: "ใช้ DRS",
    slip: "สลิปสตรีม",
    worn: "ยางพังเดินเอง",
    pitIn: "เข้าเลนพิท",
    pitLane: "วิ่งในเลนพิท",
    box: "เปลี่ยนยางแล้วออกจากพิท",
  };
  const bits = [`#${d.num} ${d.name} ${how[l.kind]} ${l.moved} ช่อง`];
  if (l.ers) bits.push("ERS +2");
  if (l.attacked !== null) bits.push(`ATTACK ดัน #${s.drivers[l.attacked].num} ออกนอกเส้น`);
  if (l.block) bits.push("BLOCK คันหลัง");
  if (l.corner) bits.push("หยุดในโค้ง");
  if (l.blocked) bits.push("ติดรถข้างหน้า");
  if (l.wear) bits.push(`ยางสึก ${l.wear} ขั้น`);
  if (l.nowWorn) bits.push("ยางพัง!");
  if (l.recharge) bits.push("ชาร์จ ERS");
  if (l.finished) bits.push(`เข้าเส้นชัยอันดับ ${d.finished}`);
  return bits.join(" · ");
}

/* ---------- หน้าตั้งค่า ---------- */

function Setup({ onStart }: { onStart: (players: number, laps: number, compounds: Compound[][]) => void }) {
  const [players, setPlayers] = useState(2);
  const [laps, setLaps] = useState(4);
  const [compounds, setCompounds] = useState<Compound[][]>([
    ["yellow", "red"],
    ["yellow", "red"],
  ]);
  return (
    <section className="card space-y-4 p-4" aria-label="ตั้งค่าการแข่ง">
      <div>
        <p className="mb-2 text-xs font-medium text-white/55">
          จำนวนผู้เล่น (ทีมละ 2 คัน ที่เหลือเป็นรถ AI จนครบ {GRID_SIZE} คัน)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((n) => (
            <Toggle key={n} on={players === n} onClick={() => setPlayers(n)}>
              <b>{n} คน</b> <span className="text-white/55">· AI {GRID_SIZE - n * 2} คัน</span>
            </Toggle>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-white/55">ระยะเรซ</p>
        <div className="grid grid-cols-3 gap-2">
          {LAP_CHOICES.map((n) => (
            <Toggle key={n} on={laps === n} onClick={() => setLaps(n)}>
              <b>{n} รอบ</b>
              {n === 4 && <span className="block text-[11px] text-white/55">เต็มรูปแบบ</span>}
            </Toggle>
          ))}
        </div>
      </div>
      {HUMAN_TEAMS.slice(0, players).map((team, ti) => (
        <div key={ti} className="space-y-2">
          <p className="text-sm">
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: team.color, color: team.ink }}>
              {team.name}
            </span>{" "}
            <span className="text-white/55">เลือกยางออกตัวของแต่ละคัน</span>
          </p>
          {team.drivers.map((dr, di) => (
            <div key={di} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2 text-sm">
              <span className="font-bold">
                #{dr.num} {dr.name}
              </span>
              {(["yellow", "red"] as Compound[]).map((k) => (
                <Toggle
                  key={k}
                  on={compounds[ti][di] === k}
                  onClick={() =>
                    setCompounds((cur) => cur.map((row, r) => (r === ti ? row.map((v, c) => (c === di ? k : v)) : row)))
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
      <button
        type="button"
        onClick={() => onStart(players, laps, compounds)}
        className="w-full rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white"
      >
        ออกสตาร์ท
      </button>
    </section>
  );
}

/* ---------- เกม ---------- */

function buildCars(players: number, compounds: Compound[][]): { cars: CarSpec[]; teams: string[] } {
  const cars: CarSpec[] = [];
  HUMAN_TEAMS.slice(0, players).forEach((team, ti) =>
    team.drivers.forEach((dr, di) => cars.push({ ...dr, team: ti, ai: false, compound: compounds[ti][di] })),
  );
  for (const team of AI_TEAMS) {
    for (const num of team.nums) {
      if (cars.length >= GRID_SIZE) break;
      cars.push({ name: team.name, num, team: -1, ai: true });
    }
  }
  return { cars, teams: HUMAN_TEAMS.slice(0, players).map((t) => t.name) };
}

export default function BoardGame({ board }: { board: Board }) {
  const [state, setState] = useState<GameState | null>(null);
  const [box, setBox] = useState(false);
  const [ers, setErs] = useState(false);
  const [attack, setAttack] = useState(false);
  const [block, setBlock] = useState(false);
  const [lane, setLane] = useState<Lane>(0);

  if (!state) {
    return (
      <div className="space-y-4">
        <Setup
          onStart={(players, laps, compounds) => {
            const { cars, teams } = buildCars(players, compounds);
            const track = { lapCells: CELLS_PER_LAP, corners: board.corners, drs: board.drs, pitEntry: board.pitEntry };
            setState(newGame(cars, teams, track, laps, Math.random));
          }}
        />
        <Rules />
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
  };
  const pick = (c: Choice) => setState((s) => (s ? choose(s, { ...c, box }, Math.random) : s));
  const go = () => {
    setState((s) => (s ? commit(s, { ers, attack, block, lane }, Math.random) : s));
    resetExtras();
  };
  const restart = () => {
    setState(null);
    resetExtras();
  };

  const d = state.over ? null : activeDriver(state);
  const pos = d ? order.findIndex((x) => x.id === d.id) + 1 : 0;
  const o = d ? options(state, d) : null;
  const p = state.pending;

  // พรีวิวขั้นที่ 2: จะไปถึงไหน และ ATTACK ได้ไหม
  let preview: ReturnType<typeof travel> | null = null;
  let canAttack = false;
  if (d && p) {
    preview = travel(state, d, p.value + (ers && d.ers > 0 ? ERS_BONUS : 0), lane);
    canAttack = attackTarget(state, d, preview) !== null;
  }
  const canBlock = !!d && d.tokens.block > 0 && state.order[state.turn + 1] !== undefined;

  return (
    <div className="space-y-4">
      <BoardView board={board} state={state} />

      <section className="card p-3" aria-label="อันดับ">
        <p className="mb-1.5 text-xs text-white/55">
          รอบเทิร์นที่ {state.round} · ระยะเรซ {state.laps} รอบสนาม
        </p>
        <ol className="space-y-0.5 text-xs">
          {order.map((x, rank) => {
            const c = look(x);
            const lap = Math.min(state.laps, Math.max(1, Math.floor(x.progress / CELLS_PER_LAP) + 1));
            return (
              <li
                key={x.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-0.5 ${x.ai ? "" : "bg-white/8"} ${d?.id === x.id ? "ring-1 ring-(--color-f1)" : ""}`}
              >
                <span className="poster w-7 text-right tabular-nums text-white/70">P{rank + 1}</span>
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums"
                  style={{ background: c.color, color: c.ink }}
                  aria-hidden
                >
                  {x.num}
                </span>
                <span className={`min-w-0 flex-1 truncate ${x.ai ? "text-white/65" : "font-bold text-white"}`}>
                  {x.name}
                  {x.ai && <span className="ml-1 text-[10px] text-white/45">AI</span>}
                </span>
                {!x.ai && (
                  <span
                    role="img"
                    aria-label={`ยาง${COMPOUNDS[x.compound].label}`}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: COMPOUND_COLOR[x.compound] }}
                  />
                )}
                <span className="w-24 text-right tabular-nums text-white/55">
                  {x.finished !== null
                    ? "เข้าเส้นแล้ว"
                    : x.pit
                      ? "อยู่ในพิท"
                      : rank === 0
                        ? `รอบ ${lap}/${state.laps}`
                        : `+${order[0].progress - x.progress} ช่อง`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {state.over ? (
        <section className="card-poster space-y-3 rounded-2xl border border-white/10 p-5 text-center" role="status">
          <Flag className="mx-auto h-6 w-6 text-(--color-f1-text)" aria-hidden />
          <p className="poster text-2xl">
            #{order[0].num} {order[0].name} ชนะ!
          </p>
          <ol className="mx-auto max-w-xs space-y-0.5 text-left text-sm">
            {order.map((x, i) => (
              <li key={x.id} className={x.ai ? "text-white/55" : "font-bold text-white"}>
                <span className="inline-block w-9 tabular-nums">P{i + 1}</span>#{x.num} {x.name}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-full bg-(--color-f1) px-5 py-2.5 text-sm font-bold text-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> แข่งใหม่
          </button>
        </section>
      ) : d && o ? (
        <section className="card space-y-4 p-4" aria-label="ตานักขับ">
          <DriverPanel d={d} pos={pos} />
          <p className="text-xs text-white/60">
            {d.pit
              ? d.pit.inBox
                ? "จอดอยู่ในช่องพิท — เลือกยางชุดใหม่แล้ววิ่งออก"
                : `อยู่ในเลนพิท วิ่งช่องละ ${PIT_SPEED} แซงในเลนพิทไม่ได้`
              : d.lane === 0
                ? "อยู่บนเส้นแข่ง — เปิดไพ่ MOVE ได้"
                : state.round === 1
                  ? "ตาแรก: นอกเส้นแข่งก็เปิดไพ่ได้"
                  : "อยู่นอกเส้นแข่ง — เดินได้แค่พื้นฐาน (กลับเข้าเส้นแข่งตอนจบตาได้ถ้าว่าง)"}
            {onTrack(d) && zoneAt(state.track, state.track.corners, d.progress) >= 0 && " · อยู่ในโค้ง ออกได้เลย"}
          </p>

          {!p && (
            <div className="space-y-2">
              {"inBox" in o ? (
                o.inBox ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[...new Set(d.sets)].map((k) => (
                      <Toggle key={k} on={false} onClick={() => pick({ kind: "box", set: k })}>
                        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COMPOUND_COLOR[k] }} aria-hidden />
                        ใส่ยาง{COMPOUNDS[k].label} แล้วออก
                      </Toggle>
                    ))}
                    {d.sets.length === 0 && (
                      <Toggle on={false} onClick={() => pick({ kind: "box" })}>
                        ยางหมด — ออกจากพิท
                      </Toggle>
                    )}
                  </div>
                ) : (
                  <Toggle on={false} onClick={() => pick({ kind: "pitLane" })}>
                    วิ่งในเลนพิท {PIT_SPEED} ช่อง
                  </Toggle>
                )
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {o.worn ? (
                      <Toggle on={false} onClick={() => pick({ kind: "worn" })}>
                        <b>ยางพัง</b>
                        <span className="block text-xs text-white/60">เดินเอง {WORN_MOVE} ช่อง ใช้ไพ่/เหรียญไม่ได้</span>
                      </Toggle>
                    ) : (
                      <Toggle on={false} onClick={() => pick({ kind: "base" })}>
                        <b>พื้นฐาน {BASE_MOVE} ช่อง</b>
                        <span className="block text-xs text-white/60">ไม่สึกยาง ปลอดภัย</span>
                      </Toggle>
                    )}
                    <Toggle on={false} disabled={!o.card} onClick={() => pick({ kind: "card" })}>
                      <b>เปิดไพ่ MOVE</b>
                      <span className="block text-xs text-white/60">{o.card ? "เร็วกว่า เสี่ยงยางสึก" : "ต้องอยู่บนเส้นแข่ง"}</span>
                    </Toggle>
                    {o.drs && (
                      <Toggle on={false} onClick={() => pick({ kind: "drs" })}>
                        <b>DRS</b>
                        <span className="block text-xs text-white/60">แซงขึ้นหน้า #{drsTarget(state, d)?.num}</span>
                      </Toggle>
                    )}
                    {o.slip && (
                      <Toggle on={false} onClick={() => pick({ kind: "slip" })}>
                        <b>สลิปสตรีม</b>
                        <span className="block text-xs text-white/60">ตามติดท้าย #{slipTargetOf(state, d)?.num} ฟรี</span>
                      </Toggle>
                    )}
                    {o.pitIn && (
                      <Toggle on={false} onClick={() => pick({ kind: "pitIn" })}>
                        <b>เข้าเลนพิท</b>
                        <span className="block text-xs text-white/60">เปลี่ยนยางตาหน้า</span>
                      </Toggle>
                    )}
                  </div>
                  {!o.worn && (
                    <label className="flex items-center gap-2 text-xs text-white/70">
                      <input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} className="accent-[#E10600]" />
                      ตั้งใจเข้าพิท — หยุดในโซนเข้าพิทถ้าวิ่งผ่าน
                    </label>
                  )}
                </>
              )}
            </div>
          )}

          {p && preview && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                {p.card !== null ? (
                  <MoveCardView id={p.card} compound={d.compound} />
                ) : (
                  <div className="w-28 shrink-0 rounded-xl border-2 border-white/25 bg-[#17171c] p-2 text-center">
                    <p className="poster text-[10px] text-white/60">{p.kind === "drs" ? "DRS" : "พื้นฐาน"}</p>
                    <p className="poster text-3xl tabular-nums">{p.value}</p>
                  </div>
                )}
                <p className="text-sm text-white/75">
                  จะไปถึงช่อง <b className="tabular-nums text-white">{lapCell(state.track, preview.progress)}</b> (
                  {preview.progress - d.progress} ช่อง)
                  {preview.corner && <span className="block text-xs text-yellow-400">ติดโค้ง — ต้องหยุดในโค้ง</span>}
                  {preview.blocked && <span className="block text-xs text-yellow-400">ติดรถข้างหน้า</span>}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Toggle on={ers} disabled={d.ers <= 0} onClick={() => setErs((v) => !v)}>
                  <b>ERS +{ERS_BONUS}</b>
                  <span className="block text-xs text-white/60">
                    เหลือ {d.ers}/{ERS_MAX}
                  </span>
                </Toggle>
                <Toggle on={attack && canAttack} disabled={d.tokens.attack <= 0 || !canAttack} onClick={() => setAttack((v) => !v)}>
                  <b>ATTACK</b>
                  <span className="block text-xs text-white/60">{canAttack ? "ดันคันหน้าออกนอกเส้น" : "ต้องจบติดท้ายคันหน้าบนเส้นแข่ง"}</span>
                </Toggle>
                <Toggle on={block} disabled={!canBlock} onClick={() => setBlock((v) => !v)}>
                  <b>BLOCK</b>
                  <span className="block text-xs text-white/60">คันถัดไปแซงไม่ได้</span>
                </Toggle>
                <Toggle on={lane === 1} onClick={() => setLane((l) => (l === 0 ? 1 : 0))}>
                  <b>จบนอกเส้นแข่ง</b>
                  <span className="block text-xs text-white/60">ใช้ขวางทาง</span>
                </Toggle>
              </div>
              <button type="button" onClick={go} className="w-full rounded-full bg-(--color-f1) px-5 py-3 text-base font-bold text-white">
                เดิน
              </button>
            </div>
          )}
        </section>
      ) : null}

      {state.feed.length > 0 && (
        <section className="card p-3" aria-label="การเดินล่าสุด">
          <p className="mb-1.5 text-xs font-medium text-white/55">การเดินล่าสุด</p>
          <ul className="space-y-0.5 text-xs text-white/70">
            {state.feed.map((l, i) => (
              <li key={i}>{logText(state, l)}</li>
            ))}
          </ul>
        </section>
      )}

      <Rules />
    </div>
  );
}

function Rules() {
  return (
    <details className="card p-4 text-sm text-white/75">
      <summary className="cursor-pointer font-bold text-white">วิธีเล่น</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>ทีมละ 2 คัน แข่งกับรถ AI จนครบ {GRID_SIZE} คัน แต่ละรอบเทิร์นเดินตามอันดับ คันนำก่อน รถ AI เดินเอง</li>
        <li>
          ทุกตาเลือก <b>พื้นฐาน {BASE_MOVE} ช่อง</b> (ไม่สึกยาง) หรือ <b>เปิดไพ่ MOVE</b> ใบบนสุดของทีม ซึ่งเร็วกว่าแต่ไม่รู้ค่าก่อนเปิด
          ไพ่มีค่าตามยาง (เหลือง/แดง) — เปิดไพ่ได้เฉพาะรถบนเส้นแข่ง (ตาแรกของเกมนอกเส้นก็ได้)
        </li>
        <li>
          ไพ่ที่มีป้าย “สึก” ทำให้ยางเสื่อม (เหลือง 1 ขั้น แดง 2 ขั้น จากราง {WEAR_MAX} ขั้น) สุดรางแล้วเจออีกใบ = ยางพัง
          เดินเองช่องละ {WORN_MOVE} ใช้ไพ่และเหรียญไม่ได้ ต้องเข้าพิท
        </li>
        <li>เห็นระยะแล้วค่อยเลือกเสริม: ERS +{ERS_BONUS} (ตาละครั้ง ไพ่สายฟ้าชาร์จคืน), ATTACK, BLOCK และจะจบที่เลนไหน</li>
        <li>
          ช่องหนึ่งจุ 2 คัน ช่องเต็มผ่านไม่ได้ และแซงแนวทแยงผ่านรถ 2 คันที่อยู่เยื้องกันไม่ได้ — เข้าโค้ง (จุดแดง)
          ต้องหยุดในโค้งก่อน แล้วออกในตาถัดไป
        </li>
        <li>
          เหรียญคันละ {TOKEN_USES} ครั้ง: <b>ATTACK</b> จบติดท้ายคันหน้าบนเส้นแข่งแล้วดันมันออกนอกเส้น · <b>BLOCK</b>{" "}
          คันที่เดินต่อจากคุณแซงหรือขึ้นคู่ไม่ได้ · <b>SLIPSTREAM</b> ถ้าตามติดคันหน้าในเลนเดียวกันตอนมันออกตัว ตามไปติดท้ายได้ฟรี
        </li>
        <li>DRS: อยู่ในโซน DRS (สี่เหลี่ยมขาว) และมีรถติดหน้าในเลนเดียวกัน → ขึ้นไปอยู่หน้ามันแทนการเดินปกติ (ใช้ไม่ได้ตาแรก)</li>
        <li>
          พิท: ติ๊ก “ตั้งใจเข้าพิท” ให้หยุดในโซนเข้าพิท แล้วตาถัดไปเข้าเลนพิท (ช่องละ {PIT_SPEED}) ถึงช่องพิทจอด
          ตาหน้าเปลี่ยนยางแล้ววิ่งออก กลับเข้าสนามนอกเส้นแข่ง
        </li>
        <li>ข้ามเส้นชัยแล้วไม่ถูกแซง อันดับตามลำดับที่ข้ามเส้น จบเมื่อทุกคันเข้าเส้น</li>
      </ol>
    </details>
  );
}
