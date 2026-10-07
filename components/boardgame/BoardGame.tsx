"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Flag, RotateCcw, Zap } from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import Car from "@/components/boardgame/Car";
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
const tyreOf = (d: Driver) => (d.ai ? "#3a3a40" : COMPOUND_COLOR[d.compound]);
const KERB = "repeating-linear-gradient(90deg,#E10600 0 4px,#fff 4px 8px)";

const LAP_CHOICES = [4, 2, 1];
/** แถบสนามข้างหน้าแสดงกี่ช่อง */
const RIBBON = 12;
/** ความยาวแอนิเมชันไพ่ลอยขึ้นตอนกดเดิน (ตรงกับ .bg-play ใน globals.css) */
const PLAY_MS = 550;

/* ---------- แผนที่สนามทั้งวง ---------- */

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
    return { lanes: [at(-1), at(1)] as const, edge: at(2.3), pit: at(-3.6) };
  });
}

function MapView({ board, state, activeId }: { board: Board; state: GameState; activeId: number | null }) {
  const pad = 8;
  const off = 1.4;
  const geo = lanePoints(board.cells, off);
  const t = state.track;
  const pitCells = Array.from({ length: PIT_LEN }, (_, k) => lapCell(t, t.pitEntry.start + k));
  const pitLine = pitCells.map((c) => `${geo[c].pit.x},${geo[c].pit.y}`).join(" ");
  const pos = (d: Driver) =>
    d.pit ? geo[lapCell(t, d.pit.base + d.pit.pos)].pit : geo[lapCell(t, d.progress)].lanes[d.lane];
  const racers = state.drivers.filter((d) => d.finished === null);
  const start = board.cells[0];
  return (
    <section aria-label="แผนที่สนาม" className="relative rounded-2xl border border-white/10 bg-[#0f0f13] p-2">
      <svg
        viewBox={`${-pad} ${-pad} ${board.w + pad * 2} ${board.h + pad * 2}`}
        className="mx-auto block max-h-[17rem] w-full"
        role="img"
        aria-label={`แผนที่สนาม${board.name} รถบนสนาม ${racers.length} คัน`}
      >
        <path d={board.d} fill="none" stroke="#3a3a44" strokeWidth={off * 5.2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={board.d} fill="none" stroke="#24242b" strokeWidth={off * 4.2} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={pitLine} fill="none" stroke="#DEDEDE" strokeOpacity={0.35} strokeWidth={0.7} strokeDasharray="1 0.8" />
        <text x={geo[pitCells[BOX_AT]].pit.x} y={geo[pitCells[BOX_AT]].pit.y - 1.8} textAnchor="middle" fontSize={1.8} fontWeight={800} fill="#DEDEDE" fillOpacity={0.75}>
          PIT
        </text>
        <path d={board.d} fill="none" stroke="#E10600" strokeOpacity={0.5} strokeWidth={0.3} strokeDasharray="1.4 1" />
        {geo.map((g, i) => (
          <g key={i}>
            {zoneAt(t, t.corners, i) >= 0 && (
              <circle cx={g.edge.x} cy={g.edge.y} r={1} fill="#E10600" stroke="#fff" strokeWidth={0.35} />
            )}
            {zoneAt(t, t.drs, i) >= 0 && (
              <rect x={g.edge.x - 0.7} y={g.edge.y - 0.7} width={1.4} height={1.4} fill="#DEDEDE" fillOpacity={0.85} />
            )}
            {inZone(t.pitEntry, i) && <circle cx={g.edge.x} cy={g.edge.y} r={0.8} fill="none" stroke="#DEDEDE" strokeWidth={0.4} />}
          </g>
        ))}
        <rect x={start.x - 1.5} y={start.y - 1.5} width={3} height={3} fill="#fff" />
        <rect x={start.x - 1.5} y={start.y - 1.5} width={1.5} height={1.5} fill="#08080A" />
        <rect x={start.x} y={start.y} width={1.5} height={1.5} fill="#08080A" />
        {[...racers]
          .sort((a, b) => Number(b.ai) - Number(a.ai) || Number(a.id === activeId) - Number(b.id === activeId))
          .map((d) => {
            const p = pos(d);
            const c = look(d);
            const me = d.id === activeId;
            const r = d.ai ? 1.15 : 1.5;
            return (
              <g
                key={d.id}
                className="transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              >
                {me && <circle r={r + 1} fill="none" stroke="#E10600" strokeWidth={0.6} />}
                <circle
                  r={r}
                  fill={d.pit ? "transparent" : c.color}
                  stroke={d.pit ? "#DEDEDE" : d.ai ? "#08080A" : "#fff"}
                  strokeWidth={d.ai ? 0.3 : 0.45}
                  strokeDasharray={d.pit ? "0.6 0.5" : undefined}
                />
                <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} fontWeight={800} fill={d.pit ? "#DEDEDE" : c.ink}>
                  {d.num}
                </text>
              </g>
            );
          })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-white/60">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-(--color-f1)" aria-hidden />โค้ง</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-[#DEDEDE]" aria-hidden />DRS</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full border border-[#DEDEDE]" aria-hidden />โซนเข้าพิท</span>
      </div>
      <OsmCredit className="bottom-2 right-2" />
    </section>
  );
}

/* ---------- แถบสนามข้างหน้า ---------- */

function Ribbon({
  state, d, ghost,
}: {
  state: GameState;
  d: Driver;
  ghost: { progress: number; lane: Lane } | null;
}) {
  const t = state.track;
  const from = d.progress;
  const cells = Array.from({ length: RIBBON }, (_, i) => from + i);
  const carAt = (q: number, lane: Lane) =>
    state.drivers.find((o) => onTrack(o) && o.progress === q && o.lane === lane && o.id !== d.id);
  const corners = cells.filter((q) => zoneAt(t, t.corners, q) >= 0).map((q) => lapCell(t, q));
  return (
    <section aria-label="สนามข้างหน้า">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="poster text-xs text-white">ข้างหน้า #{d.num}</span>
        <span className="truncate text-[11px] text-white/60">
          {corners.length ? `โค้งที่ช่อง ${corners.join(", ")}` : "ทางโล่ง ไม่มีโค้งใน 12 ช่อง"}
        </span>
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#24242b] p-1.5 pb-1">
        <div className="grid grid-cols-12 gap-0.5">
          {cells.map((q) => {
            const corner = zoneAt(t, t.corners, q) >= 0;
            const drs = zoneAt(t, t.drs, q) >= 0;
            const entry = inZone(t.pitEntry, lapCell(t, q));
            const lane = corner ? "#3b2a2c" : "#2f2f37";
            const slot = (l: Lane) => {
              const isGhost = ghost && ghost.progress === q && ghost.lane === l;
              const isMe = q === from && l === d.lane && d.pit === null;
              const other = carAt(q, l);
              return (
                <div
                  className="flex h-8 items-center justify-center rounded-md"
                  style={{ background: lane, outline: isGhost ? "2px dashed #fff" : undefined, outlineOffset: -2 }}
                >
                  {isGhost ? (
                    <Car color={look(d).color} ink={look(d).ink} num={d.num} ghost width={28} className="bg-ghost" />
                  ) : isMe ? (
                    <span className={`rounded-md ${ghost ? "opacity-40" : "bg-live"}`}>
                      <Car color={look(d).color} ink={look(d).ink} num={d.num} tyre={tyreOf(d)} width={28} />
                    </span>
                  ) : other ? (
                    <Car color={look(other).color} ink={look(other).ink} num={other.num} tyre={tyreOf(other)} width={other.ai ? 24 : 28} />
                  ) : null}
                </div>
              );
            };
            const lc = lapCell(t, q);
            return (
              <div key={q} className="flex min-w-0 flex-col gap-0.5">
                <div className="h-1 rounded-sm" style={{ background: corner ? KERB : entry ? "rgba(222,222,222,.35)" : "transparent" }} />
                {slot(0)}
                {slot(1)}
                <div className="h-1 rounded-sm" style={{ background: drs ? "#DEDEDE" : "transparent" }} />
                <span className={`text-center text-[9px] tabular-nums ${lc === 0 ? "font-bold text-(--color-f1-text)" : "text-white/55"}`}>
                  {lc === 0 ? "S" : lc}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/60">
        <span className="flex items-center gap-1"><span className="h-1 w-3.5 rounded-sm" style={{ background: KERB }} />โค้ง ต้องหยุด</span>
        <span className="flex items-center gap-1"><span className="h-1 w-3.5 rounded-sm bg-[#DEDEDE]" />DRS</span>
        <span>แถวบน = เส้นแข่ง</span>
      </div>
    </section>
  );
}

/* ---------- ชิ้นส่วนแผงนักขับ ---------- */

function Meter({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="flex flex-1 items-center gap-0.5" role="img" aria-label={`${label} ${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2.5 flex-1 rounded-sm" style={{ background: i < value ? color : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

function Stat({ label, foot, children }: { label: string; foot: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-[#1a1a20] p-2">
      <span className="text-[10px] text-white/60">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
      <span className="truncate text-[10px] text-white/60">{foot}</span>
    </div>
  );
}

function Coin({ n, style }: { n: number; style: CSSProperties }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white tabular-nums" style={style}>
      {n}
    </span>
  );
}

/** ไพ่ตัวเลือกในมือ — ปุ่มจริง แจกเข้ามือทีละใบ */
function HandCard({
  i, onClick, disabled, tone, kicker, big, foot, peek = false,
}: {
  i: number;
  onClick: () => void;
  disabled?: boolean;
  tone: "dark" | "red" | "light" | "yellow";
  kicker: string;
  big: ReactNode;
  foot: string;
  peek?: boolean;
}) {
  const tones = {
    dark: "bg-[#1F1F24] text-white border-white/20",
    red: "bg-(--color-f1) text-white border-white shadow-[4px_4px_0_#8a0400,8px_8px_0_#4d0200]",
    light: "bg-[#DEDEDE] text-[#08080A] border-white",
    yellow: "bg-[#facc15] text-[#08080A] border-white",
  } as const;
  return (
    <div className="bg-deal" style={{ animationDelay: `${i * 0.09}s` }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-36 w-full flex-col justify-between rounded-2xl border-2 p-2.5 text-left transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none ${tones[tone]} ${peek && !disabled ? "bg-peek" : ""}`}
      >
        <span className="poster text-[11px] opacity-80">{kicker}</span>
        <span className="poster text-center text-4xl leading-none">{big}</span>
        <span className="text-center text-[10px] leading-tight opacity-80">{foot}</span>
      </button>
    </div>
  );
}

/** ไพ่ MOVE ที่เปิดแล้ว: พลิกจากหลังไพ่มาหน้าไพ่ตอนแสดงครั้งแรก */
function MoveCard3D({ id, compound, playing }: { id: number; compound: Compound; playing: boolean }) {
  const c = MOVE_DECK[id];
  return (
    <div className={`bg-stage h-[188px] w-[132px] flex-none ${playing ? "bg-play" : ""}`}>
      <div className="bg-card3d bg-flip h-full w-full" role="img" aria-label={`ไพ่ MOVE ยางเหลือง ${c.y} ยางแดง ${c.r}${c.tires ? " มีป้ายสึก" : ""}${c.ers ? " มีสายฟ้า" : ""}`}>
        <div className="bg-face flex flex-col items-center justify-center gap-2 border-[3px] border-white bg-(--color-f1)">
          <span className="poster text-2xl text-white">MOVE</span>
        </div>
        <div className="bg-face bg-front flex flex-col gap-2 border-[3px] border-white bg-[#f4f4f2] p-2.5 text-[#08080A]">
          <div className="flex items-center justify-between">
            <span className="poster text-xs">MOVE</span>
            <span className="flex gap-1">
              {c.tires && <span className="rounded-md bg-(--color-f1) px-1.5 py-0.5 text-[10px] font-extrabold text-white">สึก</span>}
              {c.ers && (
                <span className="flex items-center rounded-md bg-[#08080A] px-1 py-0.5">
                  <Zap className="h-2.5 w-2.5 fill-white text-white" aria-hidden />
                </span>
              )}
            </span>
          </div>
          {(["yellow", "red"] as Compound[]).map((k) => (
            <div
              key={k}
              className={`flex items-center justify-between rounded-lg px-2 py-0.5 ${k === compound ? "bg-[#08080A] text-white" : "bg-[#e7e7e3] text-black/55"}`}
            >
              <span className="flex items-center gap-1 text-[10px] font-semibold">
                <span className="h-2.5 w-2.5 rounded-full border border-current" style={{ background: COMPOUND_COLOR[k] }} />
                {COMPOUNDS[k].label}
              </span>
              <span className={`poster tabular-nums ${k === compound ? "text-4xl" : "text-2xl"}`}>{moveValue(c, k)}</span>
            </div>
          ))}
          <span className="mt-auto text-[10px] leading-snug text-black/70">
            {c.tires ? "ยางสึก (เหลือง 1 · แดง 2)" : "ไม่สึกยาง"}
            {c.ers ? " · ชาร์จ ERS ถ้าไม่ใช้ตานี้" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function SimpleCard({ kicker, value, playing }: { kicker: string; value: number; playing: boolean }) {
  return (
    <div className={`flex h-[188px] w-[132px] flex-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/25 bg-[#1F1F24] ${playing ? "bg-play" : ""}`}>
      <span className="poster text-xs text-white/70">{kicker}</span>
      <span className="poster text-6xl leading-none text-white tabular-nums">{value}</span>
    </div>
  );
}

function ExtraButton({
  on, disabled, onClick, icon, title, foot,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  foot: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[76px] flex-col items-center gap-1 rounded-2xl border-2 px-1.5 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-(--color-f1) bg-(--color-f1)/15" : "border-white/15 bg-[#1a1a20] hover:border-white/35"
      }`}
    >
      {icon}
      <span className="text-xs font-extrabold text-white">{title}</span>
      <span className="text-center text-[10px] leading-tight text-white/60">{foot}</span>
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
        <p className="mb-2 text-xs font-medium text-white/55">จำนวนผู้เล่น (ทีมละ 2 คัน ที่เหลือเป็นรถ AI จนครบ {GRID_SIZE} คัน)</p>
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
            <div key={di} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-bold">
                <Car color={team.color} ink={team.ink} num={dr.num} tyre={COMPOUND_COLOR[compounds[ti][di]]} width={40} />
                {dr.name}
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

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function BoardGame({ board }: { board: Board }) {
  const [state, setState] = useState<GameState | null>(null);
  const [box, setBox] = useState(false);
  const [ers, setErs] = useState(false);
  const [attack, setAttack] = useState(false);
  const [block, setBlock] = useState(false);
  const [lane, setLane] = useState<Lane>(0);
  const [playing, setPlaying] = useState(false);

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
  const atk = attack && canAttack;
  const landing = preview && atk ? { progress: preview.progress + 1, lane: 0 as Lane } : preview;
  const canBlock = !!d && d.tokens.block > 0 && state.order[state.turn + 1] !== undefined;
  const lap = (x: Driver) => Math.min(state.laps, Math.max(1, Math.floor(x.progress / CELLS_PER_LAP) + 1));

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="poster text-[11px] text-(--color-f1-text)">GRAND PRIX TOUR · {board.name}</p>
          <p className="text-xs text-white/60">เทิร์นที่ {state.round} · รถ {GRID_SIZE} คัน</p>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <span className="poster rounded-full bg-[#1F1F24] px-2.5 py-1.5 text-[13px] text-white tabular-nums">
            LAP {lap(order[0])}/{state.laps}
          </span>
          {d && <span className="poster rounded-full bg-(--color-f1) px-2.5 py-1.5 text-[13px] text-white tabular-nums">P{pos}</span>}
        </div>
      </header>

      <MapView board={board} state={state} activeId={d?.id ?? null} />

      {d && <Ribbon state={state} d={d} ghost={landing} />}

      <section aria-label="อันดับ" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {order.map((x, rank) => {
          const c = look(x);
          const me = d?.id === x.id;
          return (
            <span
              key={x.id}
              className={`flex flex-none items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] ${me ? "bg-(--color-f1)/20 font-extrabold text-white" : x.ai ? "bg-[#141418] text-white/70" : "bg-[#1a1a20] font-bold text-white"}`}
            >
              <span className="poster text-white/60 tabular-nums">P{rank + 1}</span>
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-extrabold" style={{ background: c.color, color: c.ink }}>
                {x.num}
              </span>
              {x.finished !== null
                ? "เข้าเส้น"
                : x.pit
                  ? "พิท"
                  : rank === 0
                    ? "นำ"
                    : `+${order[0].progress - x.progress}`}
            </span>
          );
        })}
      </section>

      {state.over ? (
        <section className="card-poster space-y-3 rounded-2xl border border-white/10 p-5 text-center" role="status">
          <Flag className="mx-auto h-6 w-6 text-(--color-f1-text)" aria-hidden />
          <div className="flex justify-center">
            <Car color={look(order[0]).color} ink={look(order[0]).ink} num={order[0].num} tyre={tyreOf(order[0])} width={120} label={`รถหมายเลข ${order[0].num}`} />
          </div>
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
          <button type="button" onClick={restart} className="inline-flex items-center gap-2 rounded-full bg-(--color-f1) px-5 py-2.5 text-sm font-bold text-white">
            <RotateCcw className="h-4 w-4" aria-hidden /> แข่งใหม่
          </button>
        </section>
      ) : d && o ? (
        <section aria-label="ตานักขับ" className="space-y-3 rounded-t-3xl border-t border-white/10 bg-[#121216] px-4 pb-5 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-live flex-none rounded-xl bg-[#1a1a20] p-1">
              <Car color={look(d).color} ink={look(d).ink} num={d.num} tyre={tyreOf(d)} width={64} label={`รถหมายเลข ${d.num}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold text-white">{d.name} · ถึงตาคุณ</p>
              <p className="truncate text-xs text-white/60">
                {HUMAN_TEAMS[d.team]?.name} ·{" "}
                {d.pit ? (d.pit.inBox ? "จอดในช่องพิท" : "อยู่ในเลนพิท") : d.lane === 0 ? "บนเส้นแข่ง" : "นอกเส้นแข่ง"}
                {onTrack(d) && zoneAt(state.track, state.track.corners, d.progress) >= 0 && " · อยู่ในโค้ง"}
              </p>
            </div>
            <span className="poster text-3xl text-white tabular-nums">P{pos}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label={`ยาง${COMPOUNDS[d.compound].label}`} foot={d.worn ? "ยางพัง!" : `เหลือ ${WEAR_MAX - d.wear}/${WEAR_MAX}`}>
              {d.worn ? (
                <span className="text-xs font-extrabold text-yellow-400">ต้องเข้าพิท</span>
              ) : (
                <Meter value={WEAR_MAX - d.wear} max={WEAR_MAX} color={COMPOUND_COLOR[d.compound]} label="ยางเหลือ" />
              )}
            </Stat>
            <Stat label="ERS" foot={`${d.ers}/${ERS_MAX} · +${ERS_BONUS} ช่อง`}>
              <Meter value={d.ers} max={ERS_MAX} color="#DEDEDE" label="ERS" />
              <Zap className="h-3 w-3 text-[#DEDEDE]" aria-hidden />
            </Stat>
            <Stat label="เหรียญ" foot="ATK · BLK · SLIP">
              <Coin n={d.tokens.attack} style={{ border: "2px solid #E10600" }} />
              <Coin n={d.tokens.block} style={{ border: "2px solid #DEDEDE" }} />
              <Coin n={d.tokens.slip} style={{ border: "2px dashed #DEDEDE" }} />
            </Stat>
          </div>

          {!p && (
            <>
              <div className="flex items-baseline justify-between">
                <span className="poster text-sm text-white">เลือกไพ่ที่จะเล่น</span>
                <span className="text-[11px] text-white/60">
                  ยางสำรอง{" "}
                  {d.sets.length === 0
                    ? "หมด"
                    : d.sets.map((s, i) => (
                        <span key={i} role="img" aria-label={`ยาง${COMPOUNDS[s].label}`} className="ml-0.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COMPOUND_COLOR[s] }} />
                      ))}
                </span>
              </div>
              {"inBox" in o ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {o.inBox ? (
                    d.sets.length ? (
                      [...new Set(d.sets)].map((k, i) => (
                        <HandCard key={k} i={i} tone={k === "red" ? "red" : "yellow"} kicker="PIT" big={<span className="text-2xl">{COMPOUNDS[k].label}</span>} foot="ใส่ยางชุดนี้แล้วออก" onClick={() => pick({ kind: "box", set: k })} />
                      ))
                    ) : (
                      <HandCard i={0} tone="dark" kicker="PIT" big="→" foot="ยางหมด ออกจากพิท" onClick={() => pick({ kind: "box" })} />
                    )
                  ) : (
                    <HandCard i={0} tone="yellow" kicker="PIT LANE" big={PIT_SPEED} foot="วิ่งในเลนพิท แซงไม่ได้" onClick={() => pick({ kind: "pitLane" })} />
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    {o.worn ? (
                      <HandCard i={0} tone="yellow" kicker="ยางพัง" big={WORN_MOVE} foot="เดินเอง ใช้ไพ่/เหรียญไม่ได้" onClick={() => pick({ kind: "worn" })} />
                    ) : (
                      <HandCard i={0} tone="dark" kicker="BASE" big={BASE_MOVE} foot="ไม่สึกยาง" onClick={() => pick({ kind: "base" })} />
                    )}
                    <HandCard
                      i={1}
                      tone="red"
                      kicker="MOVE"
                      big={<span className="text-2xl">»»»</span>}
                      foot={o.card ? `แตะเพื่อเปิด · เหลือ ${state.teams[d.team]?.moveDeck.length ?? 0} ใบ` : "ต้องอยู่บนเส้นแข่ง"}
                      disabled={!o.card}
                      peek
                      onClick={() => pick({ kind: "card" })}
                    />
                    {o.drs && (
                      <HandCard i={2} tone="light" kicker="DRS" big={<span className="text-xl">แซง</span>} foot={`ขึ้นหน้า #${drsTarget(state, d)?.num}`} onClick={() => pick({ kind: "drs" })} />
                    )}
                    {o.slip && (
                      <HandCard i={3} tone="dark" kicker="SLIP" big="→" foot={`ตามติด #${slipTargetOf(state, d)?.num} ฟรี`} onClick={() => pick({ kind: "slip" })} />
                    )}
                    {o.pitIn && (
                      <HandCard i={4} tone="yellow" kicker="PIT" big={PIT_SPEED} foot="เข้าเลนพิท" onClick={() => pick({ kind: "pitIn" })} />
                    )}
                  </div>
                  {!o.worn && (
                    <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[#1a1a20] px-3 text-xs text-white/75">
                      <input type="checkbox" checked={box} onChange={(e) => setBox(e.target.checked)} className="h-4 w-4 accent-[#E10600]" />
                      จะเข้าพิท — หยุดในโซนเข้าพิทถ้าวิ่งผ่าน
                    </label>
                  )}
                </>
              )}
            </>
          )}

          {p && preview && landing && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                {p.card !== null ? (
                  <MoveCard3D key={p.card + state.round * 100} id={p.card} compound={d.compound} playing={playing} />
                ) : (
                  <SimpleCard kicker={p.kind === "drs" ? "DRS" : "BASE"} value={p.value} playing={playing} />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="poster text-xs text-white/70">ระยะเดิน</p>
                  <p className="poster text-6xl leading-none text-white tabular-nums">{landing.progress - d.progress}</p>
                  <p className="text-xs leading-snug text-white/70">
                    ไปช่อง {lapCell(state.track, landing.progress)}
                    {atk && " · ดันคันหน้าออกนอกเส้น"}
                  </p>
                  {preview.corner && <p className="text-xs font-semibold text-yellow-400">ติดโค้ง — ต้องหยุดในโค้ง</p>}
                  {preview.blocked && <p className="text-xs font-semibold text-yellow-400">ติดรถข้างหน้า</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ExtraButton
                  on={ers && d.ers > 0}
                  disabled={d.ers <= 0 || playing}
                  onClick={() => setErs((v) => !v)}
                  icon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DEDEDE]"><Zap className="h-4 w-4 fill-[#08080A] text-[#08080A]" aria-hidden /></span>}
                  title={`ERS +${ERS_BONUS}`}
                  foot={`เหลือ ${d.ers}/${ERS_MAX}`}
                />
                <ExtraButton
                  on={atk}
                  disabled={d.tokens.attack <= 0 || !canAttack || playing}
                  onClick={() => setAttack((v) => !v)}
                  icon={<Coin n={d.tokens.attack} style={{ border: "3px solid #E10600", width: 32, height: 32 }} />}
                  title="ATTACK"
                  foot={canAttack ? "ดันคันหน้าออก" : "ต้องจบติดท้ายคันหน้า"}
                />
                <ExtraButton
                  on={block}
                  disabled={!canBlock || playing}
                  onClick={() => setBlock((v) => !v)}
                  icon={<Coin n={d.tokens.block} style={{ border: "3px solid #DEDEDE", width: 32, height: 32 }} />}
                  title="BLOCK"
                  foot="คันถัดไปแซงไม่ได้"
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[#1a1a20] px-3 text-xs text-white/75">
                <input type="checkbox" checked={lane === 1} onChange={(e) => setLane(e.target.checked ? 1 : 0)} className="h-4 w-4 accent-[#E10600]" />
                จบนอกเส้นแข่ง (ใช้ขวางทาง)
              </label>
              <button type="button" onClick={go} disabled={playing} className="min-h-[52px] w-full rounded-full bg-(--color-f1) px-5 text-base font-bold text-white disabled:opacity-70">
                เดิน {landing.progress - d.progress} ช่อง{block ? " + BLOCK" : ""}
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
          ทุกตาเลือกไพ่: <b>BASE {BASE_MOVE} ช่อง</b> (ไม่สึกยาง) หรือ <b>เปิดไพ่ MOVE</b> ใบบนสุดของทีม ซึ่งเร็วกว่าแต่ไม่รู้ค่าก่อนเปิด
          ค่าตามยาง (เหลือง/แดง) — เปิดได้เฉพาะรถบนเส้นแข่ง (ตาแรกของเกมนอกเส้นก็ได้)
        </li>
        <li>
          ไพ่ที่มีป้าย “สึก” ทำให้ยางเสื่อม (เหลือง 1 ขั้น แดง 2 ขั้น จากราง {WEAR_MAX} ขั้น) สุดรางแล้วเจออีกใบ = ยางพัง
          เดินเองช่องละ {WORN_MOVE} ใช้ไพ่และเหรียญไม่ได้ ต้องเข้าพิท
        </li>
        <li>เปิดไพ่แล้วค่อยเลือกเสริม: ERS +{ERS_BONUS} (ตาละครั้ง ไพ่สายฟ้าชาร์จคืน), ATTACK, BLOCK และจะจบนอกเส้นไหม — แถบสนามข้างหน้าขึ้นรถเส้นประตรงช่องที่จะไปถึง</li>
        <li>ช่องหนึ่งจุ 2 คัน ช่องเต็มผ่านไม่ได้ และแซงแนวทแยงผ่านรถ 2 คันที่อยู่เยื้องกันไม่ได้ — เข้าโค้ง (ขอบแดงขาว) ต้องหยุดในโค้งก่อน แล้วออกในตาถัดไป</li>
        <li>
          เหรียญคันละ {TOKEN_USES} ครั้ง: <b>ATTACK</b> จบติดท้ายคันหน้าบนเส้นแข่งแล้วดันมันออกนอกเส้น · <b>BLOCK</b>{" "}
          คันที่เดินต่อจากคุณแซงหรือขึ้นคู่ไม่ได้ · <b>SLIPSTREAM</b> ถ้าตามติดคันหน้าในเลนเดียวกันตอนมันออกตัว ตามไปติดท้ายได้ฟรี
        </li>
        <li>DRS: อยู่ในโซน DRS (แถบขาว) และมีรถติดหน้าในเลนเดียวกัน → ขึ้นไปอยู่หน้ามันแทนการเดินปกติ (ใช้ไม่ได้ตาแรก)</li>
        <li>
          พิท: ติ๊ก “จะเข้าพิท” ให้หยุดในโซนเข้าพิท แล้วตาถัดไปเข้าเลนพิท (ช่องละ {PIT_SPEED}) ถึงช่องพิทจอด ตาหน้าเปลี่ยนยางแล้ววิ่งออก
          กลับเข้าสนามนอกเส้นแข่ง
        </li>
        <li>ข้ามเส้นชัยแล้วไม่ถูกแซง อันดับตามลำดับที่ข้ามเส้น จบเมื่อทุกคันเข้าเส้น</li>
      </ol>
    </details>
  );
}
