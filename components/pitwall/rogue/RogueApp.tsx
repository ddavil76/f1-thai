"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Coins, Crown, Flag, Heart, HelpCircle, Layers, Lock, Star, Wrench, Zap } from "lucide-react";
import Live from "@/components/pitwall/Live";
import { Btn, Card, Head, TyreDot, teamOf } from "@/components/pitwall/ui";
import { Room, type Msg, type RunRaceCfg, type Snapshot } from "@/lib/pitwall/room";
import type { StrategyKind } from "@/lib/pitwall/race";
import { activeSets, SET_BONUS, SET_SIZE, STARTERS, STRATEGY, UPGRADES, type Rarity, type StarterId, type Tag, type UpgradeId } from "@/lib/pitwall/rogue/cards";
import {
  ACTS, BOSS, buy, chooseEvent, chooseReward, choices, enter, EVENTS, fameOf, finishRace, isRace, LAPS, leaveShop, newRun, nodeOf, playerCar, raceCfg, targetOf,
  type MapNode, type NodeKind, type Reward, type RunState, type ShopItem,
} from "@/lib/pitwall/rogue/run";
import { circuitName, TEAMS } from "@/lib/pitwall/teams";
import { COMPOUNDS, COMPOUND_INFO, type Compound } from "@/lib/pitwall/types";

const RUN_KEY = "pitwall-rogue-run";
const META_KEY = "pitwall-rogue-meta";
/** สถิติข้ามรัน: ชื่อเสียงสะสม (ปลดล็อก) · จำนวนรัน/แชมป์ */
type Meta = { fame: number; runs: number; wins: number };

function load<T>(key: string): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, v: unknown) {
  try {
    if (v === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // เก็บไม่ได้ก็เล่นต่อได้ (ปิดหน้าแล้วรันหาย)
  }
}

const KIND: Record<NodeKind, { label: string; icon: typeof Flag }> = {
  race: { label: "เรซ", icon: Flag },
  sprint: { label: "สปรินต์", icon: Zap },
  shop: { label: "โรงงาน", icon: Wrench },
  event: { label: "อีเวนต์", icon: HelpCircle },
  boss: { label: "บอส", icon: Crown },
};
const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: "ธรรมดา", color: "#DEDEDE" },
  rare: { label: "หายาก", color: "#38bdf8" },
  legend: { label: "ตำนาน", color: "#facc15" },
  curse: { label: "คำสาป", color: "#ff3b2f" },
};
const STRAT_COLOR = "#a855f7";

/**
 * โหมด Roguelike "ฤดูกาลเอาตัวรอด": ตั้งค่ารัน → แผนที่ → เรซ/โรงงาน/อีเวนต์ → รางวัล → … → บอส 2 ช่วง
 * สถานะรันเก็บในเครื่อง (ปิดแล้วกลับมาเล่นต่อได้)
 */
export default function RogueApp({ onExit }: { onExit: () => void }) {
  const [run, setRunState] = useState<RunState | null>(null);
  const [meta, setMeta] = useState<Meta>({ fame: 0, runs: 0, wins: 0 });
  const [racing, setRacing] = useState<(RunRaceCfg & { target: number }) | null>(null);
  const [eventText, setEventText] = useState<string | null>(null);
  const [garage, setGarage] = useState(false);
  useEffect(() => {
    let r = load<RunState>(RUN_KEY);
    const m = load<Meta>(META_KEY) ?? { fame: 0, runs: 0, wins: 0 };
    // ออกจากหน้ากลางเรซ = ไม่จบการแข่ง
    if (r?.inRace && r.at !== null) {
      r = finishRace(r, TEAMS.length * 2, true);
      save(RUN_KEY, r);
      if (r.status === "won" || r.status === "lost") {
        Object.assign(m, { fame: m.fame + fameOf(r), runs: m.runs + 1, wins: m.wins + (r.status === "won" ? 1 : 0) });
        save(META_KEY, m);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านรันที่เล่นค้างไว้หลังโหลดหน้า
    setRunState(r);
    setMeta(m);
  }, []);
  const setRun = (r: RunState | null) => {
    setRunState(r);
    save(RUN_KEY, r);
    window.scrollTo({ top: 0 });
  };
  // จบรัน: บวกชื่อเสียงครั้งเดียว
  const end = (r: RunState) => {
    const m = { fame: meta.fame + fameOf(r), runs: meta.runs + 1, wins: meta.wins + (r.status === "won" ? 1 : 0) };
    setMeta(m);
    save(META_KEY, m);
  };

  if (!run) return <Setup meta={meta} onExit={onExit} onStart={(team, starter, heat) => setRun(newRun((Date.now() & 0x7fffffff) || 1, team, starter, heat))} />;

  if (racing)
    return (
      <RaceStage
        key={`${run.at}-${run.log.length}`}
        cfg={racing}
        team={run.team}
        seed={run.seed ^ ((run.at ?? 0) * 104729)}
        onDone={(pos, dnf) => {
          const r = finishRace(run, pos, dnf);
          setRacing(null);
          setRun(r);
          if (r.status === "won" || r.status === "lost") end(r);
        }}
      />
    );

  if (run.status === "won" || run.status === "lost") return <RunEnd run={run} meta={meta} onNew={() => setRun(null)} onExit={onExit} />;

  const node = run.at !== null ? nodeOf(run, run.at) : null;
  const atRace = node && isRace(node.kind) && !run.done.includes(node.id) && run.status === "map";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Btn tone="ghost" onClick={onExit}>
          <ChevronLeft className="inline h-4 w-4" /> กลับ
        </Btn>
        <Btn tone="ghost" onClick={() => setGarage((g) => !g)}>
          <Layers className="inline h-4 w-4" /> {garage ? "ปิดรถและการ์ด" : "รถและการ์ด"}
        </Btn>
      </div>
      <Hud run={run} />
      {garage && <Garage run={run} />}

      {run.pending?.kind === "reward" ? (
        <RewardPick run={run} onPick={(i) => setRun(chooseReward(run, i))} />
      ) : run.pending?.kind === "shop" ? (
        <Shop run={run} onBuy={(i, arg) => setRun(buy(run, i, arg))} onLeave={() => setRun(leaveShop(run))} />
      ) : run.pending?.kind === "event" || eventText ? (
        <EventView
          run={run}
          result={eventText}
          onChoose={(i) => {
            const res = chooseEvent(run, i);
            if (res.run === run) return setEventText(res.text || null);
            setEventText(res.text);
            setRun(res.run);
          }}
          onNext={() => setEventText(null)}
        />
      ) : atRace && node ? (
        <PreRace
          run={run}
          node={node}
          onStart={(tyre) => {
            setRacing(raceCfg(run, node, tyre));
            setRun({ ...run, inRace: true });
          }}
        />
      ) : (
        <MapView run={run} onPick={(id) => setRun(enter(run, id))} />
      )}
      {!garage && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("ยอมแพ้รันนี้? (ได้ชื่อเสียงตามที่ทำได้)")) {
              const r = { ...run, status: "lost" as const };
              end(r);
              setRun(r);
            }
          }}
          className="block w-full text-center text-xs text-white/50 underline-offset-2 hover:underline"
        >
          ยอมแพ้รันนี้
        </button>
      )}
    </div>
  );
}

/* ---------------- ตั้งค่ารัน ---------------- */

function Setup({ meta, onStart, onExit }: { meta: Meta; onStart: (team: number, starter: StarterId, heat: number) => void; onExit: () => void }) {
  const [team, setTeam] = useState(TEAMS.length - 1);
  const [starter, setStarter] = useState<StarterId>("tyre");
  const [heat, setHeat] = useState(0);
  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onExit}>
        <ChevronLeft className="inline h-4 w-4" /> กลับ
      </Btn>
      <Card>
        <Head kicker="ROGUELIKE · ฤดูกาลเอาตัวรอด" title="เริ่มรันใหม่" sub="คุมรถคันเดียวของทีมท้ายตาราง ผ่าน 2 ช่วงของฤดูกาลให้ถึงแชมป์ — พลาดเป้าเสียความเชื่อมั่น หมดเมื่อไรจบรัน" />
        <ul className="space-y-1 text-[13px] text-white/75">
          <li>🗺️ เลือกเส้นทางบนแผนที่: เรซ · สปรินต์ · โรงงาน · อีเวนต์ · บอสท้ายช่วง</li>
          <li>🃏 ชนะแล้วเลือกการ์ด: อัปเกรดรถถาวร หรือการ์ดกลยุทธ์ไว้ใช้ระหว่างแข่ง</li>
          <li>⚡ ระหว่างแข่งใช้พลังทีมเล่นการ์ด ได้ +1 ทุกรอบ</li>
        </ul>
        <p className="text-xs text-white/55 tabular-nums">
          ชื่อเสียงสะสม {meta.fame} · เล่นแล้ว {meta.runs} รัน · แชมป์ {meta.wins} ครั้ง
        </p>
      </Card>
      <Card>
        <Head kicker="ขั้นที่ 1" title="สีทีม" sub="ทุกสีเริ่มเป็นทีมช้าสุดเท่ากัน" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TEAMS.map((t, i) => (
            <button key={t.id} type="button" aria-pressed={team === i} onClick={() => setTeam(i)} className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-2 text-left text-xs font-bold ${team === i ? "border-white bg-white/10" : "border-white/10"}`}>
              <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 truncate">{t.name}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <Head kicker="ขั้นที่ 2" title="ชุดเริ่มต้น" sub="ได้การ์ดอัปเกรด 1 ใบ + การ์ดกลยุทธ์ 1 ใบ ตามสาย" />
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(STARTERS) as StarterId[]).map((k) => {
            const s = STARTERS[k];
            const locked = meta.fame < s.unlock;
            return (
              <button
                key={k}
                type="button"
                disabled={locked}
                aria-pressed={starter === k}
                onClick={() => setStarter(k)}
                className={`rounded-xl border-2 p-3 text-left disabled:opacity-50 ${starter === k ? "border-white bg-white/10" : "border-white/10"}`}
              >
                <span className="flex items-center justify-between">
                  <b className="text-sm">{s.name}</b>
                  {locked && (
                    <span className="flex items-center gap-1 text-[11px] text-white/60">
                      <Lock className="h-3 w-3" /> ชื่อเสียง {s.unlock}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-white/65">{s.text}</span>
                <span className="mt-1 block text-[11px] text-white/80">
                  + {UPGRADES[s.card].name} · + {STRATEGY[s.extra].name}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      {meta.wins > 0 && (
        <Card>
          <Head kicker="ความยาก" title={`Heat ${heat}`} sub="ทีมอื่นเร็วขึ้น · เป้ายากขึ้น · ชนะได้ชื่อเสียงมากขึ้น (ปลดล็อกทีละขั้นเมื่อได้แชมป์)" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.min(10, meta.wins) + 1 }, (_, h) => (
              <button key={h} type="button" aria-pressed={heat === h} onClick={() => setHeat(h)} className={`min-h-10 min-w-10 rounded-lg text-sm font-bold ${heat === h ? "bg-white text-[#08080A]" : "bg-white/10"}`}>
                {h}
              </button>
            ))}
          </div>
        </Card>
      )}
      <Btn className="w-full" onClick={() => onStart(team, starter, heat)}>
        เริ่มรัน
      </Btn>
    </div>
  );
}

/* ---------------- แถบสถานะ ---------------- */

function Hud({ run }: { run: RunState }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm tabular-nums">
      <span className="poster text-(--color-f1-text)">
        ช่วง {run.act + 1}/{ACTS}
      </span>
      <span className="flex items-center gap-1" aria-label={`ความเชื่อมั่น ${run.rep} จาก ${run.maxRep}`}>
        {Array.from({ length: run.maxRep }, (_, i) => (
          <Heart key={i} className={`h-4 w-4 ${i < run.rep ? "fill-(--color-f1) text-(--color-f1)" : "text-white/25"}`} />
        ))}
      </span>
      <span className="flex items-center gap-1">
        <Coins className="h-4 w-4 text-[#facc15]" /> {run.money}
      </span>
      <span className="flex items-center gap-1" aria-label={`ขั้นทีม ${run.tier + 1}`}>
        {Array.from({ length: run.tier + 1 }, (_, i) => (
          <Star key={i} className="h-4 w-4 fill-[#facc15] text-[#facc15]" />
        ))}
      </span>
      <span className="text-xs text-white/60">
        อัปเกรด {run.cards.length} · การ์ดกลยุทธ์ {run.deck.length}
        {run.heat ? ` · Heat ${run.heat}` : ""}
      </span>
    </div>
  );
}

/* ---------------- แผนที่ ---------------- */

const ROW_H = 92;

function MapView({ run, onPick }: { run: RunState; onPick: (id: number) => void }) {
  const m = run.maps[run.act];
  const rows = Math.max(...m.nodes.map((n) => n.row)) + 1;
  const width = (row: number) => m.nodes.filter((n) => n.row === row).length;
  const xOf = (n: MapNode) => ((n.col + 1) / (width(n.row) + 1)) * 100;
  const yOf = (n: MapNode) => n.row * ROW_H + 36;
  const open = new Set(choices(run).map((n) => n.id));
  const H = rows * ROW_H;
  return (
    <Card>
      <Head kicker={`ช่วงที่ ${run.act + 1}`} title="เลือกเส้นทาง" sub={open.size ? "แตะจุดที่กระพริบเพื่อไปต่อ — บอสอยู่ล่างสุด" : "…"} />
      <div className="relative mx-auto w-full max-w-md" style={{ height: H }}>
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
          {m.nodes.flatMap((n) =>
            n.next.map((id) => {
              const b = nodeOf(run, id);
              const walked = run.done.includes(n.id) && (run.done.includes(id) || run.at === id);
              return <line key={`${n.id}-${id}`} x1={xOf(n)} y1={yOf(n)} x2={xOf(b)} y2={yOf(b)} stroke={walked ? "#E10600" : "rgba(255,255,255,0.18)"} strokeWidth={walked ? 3 : 2} vectorEffect="non-scaling-stroke" strokeDasharray={walked ? undefined : "4 5"} />;
            }),
          )}
        </svg>
        {m.nodes.map((n) => {
          const K = KIND[n.kind];
          const Icon = K.icon;
          const done = run.done.includes(n.id);
          const here = run.at === n.id;
          const can = open.has(n.id);
          return (
            <button
              key={n.id}
              type="button"
              disabled={!can}
              onClick={() => onPick(n.id)}
              className="absolute flex w-24 -translate-x-1/2 -translate-y-[22px] flex-col items-center gap-1 disabled:cursor-default"
              style={{ left: `${xOf(n)}%`, top: yOf(n) }}
              aria-label={`${K.label}${n.circuit ? ` ${circuitName(n.circuit)}` : ""}${done ? " ผ่านแล้ว" : can ? " ไปได้" : ""}`}
            >
              <span
                className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                  n.kind === "boss" ? "h-14 w-14" : ""
                } ${can ? "animate-pulse border-(--color-f1) bg-(--color-f1)/25 text-white" : here ? "border-white bg-white text-[#08080A]" : done ? "border-white/20 bg-white/5 text-white/40" : "border-white/15 bg-[#121216] text-white/55"}`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {done && <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[#22c55e] p-0.5 text-[#08080A]" aria-hidden />}
              </span>
              <span className={`text-center text-[10px] leading-tight ${can ? "font-bold text-white" : "text-white/55"}`}>
                {n.kind === "boss" ? BOSS[n.boss!].name : K.label}
                {n.circuit && n.kind !== "boss" ? <span className="block truncate text-white/50">{circuitName(n.circuit)}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-white/55">
        {(Object.keys(KIND) as NodeKind[]).map((k) => {
          const Icon = KIND[k].icon;
          return (
            <span key={k} className="flex items-center gap-1">
              <Icon className="h-3.5 w-3.5" aria-hidden /> {KIND[k].label}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- ก่อนแข่ง ---------------- */

function PreRace({ run, node, onStart }: { run: RunState; node: MapNode; onStart: (tyre: Compound) => void }) {
  const [tyre, setTyre] = useState<Compound>("medium");
  const cfg = useMemo(() => raceCfg(run, node, tyre), [run, node, tyre]);
  const target = targetOf(run, node);
  const slot = cfg.grid.indexOf(playerCar(run)) + 1;
  const boss = node.boss ? BOSS[node.boss] : null;
  const laps = LAPS[node.kind === "boss" ? "boss" : node.kind === "sprint" ? "sprint" : "race"];
  return (
    <Card>
      <Head kicker={`${KIND[node.kind].label}${boss ? ` · ${boss.name}` : ""}`} title={circuitName(cfg.circuit)} sub={boss ? boss.text : node.kind === "sprint" ? "เรซสั้น ไม่บังคับเข้าพิท" : "ต้องเข้าพิทอย่างน้อย 1 ครั้ง"} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="เป้าหมาย" value={`ท็อป ${target}`} tone="red" />
        <Stat label="ออกสตาร์ท" value={`P${slot}`} />
        <Stat label="จำนวนรอบ" value={`${laps} รอบ`} />
      </div>
      {run.next.target > 0 && <p className="text-xs text-[#facc15]">อีเวนต์ก่อนหน้า: เป้ายากขึ้น {run.next.target} อันดับ{run.next.moneyMult > 1 ? ` · เงินรางวัล ×${run.next.moneyMult}` : ""}</p>}
      <div className="space-y-1">
        <p className="text-xs font-bold text-white/70">ยางออกสตาร์ท</p>
        <div className="grid grid-cols-3 gap-2">
          {COMPOUNDS.map((c) => (
            <button key={c} type="button" aria-pressed={tyre === c} onClick={() => setTyre(c)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold ${tyre === c ? "border-white bg-white/10" : "border-white/10"}`}>
              <TyreDot c={c} size={20} /> {COMPOUND_INFO[c].label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-white/70">
          การ์ดกลยุทธ์ในกอง ({run.deck.length} ใบ · จั่วขึ้นมือ 3 ใบ · พลังทีมเริ่ม {cfg.energy} สูงสุด {cfg.maxEnergy})
        </p>
        <DeckList deck={run.deck} />
      </div>
      <Btn className="w-full" onClick={() => onStart(tyre)}>
        <Flag className="inline h-4 w-4" /> เริ่มแข่ง
      </Btn>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="rounded-xl bg-[#08080A] p-2">
      <p className="text-[11px] text-white/55">{label}</p>
      <p className={`poster text-xl tabular-nums ${tone === "red" ? "text-(--color-f1-text)" : "text-white"}`}>{value}</p>
    </div>
  );
}

/* ---------------- ระหว่างแข่ง ---------------- */

function RaceStage({ cfg, team, seed, onDone }: { cfg: RunRaceCfg & { target: number }; team: number; seed: number; onDone: (pos: number, dnf: boolean) => void }) {
  const [room] = useState(() => {
    const r = new Room({ online: false, seed: seed || 1 });
    r.join("me", "ผู้เล่น");
    r.handle("me", { t: "team", team });
    r.runRace(cfg);
    return r;
  });
  const [snap, setSnap] = useState<Snapshot>(() => room.snapshot());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let last = performance.now();
    const iv = window.setInterval(() => {
      const now = performance.now();
      room.tick(now - last);
      last = now;
      setSnap(room.snapshot());
    }, 100);
    return () => window.clearInterval(iv);
  }, [room]);
  const send = (m: Msg) => {
    setError(room.handle("me", m));
    setSnap(room.snapshot());
  };
  if (snap.phase === "results" && snap.results) {
    const row = snap.results.find((x) => x.id === cfg.car);
    const pos = snap.results.findIndex((x) => x.id === cfg.car) + 1;
    const dnf = !!row?.out;
    const ok = !dnf && pos <= cfg.target;
    return (
      <Card>
        <Head kicker="ผลการแข่ง" title={dnf ? "ไม่จบการแข่ง" : `จบอันดับ ${pos}`} sub={`เป้า: ท็อป ${cfg.target}`} />
        <p className={`poster text-3xl ${ok ? "text-[#22c55e]" : "text-(--color-f1-text)"}`}>{ok ? "ทำได้ตามเป้า!" : "พลาดเป้า — ความเชื่อมั่นลดลง"}</p>
        <ol className="space-y-0.5 text-xs">
          {snap.results.slice(0, 10).map((x, i) => {
            const c = snap.cars[x.id];
            const t = teamOf(c);
            return (
              <li key={x.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${x.id === cfg.car ? "bg-(--color-f1)/25" : "bg-white/[0.03]"}`}>
                <span className="poster w-7 tabular-nums">P{i + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: t.color }} />
                <span className="min-w-0 flex-1 truncate">
                  #{c.num} {c.name}
                </span>
                <span className="tabular-nums text-white/60">{x.gap}</span>
              </li>
            );
          })}
        </ol>
        <Btn className="w-full" onClick={() => onDone(dnf ? snap.cars.length : pos, dnf)}>
          ไปต่อ
        </Btn>
      </Card>
    );
  }
  return (
    <Live
      snap={snap}
      me="me"
      send={send}
      interval={100}
      error={error}
      onExit={() => {
        if (window.confirm("ออกจากเรซนี้? นับเป็นไม่จบการแข่ง (พลาดเป้า)")) onDone(snap.cars.length, true);
      }}
    />
  );
}

/* ---------------- การ์ด ---------------- */

function UpgradeCard({ id, footer, onClick, disabled }: { id: UpgradeId; footer?: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const u = UPGRADES[id];
  const r = RARITY[u.rarity];
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold" style={{ color: r.color }}>
          {r.label}
          {u.tag ? ` · ${SET_BONUS[u.tag].name}` : ""}
        </span>
        <span className="text-[10px] text-white/45">อัปเกรด</span>
      </span>
      <b className="block text-sm text-white">{u.name}</b>
      <span className="block text-xs text-white/70">{u.text}</span>
      {footer}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-xl border-2 bg-[#08080A] p-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} transition hover:-translate-y-0.5 disabled:opacity-45`} style={{ borderColor: r.color }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ borderColor: r.color }}>
      {body}
    </div>
  );
}

function StrategyCard({ kind, footer, onClick, disabled }: { kind: StrategyKind; footer?: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const s = STRATEGY[kind];
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold" style={{ color: STRAT_COLOR }}>
          การ์ดกลยุทธ์
        </span>
        <span className="flex items-center gap-0.5" aria-label={`ใช้พลัง ${s.cost}`}>
          {Array.from({ length: s.cost }, (_, j) => (
            <span key={j} className="h-2 w-2 rotate-45 rounded-[2px] bg-[#facc15]" />
          ))}
        </span>
      </span>
      <b className="block text-sm text-white">{s.name}</b>
      <span className="block text-xs text-white/70">{s.text}</span>
      {footer}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-xl border-2 bg-[#08080A] p-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} transition hover:-translate-y-0.5 disabled:opacity-45`} style={{ borderColor: STRAT_COLOR }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ borderColor: STRAT_COLOR }}>
      {body}
    </div>
  );
}

const RewardCard = ({ x, onClick, footer, disabled }: { x: Reward; onClick?: () => void; footer?: ReactNode; disabled?: boolean }) =>
  x.type === "upgrade" ? <UpgradeCard id={x.id} onClick={onClick} footer={footer} disabled={disabled} /> : <StrategyCard kind={x.kind} onClick={onClick} footer={footer} disabled={disabled} />;

function RewardPick({ run, onPick }: { run: RunState; onPick: (i: number) => void }) {
  const p = run.pending as Extract<RunState["pending"], { kind: "reward" }>;
  const last = run.log[run.log.length - 1];
  return (
    <Card>
      <Head kicker="รางวัล" title="เลือกการ์ด 1 ใบ" sub={last ? `${last.ok ? "✅ ทำได้ตามเป้า" : "❌ พลาดเป้า"} · จบ ${last.dnf ? "DNF" : `P${last.pos}`} (เป้า ท็อป ${last.target}) · ได้เงิน ${last.money}` : undefined} />
      <div className="grid gap-2 sm:grid-cols-3">
        {p.options.map((x, i) => (
          <RewardCard key={i} x={x} onClick={() => onPick(i)} />
        ))}
      </div>
      <Btn tone="ghost" className="w-full" onClick={() => onPick(-1)}>
        ข้าม (รับเงิน 20 แทน)
      </Btn>
    </Card>
  );
}

/* ---------------- โรงงาน ---------------- */

function Shop({ run, onBuy, onLeave }: { run: RunState; onBuy: (i: number, arg?: string) => void; onLeave: () => void }) {
  const p = run.pending as Extract<RunState["pending"], { kind: "shop" }>;
  const [picking, setPicking] = useState<number | null>(null);
  const priceTag = (it: ShopItem) => (
    <span className={`mt-1 flex items-center gap-1 text-xs font-bold ${it.sold ? "text-white/45" : run.money >= it.price ? "text-[#facc15]" : "text-white/45"}`}>
      <Coins className="h-3.5 w-3.5" /> {it.sold ? "ขายแล้ว" : it.price}
    </span>
  );
  const pick = picking !== null ? p.items[picking] : null;
  return (
    <Card>
      <Head kicker="โรงงาน" title="ซื้ออัปเกรด" sub={`มีเงิน ${run.money}`} />
      <div className="grid gap-2 sm:grid-cols-3">
        {p.items.map((it, i) => {
          const can = !it.sold && run.money >= it.price;
          if (it.type === "upgrade" || it.type === "strategy") return <RewardCard key={i} x={it} onClick={() => onBuy(i)} disabled={!can} footer={priceTag(it)} />;
          const info =
            it.type === "heal"
              ? { name: "ซ่อมความสัมพันธ์สปอนเซอร์", text: `ความเชื่อมั่น +1 (สูงสุด ${run.maxRep})` }
              : it.type === "purge"
                ? { name: "ล้างคำสาป", text: "ลบการ์ดคำสาป 1 ใบ" }
                : { name: "คัดการ์ดออก", text: "ลบการ์ดกลยุทธ์ 1 ใบออกจากกอง (จั่วการ์ดดีบ่อยขึ้น)" };
          const disabled = !can || (it.type === "heal" && run.rep >= run.maxRep);
          return (
            <button key={i} type="button" disabled={disabled} onClick={() => (it.type === "heal" ? onBuy(i) : setPicking(i))} className="flex flex-col gap-1 rounded-xl border-2 border-white/20 bg-[#08080A] p-3 text-left disabled:opacity-45">
              <span className="text-[10px] font-bold text-white/60">บริการ</span>
              <b className="text-sm">{info.name}</b>
              <span className="text-xs text-white/70">{info.text}</span>
              {priceTag(it)}
            </button>
          );
        })}
      </div>
      {pick && (pick.type === "purge" || pick.type === "thin") && (
        <div className="space-y-2 rounded-xl bg-[#08080A] p-3">
          <p className="text-xs font-bold">{pick.type === "purge" ? "เลือกคำสาปที่จะลบ" : "เลือกการ์ดกลยุทธ์ที่จะลบ"}</p>
          <div className="flex flex-wrap gap-1.5">
            {(pick.type === "purge" ? run.cards.filter((c) => UPGRADES[c].rarity === "curse") : [...new Set(run.deck)]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onBuy(picking!, k);
                  setPicking(null);
                }}
                className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold"
              >
                {pick.type === "purge" ? UPGRADES[k as UpgradeId].name : STRATEGY[k as StrategyKind].name}
              </button>
            ))}
            <button type="button" onClick={() => setPicking(null)} className="min-h-10 px-3 text-xs text-white/60">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      <Btn tone="white" className="w-full" onClick={onLeave}>
        ออกจากโรงงาน
      </Btn>
    </Card>
  );
}

/* ---------------- อีเวนต์ ---------------- */

function EventView({ run, result, onChoose, onNext }: { run: RunState; result: string | null; onChoose: (i: number) => void; onNext: () => void }) {
  const pending = run.pending?.kind === "event" ? run.pending.event : null;
  if (!pending)
    return (
      <Card>
        <Head kicker="อีเวนต์" title="ผลการตัดสินใจ" />
        <p className="text-sm text-white/85">{result}</p>
        <Btn className="w-full" onClick={onNext}>
          ไปต่อ
        </Btn>
      </Card>
    );
  const ev = EVENTS[pending];
  return (
    <Card>
      <Head kicker="อีเวนต์" title={ev.title} sub={ev.text} />
      {result && <p className="text-sm text-(--color-f1-text)">{result}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {ev.options.map((o, i) => (
          <button key={i} type="button" onClick={() => onChoose(i)} className="flex flex-col gap-1 rounded-xl border-2 border-white/15 bg-[#08080A] p-3 text-left hover:border-white/40">
            <b className="text-sm">{o.label}</b>
            <span className="text-xs text-white/70">{o.text}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- รถและการ์ด ---------------- */

function DeckList({ deck }: { deck: StrategyKind[] }) {
  const counts = deck.reduce<Partial<Record<StrategyKind, number>>>((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {});
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(counts) as StrategyKind[]).map((k) => (
        <span key={k} className="rounded-lg border px-2 py-1 text-[11px] font-bold" style={{ borderColor: STRAT_COLOR }}>
          {STRATEGY[k].name}
          {counts[k]! > 1 ? ` ×${counts[k]}` : ""}
        </span>
      ))}
    </div>
  );
}

function Garage({ run }: { run: RunState }) {
  const sets = activeSets(run.cards);
  const tagCount = (t: Tag) => run.cards.filter((c) => UPGRADES[c].tag === t).length;
  return (
    <Card>
      <Head kicker="รถของคุณ" title="อัปเกรดและการ์ด" sub="สะสมการ์ดสายเดียวกันครบ 3 ใบ ได้โบนัสสาย" />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SET_BONUS) as Tag[]).map((t) => (
          <span key={t} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sets.includes(t) ? "bg-[#22c55e] text-[#08080A]" : "bg-white/10 text-white/70"}`} title={SET_BONUS[t].text}>
            {SET_BONUS[t].name} {Math.min(tagCount(t), SET_SIZE)}/{SET_SIZE}
            {sets.includes(t) ? ` · ${SET_BONUS[t].text}` : ""}
          </span>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {run.cards.map((c, i) => (
          <UpgradeCard key={`${c}-${i}`} id={c} />
        ))}
      </div>
      <p className="text-xs font-bold text-white/70">การ์ดกลยุทธ์ในกอง ({run.deck.length})</p>
      <DeckList deck={run.deck} />
    </Card>
  );
}

/* ---------------- จบรัน ---------------- */

function RunEnd({ run, meta, onNew, onExit }: { run: RunState; meta: Meta; onNew: () => void; onExit: () => void }) {
  const won = run.status === "won";
  return (
    <div className="space-y-4">
      <Card className="card-poster">
        <Head kicker={won ? "แชมป์!" : "จบรัน"} title={won ? "คว้าแชมป์ฤดูกาล" : "สปอนเซอร์ถอนตัว"} sub={won ? "ทีมท้ายตารางไต่ขึ้นมาเป็นแชมป์" : `ไปได้ถึงช่วงที่ ${run.act + 1}`} />
        <p className="poster text-2xl text-[#facc15]">+{fameOf(run)} ชื่อเสียง</p>
        <p className="text-xs text-white/60 tabular-nums">
          ชื่อเสียงสะสม {meta.fame} · แชมป์ {meta.wins} ครั้ง
        </p>
        <ol className="space-y-0.5 text-xs">
          {run.log.map((l, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1 tabular-nums">
              <span className="w-12 text-white/55">ช่วง {l.act + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {KIND[l.kind].label} · {circuitName(l.circuit)}
              </span>
              <span>{l.dnf ? "DNF" : `P${l.pos}`}</span>
              <span className="w-14 text-right text-white/55">เป้า {l.target}</span>
              <span>{l.ok ? "✅" : "❌"}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/60">อัปเกรดที่สะสม: {run.cards.map((c) => UPGRADES[c].name).join(" · ")}</p>
      </Card>
      <Btn className="w-full" onClick={onNew}>
        เริ่มรันใหม่
      </Btn>
      <Btn tone="ghost" className="w-full" onClick={onExit}>
        กลับหน้าโหมด
      </Btn>
    </div>
  );
}
