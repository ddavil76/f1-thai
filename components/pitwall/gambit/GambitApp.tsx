"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Flag, ListOrdered, Pause, Play, RotateCcw, Wrench, Zap } from "lucide-react";
import { Btn, Card, fmtLap, Head, Seg, TyreDot } from "@/components/pitwall/ui";
import { useDriveTrack } from "@/components/pitwall/driver/driveTrack";
import type { CameraMode, DriveScene } from "@/components/pitwall/driver/scene";
import { laneValue } from "@/lib/pitwall/drive/line";
import { lapsLeft } from "@/lib/pitwall/drive/tyres";
import { hasRealTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import type { Difficulty } from "@/lib/pitwall/drive/race";
import { CARD, FAC_KEYS, FAC_MAX, FACS, GOLD_TIERS, TIER_MAX, type Hand } from "@/lib/pitwall/gambit/cards";
import { callPit, chooseCard, createSession, gapToLeader, heroCar, heroCrew, posOf, setAutoBoost, stepSession, toggleBoost, type Session, type Setup } from "@/lib/pitwall/gambit/session";
import { CIRCUITS, circuitName, TEAMS } from "@/lib/pitwall/teams";
import { COMPOUNDS, COMPOUND_INFO, type Compound } from "@/lib/pitwall/types";
import { CARD_ICONS, FAC_ICONS } from "./icons";

const SETUP_KEY = "pitwall-gambit-setup";

/** ไอคอนเส้นจากต้นแบบ (สตริงคงที่ในโค้ด ไม่ได้มาจากผู้ใช้) */
function Icon({ d, className = "" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 48 48" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}

/** โหมดกลยุทธ์ (Pit Wall Gambit): ตั้งค่า → แข่ง (รถขับเอง เราเลือกการ์ด/พิท/บูสต์) → ผล */
export default function GambitApp({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Omit<Setup, "seed">>(() => {
    const base = { circuit: "monza", laps: 5, difficulty: "normal" as Difficulty, startTyre: "medium" as Compound, team: 0, field: 12 };
    if (typeof window === "undefined") return base;
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") };
    } catch {
      return base;
    }
  });
  const [run, setRun] = useState<Setup | null>(null);
  const set = (p: Partial<typeof setup>) =>
    setSetup((s) => {
      const next = { ...s, ...p };
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  if (run) return <GambitRace key={run.seed} setup={run} onAgain={() => setRun({ ...run, seed: (Date.now() & 0xffff) + 1 })} onExit={() => setRun(null)} />;

  const team = TEAMS[setup.team] ?? TEAMS[0];
  return (
    <div className="space-y-4">
      <button type="button" onClick={onExit} className="flex items-center gap-1 text-sm text-white/70 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> เลือกโหมด
      </button>
      <Card>
        <Head kicker="ROGUELITE · ห้องวิศวกร" title="นักแข่งคุมพวงมาลัย คุณคุมกลยุทธ์" sub={`รถของคุณ (#${team.drivers[0]?.num ?? 7} ${team.name}) ขับเองตลอดการแข่ง หน้าที่ของคุณคือตัดสินใจเรื่องที่ทำให้ชนะ`} />
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-xl bg-[#1F1F24] p-3">
            <b className="block">การ์ดอัปเกรด</b>
            <span className="text-white/70">เลือก 1 จาก 3 ทุกเลเวลอัป มี 6 หมวด เติมหมวดครบ 6 ช่องรับโบนัส การ์ดที่อัปครบ 3 ขั้นจะสุ่มออกเป็นการ์ดทองชั่วคราว</span>
          </li>
          <li className="rounded-xl bg-[#1F1F24] p-3">
            <b className="block">พิทและยาง</b>
            <span className="text-white/70">ยางแต่ละแบบเร็วและทนต่างกัน ยางใกล้หมดเกาะถนนลดลงเร็ว สั่งเข้าพิทได้ทุกเมื่อ</span>
          </li>
          <li className="rounded-xl bg-[#1F1F24] p-3">
            <b className="block">บูสต์</b>
            <span className="text-white/70">ใช้แบตตอนไล่ตามหรือป้องกันอันดับ แบตชาร์จคืนตอนเบรกและทุกเซกเตอร์ · ปล่อยให้อัตโนมัติก็ได้</span>
          </li>
          <li className="rounded-xl bg-[#1F1F24] p-3">
            <b className="block">XP</b>
            <span className="text-white/70">ได้จากระยะทาง การแซง และรอบเร็วสุดของสนาม · คู่แข่ง AI ก็เลือกการ์ดอัปเกรดของตัวเอง</span>
          </li>
        </ul>
      </Card>

      <Card>
        <Head kicker="ทีม" title={team.name} />
        <div className="flex flex-wrap gap-1.5">
          {TEAMS.map((t, i) => (
            <button key={t.id} type="button" aria-pressed={setup.team === i} onClick={() => set({ team: i })} className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${setup.team === i ? "border-white bg-white text-[#08080A]" : "border-white/15 text-white/75"}`}>
              <span className="h-3 w-1.5 rounded-full" style={{ background: t.color }} /> {t.name}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <Head kicker="สนาม" title={circuitName(setup.circuit)} />
        <div className="flex flex-wrap gap-1.5">
          {CIRCUITS.map((c) => (
            <button key={c.id} type="button" aria-pressed={setup.circuit === c.id} onClick={() => set({ circuit: c.id })} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${setup.circuit === c.id ? "border-white bg-white text-[#08080A]" : "border-white/15 text-white/75"}`}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">จำนวนรอบ</span>
            <Seg value={setup.laps} onChange={(v) => set({ laps: v })} options={[{ v: 3, label: "3 รอบ" }, { v: 5, label: "5 รอบ" }, { v: 8, label: "8 รอบ" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">คู่แข่ง AI</span>
            <Seg<Difficulty> value={setup.difficulty} onChange={(v) => set({ difficulty: v })} options={[{ v: "easy", label: "ง่าย" }, { v: "normal", label: "ปกติ" }, { v: "hard", label: "ยาก" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">ยางออกสตาร์ท</span>
            <Seg<Compound> value={setup.startTyre} onChange={(v) => set({ startTyre: v })} options={COMPOUNDS.map((c) => ({ v: c, label: COMPOUND_INFO[c].label, tone: COMPOUND_INFO[c].color }))} />
          </label>
        </div>
        <p className="text-[11px] text-white/60">
          คีย์ลัด: <b>Space</b> บูสต์ · <b>P</b> เข้าพิท · <b>1</b>–<b>3</b> เลือกการ์ด · <b>C</b> เปลี่ยนกล้อง · <b>Esc</b> หยุด
        </p>
        <Btn className="w-full" onClick={() => setRun({ ...setup, seed: (Date.now() & 0xffff) + 1 })}>
          <Flag className="inline h-4 w-4" /> เริ่มการแข่งขัน
        </Btn>
      </Card>
    </div>
  );
}

const CAMS: [CameraMode, string][] = [
  ["chase", "ตามรถ"],
  ["broadcast", "ทีวี"],
  ["heli", "มุมสูง"],
];
const SPEEDS = [0, 1, 2, 4] as const;
const TONE: Record<string, string> = { good: "#22c55e", bad: "#E10600", info: "rgba(255,255,255,.4)", best: "#b583ff" };

/** หน้าจอแข่ง: ภาพ 3D ตามรถเรา · การ์ดเลเวลอัป (เวลาค่อย ๆ หยุดจนเลือก) · พิท/ยาง · บูสต์ · ตารางอันดับ */
function GambitRace({ setup, onAgain, onExit }: { setup: Setup; onAgain: () => void; onExit: () => void }) {
  const track = useDriveTrack(setup.circuit);
  const session = useMemo<Session | null>(() => (track ? createSession(track, setup) : null), [track, setup]);
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DriveScene | null>(null);
  const [cam, setCam] = useState<CameraMode>("chase");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [menu, setMenu] = useState(false);
  const [pitOpen, setPitOpen] = useState(false);
  const [tower, setTower] = useState(false);
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);
  const ctl = useRef({ speed: 1 as number, menu: false });
  useEffect(() => {
    ctl.current = { speed, menu };
  }, [speed, menu]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // คีย์ลัด
  useEffect(() => {
    if (!session) return;
    const key = (e: KeyboardEvent) => {
      if (session.over) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleBoost(session);
      } else if (e.key === "p" || e.key === "P") {
        if (heroCar(session).pitWant) callPit(session, null);
        else setPitOpen((o) => !o);
      } else if (e.key === "1" || e.key === "2" || e.key === "3") chooseCard(session, Number(e.key) - 1);
      else if (e.key === "c" || e.key === "C") setCam((m) => CAMS[(CAMS.findIndex(([k]) => k === m) + 1) % CAMS.length][0]);
      else if (e.key === "Escape") setMenu((m) => !m);
      else return;
      setTick((n) => n + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session]);

  // ฉาก 3D + ลูปจำลอง
  useEffect(() => {
    const el = host.current;
    if (!el || !session || !track) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
      const { Sky } = await import("three/addons/objects/Sky.js");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const { createDriveScene } = await import("@/components/pitwall/driver/scene");
      if (disposed) return;
      const r = session.race;
      const low = matchMedia("(pointer: coarse)").matches || el.clientWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4;
      const liveries = r.cars.map((c) => ({ team: c.team, colour: c.colour, ink: c.ink, num: c.num }));
      const scene = createDriveScene({
        THREE,
        addons: { Sky, RoomEnvironment },
        merge: mergeGeometries,
        body: null,
        el,
        track,
        livery: liveries[session.hero],
        gfx: low ? "low" : "high",
        rivals: liveries,
        pit: { lane: r.pitLane, teams: TEAMS.map((x) => ({ color: x.color, name: x.name })), mine: setup.team },
        spectator: true,
      });
      sceneRef.current = scene;
      scene.setLine(false);
      scene.setCamera("chase");
      setReady(true);
      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);
      let last = performance.now();
      let hudAt = 0;
      /** ตัวคูณเวลา: มีการ์ดรอเลือก = ค่อย ๆ หยุด · เลือกแล้วค่อย ๆ กลับมา */
      let ts = 1;
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const choosing = !!session.offer && !session.over;
        if (choosing) ts = Math.max(0, ts - dt / (calm ? 0.05 : 1.1));
        else ts = Math.min(1, ts + dt / (calm ? 0.05 : 0.7));
        const simDt = ctl.current.menu ? 0 : dt * ctl.current.speed * ts * ts;
        if (simDt > 0 && !session.over) stepSession(session, simDt);
        const states = r.cars.map((c) => ({
          s: c.car.s,
          lateral: c.pitOff ?? laneValue(track, "offset", c.car.s, c.car.lat) + c.car.slide,
          speed: c.car.v,
          aero: c.car.sm ? 1 : 0,
          tyre: COMPOUND_INFO[c.tyre.c].color,
        }));
        const me = states[session.hero];
        scene.update({ s: me.s, lateral: me.lateral, ghost: null, speed: me.speed, accel: 0, dt: simDt > 0 ? dt : 0, rivals: states, focus: session.hero, boost: heroCar(session).car.ot });
        scene.render();
        if (now - hudAt > 150) {
          hudAt = now;
          setTick((n) => n + 1);
        }
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        scene.dispose();
        sceneRef.current = null;
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [session, track, setup.team]);

  useEffect(() => {
    sceneRef.current?.setCamera(cam);
  }, [cam]);

  const s = session;
  const r = s?.race;
  const rc = s ? heroCar(s) : null;
  const cr = s ? heroCrew(s) : null;
  const pos = s ? posOf(s, s.hero) : 0;
  const lap = rc && r ? Math.min(r.laps, Math.max(1, rc.car.lap + 1)) : 1;
  const tyreLaps = rc && r ? lapsLeft(rc.tyre, r.laps) / rc.boost.wear : 0;
  const lapsToGo = rc && r ? Math.max(0, r.laps - rc.car.lap) : 0;
  const life = rc ? Math.max(0, Math.round((1 - rc.tyre.wear) * 100)) : 0;
  const feed = s ? s.feed.slice(-3).reverse() : [];
  const golds = cr && r ? cr.deck.golds.filter((g) => g.until > r.t) : [];
  const limp = cr && r ? cr.deck.limpUntil > r.t : false;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#08080A] text-white">
      <div ref={host} className="absolute inset-0" role="img" aria-label="ภาพการแข่ง 3D" />
      {(!ready || !s) && <p className="poster absolute inset-0 flex items-center justify-center text-sm text-white/60">{track === null ? "โหลดสนามไม่ได้" : "กำลังโหลดสนาม 3D…"}</p>}

      {/* แถบบน */}
      <header className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-1.5 rounded-xl bg-black/65 px-2 py-1.5 backdrop-blur">
        <button type="button" onClick={() => setMenu(true)} aria-label="หยุดชั่วคราว" className="rounded-full p-2 text-white/80 hover:bg-white/10">
          <Pause className="h-5 w-5" />
        </button>
        <span className="poster hidden min-w-0 truncate text-sm sm:block">{circuitName(setup.circuit)}</span>
        <span className="poster rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums">
          รอบ {lap}/{r?.laps ?? setup.laps}
        </span>
        <span className="poster rounded-full bg-(--color-f1) px-2.5 py-1 text-[12px] tabular-nums">P{pos}</span>
        <button type="button" onClick={() => setTower((v) => !v)} aria-expanded={tower} className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[12px] font-bold lg:hidden">
          <ListOrdered className="h-3.5 w-3.5" /> <span className="max-sm:sr-only">อันดับ</span>
        </button>
        <div className="ml-auto flex overflow-hidden rounded-full border border-white/15" role="group" aria-label="ความเร็วเกม">
          {SPEEDS.map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={`min-h-8 px-2 text-[12px] font-bold tabular-nums sm:px-2.5 ${speed === v ? "bg-[#facc15] text-[#08080A]" : "text-white/75"}`}>
              {v === 0 ? "หยุด" : `${v}×`}
            </button>
          ))}
        </div>
      </header>

      <div className="absolute right-2 top-16 z-10 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur" role="group" aria-label="มุมกล้อง">
        {CAMS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cam === k} onClick={() => setCam(k)} className={`min-h-8 rounded-full px-2.5 text-[11px] font-bold ${cam === k ? "bg-white text-[#08080A]" : "text-white/75"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ไฟสตาร์ท */}
      {r && r.lights > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-60 z-10 mx-auto flex w-fit gap-2 rounded-2xl bg-black/70 p-3 sm:top-32 land:top-24" aria-hidden>
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} className="h-8 w-8 rounded-full" style={{ background: k < Math.min(5, Math.floor((5.4 - r.lights) / 0.6) + 1) ? "#E10600" : "#2a2c31" }} />
          ))}
        </div>
      )}

      {/* ตารางอันดับ */}
      {s && r && (
        <ol className={`absolute left-2 top-16 z-10 w-56 space-y-0.5 rounded-xl bg-black/65 p-1.5 text-[11px] tabular-nums backdrop-blur max-lg:z-20 lg:block ${tower ? "block" : "hidden"}`} aria-label="ตารางอันดับ">
          {r.order.map((i, k) => {
            const c = r.cars[i];
            const gap = k === 0 ? (c.finish !== null ? "ชนะ" : "ผู้นำ") : c.pitOff !== null ? "พิท" : `+${gapToLeader(s, i).toFixed(1)}`;
            return (
              <li key={c.id} className={`flex items-center gap-1.5 rounded px-1 ${i === s.hero ? "bg-white/20 font-bold" : ""}`}>
                <span className="w-4 text-right text-white/70">{k + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: c.colour }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-[10px] text-[#facc15]">Lv{s.crews[i].level}</span>
                <span className={c.pitOff !== null ? "text-[#facc15]" : "text-white/75"}>{gap}</span>
                <TyreDot c={c.tyre.c} size={12} />
              </li>
            );
          })}
          {s.bestLap !== null && s.bestCar !== null && (
            <li className="mt-1 border-t border-white/10 px-1 pt-1 text-white/70">
              รอบเร็วสุด {r.cars[s.bestCar].name} <b className="text-[#b583ff]">{fmtLap(s.bestLap)}</b>
            </li>
          )}
        </ol>
      )}

      {/* วิทยุ */}
      <ul className="pointer-events-none absolute inset-x-2 top-28 z-10 mx-auto flex max-w-md flex-col gap-1 sm:top-16" aria-live="polite">
        {feed.map((f, k) => (
          <li key={f.id} className="rounded-lg border-l-4 bg-[#08080A]/85 px-3 py-1 text-xs font-bold" style={{ borderColor: TONE[f.tone], opacity: 1 - k * 0.25 }}>
            {f.text}
          </li>
        ))}
      </ul>

      {/* แผงล่าง: คอนโซลวิศวกร + อัปเกรด */}
      {s && rc && cr && r && (
        <div className="absolute inset-x-2 bottom-2 z-10 grid gap-2 pb-[env(safe-area-inset-bottom)] lg:grid-cols-[auto_1fr] land:grid-cols-[auto_1fr] land:gap-1.5">
          <section className="flex flex-wrap items-center gap-3 rounded-xl bg-black/70 p-2.5 backdrop-blur land:gap-2 land:p-2" aria-label="คอนโซลวิศวกร">
            <div>
              <p className="poster text-3xl leading-none">P{pos}</p>
              <p className="text-[10px] text-white/60 tabular-nums">{rc.finish !== null ? "จบการแข่งขัน" : `ออกตัว P${cr.startPos}`}</p>
            </div>
            <div className="w-36 space-y-1 text-[11px] land:w-28">
              <div className="flex items-center gap-1.5">
                <TyreDot c={rc.tyre.c} size={20} />
                <span className="min-w-0 tabular-nums">
                  <b>{COMPOUND_INFO[rc.tyre.c].label}</b> {life}%
                  <span className={`block text-[10px] ${tyreLaps < lapsToGo ? "text-(--color-f1-text)" : "text-white/60"}`}>{tyreLaps < lapsToGo ? `~${tyreLaps.toFixed(1)} รอบ` : "พอถึงจบ"}</span>
                </span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${life}%`, background: life < 25 ? "#E10600" : COMPOUND_INFO[rc.tyre.c].color }} />
              </span>
            </div>
            <div className="w-36 space-y-1 text-[11px] land:w-28">
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-[#38bdf8]" style={{ width: `${rc.car.energy * 100}%` }} />
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={rc.car.ot}
                  disabled={s.autoBoost || !!rc.pit || rc.finish !== null}
                  onClick={() => toggleBoost(s)}
                  className={`flex min-h-9 items-center gap-1 rounded-lg border px-2.5 font-bold disabled:opacity-50 ${rc.car.ot ? "border-[#38bdf8] bg-[#38bdf8] text-[#08080A]" : "border-white/20"}`}
                >
                  <Zap className="h-3.5 w-3.5" /> {rc.car.ot ? "บูสต์ทำงาน" : "บูสต์"}
                </button>
                <label className="flex items-center gap-1 text-white/70">
                  <input
                    type="checkbox"
                    checked={s.autoBoost}
                    onChange={(e) => {
                      setAutoBoost(s, e.target.checked);
                      setTick((n) => n + 1);
                    }}
                  />
                  อัตโนมัติ
                </label>
              </div>
            </div>
            <div className="max-w-44 space-y-1">
              <button
                type="button"
                disabled={!!rc.pit || rc.finish !== null || r.lights > 0}
                onClick={() => (rc.pitWant ? callPit(s, null) : setPitOpen(true))}
                className={`flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold disabled:opacity-50 ${rc.pitWant ? "border border-[#facc15] text-[#facc15]" : "bg-[#facc15] text-[#08080A]"}`}
              >
                <Wrench className="h-3.5 w-3.5" /> {rc.pitWant ? "ยกเลิกเข้าพิท" : "เข้าพิท"}
              </button>
              <p className="text-[10px] leading-tight text-white/60">
                {rc.pit ? "อยู่ในพิท" : rc.pitWant ? `รอเข้าพิท → ${COMPOUND_INFO[rc.pitWant].label}` : rc.pits ? `เข้าพิทแล้ว ${rc.pits} ครั้ง` : "ยังไม่ได้เข้าพิท"}
                {limp ? " · ⚠ เครื่องรวน" : ""}
              </p>
            </div>
            <p className="hidden text-[10px] text-white/60 tabular-nums sm:block land:hidden">
              ล่าสุด <b className="text-white">{fmtLap(cr.lastLap)}</b>
              <br />
              ดีสุด <b className={s.bestCar === s.hero ? "text-[#b583ff]" : "text-white"}>{fmtLap(cr.bestLap)}</b>
            </p>
          </section>
          <section className="min-w-0 space-y-1.5 rounded-xl bg-black/70 p-2.5 backdrop-blur land:p-2" aria-label="อัปเกรดรถ">
            <div className="flex items-center gap-2">
              <span className="poster text-sm text-[#facc15]">Lv {cr.level}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`XP ${cr.xp} จาก ${s.xpCost}`}>
                <span className="block h-full rounded-full bg-[#facc15]" style={{ width: `${(cr.xp / s.xpCost) * 100}%` }} />
              </span>
              <span className="text-[10px] text-white/60 tabular-nums">
                {cr.xp}/{s.xpCost} XP
              </span>
              {cr.pending > 0 && <span className="rounded-full bg-[#facc15] px-2 text-[11px] font-bold text-[#08080A]">รอเลือก {cr.pending} ใบ</span>}
            </div>
            {golds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {golds.map((g, k) => (
                  <span key={`${g.id}-${k}`} className="rounded-full border border-[#6b5717] bg-[#3a2f0c] px-2 text-[#ffe08a] tabular-nums">
                    {CARD[g.id].name} <b>{Math.ceil(g.until - r.t)}</b> วิ
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {FAC_KEYS.map((f) => {
                const n = cr.deck.fac[f];
                return (
                  <span key={f} className={`flex items-center gap-1 text-[11px] ${n >= FAC_MAX ? "text-white" : "text-white/60"}`} title={`เต็ม 6 ช่อง: ${FACS[f].bonus}`}>
                    <span className="flex gap-0.5">
                      {Array.from({ length: FAC_MAX }, (_, q) => (
                        <i key={q} className="h-2 w-2 rounded-[2px] border" style={{ borderColor: FACS[f].color, background: q < n ? FACS[f].color : "transparent" }} />
                      ))}
                    </span>
                    {FACS[f].name}
                    {n >= FAC_MAX ? " · โบนัส" : ""}
                  </span>
                );
              })}
            </div>
            <p className="text-[9px] leading-tight text-white/45">
              {hasRealTrack(setup.circuit) ? TRACK_DATA_CREDIT : "© OpenStreetMap contributors"} · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
            </p>
          </section>
        </div>
      )}

      {/* เลือกยางเข้าพิท */}
      {s && rc && r && pitOpen && !rc.pit && (
        <div className="absolute inset-x-2 top-28 z-30 mx-auto max-w-sm space-y-2 rounded-2xl bg-[#121216] p-3 shadow-2xl" role="dialog" aria-label="เลือกยางสำหรับพิทสต็อป">
          <p className="poster text-lg">เข้าพิท: เลือกยางชุดใหม่</p>
          <p className="text-xs text-white/60">รถจะเข้าพิทเมื่อถึงทางเข้าพิท (ก่อนเส้นชัย)</p>
          {COMPOUNDS.map((c) => {
            const left = lapsLeft({ c, wear: 0, cold: 0 }, r.laps) / rc.boost.wear;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  callPit(s, c);
                  setPitOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-white/15 bg-[#1F1F24] p-2 text-left hover:border-white/40"
              >
                <TyreDot c={c} size={22} />
                <b className="flex-1 text-sm">
                  {COMPOUND_INFO[c].label}
                  {c === rc.tyre.c ? <span className="ml-1 text-[11px] font-normal text-white/60">(ชุดเดิม)</span> : null}
                </b>
                <span className="text-xs text-white/70 tabular-nums">~{left.toFixed(1)} รอบ</span>
              </button>
            );
          })}
          <Btn tone="ghost" className="w-full" onClick={() => setPitOpen(false)}>
            ปิด
          </Btn>
        </div>
      )}

      {/* การ์ดเลเวลอัป: เวลาค่อย ๆ หยุดจนกว่าจะเลือก */}
      {s && cr && s.offer && !s.over && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-end gap-3 bg-[radial-gradient(ellipse_at_50%_60%,transparent_30%,rgba(5,9,11,.6))] p-3 pb-44 max-lg:pb-64 land:pb-36! land:gap-1.5" role="dialog" aria-label="เลือกการ์ดอัปเกรด">
          <div className="pointer-events-auto flex max-w-full items-end justify-center gap-2 sm:gap-3">
            {s.offer.map((h, i) => (
              <CardFace key={`${cr.level}-${cr.pending}-${h.id}-${i}`} h={h} lv={cr.deck.cards[h.id] ?? 0} goldMul={cr.deck.fac.golden >= FAC_MAX ? 1.5 : 1} goldDur={cr.stats.goldDur} idx={i} onPick={() => chooseCard(s, i)} />
            ))}
          </div>
          <p className="pointer-events-auto poster rounded-lg bg-[#facc15] px-5 py-1.5 text-base text-[#08080A] sm:text-xl">
            เลือกการ์ดอัปเกรด {cr.pending > 1 ? <small className="text-xs">ยังเหลืออีก {cr.pending - 1} ใบ</small> : null}
          </p>
        </div>
      )}

      {/* หยุดชั่วคราว */}
      {menu && s && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-label="หยุดชั่วคราว">
          <div className="w-full max-w-xs space-y-2 rounded-2xl bg-[#121216] p-4">
            <p className="poster text-center text-xl">หยุดชั่วคราว</p>
            <Btn className="w-full" onClick={() => setMenu(false)}>
              <Play className="inline h-4 w-4" /> แข่งต่อ
            </Btn>
            <Btn tone="white" className="w-full" onClick={onAgain}>
              <RotateCcw className="inline h-4 w-4" /> เริ่มใหม่
            </Btn>
            <Btn tone="ghost" className="w-full" onClick={onExit}>
              ออกไปหน้าตั้งค่า
            </Btn>
          </div>
        </div>
      )}

      {/* ผลการแข่ง */}
      {s && r && cr && s.over && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-auto bg-black/75 p-4" role="dialog" aria-label="ผลการแข่ง">
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-[#121216] p-5">
            <p className="poster text-xs text-(--color-f1-text)">ผลการแข่งขัน {r.laps} รอบ</p>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="poster text-6xl text-[#facc15]">P{pos}</span>
              <span className="poster text-2xl">{pos === 1 ? "ชนะการแข่งขัน!" : pos <= 3 ? "ขึ้นโพเดียม!" : `จบอันดับ P${pos}`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                ["ออกตัว → จบ", `P${cr.startPos} → P${pos}`],
                ["แซง", String(cr.overtakes)],
                ["เข้าพิท", String(rc?.pits ?? 0)],
                ["รอบดีสุด", fmtLap(cr.bestLap)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#1F1F24] p-2">
                  <p className="text-[10px] text-white/60">{k}</p>
                  <p className="poster text-lg tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/70">
              อัปเกรดของคุณ (Lv {cr.level}):{" "}
              {Object.entries(cr.deck.cards)
                .map(([id, lv]) => `${CARD[id].name} ขั้น ${lv}`)
                .join(" · ") || "ยังไม่ได้เลือกการ์ด"}
            </p>
            <ol className="max-h-[40vh] space-y-0.5 overflow-auto text-sm tabular-nums">
              {r.order.map((i, k) => {
                const c = r.cars[i];
                const lead = r.cars[r.order[0]];
                const gap = c.finish === null ? "ไม่จบ" : k === 0 ? fmtLap(c.finish) : `+${(c.finish + c.penalty - (lead.finish ?? 0) - lead.penalty).toFixed(3)}`;
                return (
                  <li key={c.id} className={`flex items-center gap-2 rounded px-2 py-0.5 ${i === s.hero ? "bg-white/15 font-bold" : ""}`}>
                    <span className="w-5 text-right">{k + 1}</span>
                    <span className="h-4 w-1.5 rounded-full" style={{ background: c.colour }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="flex gap-0.5">
                      {c.stints.map((x, q) => (
                        <TyreDot key={q} c={x.c} size={12} />
                      ))}
                    </span>
                    <span className="w-20 text-right text-white/75">{gap}</span>
                  </li>
                );
              })}
            </ol>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={onAgain}>
                <RotateCcw className="inline h-4 w-4" /> แข่งอีกครั้ง
              </Btn>
              <Btn tone="ghost" className="flex-1" onClick={onExit}>
                หน้าตั้งค่า
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** การ์ดหนึ่งใบ (ปกติ / ทอง / เสี่ยง) */
function CardFace({ h, lv, goldMul, goldDur, idx, onPick }: { h: Hand; lv: number; goldMul: number; goldDur: number; idx: number; onPick: () => void }) {
  const k = CARD[h.id];
  const fac = FACS[k.fac];
  const color = h.gold ? FACS.golden.color : fac.color;
  const next = h.risky ? TIER_MAX : lv + 1;
  const art = h.gold
    ? "repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.08) 10px 12px),linear-gradient(160deg,#f6d35b,#9a6f0c)"
    : h.risky
      ? `repeating-linear-gradient(135deg,transparent 0 12px,rgba(255,197,61,.28) 12px 20px),linear-gradient(160deg,color-mix(in srgb,${color} 75%,#000),#1a1405)`
      : `repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.05) 10px 12px),linear-gradient(160deg,color-mix(in srgb,${color} 75%,#000),color-mix(in srgb,${color} 30%,#000))`;
  return (
    <button
      type="button"
      onClick={onPick}
      className="gambit-card relative flex w-[min(11rem,31vw)] flex-col land:w-36 overflow-hidden rounded-xl border-2 bg-[#0e1518] text-left shadow-[0_10px_28px_#000a] transition-transform hover:-translate-y-2 hover:scale-[1.03] focus-visible:-translate-y-2"
      style={{ borderColor: color, animationDelay: `${idx * 110}ms`, boxShadow: h.gold ? "0 10px 28px #000a, 0 0 22px rgba(242,194,48,.45)" : undefined }}
    >
      <span className="flex items-center gap-1.5 truncate px-2 py-1 text-[11px] font-bold text-[#0a0f11]" style={{ background: color }}>
        <Icon d={FAC_ICONS[h.gold ? "golden" : k.fac]} className="h-3.5 w-3.5 flex-none" />
        {h.gold ? `การ์ดทอง · ${fac.name}` : fac.name}
      </span>
      <span className="relative grid aspect-[1/0.82] place-items-center text-white land:aspect-[1/0.45]" style={{ background: art }}>
        <Icon d={CARD_ICONS[h.id]} className="w-[58%] land:w-[32%] drop-shadow-[0_3px_0_rgba(0,0,0,.35)]" />
        {!h.gold && (
          <span className="absolute bottom-1.5 left-2 flex gap-0.5">
            {Array.from({ length: TIER_MAX }, (_, q) => (
              <i key={q} className={`h-1.5 w-4 rounded-sm ${q < next ? "bg-white" : "bg-white/25"}`} />
            ))}
          </span>
        )}
        <kbd className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1 text-[10px] max-sm:hidden">{idx + 1}</kbd>
      </span>
      <b className="px-2 pt-1.5 text-sm leading-tight sm:text-[15px]">{k.name}</b>
      <span className="px-2 pb-2 text-[11px] leading-snug text-[#c4d1d5] sm:text-xs">
        {h.gold ? `+${GOLD_TIERS * goldMul} ขั้นชั่วคราว (ขั้นละ ${k.eff})` : k.eff}
        <em className="mt-0.5 block not-italic text-[#facc15]">
          {h.gold
            ? `อยู่ ${Math.round(goldDur)} วิ · ซ้อนกันได้`
            : h.risky
              ? `ข้ามไปขั้น 3 ทันที · โอกาสเครื่องรวน ${Math.round(h.risky.chance * 100)}% ภายใน ${h.risky.window} วิ`
              : `ขั้น ${next}/${TIER_MAX}${next === TIER_MAX ? " · ครบ!" : ""}`}
        </em>
      </span>
    </button>
  );
}
