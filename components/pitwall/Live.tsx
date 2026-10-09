"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FastForward, LogOut, Radio as RadioIcon, Timer, Volume2, VolumeX } from "lucide-react";
import Car from "@/components/pitwall/Car";
import DriveLap from "@/components/pitwall/DriveLap";
import LaunchScreen from "@/components/pitwall/Launch";
import PitMap, { PIT_K, SIDE, type MapCar } from "@/components/pitwall/PitMap";
import { setSoundOn, sfx, soundOn } from "@/components/pitwall/sound";
import { myCars } from "@/components/pitwall/Weekend";
import { Bar, Btn, Seg, TyreDot, fmtClock, fmtGap, fmtLap, teamOf } from "@/components/pitwall/ui";
import { buildBoard } from "@/lib/pitwall/board";
import { ERS, MODE } from "@/lib/pitwall/model";
import { boxPos, segOrder, type QCar, type Risk } from "@/lib/pitwall/quali";
import { freshSets, standings, type RaceCar } from "@/lib/pitwall/race";
import type { Msg, Snapshot } from "@/lib/pitwall/room";
import { circuitName } from "@/lib/pitwall/teams";
import { buildTrack, lapOf } from "@/lib/pitwall/track";
import { COMPOUNDS, COMPOUND_INFO, type Car as CarSpec, type Compound, type DriveMode, type ErsMode, type Fight, type TeamOrder } from "@/lib/pitwall/types";

type Props = { snap: Snapshot; me: string; send: (m: Msg) => void; interval: number; onExit: () => void };

const SECTOR = { purple: "#a855f7", green: "#22c55e", yellow: "#facc15" } as const;

export default function Live({ snap, me, send: rawSend, interval, onExit }: Props) {
  // คำสั่งจากกำแพงพิทมีเสียงคลิกยืนยัน
  const send = (m: Msg) => {
    if (["mode", "ers", "fight", "pit", "order", "qsend", "qin", "auto"].includes(m.t)) sfx.select();
    rawSend(m);
  };
  const board = useMemo(() => buildBoard(snap.circuit, circuitName(snap.circuit)), [snap.circuit]);
  const track = useMemo(() => buildTrack(snap.circuit), [snap.circuit]);
  const mine = myCars(snap, me);
  const [focus, setFocus] = useState<number | null>(mine[0]?.id ?? null);
  const [zoomed, setZoomed] = useState(true);
  const [tab, setTab] = useState<"team" | "timing" | "radio">("team");
  const [sound, setSound] = useState(soundOn);
  const [doneLaps, setDoneLaps] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<{ car: number; key: string } | null>(null);
  const [launched, setLaunched] = useState<Record<number, boolean>>({});
  const host = snap.players.find((p) => p.id === me)?.host;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // เสียงวิทยุ: ข้อความใหม่ของทีมเรา / ประกาศ
  const lastRadio = useRef(snap.radio.at(-1)?.id ?? 0);
  const myTeam = mine[0]?.team ?? -1;
  useEffect(() => {
    const fresh = snap.radio.filter((r) => r.id > lastRadio.current);
    if (!fresh.length) return;
    lastRadio.current = fresh[fresh.length - 1].id;
    const rel = fresh.filter((r) => r.team === null || r.team === myTeam);
    if (rel.some((r) => /SAFETY|VSC!|ธงแดง/.test(r.text))) sfx.alert();
    else if (rel.some((r) => r.tone === "bad" && /ชน/.test(r.text))) sfx.crash();
    else if (rel.some((r) => /แซง .* ได้/.test(r.text))) sfx.overtake();
    else if (rel.some((r) => r.tone === "good")) sfx.good();
  }, [snap.radio, myTeam]);

  // ขับเอง: รถเราเริ่มรอบเร่งที่สั่งให้ขับเอง (รอบละครั้ง) — เปิดค้างไว้จนผู้เล่นขับจบ แม้รอบในเกมจะจบก่อน
  const waiting = (snap.phase === "quali" ? snap.quali : null)?.cars.find((q) => mine.some((m) => m.id === q.id) && q.status === "push" && q.waitDrive && q.lap && !doneLaps.has(`${q.id}:${q.lap.start}`));
  const waitingKey = waiting?.lap ? `${waiting.id}:${waiting.lap.start}` : "";
  if (waiting && !active) setActive({ car: waiting.id, key: waitingKey });
  const driving = active?.car ?? null;
  const drivingKey = active?.key ?? "";

  if (!board || !track) return null;
  const r = snap.phase === "race" ? snap.race : null;
  const q = snap.phase === "quali" ? snap.quali : null;

  const mapCars: MapCar[] = snap.cars
    .map((c): MapCar | null => {
      const t = teamOf(c);
      const base = { id: c.id, num: c.num, color: t.color, ink: t.ink, mine: mine.some((m) => m.id === c.id) };
      if (r) {
        const rc = r.cars[c.id];
        if (rc.out || rc.finished !== null) return null;
        return { ...base, tyre: COMPOUND_INFO[rc.compound].color, pos: rc.pos, k: rc.pit ? PIT_K : rc.side * SIDE, ghost: !!rc.pit };
      }
      if (q) {
        const qc = q.cars[c.id];
        if (qc.status === "eliminated") return null;
        const garage = qc.status === "garage";
        const tyre = qc.run ? COMPOUND_INFO[qc.run.compound].color : "#3a3a40";
        const k = garage ? PIT_K - 0.2 + ((c.id % 7) - 3) * 0.12 : qc.status === "push" ? -SIDE * 0.4 : SIDE;
        return { ...base, tyre, pos: garage ? boxPos(track) + ((c.id % 7) - 3) * 0.35 : qc.pos, k, ghost: garage };
      }
      return null;
    })
    .filter((x): x is MapCar => x !== null);

  // ออกตัว: เล่นมินิเกมทีละคันของเรา
  const needLaunch = r && !r.started ? mine.filter((c) => !snap.launch[c.id] && !launched[c.id]) : [];
  const launchCar = needLaunch[0];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#08080A] text-white md:flex-row">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 flex-none items-center gap-1.5 border-b border-white/10 px-2">
          <button type="button" onClick={onExit} aria-label="ออกจากเกม" className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <LogOut className="h-5 w-5" />
          </button>
          <span className="poster min-w-0 flex-1 truncate text-[11px] text-(--color-f1-text)">{circuitName(snap.circuit)}</span>
          {q && (
            <span className="poster flex items-center gap-1 rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums">
              <Timer className="h-3.5 w-3.5" /> {q.segs[q.seg].name} {q.pause > 0 && !q.red ? "รอเริ่ม" : fmtClock(q.clock)}
            </span>
          )}
          {r && (
            <span className="poster rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums">
              LAP {Math.min(r.laps, Math.max(1, lapOf(track, Math.max(...r.cars.map((c) => c.pos))) + 1))}/{r.laps}
            </span>
          )}
          {r?.neutral && (
            <span className="poster rounded-full bg-[#facc15] px-2.5 py-1 text-[11px] text-[#08080A]">
              {r.neutral.kind === "sc" ? "SAFETY CAR" : "VSC"}
              {r.neutral.ending ? " · ENDING" : ""}
            </span>
          )}
          {q?.red && <span className="poster rounded-full bg-(--color-f1) px-2.5 py-1 text-[11px]">ธงแดง</span>}
          {!snap.online && (
            <button
              type="button"
              onClick={() => send({ t: "speed", x: snap.speed === 1 ? 2 : snap.speed === 2 ? 4 : 1 })}
              aria-label={`ความเร็วเกม ×${snap.speed} แตะเพื่อเปลี่ยน`}
              className="poster min-w-11 rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums"
            >
              ×{snap.speed}
            </button>
          )}
          {!snap.online && host && (
            <button type="button" onClick={() => send({ t: "skip" })} aria-label="จำลองจนจบช่วงนี้" className="rounded-full p-2 text-white/70 hover:bg-white/10">
              <FastForward className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSoundOn(!sound);
              setSound(!sound);
            }}
            aria-label={sound ? "ปิดเสียง" : "เปิดเสียง"}
            aria-pressed={sound}
            className="rounded-full p-2 text-white/70 hover:bg-white/10"
          >
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </header>
        <div className="relative min-h-[34vh] flex-1">
          <PitMap board={board} track={track} cars={mapCars} focus={focus} neutral={r?.neutral?.kind ?? null} zoomed={zoomed} onToggle={() => setZoomed((z) => !z)} interval={interval} />
          <RadioTicker snap={snap} team={myTeam} />
          {r && !r.started && !launchCar && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
              <p className="poster text-lg text-white/80">รอรถคันอื่นพร้อมออกตัว… {snap.timer > 0 ? Math.ceil(snap.timer) : ""}</p>
            </div>
          )}
        </div>
      </div>

      <section aria-label="กำแพงพิท" className="flex max-h-[58dvh] min-h-[16rem] flex-none flex-col border-t border-white/10 bg-[#121216] md:max-h-none md:w-[440px] md:border-l md:border-t-0">
        <div className="grid flex-none grid-cols-3 gap-1 border-b border-white/10 p-1.5 md:hidden">
          {(
            [
              ["team", "ทีมเรา"],
              ["timing", "อันดับ"],
              ["radio", "วิทยุ"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`min-h-9 rounded-lg text-xs font-bold ${tab === k ? "bg-white text-[#08080A]" : "text-white/70"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={`space-y-3 ${tab === "team" ? "" : "hidden md:block"}`}>
            {r && <TeamOrders snap={snap} team={myTeam} send={send} />}
            {mine.map((c) =>
              r ? (
                <RaceCarPanel key={c.id} snap={snap} spec={c} car={r.cars[c.id]} focus={focus === c.id} onFocus={() => setFocus(c.id)} send={send} />
              ) : q ? (
                <QualiCarPanel key={c.id} snap={snap} spec={c} car={q.cars[c.id]} focus={focus === c.id} onFocus={() => setFocus(c.id)} send={send} />
              ) : null,
            )}
          </div>
          <div className={tab === "timing" ? "" : "hidden md:block"}>{r ? <RaceTower snap={snap} mine={mine} onPick={setFocus} /> : <QualiTower snap={snap} mine={mine} onPick={setFocus} />}</div>
          <div className={tab === "radio" ? "" : "hidden md:block"}>
            <RadioLog snap={snap} team={myTeam} />
          </div>
        </div>
      </section>
      {/* ออกตัว: เต็มจอ ไม่ให้ถูกบีบอยู่ในกรอบแผนที่บนมือถือ */}
      {launchCar && (
        <LaunchScreen
          key={launchCar.id}
          car={launchCar}
          team={teamOf(launchCar).name}
          onDone={(kind) => {
            setLaunched((l) => ({ ...l, [launchCar.id]: true }));
            send({ t: "launch", car: launchCar.id, kind });
          }}
        />
      )}

      {driving !== null && (
        <DriveLap
          key={drivingKey}
          car={snap.cars[driving]}
          circuit={snap.circuit}
          level={snap.config.ai}
          compound={q?.cars[driving].run?.compound ?? "soft"}
          onDone={(delta) => {
            send({ t: "drive", car: driving, delta });
            setDoneLaps((d) => new Set(d).add(drivingKey));
            setActive(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/* ---------- วิทยุ ---------- */

function RadioTicker({ snap, team }: { snap: Snapshot; team: number }) {
  const last = [...snap.radio].reverse().find((r) => r.team === null || r.team === team);
  if (!last) return null;
  const tone = last.tone === "good" ? "border-[#22c55e]" : last.tone === "bad" ? "border-(--color-f1)" : last.tone === "warn" ? "border-[#facc15]" : "border-white/20";
  return (
    <div key={last.id} className={`bg-pop pointer-events-none absolute inset-x-2 bottom-7 z-10 mx-auto flex max-w-md items-center gap-2 rounded-xl border-l-4 bg-[#08080A]/90 px-3 py-2 text-xs text-white ${tone}`}>
      <RadioIcon className="h-4 w-4 flex-none text-white/60" aria-hidden />
      <span>{last.text}</span>
    </div>
  );
}

function RadioLog({ snap, team }: { snap: Snapshot; team: number }) {
  const list = snap.radio.filter((r) => r.team === null || r.team === team).slice(-12).reverse();
  return (
    <div className="space-y-1.5">
      <p className="poster text-xs text-white/60">วิทยุทีม</p>
      <ul className="space-y-1 text-xs" aria-live="polite">
        {list.map((r) => (
          <li key={r.id} className={r.tone === "good" ? "text-[#4ade80]" : r.tone === "bad" ? "text-(--color-f1-text)" : r.tone === "warn" ? "text-[#facc15]" : "text-white/75"}>
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- ควอลิฟาย ---------- */

function QualiCarPanel({ snap, spec, car, focus, onFocus, send }: { snap: Snapshot; spec: CarSpec; car: QCar; focus: boolean; onFocus: () => void; send: (m: Msg) => void }) {
  const q = snap.quali!;
  const t = teamOf(spec);
  const [compound, setCompound] = useState<Compound>("soft");
  const [laps, setLaps] = useState(1);
  const [risk, setRisk] = useState<Risk>("normal");
  const [tow, setTow] = useState(false);
  const [drive, setDrive] = useState(false);
  const order = segOrder(q);
  const rank = order.indexOf(car.id) + 1;
  const cut = order.length - q.segs[q.seg].out;
  const noTime = car.best === null;
  const danger = q.segs[q.seg].out > 0 && (rank > cut || noTime);
  const status: Record<QCar["status"], string> = {
    garage: "อยู่ในพิท",
    out: "รอบอุ่นยาง",
    push: car.waitDrive ? "รอบเร่ง (ขับเอง)" : "รอบเร่ง",
    in: "กลับพิท",
    eliminated: `ตกรอบ · ออกสตาร์ท P${car.grid}`,
  };
  return (
    <div className={`space-y-2 rounded-2xl border p-3 ${focus ? "border-white/40" : "border-white/10"} bg-[#1a1a20]`}>
      <button type="button" onClick={onFocus} className="flex w-full items-center gap-2 text-left">
        <Car color={t.color} ink={t.ink} num={spec.num} width={36} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{spec.name}</b>
          <span className="block text-[11px] text-white/60">{status[car.status]}</span>
        </span>
        <span className="text-right">
          <b className={`poster block text-lg tabular-nums ${noTime ? "text-white/60" : danger ? "text-(--color-f1-text)" : "text-white"}`}>{car.status === "eliminated" ? "—" : noTime ? "" : `P${rank}`}</b>
          <span className="block text-[11px] tabular-nums text-white/70">{fmtLap(car.best)}</span>
        </span>
      </button>
      {car.status !== "eliminated" && q.segs[q.seg].out > 0 && (
        <p className={`text-[11px] ${danger ? "text-(--color-f1-text)" : "text-white/60"}`}>{noTime ? `ยังไม่มีเวลา · ส่งรถออกทำเวลาให้ติด ${cut} อันดับแรก` : danger ? `อยู่ในโซนตกรอบ (ต้องติด ${cut} อันดับแรก)` : `ปลอดภัย · เส้นตัด P${cut}`}</p>
      )}
      {(car.status === "push" || car.status === "out") && (
        <div className="flex items-center gap-1.5 text-[11px]">
          {[0, 1, 2].map((k) => (
            <span key={k} className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums">
              S{k + 1} {car.shown[k] !== null ? car.shown[k]!.toFixed(3) : "—"}
            </span>
          ))}
          <Btn tone="ghost" className="ml-auto min-h-8! px-3 text-xs" onClick={() => send({ t: "qin", car: car.id })}>
            เรียกกลับพิท
          </Btn>
        </div>
      )}
      {car.last && car.status !== "push" && (
        <p className={`text-[11px] ${car.last.deleted ? "text-(--color-f1-text)" : "text-white/70"}`}>
          รอบล่าสุด {car.last.deleted ? "ถูกตัด" : fmtLap(car.last.time)} {car.last.note && `· ${car.last.note}`}
        </p>
      )}
      {car.status === "garage" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {COMPOUNDS.map((k) => {
              const fresh = freshSets(spec, k);
              const any = spec.sets.some((s) => s.compound === k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!any}
                  aria-pressed={compound === k}
                  onClick={() => setCompound(k)}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-[11px] font-bold disabled:opacity-40 ${compound === k ? "border-white bg-white/10" : "border-white/10"}`}
                >
                  <TyreDot c={k} size={16} /> ใหม่ {fresh}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Seg size="sm" value={laps} onChange={setLaps} options={[{ v: 1, label: "รอบเร่ง 1" }, { v: 2, label: "รอบเร่ง 2" }]} />
            <Seg size="sm" value={risk} onChange={setRisk} options={[{ v: "normal", label: "ปกติ" }, { v: "attack", label: "เสี่ยง", tone: "#fb923c" }]} />
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-white/75">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tow} onChange={(e) => setTow(e.target.checked)} className="h-4 w-4 accent-[#E10600]" /> ลากท้ายเพื่อนร่วมทีม
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={drive} onChange={(e) => setDrive(e.target.checked)} className="h-4 w-4 accent-[#E10600]" /> ขับเอง (เกมจับจังหวะ)
            </label>
          </div>
          <Btn
            className="w-full"
            disabled={q.clock <= 0 || q.red || q.pause > 0}
            onClick={() => send({ t: "qsend", car: car.id, compound, laps, risk, tow, drive })}
          >
            ส่งรถออก
          </Btn>
        </div>
      )}
      {car.status !== "eliminated" && (
        <label className="flex items-center gap-1.5 text-[11px] text-white/70">
          <input type="checkbox" checked={car.auto} onChange={(e) => send({ t: "auto", car: car.id, v: e.target.checked })} className="h-4 w-4 accent-[#E10600]" />
          {car.auto && car.status === "garage" ? "AI จะส่งรถออกเองเมื่อถึงจังหวะ (เอาติ๊กออกเพื่อสั่งเอง)" : "ให้ AI ส่งรถออกแทน (เลือกยางและจังหวะเอง)"}
        </label>
      )}
    </div>
  );
}

function QualiTower({ snap, mine, onPick }: { snap: Snapshot; mine: CarSpec[]; onPick: (id: number) => void }) {
  const q = snap.quali!;
  const order = segOrder(q);
  const cut = order.length - q.segs[q.seg].out;
  const best = order.length ? q.cars[order[0]].best : null;
  // เซกเตอร์เร็วสุดของช่วงนี้
  const top = [0, 1, 2].map((k) => Math.min(...q.cars.map((c) => c.bestSec[k] ?? Infinity)));
  const elim = q.cars.filter((c) => c.status === "eliminated").sort((a, b) => (a.grid ?? 99) - (b.grid ?? 99));
  return (
    <div className="space-y-1">
      <p className="poster text-xs text-white/60">{q.segs[q.seg].name} · ตารางเวลา</p>
      <ol className="space-y-0.5 text-xs">
        {order.map((id, i) => {
          const c = q.cars[id];
          const spec = snap.cars[id];
          const t = teamOf(spec);
          return (
            <li key={id}>
              {i === cut && q.segs[q.seg].out > 0 && <div className="my-1 h-0.5 bg-(--color-f1)" aria-label="เส้นตัดรอบ" />}
              <button type="button" onClick={() => onPick(id)} className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left ${mine.some((m) => m.id === id) ? "bg-(--color-f1)/20" : "bg-white/[0.03]"}`}>
                <span className="poster w-6 tabular-nums">{c.best === null ? "—" : i + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: t.color }} />
                <span className="w-7 font-bold tabular-nums">#{spec.num}</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((k) => {
                    const s = c.bestSec[k];
                    return <i key={k} className="h-2 w-2 rounded-sm" style={{ background: s === null ? "rgba(255,255,255,.12)" : s <= top[k] + 1e-6 ? SECTOR.purple : SECTOR.green }} />;
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/60">{c.status === "garage" ? "พิท" : c.status === "push" ? "เร่ง" : c.status === "out" ? "อุ่นยาง" : "กลับ"}</span>
                <span className="tabular-nums text-white">{fmtLap(c.best)}</span>
                <span className="w-12 text-right tabular-nums text-white/60">{i === 0 || c.best === null || best === null ? "" : `+${(c.best - best).toFixed(3)}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {elim.length > 0 && (
        <p className="pt-1 text-[11px] text-white/50">
          ตกรอบ: {elim.map((c) => `P${c.grid} #${snap.cars[c.id].num}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/* ---------- เรซ ---------- */

function TeamOrders({ snap, team, send }: { snap: Snapshot; team: number; send: (m: Msg) => void }) {
  if (team < 0) return null;
  const order = snap.race!.orders[team];
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold text-white/60">คำสั่งทีม</p>
      <Seg<TeamOrder>
        size="sm"
        value={order}
        onChange={(v) => send({ t: "order", order: v })}
        options={[
          { v: "free", label: "แข่งกันได้" },
          { v: "hold", label: "ห้ามแซงกัน" },
          { v: "swap", label: "สลับอันดับ", tone: "#fb923c" },
        ]}
      />
    </div>
  );
}

/** คำอธิบายสั้นของตัวเลือกที่เลือกอยู่ (ให้รู้ว่าได้อะไร เสียอะไร) */
const MODE_HINT: Record<DriveMode, string> = {
  save: "ช้าลงเล็กน้อย ยางสึกช้า เสี่ยงพลาดน้อย",
  normal: "สมดุลระหว่างความเร็วกับยาง",
  push: "เร็วขึ้น แต่ยางสึกเร็วและเสี่ยงพลาด",
};
const ERS_HINT: Record<ErsMode, string> = {
  harvest: "ชาร์จแบต เสียความเร็วบนทางตรง",
  auto: "ใช้และชาร์จแบตให้อัตโนมัติ",
  boost: "เร็วขึ้นบนทางตรง แบตหมดไว",
};
const FIGHT_HINT: Record<Fight, string> = {
  defend: "ปิดไลน์ คันหลังแซงยาก แต่ช้าลงนิดหน่อย",
  none: "ขับตามปกติ",
  attack: "พยายามแซงคันหน้า ใช้แบตและยางมากขึ้น",
};

function Control({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-bold text-white/70">{label}</p>
      {children}
      <p className="text-[11px] leading-snug text-white/60">{hint}</p>
    </div>
  );
}

function RaceCarPanel({ snap, spec, car, focus, onFocus, send }: { snap: Snapshot; spec: CarSpec; car: RaceCar; focus: boolean; onFocus: () => void; send: (m: Msg) => void }) {
  const r = snap.race!;
  const t = teamOf(spec);
  const track = buildTrack(snap.circuit)!;
  const pos = standings(r, track.lapCells).findIndex((c) => c.id === car.id) + 1;
  const done = car.finished !== null || car.out !== null;
  const lapsLeft = r.laps - lapOf(track, car.pos);
  return (
    <div className={`space-y-2 rounded-2xl border p-3 ${focus ? "border-white/40" : "border-white/10"} bg-[#1a1a20]`}>
      <button type="button" onClick={onFocus} className="flex w-full items-center gap-2 text-left">
        <Car color={t.color} ink={t.ink} num={spec.num} width={36} tyre={COMPOUND_INFO[car.compound].color} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{spec.name}</b>
          <span className="block text-[11px] tabular-nums text-white/60">
            {car.out ? `ออกจากเรซ (${car.out})` : car.finished !== null ? "เข้าเส้นชัย" : car.pit ? "อยู่ในพิท" : `หน้า ${fmtGap(car.gapAhead)} · หลัง ${car.gapBehind === null ? "—" : car.gapBehind.toFixed(2)}`}
          </span>
        </span>
        <b className="poster text-xl tabular-nums">P{pos}</b>
      </button>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="space-y-1">
          <span className="flex items-center gap-1 text-white/70">
            <TyreDot c={car.compound} size={14} /> ยาง {Math.max(0, Math.round((1 - car.wear) * 100))}% · {car.age} รอบ
          </span>
          <Bar value={1 - car.wear} color={car.wear > 0.8 ? "#E10600" : car.wear > 0.6 ? "#facc15" : "#22c55e"} label="ยางเหลือ" />
        </div>
        <div className="space-y-1">
          <span className="text-white/70">ERS {Math.round(car.ers * 100)}%{car.drs ? " · DRS เปิด" : ""}</span>
          <Bar value={car.ers} color="#38bdf8" label="แบต ERS" />
        </div>
      </div>
      {!done && (
        <>
          <Control label="การขับ" hint={MODE_HINT[car.mode]}>
            <Seg<DriveMode>
              size="sm"
              value={car.mode}
              onChange={(v) => send({ t: "mode", car: car.id, mode: v })}
              options={(["save", "normal", "push"] as DriveMode[]).map((v) => ({ v, label: MODE[v].label, tone: v === "push" ? "#fb923c" : v === "save" ? "#86efac" : undefined }))}
            />
          </Control>
          <div className="grid grid-cols-2 gap-1.5">
            <Control label="แบตเตอรี่ (ERS)" hint={ERS_HINT[car.ersMode]}>
              <Seg<ErsMode>
                size="sm"
                value={car.ersMode}
                onChange={(v) => send({ t: "ers", car: car.id, ers: v })}
                options={(["harvest", "auto", "boost"] as ErsMode[]).map((v) => ({ v, label: ERS[v].label, tone: v === "boost" ? "#38bdf8" : undefined }))}
              />
            </Control>
            <Control label="ต่อสู้" hint={FIGHT_HINT[car.fight]}>
              <Seg<Fight>
                size="sm"
                value={car.fight}
                onChange={(v) => send({ t: "fight", car: car.id, fight: v })}
                options={[
                  { v: "defend", label: "ป้องกัน" },
                  { v: "none", label: "ปกติ" },
                  { v: "attack", label: "บุก", tone: "#fb923c" },
                ]}
              />
            </Control>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-white/60">
              {car.pitReq ? `เข้าพิทรอบนี้ → ${COMPOUND_INFO[car.pitReq].label}` : car.pit ? "กำลังเปลี่ยนยาง…" : `สั่งเข้าพิท · เลือกยางที่จะใส่ (เหลือ ${lapsLeft} รอบ · ${car.stops ? `เข้าแล้ว ${car.stops} ครั้ง` : "ยังไม่เข้า · บังคับ 1 ครั้ง"})`}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {COMPOUNDS.map((k) => {
                const any = spec.sets.some((s) => s.compound === k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!any || !!car.pit}
                    aria-pressed={car.pitReq === k}
                    onClick={() => send({ t: "pit", car: car.id, compound: car.pitReq === k ? null : k })}
                    className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-[11px] font-bold disabled:opacity-40 ${car.pitReq === k ? "border-white bg-white/15" : "border-white/10"}`}
                  >
                    <TyreDot c={k} size={16} /> ใหม่ {freshSets(spec, k)}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!car.pitReq}
                onClick={() => send({ t: "pit", car: car.id, compound: null })}
                className="rounded-lg border-2 border-white/10 text-[11px] font-bold text-white/75 disabled:opacity-40"
              >
                ยกเลิก
              </button>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-white/70">
            <input type="checkbox" checked={car.auto} onChange={(e) => send({ t: "auto", car: car.id, v: e.target.checked })} className="h-4 w-4 accent-[#E10600]" />
            ให้ผู้ช่วย AI คุมกลยุทธ์คันนี้ (เข้าพิท โหมด บุก/ป้องกัน)
          </label>
        </>
      )}
    </div>
  );
}

function RaceTower({ snap, mine, onPick }: { snap: Snapshot; mine: CarSpec[]; onPick: (id: number) => void }) {
  const r = snap.race!;
  const track = buildTrack(snap.circuit)!;
  const list = standings(r, track.lapCells);
  const lead = list[0];
  const lapSec = track.baseLap / track.lapCells;
  return (
    <div className="space-y-1">
      <p className="poster text-xs text-white/60">อันดับ{r.fastest ? ` · รอบเร็วสุด #${snap.cars[r.fastest.car].num} ${fmtLap(r.fastest.time)}` : ""}</p>
      <ol className="space-y-0.5 text-xs">
        {list.map((c, i) => {
          const spec = snap.cars[c.id];
          const t = teamOf(spec);
          const lapsDown = lapOf(track, lead.pos) - lapOf(track, c.pos);
          const gap =
            i === 0
              ? "ผู้นำ"
              : c.out
                ? "DNF"
                : c.finished !== null && lead.finished !== null
                  ? lapsDown > 0
                    ? `+${lapsDown} รอบ`
                    : `+${(c.finished + c.penalty - (lead.finished + lead.penalty)).toFixed(1)}`
                  : lapsDown > 0 && lead.pos - c.pos >= track.lapCells
                    ? `+${lapsDown} รอบ`
                    : `+${((lead.pos - c.pos) * lapSec).toFixed(1)}`;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left ${mine.some((m) => m.id === c.id) ? "bg-(--color-f1)/20" : "bg-white/[0.03]"}`}>
                <span className="poster w-6 tabular-nums">{i + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: t.color }} />
                <span className="w-7 font-bold tabular-nums">#{spec.num}</span>
                <span className="min-w-0 flex-1 truncate text-white/70">{spec.name}</span>
                {c.pit && <span className="rounded bg-white/15 px-1 text-[9px] font-bold">PIT</span>}
                {c.finished !== null && <span className="text-[10px]">🏁</span>}
                <TyreDot c={c.compound} size={14} />
                <span className="w-5 text-right tabular-nums text-white/50">{c.age}</span>
                <span className="w-14 text-right tabular-nums text-white">{gap}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

