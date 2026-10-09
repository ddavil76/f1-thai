"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Flag, LogOut, Route, Volume2, VolumeX } from "lucide-react";
import { Btn, Card, Head, Seg } from "@/components/pitwall/ui";
import { setSoundOn, soundOn } from "@/components/pitwall/sound";
import { deltaTo, ghostDistance, idealInput, lapDistance, newCar, perfOf, STEP, stepCar, type LapResult, type StepEvent } from "@/lib/pitwall/drive/car";
import { buildDriveTrack, DS, poseAt, sample, type DriveTrack } from "@/lib/pitwall/drive/line";
import { CIRCUITS, TEAMS, circuitName } from "@/lib/pitwall/teams";
import type { BodyModel, CameraMode, DriveScene, Gfx } from "./scene";

type Settings = { team: number; driver: number; circuit: string; line: boolean; autoBrake: boolean; camera: CameraMode; gfx: "auto" | Gfx };
type Best = { time: number; trace: number[] };

const SETTINGS_KEY = "pitwall-drive-settings";
/** ไฟล์โมเดลรถที่มีอยู่ใน public/pitwall/cars/ (ไม่มี .glb) — เพิ่มชื่อเมื่ออัปโหลดไฟล์ใหม่ ไม่ต้องยิงขอไฟล์ที่ไม่มี */
const MODELS_AVAILABLE: readonly string[] = [];
/** ไฟล์โมเดลรถของแต่ละทีม — ไม่มีไฟล์ทีมใช้ base.glb (ย้อมสีทีม) ไม่มีอีกใช้รถที่สร้างในโค้ด */
const MODEL_FILE: Record<string, string> = {
  papaya: "papaya",
  bull: "bullrun",
  silver: "silverstar",
  rosso: "rosso",
  green: "britishgreen",
  grove: "grove",
  stripe: "starstripe",
};
const bestKey = (circuit: string) => `pitwall-drive-best:${circuit}`;

function readJson<T>(key: string): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // เก็บไม่ได้ (โหมดส่วนตัว) ก็เล่นต่อได้ แค่ไม่จำ
  }
}

export const fmtTime = (s: number | null) => {
  if (s === null || !Number.isFinite(s)) return "–:––.–––";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
};
const fmtDelta = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
/** เกียร์จากความเร็ว (กม./ชม.) — แค่ให้ดูมีชีวิต ไม่มีผลกับการขับ */
const GEARS = [0, 85, 125, 160, 195, 230, 265, 300];
const gearOf = (kmh: number) => GEARS.filter((g) => kmh >= g).length;

/** โหมดนักขับ (ทดลอง): Time Trial ขับเองด้วยคันเร่ง/เบรก ตามเส้นช่วยสามสี */
export default function DriverMode({ onExit }: { onExit: () => void }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = typeof window === "undefined" ? null : readJson<Partial<Settings>>(SETTINGS_KEY);
    return { team: 0, driver: 0, circuit: "monza", line: true, autoBrake: false, camera: "tv", gfx: "auto", ...saved };
  });
  const [driving, setDriving] = useState(false);
  const set = (p: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...p };
      writeJson(SETTINGS_KEY, next);
      return next;
    });

  if (driving) return <DriveSession settings={settings} onExit={() => setDriving(false)} />;
  return <Setup settings={settings} set={set} onStart={() => setDriving(true)} onExit={onExit} />;
}

function Setup({ settings, set, onStart, onExit }: { settings: Settings; set: (p: Partial<Settings>) => void; onStart: () => void; onExit: () => void }) {
  const team = TEAMS[settings.team] ?? TEAMS[0];
  const best = useMemo(() => (typeof window === "undefined" ? null : readJson<Best>(bestKey(settings.circuit))), [settings.circuit]);
  const track = useMemo(() => buildDriveTrack(settings.circuit), [settings.circuit]);
  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onExit}>
        <LogOut className="inline h-4 w-4" /> กลับเมนู
      </Btn>
      <Card>
        <Head kicker="โหมดนักขับ · ทดลอง" title="Time Trial" sub="ขับเองหนึ่งคัน กดคันเร่งและเบรกตามเส้นช่วยบนถนน ยิ่งกดตรงจังหวะยิ่งเร็ว ทำเวลาให้ดีที่สุด" />
        <div className="grid gap-2 rounded-xl bg-[#08080A] p-3 text-xs text-white/75 sm:grid-cols-3">
          <p>
            <b className="text-[#4ade80]">เส้นเขียว</b> กดคันเร่ง
          </p>
          <p>
            <b className="text-[#facc15]">เส้นเหลือง</b> ปล่อยคันเร่ง ประคองผ่านโค้ง
          </p>
          <p>
            <b className="text-(--color-f1-text)">เส้นแดง</b> กดเบรก
          </p>
        </div>
        <p className="text-xs text-white/60">
          คอม: <b>↑</b> หรือ <b>W</b> = คันเร่ง · <b>↓</b> <b>S</b> หรือ <b>Space</b> = เบรก · <b>C</b> = สลับกล้อง · <b>Esc</b> = ออก · มือถือ: ปุ่มเบรกซ้าย คันเร่งขวา
        </p>
      </Card>

      <Card>
        <Head kicker="ทีม" title="เลือกทีมและนักขับ" sub="ทีมที่รถเร็วกว่าเร่งและเข้าโค้งได้ดีกว่าเล็กน้อย" />
        <div className="grid gap-2 sm:grid-cols-2">
          {TEAMS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={settings.team === i}
              onClick={() => set({ team: i, driver: 0 })}
              className={`flex items-center gap-3 rounded-xl border-2 p-2.5 text-left ${settings.team === i ? "border-white bg-white/10" : "border-white/10 hover:border-white/30"}`}
            >
              <span className="h-8 w-2 flex-none rounded-full" style={{ background: t.color }} />
              <b className="min-w-0 flex-1 truncate text-sm text-white">{t.name}</b>
              <span className="text-[11px] tracking-wider text-[#facc15]" aria-label={`ความเร็วรถ ${stars(t.pace)} จาก 4 ดาว`}>
                {"★".repeat(stars(t.pace))}
                <span className="text-white/25">{"★".repeat(4 - stars(t.pace))}</span>
              </span>
            </button>
          ))}
        </div>
        <Seg value={settings.driver} onChange={(v) => set({ driver: v })} options={team.drivers.map((d, i) => ({ v: i, label: `#${d.num} ${d.name}` }))} />
      </Card>

      <Card>
        <Head kicker="สนาม" title={circuitName(settings.circuit)} sub={track ? `${(track.length / 1000).toFixed(2)} กม. · เวลาเป้าหมาย (ขับตามเส้นเป๊ะ) ${fmtTime(track.refLap)}` : undefined} />
        <div className="flex flex-wrap gap-1.5">
          {CIRCUITS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={settings.circuit === c.id}
              onClick={() => set({ circuit: c.id })}
              className={`min-h-9 rounded-full border px-3 text-xs font-bold ${settings.circuit === c.id ? "border-white bg-white text-[#08080A]" : "border-white/15 text-white/75"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {best && <p className="text-xs text-white/60">รอบดีสุดของคุณที่สนามนี้ {fmtTime(best.time)}</p>}
      </Card>

      <Card>
        <Head kicker="ตัวช่วย" title="ตั้งค่าการขับ" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">เส้นช่วย</span>
            <Seg value={settings.line ? 1 : 0} onChange={(v) => set({ line: v === 1 })} options={[{ v: 1, label: "แสดง" }, { v: 0, label: "ซ่อน" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">เบรกอัตโนมัติ</span>
            <Seg value={settings.autoBrake ? 1 : 0} onChange={(v) => set({ autoBrake: v === 1 })} options={[{ v: 0, label: "ปิด" }, { v: 1, label: "เปิด" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">กล้อง</span>
            <Seg<CameraMode> value={settings.camera} onChange={(v) => set({ camera: v })} options={[{ v: "tv", label: "TV Pod" }, { v: "chase", label: "ตามหลัง" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">กราฟิก</span>
            <Seg<Settings["gfx"]>
              value={settings.gfx}
              onChange={(v) => set({ gfx: v })}
              options={[
                { v: "auto", label: "อัตโนมัติ" },
                { v: "high", label: "สูง" },
                { v: "low", label: "ต่ำ" },
              ]}
            />
          </label>
        </div>
        <p className="text-[11px] text-white/60">เบรกอัตโนมัติ: รถเบรกให้เองในเส้นแดง กดแค่คันเร่ง เหมาะกับมือใหม่ · กราฟิกต่ำ: ไม่มีเงา ต้นไม้น้อยลง ลื่นกว่าบนมือถือ</p>
      </Card>

      <Btn className="w-full" onClick={onStart} disabled={!track}>
        <Flag className="inline h-4 w-4" /> เริ่มขับ
      </Btn>
    </div>
  );
}

const stars = (pace: number) => Math.max(1, Math.min(4, 4 - Math.round(pace * 3)));

type Hud = {
  time: HTMLSpanElement | null;
  delta: HTMLSpanElement | null;
  speed: HTMLSpanElement | null;
  gear: HTMLSpanElement | null;
  thr: HTMLDivElement | null;
  brk: HTMLDivElement | null;
  hint: HTMLSpanElement | null;
  dot: SVGCircleElement | null;
  lap: HTMLSpanElement | null;
};

function DriveSession({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const team = TEAMS[settings.team] ?? TEAMS[0];
  const driver = team.drivers[settings.driver] ?? team.drivers[0];
  const track = useMemo(() => buildDriveTrack(settings.circuit), [settings.circuit]) as DriveTrack;
  const host = useRef<HTMLDivElement>(null);
  const input = useRef({ throttle: false, brake: false, touchT: false, touchB: false });
  const hud = useRef<Hud>({ time: null, delta: null, speed: null, gear: null, thr: null, brk: null, hint: null, dot: null, lap: null });
  const sceneRef = useRef<DriveScene | null>(null);
  const [camera, setCamera] = useState<CameraMode>(settings.camera);
  const [line, setLine] = useState(settings.line);
  const [best, setBest] = useState<Best | null>(() => readJson<Best>(bestKey(settings.circuit)));
  const bestRef = useRef<Best | null>(best);
  const [laps, setLaps] = useState<LapResult[]>([]);
  const [msg, setMsg] = useState<{ id: number; text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [sound, setSound] = useState(soundOn());
  const soundRef = useRef(sound);
  const [failed, setFailed] = useState(false);
  const [credit, setCredit] = useState(false);

  // แผนที่ย่อ (จุดละ ~40 ม.)
  const mini = useMemo(() => {
    const step = Math.max(1, Math.round(40 / DS));
    const pts: string[] = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i += step) {
      minX = Math.min(minX, track.x[i]);
      maxX = Math.max(maxX, track.x[i]);
      minZ = Math.min(minZ, track.z[i]);
      maxZ = Math.max(maxZ, track.z[i]);
      pts.push(`${track.x[i].toFixed(0)},${track.z[i].toFixed(0)}`);
    }
    const pad = 80;
    return { d: `M${pts.join(" L")} Z`, box: `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`, w: (maxX - minX) / 60 };
  }, [track]);

  useEffect(() => {
    sceneRef.current?.setCamera(camera);
  }, [camera]);
  useEffect(() => {
    sceneRef.current?.setLine(line);
  }, [line]);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // คีย์บอร์ด
  useEffect(() => {
    const keys = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") input.current.throttle = down;
      else if (k === "ArrowDown" || k === "s" || k === "S" || k === " ") input.current.brake = down;
      else if (down && (k === "c" || k === "C")) setCamera((m) => (m === "tv" ? "chase" : "tv"));
      else if (down && k === "Escape") onExit();
      else return;
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => keys(e, true);
    const up = (e: KeyboardEvent) => keys(e, false);
    // สลับแอป/แท็บ: ปล่อยปุ่มทั้งหมด กันรถเร่งค้าง
    const blur = () => Object.assign(input.current, { throttle: false, brake: false, touchT: false, touchB: false });
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [onExit]);

  // ฉาก 3D + ลูปจำลอง
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
        setFailed(true);
        return;
      }
      const THREE = await import("three");
      const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
      const { carFactory } = await import("@/lib/three-car");
      const { Sky } = await import("three/addons/objects/Sky.js");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const { createDriveScene, normaliseBody } = await import("./scene");
      // โมเดลรถจากไฟล์ (ถ้ามี): ของทีม → base (ย้อมสี) → รถที่สร้างในโค้ด
      let body: BodyModel | null = null;
      for (const [file, tint] of [[MODEL_FILE[team.id], false], ["base", true]] as const) {
        if (!file || !MODELS_AVAILABLE.includes(file)) continue;
        const url = `/pitwall/cars/${file}.glb`;
        try {
          const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
          const gltf = await new GLTFLoader().loadAsync(url);
          body = { scene: normaliseBody(THREE, gltf.scene), tint };
          setCredit(true);
          break;
        } catch {
          // ไฟล์เสีย/โหลดไม่ได้ ลองตัวถัดไป
        }
      }
      if (disposed) return;
      const auto = matchMedia("(pointer: coarse)").matches || el.clientWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4;
      const gfx: Gfx = settings.gfx === "auto" ? (auto ? "low" : "high") : settings.gfx;
      const factory = carFactory(THREE, mergeGeometries, 5.6);
      const scene = createDriveScene({ THREE, addons: { Sky, RoomEnvironment }, factory, body, el, track, colour: team.color, gfx });
      sceneRef.current = scene;
      scene.setCamera(camera);
      scene.setLine(line);
      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);

      // เสียงเครื่องยนต์เบา ๆ (สร้างหลังผู้เล่นกดเริ่มขับแล้ว เบราว์เซอร์จึงยอมให้เล่น)
      let audio: { ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null = null;
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start();
        audio = { ctx, osc, gain };
      } catch {
        audio = null;
      }

      const car = newCar(track);
      const perf = perfOf(team.pace);
      const events: StepEvent[] = [];
      let last = performance.now();
      let acc = 0;
      let hudAt = 0;
      let wasInvalid = false;
      let prevV = car.v;
      // นับถอยหลังสั้น ๆ ก่อนออกตัว
      let wait = 1.6;
      setMsg({ id: Date.now(), text: "พร้อม…", tone: "info" });

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (wait > 0) {
          wait -= dt;
          if (wait <= 0) setMsg({ id: Date.now(), text: "ไป!", tone: "good" });
        } else {
          acc += dt;
          const i = input.current;
          while (acc >= STEP) {
            acc -= STEP;
            const want = { throttle: i.throttle || i.touchT, brake: i.brake || i.touchB };
            if (settings.autoBrake) {
              const ideal = idealInput(track, car);
              want.brake = want.brake || ideal.brake;
              if (ideal.brake) want.throttle = false;
            }
            events.length = 0;
            stepCar(track, car, want, perf, events);
            for (const e of events) {
              if (e.kind === "off") setMsg({ id: now, text: "หลุดโค้ง! รอบนี้ไม่นับ", tone: "bad" });
              if (e.kind === "lap") {
                const r = e.result;
                setLaps((l) => [r, ...l].slice(0, 8));
                const prev = bestRef.current;
                if (r.valid && (!prev || r.time < prev.time)) {
                  const b = { time: r.time, trace: r.trace };
                  bestRef.current = b;
                  setBest(b);
                  writeJson(bestKey(settings.circuit), b);
                  setMsg({ id: now, text: `รอบดีสุดใหม่! ${fmtTime(r.time)}`, tone: "good" });
                } else {
                  setMsg({ id: now, text: `${r.valid ? "" : "ไม่นับ · "}${fmtTime(r.time)}`, tone: r.valid ? "info" : "bad" });
                }
              }
            }
          }
          if (car.invalid !== wasInvalid) {
            wasInvalid = car.invalid;
            setInvalid(car.invalid);
          }
        }

        const d = lapDistance(track, car);
        const lateral = sample(track, track.lineOffset, car.s) + car.slide;
        const b = bestRef.current;
        const ghost = b && car.lapStart !== null ? ghostDistance(b.trace, car.t - car.lapStart) + car.lap * track.length : null;
        const accel = dt > 0 ? (car.v - prevV) / dt : 0;
        prevV = car.v;
        scene.update({ s: car.s, lateral, ghost, speed: car.v, accel, dt });
        scene.render();

        const kmh = car.v * 3.6;
        if (audio) {
          const gear = gearOf(kmh);
          const lo = GEARS[gear - 1] ?? 0;
          const hi = GEARS[gear] ?? 340;
          const rpm = Math.min(1, Math.max(0, (kmh - lo) / Math.max(1, hi - lo)));
          audio.osc.frequency.setTargetAtTime(70 + rpm * 160 + gear * 6, audio.ctx.currentTime, 0.05);
          audio.gain.gain.setTargetAtTime(soundRef.current && wait <= 0 ? 0.035 : 0, audio.ctx.currentTime, 0.1);
        }

        // อัปเดตหน้าปัด ~20 ครั้ง/วิ
        if (now - hudAt > 50) {
          hudAt = now;
          const h = hud.current;
          const i = input.current;
          if (h.speed) h.speed.textContent = String(Math.round(kmh));
          if (h.gear) h.gear.textContent = String(gearOf(kmh));
          if (h.time) h.time.textContent = car.lapStart === null ? "รอบเปิด" : fmtTime(car.t - car.lapStart);
          if (h.lap) h.lap.textContent = car.lapStart === null ? "เข้าเส้นสตาร์ท" : `รอบ ${car.lap + 1}`;
          const delta = deltaTo(b?.trace ?? null, car, d);
          if (h.delta) {
            h.delta.textContent = delta === null ? "" : fmtDelta(delta);
            h.delta.style.color = delta === null ? "" : delta <= 0 ? "#4ade80" : "#ff3b2f";
          }
          if (h.thr) h.thr.style.opacity = i.throttle || i.touchT ? "1" : "0.18";
          if (h.brk) h.brk.style.opacity = i.brake || i.touchB ? "1" : "0.18";
          // บอกล่วงหน้าเมื่อโซนเบรกใกล้เข้ามา
          if (h.hint) {
            let dist: number | null = null;
            for (let k = 0; k <= 260; k += DS) {
              const z = track.zone[Math.floor(((((car.s + k) / DS) % track.n) + track.n) % track.n)];
              if (z === "brake") {
                dist = k;
                break;
              }
            }
            // ช้าพอแล้ว (ไม่เร็วกว่าความเร็วอ้างอิงตรงนั้น) ไม่ต้องเตือน
            const fast = dist !== null && car.v > sample(track, track.vref, car.s + dist) + 2;
            h.hint.textContent = !fast || dist === null ? "" : dist < 8 ? "เบรก!" : `เบรกใน ${Math.round(dist)} ม.`;
          }
          if (h.dot) {
            const p = poseAt(track, car.s);
            h.dot.setAttribute("cx", p.x.toFixed(0));
            h.dot.setAttribute("cy", p.z.toFixed(0));
          }
        }
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        scene.dispose();
        factory.dispose();
        sceneRef.current = null;
        audio?.ctx.close().catch(() => {});
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
    // ตั้งฉากครั้งเดียวต่อเซสชัน — กล้อง/เส้นช่วยเปลี่ยนผ่าน sceneRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const pad = "flex select-none items-center justify-center rounded-2xl border-2 text-sm font-black tracking-wide touch-none";

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#08080A] text-white">
      <div ref={host} className="absolute inset-0" />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">เครื่องนี้ไม่รองรับกราฟิก 3D (WebGL)</p>}

      {/* แถบบน */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 sm:p-3">
        <button type="button" onClick={onExit} aria-label="ออก" className="pointer-events-auto rounded-full bg-black/55 p-2.5 backdrop-blur">
          <LogOut className="h-5 w-5" />
        </button>
        <div className="hidden rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur sm:block">
          <p className="poster text-[11px] text-(--color-f1-text)">{circuitName(settings.circuit)}</p>
          <p className="text-[11px] text-white/75">
            #{driver.num} {driver.name} · <span ref={(n) => void (hud.current.lap = n)} />
          </p>
        </div>
        <div className="mx-auto rounded-xl bg-black/55 px-4 py-1.5 text-center backdrop-blur">
          <span ref={(n) => void (hud.current.time = n)} className="poster block whitespace-nowrap text-xl tabular-nums sm:text-3xl" />
          <span className="flex items-center justify-center gap-2 text-xs tabular-nums">
            <span ref={(n) => void (hud.current.delta = n)} className="font-bold" />
            {invalid && <span className="rounded bg-(--color-f1) px-1.5 font-bold">ไม่นับ</span>}
          </span>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setLine((v) => !v)} aria-pressed={line} aria-label="แสดงเส้นช่วย" className={`rounded-full p-2.5 backdrop-blur ${line ? "bg-white text-[#08080A]" : "bg-black/55"}`}>
              <Route className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setCamera((m) => (m === "tv" ? "chase" : "tv"))} aria-label={`กล้อง ${camera === "tv" ? "TV Pod" : "ตามหลัง"} แตะเพื่อสลับ`} className="rounded-full bg-black/55 p-2.5 backdrop-blur">
              <Camera className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSoundOn(!sound);
                setSound(!sound);
              }}
              aria-pressed={sound}
              aria-label={sound ? "ปิดเสียง" : "เปิดเสียง"}
              className="rounded-full bg-black/55 p-2.5 backdrop-blur"
            >
              {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          </div>
          <div className="hidden rounded-xl bg-black/55 px-3 py-1.5 text-right text-[11px] tabular-nums text-white/80 backdrop-blur sm:block">
            <p>
              ดีสุด <b className="text-white">{fmtTime(best?.time ?? null)}</b>
            </p>
            <p>เป้าหมาย {fmtTime(track.refLap)}</p>
            {credit && <p className="text-[10px] text-white/50">โมเดลรถ: Meshy (CC BY 4.0)</p>}
            {laps.slice(0, 4).map((l) => (
              <p key={l.lap} className={l.valid ? "" : "text-(--color-f1-text) line-through"}>
                รอบ {l.lap} {fmtTime(l.time)}
              </p>
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <p key={msg.id} className={`radio-toast pointer-events-none absolute inset-x-0 top-24 mx-auto w-fit rounded-xl px-4 py-2 text-center text-base font-bold sm:top-28 sm:text-lg ${msg.tone === "good" ? "bg-[#16a34a]/90" : msg.tone === "bad" ? "bg-(--color-f1)/90" : "bg-black/70"}`}>
          {msg.text}
        </p>
      )}

      {/* แผนที่ย่อ */}
      <svg viewBox={mini.box} className="pointer-events-none absolute right-3 top-16 h-20 w-20 rounded-xl bg-black/45 p-1 sm:top-auto sm:bottom-3 sm:h-32 sm:w-32" aria-hidden>
        <path d={mini.d} fill="none" stroke="white" strokeOpacity={0.7} strokeWidth={mini.w} />
        <circle ref={(n) => void (hud.current.dot = n)} r={mini.w * 2.2} fill={team.color} stroke="white" strokeWidth={mini.w * 0.6} />
      </svg>

      {/* หน้าปัด: ความเร็ว เกียร์ ปุ่มที่กดอยู่ และเตือนเบรก */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1">
        <span ref={(n) => void (hud.current.hint = n)} className="poster text-lg text-(--color-f1-text) drop-shadow" />
        <div className="flex items-end gap-3 rounded-2xl bg-black/55 px-4 py-2 backdrop-blur">
          <div ref={(n) => void (hud.current.brk = n)} className="h-10 w-2.5 rounded-full bg-(--color-f1)" aria-hidden />
          <div className="text-center">
            <span ref={(n) => void (hud.current.speed = n)} className="poster block text-3xl leading-none tabular-nums" />
            <span className="text-[10px] text-white/60">กม./ชม.</span>
          </div>
          <div className="text-center">
            <span ref={(n) => void (hud.current.gear = n)} className="poster block text-3xl leading-none text-[#facc15]" />
            <span className="text-[10px] text-white/60">เกียร์</span>
          </div>
          <div ref={(n) => void (hud.current.thr = n)} className="h-10 w-2.5 rounded-full bg-[#22c55e]" aria-hidden />
        </div>
      </div>

      {/* ปุ่มสัมผัส: ซ้ายเบรก ขวาคันเร่ง (คอมก็คลิกค้างได้) */}
      <button
        type="button"
        aria-label="เบรก (กดค้าง)"
        onPointerDown={() => {
          input.current.touchB = true;
        }}
        onPointerUp={() => {
          input.current.touchB = false;
        }}
        onPointerCancel={() => {
          input.current.touchB = false;
        }}
        onPointerLeave={() => {
          input.current.touchB = false;
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`${pad} absolute bottom-3 left-3 h-24 w-28 border-(--color-f1) bg-(--color-f1)/25 active:bg-(--color-f1)/60 sm:h-20 sm:w-24`}
      >
        เบรก
      </button>
      <button
        type="button"
        aria-label="คันเร่ง (กดค้าง)"
        onPointerDown={() => {
          input.current.touchT = true;
        }}
        onPointerUp={() => {
          input.current.touchT = false;
        }}
        onPointerCancel={() => {
          input.current.touchT = false;
        }}
        onPointerLeave={() => {
          input.current.touchT = false;
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`${pad} absolute bottom-3 right-3 h-24 w-28 border-[#22c55e] bg-[#22c55e]/25 active:bg-[#22c55e]/60 sm:bottom-40 sm:h-20 sm:w-24`}
      >
        คันเร่ง
      </button>
    </div>,
    document.body,
  );
}
