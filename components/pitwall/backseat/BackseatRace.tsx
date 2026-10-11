"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FastForward, Pause, Play, Wrench } from "lucide-react";
import OsmCredit from "@/components/OsmCredit";
import { TyreDot } from "@/components/pitwall/ui";
import { useDriveTrack } from "@/components/pitwall/driver/driveTrack";
import type { CameraMode, DriveScene } from "@/components/pitwall/driver/scene";
import { laneValue } from "@/lib/pitwall/drive/line";
import { lapsLeft } from "@/lib/pitwall/drive/tyres";
import { hasRealTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import { cardOf, riskOf, STAT_NAME, xpNeed, type Card } from "@/lib/pitwall/backseat/cards";
import type { RaceSetup } from "@/lib/pitwall/backseat/run";
import { callPit, chooseCard, createSession, finalPos, heroCar, paused, stepSession, type Session } from "@/lib/pitwall/backseat/session";
import { circuitName, TEAMS } from "@/lib/pitwall/teams";
import { COMPOUNDS, COMPOUND_INFO } from "@/lib/pitwall/types";

const CAMS: [CameraMode, string][] = [
  ["broadcast", "TV"],
  ["heli", "มุมสูง"],
  ["chase", "ตามหลัง"],
  ["tv", "ออนบอร์ด"],
];
export const RARITY_COLOR: Record<Card["rarity"], string> = { common: "#DEDEDE", rare: "#38bdf8", legend: "#facc15", curse: "#ff3b2f" };

/**
 * หน้าจอเรซของโหมดคุมนักขับ AI: ภาพ 3D มุมถ่ายทอดสดตามรถเรา · นักขับ AI ขับเอง
 * ทีมเรา: สั่งเข้าพิท/เลือกยาง · เลือกการ์ดเมื่อเลเวลอัป (เกมหยุดให้เลือก) · เร่งเวลา ×2 ×4
 */
export default function BackseatRace({ setup, onDone }: { setup: RaceSetup; onDone: (pos: number, dnf: boolean, level: number) => void }) {
  const track = useDriveTrack(setup.circuit);
  const session = useMemo<Session | null>(() => (track ? createSession(track, setup) : null), [track, setup]);
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DriveScene | null>(null);
  const [cam, setCam] = useState<CameraMode>("broadcast");
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState(false);
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const ctl = useRef({ speed: 1, menu: false });
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
      const mine = Math.max(0, TEAMS.findIndex((t) => t.id === heroCar(session).team));
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
        pit: { lane: r.pitLane, teams: TEAMS.map((x) => ({ color: x.color, name: x.name })), mine },
        spectator: true,
      });
      sceneRef.current = scene;
      scene.setLine(false);
      scene.setCamera("broadcast");
      setReady(true);
      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);
      let last = performance.now();
      let hudAt = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!ctl.current.menu && !paused(session) && !session.over) stepSession(session, dt * ctl.current.speed);
        const states = r.cars.map((c) => ({
          s: c.car.s,
          lateral: c.pitOff ?? laneValue(track, "offset", c.car.s, c.car.lat) + c.car.slide,
          speed: c.car.v,
          aero: c.car.sm ? 1 : 0,
          tyre: COMPOUND_INFO[c.tyre.c].color,
        }));
        const me = states[session.hero];
        scene.update({ s: me.s, lateral: me.lateral, ghost: null, speed: me.speed, accel: 0, dt: ctl.current.menu || paused(session) ? 0 : dt, rivals: states, focus: session.hero });
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
  }, [session, track]);

  useEffect(() => {
    sceneRef.current?.setCamera(cam);
  }, [cam]);

  const s = session;
  const rc = s ? heroCar(s) : null;
  const r = s?.race;
  const pos = s ? finalPos(s) : 0;
  const lap = rc && r ? Math.min(r.laps, Math.max(1, rc.car.lap + 1)) : 1;
  const ok = pos <= setup.target;
  const risk = s ? riskOf(s.cards) : { engine: 0, spin: 0 };
  const tyreLaps = rc && r ? lapsLeft(rc.tyre, r.laps) / rc.boost.wear : 0;
  const lapsToGo = rc && r ? Math.max(0, r.laps - rc.car.lap) : 0;
  const gapA = s && r ? gapTo(s, -1) : null;
  const gapB = s && r ? gapTo(s, 1) : null;
  const feed = s ? s.feed.slice(-2) : [];

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#08080A] text-white">
      <div ref={host} className="absolute inset-0" role="img" aria-label="ภาพการแข่ง 3D" />
      {(!ready || !s) && <p className="poster absolute inset-0 flex items-center justify-center text-sm text-white/60">{track === null ? "โหลดสนามไม่ได้" : "กำลังโหลดสนาม 3D…"}</p>}

      {/* แถบบน: เมนู · สนาม · รอบ · อันดับ · ความเร็วเวลา */}
      <header className="absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-1.5 bg-gradient-to-b from-black/80 to-transparent px-2">
        <button type="button" onClick={() => setMenu(true)} aria-label="หยุดชั่วคราว" className="rounded-full p-2 text-white/80 hover:bg-white/10">
          <Pause className="h-5 w-5" />
        </button>
        <span className="poster min-w-0 flex-1 truncate text-sm text-white">{circuitName(setup.circuit)}</span>
        <span className="poster rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px] tabular-nums">
          LAP {lap}/{r?.laps ?? setup.laps}
        </span>
        <span className={`poster rounded-full px-2.5 py-1 text-[12px] tabular-nums ${ok ? "bg-[#22c55e] text-[#08080A]" : "bg-(--color-f1)"}`} aria-label={`อันดับ ${pos} เป้า ท็อป ${setup.target}`}>
          P{pos} <span className="opacity-70">/ เป้า {setup.target}</span>
        </span>
        <button type="button" onClick={() => setSpeed((x) => (x === 1 ? 2 : x === 2 ? 4 : 1))} aria-label={`ความเร็วเวลา ×${speed}`} className="poster flex min-w-14 items-center justify-center gap-1 rounded-full bg-[#1F1F24] px-2.5 py-1 text-[12px]">
          <FastForward className="h-3.5 w-3.5" /> ×{speed}
        </button>
      </header>

      <div className="absolute right-2 top-14 z-10 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur" role="group" aria-label="มุมกล้อง">
        {CAMS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cam === k} onClick={() => setCam(k)} className={`min-h-8 rounded-full px-2.5 text-[11px] font-bold ${cam === k ? "bg-white text-[#08080A]" : "text-white/75"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ข้อความล่าสุด */}
      <div className="pointer-events-none absolute inset-x-2 top-28 z-10 mx-auto flex max-w-md flex-col gap-1 sm:top-14">
        {feed.map((f) => (
          <p key={f.id} className={`radio-toast rounded-xl border-l-4 bg-[#08080A]/85 px-3 py-1.5 text-center text-xs font-bold ${f.tone === "good" ? "border-[#22c55e]" : f.tone === "bad" ? "border-(--color-f1) text-(--color-f1-text)" : "border-white/40"}`}>
            {f.text}
          </p>
        ))}
      </div>

      {/* แผงล่าง: XP · ยาง/พิท · ช่องห่าง/การ์ด */}
      {s && rc && r && (
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/90 via-black/75 to-transparent p-3 pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className="poster w-12 flex-none text-sm text-[#facc15]">LV {s.level}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`XP ${s.xp} จาก ${xpNeed(s.level)}`}>
              <span className="block h-full rounded-full bg-[#facc15] transition-[width]" style={{ width: `${(s.xp / xpNeed(s.level)) * 100}%` }} />
            </span>
            <span className="w-16 flex-none text-right text-[10px] text-white/60 tabular-nums">
              {s.xp}/{xpNeed(s.level)} XP
            </span>
          </div>
          <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-2 rounded-xl bg-[#121216]/90 p-2 text-xs">
              <TyreDot c={rc.tyre.c} size={22} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 tabular-nums">
                  <b>ยาง {Math.max(0, Math.round((1 - rc.tyre.wear) * 100))}%</b>
                  <span className={tyreLaps < lapsToGo ? "text-(--color-f1-text)" : "text-white/60"}>
                    {tyreLaps < lapsToGo ? `หมดในอีก ~${tyreLaps.toFixed(1)} รอบ` : "พอถึงจบ"}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(0, 1 - rc.tyre.wear) * 100}%`, background: rc.tyre.wear > 0.75 ? "#E10600" : rc.tyre.wear > 0.5 ? "#facc15" : "#22c55e" }} />
                </span>
                <span className="mt-1 block truncate text-[10px] text-white/60 tabular-nums">
                  หน้า {gapA === null ? "—" : `${gapA.toFixed(1)} วิ`} · หลัง {gapB === null ? "—" : `${gapB.toFixed(1)} วิ`}
                  {s.damaged ? " · ⚠ เครื่องเสีย" : ""}
                </span>
              </span>
            </div>
            <div className="rounded-xl bg-[#121216]/90 p-2">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-white/75">
                <Wrench className="h-3.5 w-3.5" />
                {rc.pit ? "อยู่ในพิท…" : rc.pitWant ? `เข้าพิทรอบนี้ → ${COMPOUND_INFO[rc.pitWant].label} (แตะซ้ำ = ยกเลิก)` : r.mustPit && rc.pits === 0 ? "ยังไม่เข้าพิท · ต้องเข้า 1 ครั้ง" : "สั่งเข้าพิท"}
              </p>
              <div className="flex gap-1.5">
                {COMPOUNDS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!!rc.pit || rc.finish !== null}
                    aria-pressed={rc.pitWant === c}
                    onClick={() => callPit(s, rc.pitWant === c ? null : c)}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 text-xs font-bold disabled:opacity-40 sm:flex-none ${rc.pitWant === c ? "border-white bg-white/20" : "border-white/15"}`}
                  >
                    <TyreDot c={c} size={18} /> {COMPOUND_INFO[c].short}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {(s.cards.length > 0 || risk.engine > 0 || risk.spin > 0) && (
            <div className="mx-auto flex max-w-3xl flex-wrap gap-1">
              {s.cards.map((id, i) => (
                <span key={`${id}-${i}`} className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: RARITY_COLOR[cardOf(id).rarity] }}>
                  {cardOf(id).name}
                </span>
              ))}
              {risk.engine > 0 && <span className="rounded-full bg-(--color-f1)/25 px-2 py-0.5 text-[10px] font-bold text-(--color-f1-text)">⚠ เครื่องพัง {Math.round(risk.engine * 100)}%/รอบ</span>}
              {risk.spin > 0 && <span className="rounded-full bg-(--color-f1)/25 px-2 py-0.5 text-[10px] font-bold text-(--color-f1-text)">⚠ หมุน {Math.round(risk.spin * 100)}%/โค้ง</span>}
            </div>
          )}
          <p className="mx-auto max-w-3xl text-[9px] leading-tight text-white/45">
            {hasRealTrack(setup.circuit) ? `${TRACK_DATA_CREDIT} · ` : ""}ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
          </p>
        </div>
      )}
      <OsmCredit className="right-2 top-24 z-10" />

      {/* เลเวลอัป: เกมหยุดให้เลือกการ์ด */}
      {s?.offer && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="เลเวลอัป เลือกการ์ด">
          <div className="w-full max-w-3xl space-y-3">
            <p className="poster text-center text-3xl text-[#facc15]">LEVEL UP!</p>
            <p className="text-center text-sm text-white/75">เลือกอัปเกรด 1 ใบ — มีผลทันทีจนจบเรซนี้ {s.levelUps > 1 ? `(เหลืออีก ${s.levelUps - 1} ใบ)` : ""}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {s.offer.map((c, i) => (
                <button key={c.id} type="button" onClick={() => chooseCard(s, i)} className="flex flex-col gap-1 rounded-2xl border-2 bg-[#121216] p-4 text-left transition hover:-translate-y-1" style={{ borderColor: RARITY_COLOR[c.rarity] }}>
                  <span className="text-[10px] font-bold" style={{ color: RARITY_COLOR[c.rarity] }}>
                    {STAT_NAME[c.stat]}
                    {c.risk ? " · เสี่ยง" : ""}
                  </span>
                  <b className="text-base">{c.name}</b>
                  <span className="text-xs text-white/75">{c.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* หยุดชั่วคราว */}
      {menu && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-label="หยุดชั่วคราว">
          <div className="w-full max-w-xs space-y-2 rounded-2xl bg-[#121216] p-4">
            <p className="poster text-center text-xl">หยุดชั่วคราว</p>
            <button type="button" onClick={() => setMenu(false)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-(--color-f1) font-bold">
              <Play className="h-4 w-4" /> แข่งต่อ
            </button>
            <button
              type="button"
              onClick={() => {
                if (s && window.confirm("ออกจากเรซนี้? นับเป็นไม่จบการแข่ง")) onDone(s.race.cars.length, true, s.level);
              }}
              className="min-h-11 w-full rounded-full border border-white/20 text-sm text-white/80"
            >
              ออกจากเรซ (ไม่จบการแข่ง)
            </button>
          </div>
        </div>
      )}

      {/* จบเรซ */}
      {s?.over && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-label="ผลการแข่ง">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-[#121216] p-5 text-center">
            <p className="poster text-sm text-(--color-f1-text)">ผลการแข่ง</p>
            <p className="poster text-5xl tabular-nums">P{pos}</p>
            <p className={`poster text-xl ${ok ? "text-[#22c55e]" : "text-(--color-f1-text)"}`}>{ok ? "ทำได้ตามเป้า!" : `พลาดเป้า (ท็อป ${setup.target})`}</p>
            <p className="text-xs text-white/60">
              เลเวลที่ไปถึง {s.level} · การ์ด {s.cards.length} ใบ{rc && rc.penalty > 0 ? ` · โทษ +${rc.penalty} วิ` : ""}
            </p>
            <button type="button" onClick={() => onDone(pos, false, s.level)} className="min-h-12 w-full rounded-full bg-(--color-f1) font-bold">
              ไปต่อ
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** ช่องห่าง (วินาที) กับคันข้างหน้า (dir −1) / ข้างหลัง (dir 1) ในลำดับ */
function gapTo(s: Session, dir: -1 | 1): number | null {
  const r = s.race;
  const at = r.order.indexOf(s.hero);
  const o = r.cars[r.order[at + dir]];
  if (!o) return null;
  const me = heroCar(s);
  return Math.abs(o.car.s - me.car.s) / Math.max(15, dir < 0 ? me.car.v : o.car.v);
}
