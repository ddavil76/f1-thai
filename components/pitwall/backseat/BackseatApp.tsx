"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Coins, Crown, Flag, Heart, HelpCircle, Layers, Star, Wrench, Zap } from "lucide-react";
import BackseatRace, { RARITY_COLOR } from "@/components/pitwall/backseat/BackseatRace";
import { Btn, Card, Head, TyreDot } from "@/components/pitwall/ui";
import { cardOf, STAT_NAME, type Rarity } from "@/lib/pitwall/backseat/cards";
import {
  ACTS, BOSS, buy, chooseEvent, chooseReward, choices, enter, EVENTS, FIELD, fameOf, finishRace, heroId, isRace, LAPS, leaveShop, newRun, nodeOf, raceSetup, targetOf,
  type MapNode, type NodeKind, type RaceSetup, type RunState, type ShopItem,
} from "@/lib/pitwall/backseat/run";
import { circuitName, TEAMS } from "@/lib/pitwall/teams";
import { COMPOUNDS, COMPOUND_INFO, type Compound } from "@/lib/pitwall/types";

const RUN_KEY = "pitwall-backseat-run";
const META_KEY = "pitwall-backseat-meta";
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
    // เก็บไม่ได้ก็เล่นต่อได้
  }
}

const KIND: Record<NodeKind, { label: string; icon: typeof Flag }> = {
  race: { label: "เรซ", icon: Flag },
  sprint: { label: "สปรินต์", icon: Zap },
  shop: { label: "โรงงาน", icon: Wrench },
  event: { label: "อีเวนต์", icon: HelpCircle },
  boss: { label: "บอส", icon: Crown },
};
const RARITY_LABEL: Record<Rarity, string> = { common: "ธรรมดา", rare: "หายาก", legend: "ตำนาน", curse: "คำสาป" };

/**
 * โหมดคุมนักขับ AI: ตั้งค่ารัน → แผนที่ → เรซ (AI ขับ · เราเลือกการ์ด/สั่งพิท) / โรงงาน / อีเวนต์ → ชิ้นส่วน → … → บอส 2 ช่วง
 * สถานะรันเก็บในเครื่อง (ปิดแล้วกลับมาเล่นต่อได้ · ปิดกลางเรซ = ไม่จบการแข่ง)
 */
export default function BackseatApp({ onExit }: { onExit: () => void }) {
  const [run, setRunState] = useState<RunState | null>(null);
  const [meta, setMeta] = useState<Meta>({ fame: 0, runs: 0, wins: 0 });
  const [racing, setRacing] = useState<RaceSetup | null>(null);
  const [eventText, setEventText] = useState<string | null>(null);
  const [garage, setGarage] = useState(false);
  useEffect(() => {
    let r = load<RunState>(RUN_KEY);
    if (r && r.v !== 2) r = null;
    const m = load<Meta>(META_KEY) ?? { fame: 0, runs: 0, wins: 0 };
    if (r?.inRace && r.at !== null) {
      r = finishRace(r, FIELD, true);
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
  const end = (r: RunState) => {
    const m = { fame: meta.fame + fameOf(r), runs: meta.runs + 1, wins: meta.wins + (r.status === "won" ? 1 : 0) };
    setMeta(m);
    save(META_KEY, m);
  };

  if (!run) return <Setup meta={meta} onExit={onExit} onStart={(team, heat) => setRun(newRun((Date.now() & 0x7fffffff) || 1, team, heat))} />;

  if (racing)
    return (
      <BackseatRace
        key={`${run.at}-${run.log.length}`}
        setup={racing}
        onDone={(pos, dnf, level) => {
          const r = finishRace(run, pos, dnf, level);
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
          <Layers className="inline h-4 w-4" /> {garage ? "ปิดรถ" : `รถของคุณ (${run.parts.length})`}
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
            setRacing(raceSetup(run, node, tyre));
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

function Setup({ meta, onStart, onExit }: { meta: Meta; onStart: (team: number, heat: number) => void; onExit: () => void }) {
  const [team, setTeam] = useState(TEAMS.length - 1);
  const [heat, setHeat] = useState(0);
  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onExit}>
        <ChevronLeft className="inline h-4 w-4" /> กลับ
      </Btn>
      <Card className="card-poster">
        <Head kicker="ROGUELITE · AUTO RACE" title="คุมนักขับ AI" sub="นักขับ AI ขับเอง — คุณคือทีมหลังรถ พาทีมท้ายตารางผ่าน 2 ช่วงของฤดูกาลให้ถึงแชมป์" />
        <ul className="space-y-1 text-[13px] text-white/80">
          <li>⭐ ระหว่างเรซ นักขับเก็บ XP จากการแซง จบรอบ และรอบสะอาด → <b>เลเวลอัป เกมหยุดให้เลือกการ์ด</b> 1 จาก 3 ใบ มีผลทันที</li>
          <li>⚠ การ์ดเสี่ยงแรงกว่าแต่เครื่องอาจพังหรือรถอาจหมุน</li>
          <li>🔧 คุณสั่งเข้าพิทและเลือกยางเอง (เรซปกติต้องเข้า 1 ครั้ง)</li>
          <li>🗺️ ระหว่างเรซเลือกเส้นทาง เก็บชิ้นส่วนติดรถถาวร · พลาดเป้าเสียความเชื่อมั่น หมดเมื่อไรจบรัน</li>
        </ul>
        <p className="text-xs text-white/55 tabular-nums">
          ชื่อเสียงสะสม {meta.fame} · เล่นแล้ว {meta.runs} รัน · แชมป์ {meta.wins} ครั้ง
        </p>
      </Card>
      <Card>
        <Head kicker="ทีม" title="เลือกสีทีม" sub="ทุกสีเริ่มเป็นรถช้าสุดและนักขับมือใหม่เท่ากัน" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TEAMS.map((t, i) => (
            <button key={t.id} type="button" aria-pressed={team === i} onClick={() => setTeam(i)} className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-2 text-left text-xs font-bold ${team === i ? "border-white bg-white/10" : "border-white/10"}`}>
              <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: t.color }} />
              <span className="min-w-0">
                <span className="block truncate">{t.name}</span>
                <span className="block truncate text-[10px] font-normal text-white/55">
                  #{t.drivers[0].num} {t.drivers[0].name}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      {meta.wins > 0 && (
        <Card>
          <Head kicker="ความยาก" title={`Heat ${heat}`} sub="ทีมอื่นเก่งขึ้น · เป้ายากขึ้น · ชนะได้ชื่อเสียงมากขึ้น (ปลดล็อกทีละขั้นเมื่อได้แชมป์)" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.min(10, meta.wins) + 1 }, (_, h) => (
              <button key={h} type="button" aria-pressed={heat === h} onClick={() => setHeat(h)} className={`min-h-10 min-w-10 rounded-lg text-sm font-bold ${heat === h ? "bg-white text-[#08080A]" : "bg-white/10"}`}>
                {h}
              </button>
            ))}
          </div>
        </Card>
      )}
      <Btn className="w-full" onClick={() => onStart(team, heat)}>
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
        #{TEAMS[run.team].drivers[0].num} {TEAMS[run.team].drivers[0].name}
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
      <Head kicker={`ช่วงที่ ${run.act + 1}`} title="เลือกเส้นทาง" sub="แตะจุดที่กระพริบเพื่อไปต่อ — บอสอยู่ล่างสุด" />
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
                className={`relative flex items-center justify-center rounded-full border-2 ${n.kind === "boss" ? "h-14 w-14" : "h-11 w-11"} ${
                  can ? "animate-pulse border-(--color-f1) bg-(--color-f1)/25 text-white" : here ? "border-white bg-white text-[#08080A]" : done ? "border-white/20 bg-white/5 text-white/40" : "border-white/15 bg-[#121216] text-white/55"
                }`}
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
  const setup = useMemo(() => raceSetup(run, node, tyre), [run, node, tyre]);
  const target = targetOf(run, node);
  const slot = setup.entrants.findIndex((e) => e.id === heroId(run)) + 1;
  const boss = node.boss ? BOSS[node.boss] : null;
  const laps = LAPS[node.kind === "boss" ? "boss" : node.kind === "sprint" ? "sprint" : "race"];
  return (
    <Card>
      <Head kicker={`${KIND[node.kind].label}${boss ? ` · ${boss.name}` : ""}`} title={circuitName(setup.circuit)} sub={boss ? boss.text : node.kind === "sprint" ? "เรซสั้น ไม่บังคับเข้าพิท" : "ต้องเข้าพิทอย่างน้อย 1 ครั้ง — คุณเป็นคนสั่ง"} />
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
        <p className="text-[11px] text-white/55">Soft เร็วแต่สึกไว · Hard ทนแต่ช้ากว่า — ระหว่างเรซแตะปุ่มยางด้านล่างจอเพื่อสั่งเข้าพิท</p>
      </div>
      {run.parts.length > 0 && <p className="text-xs text-white/65">ชิ้นส่วนที่ติดรถ: {run.parts.map((p) => cardOf(p).name).join(" · ")}</p>}
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

/* ---------------- ชิ้นส่วน ---------------- */

function PartCard({ id, footer, onClick, disabled }: { id: string; footer?: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const c = cardOf(id);
  const color = RARITY_COLOR[c.rarity];
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[10px] font-bold">
        <span style={{ color }}>
          {RARITY_LABEL[c.rarity]} · {STAT_NAME[c.stat]}
        </span>
        <span className="text-white/45">ชิ้นส่วน</span>
      </span>
      <b className="block text-sm text-white">{c.name}</b>
      <span className="block text-xs text-white/70">{c.text}</span>
      {footer}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-xl border-2 bg-[#08080A] p-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} transition hover:-translate-y-0.5 disabled:opacity-45`} style={{ borderColor: color }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ borderColor: color }}>
      {body}
    </div>
  );
}

function RewardPick({ run, onPick }: { run: RunState; onPick: (i: number) => void }) {
  const p = run.pending as Extract<RunState["pending"], { kind: "reward" }>;
  const last = run.log[run.log.length - 1];
  return (
    <Card>
      <Head kicker="รางวัล" title="เลือกชิ้นส่วน 1 ชิ้น" sub={last ? `${last.ok ? "✅ ทำได้ตามเป้า" : "❌ พลาดเป้า"} · จบ ${last.dnf ? "DNF" : `P${last.pos}`} (เป้า ท็อป ${last.target}) · ได้เงิน ${last.money}` : undefined} />
      <p className="text-xs text-white/60">ชิ้นส่วนติดรถถาวรทั้งรัน (การ์ดเลเวลอัประหว่างเรซหายเมื่อจบเรซ)</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {p.options.map((id, i) => (
          <PartCard key={id} id={id} onClick={() => onPick(i)} />
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
  const [picking, setPicking] = useState(false);
  const priceTag = (it: ShopItem) => (
    <span className={`mt-1 flex items-center gap-1 text-xs font-bold ${it.sold ? "text-white/45" : run.money >= it.price ? "text-[#facc15]" : "text-white/45"}`}>
      <Coins className="h-3.5 w-3.5" /> {it.sold ? "ขายแล้ว" : it.price}
    </span>
  );
  const purgeIdx = p.items.findIndex((x) => x.type === "purge");
  return (
    <Card>
      <Head kicker="โรงงาน" title="ซื้อชิ้นส่วน" sub={`มีเงิน ${run.money}`} />
      <div className="grid gap-2 sm:grid-cols-3">
        {p.items.map((it, i) => {
          const can = !it.sold && run.money >= it.price;
          if (it.type === "part") return <PartCard key={i} id={it.id} onClick={() => onBuy(i)} disabled={!can} footer={priceTag(it)} />;
          const info = it.type === "heal" ? { name: "ซ่อมความสัมพันธ์สปอนเซอร์", text: `ความเชื่อมั่น +1 (สูงสุด ${run.maxRep})` } : { name: "ล้างคำสาป", text: "ถอดชิ้นส่วนคำสาป 1 ชิ้น" };
          const disabled = !can || (it.type === "heal" && run.rep >= run.maxRep);
          return (
            <button key={i} type="button" disabled={disabled} onClick={() => (it.type === "heal" ? onBuy(i) : setPicking(true))} className="flex flex-col gap-1 rounded-xl border-2 border-white/20 bg-[#08080A] p-3 text-left disabled:opacity-45">
              <span className="text-[10px] font-bold text-white/60">บริการ</span>
              <b className="text-sm">{info.name}</b>
              <span className="text-xs text-white/70">{info.text}</span>
              {priceTag(it)}
            </button>
          );
        })}
      </div>
      {picking && purgeIdx >= 0 && (
        <div className="space-y-2 rounded-xl bg-[#08080A] p-3">
          <p className="text-xs font-bold">เลือกคำสาปที่จะถอด</p>
          <div className="flex flex-wrap gap-1.5">
            {run.parts
              .filter((c) => cardOf(c).rarity === "curse")
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onBuy(purgeIdx, k);
                    setPicking(false);
                  }}
                  className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold"
                >
                  {cardOf(k).name}
                </button>
              ))}
            <button type="button" onClick={() => setPicking(false)} className="min-h-10 px-3 text-xs text-white/60">
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

/* ---------------- รถของคุณ ---------------- */

function Garage({ run }: { run: RunState }) {
  return (
    <Card>
      <Head kicker="รถของคุณ" title="ชิ้นส่วนที่ติดรถ" sub={run.parts.length ? "ติดถาวรทั้งรัน" : "ยังไม่มีชิ้นส่วน — ได้หลังจบเรซหรือซื้อที่โรงงาน"} />
      <div className="grid gap-2 sm:grid-cols-2">
        {run.parts.map((c, i) => (
          <PartCard key={`${c}-${i}`} id={c} />
        ))}
      </div>
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
              <span className="text-white/55">LV {l.level}</span>
              <span>{l.dnf ? "DNF" : `P${l.pos}`}</span>
              <span className="w-14 text-right text-white/55">เป้า {l.target}</span>
              <span>{l.ok ? "✅" : "❌"}</span>
            </li>
          ))}
        </ol>
        {run.parts.length > 0 && <p className="text-xs text-white/60">ชิ้นส่วนที่สะสม: {run.parts.map((c) => cardOf(c).name).join(" · ")}</p>}
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
