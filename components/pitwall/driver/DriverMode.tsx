"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Copy, Flag, LogIn, LogOut, Pause, Play, RotateCcw, Route, Users, Volume2, VolumeX } from "lucide-react";
import { Btn, Card, Head, Seg } from "@/components/pitwall/ui";
import { setSoundOn, soundOn } from "@/components/pitwall/sound";
import { createRoom, onlineReady } from "@/components/pitwall/session";
import { useDriveLink, type DriveLink } from "./driveSession";
import { deltaTo, DIRTY_GRIP, ghostDistance, idealInput, lapDistance, newCar, perfOf, STEP, stepCar, type LapResult, type StepEvent } from "@/lib/pitwall/drive/car";
import { buildDriveTrack, DS, laneValue, poseAt, sample as sampleAt, type DriveTrack } from "@/lib/pitwall/drive/line";
import { advanceRemote, createRace, gapAhead, OFF_PENALTY, packState, setRemote, sideBySide, STEP as RACE_STEP, stepRace, stopError, TRACK_LIMITS, type Difficulty, type Entrant, type Race, type RaceCar, type RaceEvent } from "@/lib/pitwall/drive/race";
import { PIT_IN, PIT_MISS_PENALTY, STOP_MISS, STOP_WINDOW } from "@/lib/pitwall/drive/pit";
import { COMPOUND_INFO, COMPOUNDS, suggestCompound, tyreGrip, type Compound } from "@/lib/pitwall/drive/tyres";
import type { DriveSnap } from "@/lib/pitwall/drive/room";
import { cornerMap, learnCorner, type Mastery } from "@/lib/pitwall/drive/guide";
import { hasRealTrack, loadRawTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import { CIRCUITS, TEAMS, circuitName } from "@/lib/pitwall/teams";
import type { BodyModel, CameraMode, DriveScene, Gfx, GuideMode } from "./scene";
import { buzz, createSfx } from "./sfx";
import { frameAt, Recorder, type RFrame } from "./replay";

type Settings = {
  team: number;
  driver: number;
  circuit: string;
  line: boolean;
  /** แบบเส้นช่วย: ไดนามิก (สีตามความเร็วตอนนี้) · เฉพาะโค้ง · คงที่ (สามสีตายตัว) */
  guide: GuideMode;
  /** โหมดฝึก: เส้นช่วยค่อย ๆ จางในโค้งที่ผ่านได้ดีติดกัน (หลุดโค้ง = กลับมาเต็ม) */
  train: boolean;
  /** สั่นมือถือตอนขึ้น kerb / หลุดโค้ง / ชนท้าย */
  haptics: boolean;
  autoBrake: boolean;
  camera: CameraMode;
  gfx: "auto" | Gfx;
  /** Straight Mode: auto = เปิดเองทุกครั้งที่อยู่ในโซน · manual = กดเอง (E / Shift / ปุ่มบนจอ) */
  sm: "auto" | "manual";
  /** tt = Time Trial · race = แข่งกับ AI · online = แข่งกับเพื่อน */
  mode: "tt" | "race" | "online";
  raceLaps: number;
  /** จำนวนรถในสนามทั้งหมด (รวมผู้เล่น) */
  field: number;
  difficulty: Difficulty;
  /** ตำแหน่งออกตัวของผู้เล่น: ท้ายกริด / กลางกริด / ตามความเร็วรถ */
  grid: "back" | "mid" | "pace";
  /** ยางออกตัว (แข่ง/ออนไลน์) */
  startTyre: Compound;
};

/** รถในสนามแข่ง: ผู้เล่น + นักขับคนอื่นจากทุกทีม (เรียงตามกริด) */
function buildField(settings: Settings): Entrant[] {
  const all: Entrant[] = TEAMS.flatMap((t, ti) =>
    t.drivers.map((d, k) => ({
      id: `${t.id}-${k}`,
      name: d.name,
      team: t.id,
      num: d.num,
      colour: t.color,
      ink: t.ink,
      pace: t.pace,
      skill: d.skill,
      player: ti === settings.team && k === settings.driver,
    })),
  );
  const me = all.find((e) => e.player) ?? { ...all[0], player: true };
  // คู่แข่ง: สลับทีมกันไป ให้มีทั้งรถเร็ว/ช้า
  const others = all.filter((e) => e !== me);
  const picked = [...others.filter((_, i) => i % 2 === 0), ...others.filter((_, i) => i % 2 === 1)].slice(0, Math.max(1, settings.field - 1));
  const byPace = (a: Entrant, b: Entrant) => a.pace + a.skill * 0.5 - (b.pace + b.skill * 0.5);
  picked.sort(byPace);
  if (settings.grid === "pace") return [...picked, me].sort(byPace);
  if (settings.grid === "mid") {
    const at = Math.floor(picked.length / 2);
    return [...picked.slice(0, at), me, ...picked.slice(at)];
  }
  return [...picked, me];
}
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
// v2: ผังสนามจริง + เนิน — เวลาเก่า (ผังคร่าว ๆ) เทียบกันไม่ได้
const bestKey = (circuit: string) => `pitwall-drive-best2:${circuit}`;
const masteryKey = (circuit: string) => `pitwall-drive-mastery:${circuit}`;

/** สนามที่สร้างแล้ว (สร้างครั้งเดียวต่อสนาม) */
const trackCache = new Map<string, DriveTrack | null>();
/** โหลดผังสนามจริง (ถ้ามี) แล้วสร้างสนาม · ระหว่างโหลดได้ undefined */
function useDriveTrack(circuit: string): DriveTrack | null | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (trackCache.has(circuit)) return;
    let alive = true;
    (async () => {
      const raw = hasRealTrack(circuit) ? await loadRawTrack(circuit).catch(() => null) : null;
      trackCache.set(circuit, buildDriveTrack(circuit, raw));
      if (alive) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [circuit]);
  return trackCache.has(circuit) ? trackCache.get(circuit) : undefined;
}

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
export default function DriverMode({ name, onExit }: { name: string; onExit: () => void }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = typeof window === "undefined" ? null : readJson<Partial<Settings>>(SETTINGS_KEY);
    return { team: 0, driver: 0, circuit: "monza", line: true, guide: "dynamic", train: false, haptics: true, autoBrake: false, camera: "tv", gfx: "auto", sm: "auto", mode: "tt", raceLaps: 5, field: 10, difficulty: "normal", grid: "back", startTyre: "medium", ...saved };
  });
  const [driving, setDriving] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const set = (p: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...p };
      writeJson(SETTINGS_KEY, next);
      return next;
    });

  const track = useDriveTrack(settings.circuit);
  const online = settings.mode === "online" && onlineReady();

  if (online && room) return <OnlineDrive code={room} name={name} settings={settings} set={set} onLeave={() => setRoom(null)} />;
  if (driving && track && !online) return <DriveSession settings={settings} track={track} onExit={() => setDriving(false)} />;
  return <Setup settings={settings} track={track} set={set} online={online} onRoom={setRoom} onStart={() => setDriving(true)} onExit={onExit} />;
}

function Setup({
  settings,
  track,
  set,
  online,
  onRoom,
  onStart,
  onExit,
}: {
  settings: Settings;
  track: DriveTrack | null | undefined;
  set: (p: Partial<Settings>) => void;
  online: boolean;
  onRoom: (code: string) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  const team = TEAMS[settings.team] ?? TEAMS[0];
  const best = useMemo(() => (typeof window === "undefined" ? null : readJson<Best>(bestKey(settings.circuit))), [settings.circuit]);
  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onExit}>
        <LogOut className="inline h-4 w-4" /> กลับเมนู
      </Btn>
      <Card>
        <Head
          kicker="โหมดนักขับ · ทดลอง"
          title={online ? "แข่งกับเพื่อน" : settings.mode === "race" ? "แข่งกับ AI" : "Time Trial"}
          sub={
            online
              ? "สร้างห้องแล้วส่งรหัสให้เพื่อน (สูงสุด 8 คน) ทุกคนเลือกรถ หัวห้องเลือกสนามและจำนวนรอบ แล้วออกตัวพร้อมกัน"
              : settings.mode === "race"
                ? "ออกตัวจากกริดพร้อมคู่แข่ง AI ตามติดคันหน้าแล้วกด “แซง” ใช้ OT เร่งผ่าน"
                : "ขับคนเดียว ทำเวลาต่อรอบให้ดีที่สุด"
          }
        />
        <Seg<Settings["mode"]>
          value={settings.mode === "online" && !online ? "race" : settings.mode}
          onChange={(v) => set({ mode: v })}
          options={[{ v: "tt", label: "Time Trial" }, { v: "race", label: "แข่งกับ AI" }, ...(onlineReady() ? [{ v: "online" as const, label: "แข่งกับเพื่อน" }] : [])]}
        />
        <p className="text-xs text-white/70">
          {online ? "แข่งออนไลน์" : `${circuitName(settings.circuit)} · #${(team.drivers[settings.driver] ?? team.drivers[0]).num} ${team.name}`}
          {settings.mode === "race" && !online && ` · ${settings.raceLaps} รอบ · ${settings.field} คัน · AI ${({ easy: "ง่าย", normal: "ปกติ", hard: "ยาก" } as const)[settings.difficulty]}`}
        </p>
        {!online && (
          <Btn className="w-full" onClick={onStart} disabled={!track}>
            <Flag className="inline h-4 w-4" /> {track === undefined ? "กำลังโหลดสนาม…" : settings.mode === "race" ? "แข่งเลย" : "ขับเลย"}
          </Btn>
        )}
        <details className="group rounded-xl bg-[#08080A] p-3 text-xs text-white/75">
          <summary className="cursor-pointer select-none font-bold text-white">วิธีเล่น · ปุ่ม · ความหมายของสีเส้นช่วย</summary>
          <div className="mt-3 space-y-3">
        {settings.guide === "static" ? (
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
        ) : (
          <div className="space-y-2 rounded-xl bg-[#08080A] p-3 text-xs text-white/75">
            <div className="h-2 rounded-full bg-gradient-to-r from-[#22c55e] via-[#facc15] to-[#ef4444]" aria-hidden />
            <div className="grid gap-2 sm:grid-cols-3">
              <p>
                <b className="text-[#4ade80]">เขียว</b> ต่ำกว่าความเร็วที่โค้งรับได้ เร่งได้
              </p>
              <p>
                <b className="text-[#facc15]">เหลือง → ส้ม</b> ใกล้/เกินเล็กน้อย ยกคันเร่ง เตรียมเบรก
              </p>
              <p>
                <b className="text-(--color-f1-text)">แดง</b> เกินมาก ไม่เบรกหลุดโค้งแน่
              </p>
            </div>
            <p className="text-[11px] text-white/60">
              ลูกศรบนถนนเปลี่ยนสีตามความเร็วที่คุณจะมีตอนไปถึงจุดนั้น (กำลังเร่ง = แดงเร็วขึ้น · กำลังเบรก = เขียวเมื่อความเร็วลดลงพอแล้วจริง ๆ ปล่อยเบรกได้) · ตามติดคันหน้าในโค้ง (อากาศเสีย) สีจะแดงเร็วขึ้น · โหมดฝึก: ผ่านโค้งไหนได้ไม่หลุด 3 ครั้ง เส้นของโค้งนั้นจะจางเกือบหาย (หลุดเมื่อไหร่กลับมาเต็ม)
            </p>
          </div>
        )}
        <p className="text-xs text-white/60">
          คอม: <b>↑</b> หรือ <b>W</b> = คันเร่ง · <b>↓</b> <b>S</b> หรือ <b>Space</b> = เบรก · <b>E</b> หรือ <b>Shift</b> = Straight Mode · <b>C</b> = สลับกล้อง · <b>Esc</b> = หยุดชั่วคราว · มือถือ: ปุ่มเบรกซ้าย คันเร่งขวา
          {settings.mode !== "tt" && (
            <>
              {" "}
              · แข่ง: <b>D</b> = แซง (เมื่อปุ่มแซงพร้อม) · <b>Q</b> (กดค้าง) = OT ใช้แบต · <b>P</b> = ขอ/ยกเลิกเข้าพิท · <b>1</b>/<b>2</b>/<b>3</b> = เลือกยาง S/M/H · ในพิท <b>Enter</b> หรือ <b>Space</b> = จอด / ไป · มือถือ: ปุ่ม “แซง” “OT” และ “PIT”
            </>
          )}
        </p>
            {settings.mode !== "tt" && (
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-white/65">
            <li>
              <b className="text-white">ตามติด:</b> ตามทันคันหน้าบนทางตรง ความเร็วถูกจำกัดให้ค้างห่างราว 0.1 วินาที · เข้าโค้งต้องเบรกเอง ไม่เบรก = ชนท้าย เสียความเร็วมาก
            </li>
            <li>
              <b className="text-white">แซง:</b> ปุ่ม “แซง” พร้อมเมื่อห่างคันหน้าไม่เกิน ~0.28 วิ (ตั้งแต่ระยะนั้นจนติดคันหน้า) เหลือทางตรงพอ และฝั่งข้างว่าง/ถนนกว้างพอ (ใกล้โค้งปุ่มเป็นสีเทา) · กดแล้วรถขึ้นไปเคียงเอง แล้วกลับ racing line เมื่อพ้น · ถึงจุดเบรกแล้วยังขึ้นไม่ถึงครึ่งคัน รถถอยกลับไปต่อท้าย
            </li>
            <li>
              <b className="text-white">ลมดูด / แบต (OT):</b> ออกจากท้ายคันหน้าได้ลมดูดพาไปครู่หนึ่ง · กด OT ค้างใช้แบตเร่ง (แรงเร่งเพิ่ม · ความเร็วสูงสุด +5% · หมดใน ~4.5 วิ) · เบรกชาร์จเร็ว (แถบเขียว) · ยกคันเร่งชาร์จช้า · ตามหลังไม่เกิน 1 วิตอนผ่านต้นโซนทางตรงได้พลังงานเพิ่ม
            </li>
            <li>
              <b className="text-white">หลุดโค้ง:</b> เข้าโค้งเร็วเกิน รถลงหญ้า ความเร็วหายเกือบครึ่ง · เตือน 3 ครั้ง ครั้งต่อไปโดน +5 วินาทีทุกครั้ง
            </li>
            <li>
              <b className="text-white">ยาง:</b> Soft (แดง) เกาะดีสุดแต่หมดเร็ว · Medium (เหลือง) กลาง ๆ · Hard (ขาว) ทนสุด · สึกตามระยะ และสึกเร็วขึ้นเมื่อไถล/หลุดโค้ง · ใกล้หมดเกาะถนนลดลงเร็ว (เส้นช่วยแดงเร็วขึ้นตาม) · ยางใหม่จากพิทยังเย็นช่วงครึ่งรอบแรก
            </li>
            <li>
              <b className="text-white">เข้าพิท (ต้องเข้าอย่างน้อย 1 ครั้ง ไม่งั้นโทษ +{PIT_MISS_PENALTY} วิ):</b> กด PIT แล้วเลือกยาง → ถึงทางเข้าพิท (ก่อนเส้นชัย) รถวิ่งเองที่ 80 กม./ชม. → กด “จอด!” ให้รถหยุดตรงกรอบอู่ทีม (แถบเลื่อนเข้าช่องเขียว — อู่แต่ละทีมอยู่คนละตำแหน่ง จังหวะจึงต่างกัน) จอดตรง = เปลี่ยนยาง ~2.3 วิ · ก่อน/เลยกรอบ = ช้าลง · ไฟเขียวแล้วกด “ไป!” (กดก่อนไฟเขียว เสียเวลาเพิ่ม)
            </li>
            <li>
              <b className="text-white">AI:</b> ใช้กติกาเดียวกัน — แซงบนทางตรงยาว เก็บแบตไว้ใช้ตอนแซง ป้องกันได้ครั้งเดียวต่อทางตรง · วางแผนเข้าพิทตามยาง
            </li>
              </ul>
            )}
          </div>
        </details>
      </Card>

      {online && <JoinCard onRoom={onRoom} />}
      {online && (
        <Card>
          <TyrePick value={settings.startTyre} onChange={(v) => set({ startTyre: v })} />
        </Card>
      )}

      {settings.mode === "race" && !online && (
        <Card>
          <Head kicker="การแข่ง" title="ตั้งค่าการแข่ง" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold text-white/70">จำนวนรอบ</span>
              <Seg value={settings.raceLaps} onChange={(v) => set({ raceLaps: v })} options={[3, 5, 10].map((v) => ({ v, label: `${v} รอบ` }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-white/70">รถในสนาม</span>
              <Seg value={settings.field} onChange={(v) => set({ field: v })} options={[6, 10, 14].map((v) => ({ v, label: `${v} คัน` }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-white/70">ฝีมือ AI</span>
              <Seg<Difficulty>
                value={settings.difficulty}
                onChange={(v) => set({ difficulty: v })}
                options={[
                  { v: "easy", label: "ง่าย" },
                  { v: "normal", label: "ปกติ" },
                  { v: "hard", label: "ยาก" },
                ]}
              />
            </label>
            <TyrePick value={settings.startTyre} onChange={(v) => set({ startTyre: v })} />
            <label className="space-y-1">
              <span className="text-xs font-bold text-white/70">ออกตัว</span>
              <Seg<Settings["grid"]>
                value={settings.grid}
                onChange={(v) => set({ grid: v })}
                options={[
                  { v: "back", label: "ท้ายกริด" },
                  { v: "mid", label: "กลางกริด" },
                  { v: "pace", label: "ตามความเร็ว" },
                ]}
              />
            </label>
          </div>
        </Card>
      )}

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

      {!online && (
      <Card>
        <Head kicker="สนาม" title={circuitName(settings.circuit)} sub={track ? `${(track.length / 1000).toFixed(2)} กม. · เวลาเป้าหมาย (ขับตามเส้นเป๊ะ) ${fmtTime(track.refLap)}` : track === undefined ? "กำลังโหลดผังสนาม…" : undefined} />
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
        <p className="text-[11px] text-white/55">
          {hasRealTrack(settings.circuit)
            ? `ผังสนามและความกว้างถนนตามจริง · ความสูงเนินเป็นค่าประมาณ — ${TRACK_DATA_CREDIT}`
            : "ผังสนามแบบคร่าว ๆ (© OpenStreetMap contributors) · ความสูงเนินเป็นค่าประมาณ"}
        </p>
      </Card>
      )}

      <details className="card group p-4">
        <summary className="cursor-pointer select-none list-none">
          <p className="poster text-xs text-(--color-f1-text)">ตัวช่วย</p>
          <p className="poster flex items-center justify-between text-2xl text-white">
            ตั้งค่าการขับ <span className="text-sm text-white/60 group-open:hidden">แตะเพื่อเปิด ▾</span>
          </p>
          <p className="text-xs text-white/60">เส้นช่วย · เบรกอัตโนมัติ · โหมดฝึก · สั่น · Straight Mode · กล้อง · กราฟิก</p>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">เส้นช่วย</span>
            <Seg<GuideMode | "off">
              value={settings.line ? settings.guide : "off"}
              onChange={(v) => set(v === "off" ? { line: false } : { line: true, guide: v })}
              options={[
                { v: "dynamic", label: "ไดนามิก" },
                { v: "corners", label: "เฉพาะโค้ง" },
                { v: "static", label: "คงที่" },
                { v: "off", label: "ซ่อน" },
              ]}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">เบรกอัตโนมัติ</span>
            <Seg value={settings.autoBrake ? 1 : 0} onChange={(v) => set({ autoBrake: v === 1 })} options={[{ v: 0, label: "ปิด" }, { v: 1, label: "เปิด" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">โหมดฝึก (เส้นจางเมื่อจำโค้งได้)</span>
            <Seg value={settings.train ? 1 : 0} onChange={(v) => set({ train: v === 1 })} options={[{ v: 0, label: "ปิด" }, { v: 1, label: "เปิด" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">สั่น (มือถือ: kerb · หลุดโค้ง · ชนท้าย)</span>
            <Seg value={settings.haptics ? 1 : 0} onChange={(v) => set({ haptics: v === 1 })} options={[{ v: 1, label: "เปิด" }, { v: 0, label: "ปิด" }]} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-white/70">Straight Mode (พับปีกบนทางตรง)</span>
            <Seg<Settings["sm"]> value={settings.sm} onChange={(v) => set({ sm: v })} options={[{ v: "auto", label: "อัตโนมัติ" }, { v: "manual", label: "กดเอง" }]} />
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
        <p className="text-[11px] text-white/60">Straight Mode: บนทางตรงที่กำหนด ปีกหน้า/หลังพับราบ แรงต้านน้อยลง วิ่งได้เร็วขึ้น — ปิดเองเมื่อเบรกหรือพ้นทางตรง (แบบกฎรถปี 2026) · เบรกอัตโนมัติ: รถเบรกให้เองเมื่อถึงจุดเบรก กดแค่คันเร่ง เหมาะกับมือใหม่ · กราฟิกต่ำ: ไม่มีเงา ต้นไม้น้อยลง ลื่นกว่าบนมือถือ</p>
      </details>

      {!online && (
        <Btn className="w-full" onClick={onStart} disabled={!track}>
          <Flag className="inline h-4 w-4" /> {settings.mode === "race" ? "เข้ากริดสตาร์ท" : "เริ่มขับ"}
        </Btn>
      )}
    </div>
  );
}

/** แข่งกับเพื่อน: สร้างห้องใหม่ หรือใส่รหัสห้องของเพื่อน */
function JoinCard({ onRoom }: { onRoom: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <Head kicker="ออนไลน์" title="ห้องแข่ง" sub="แต่ละเครื่องขับรถของตัวเอง แล้วเห็นรถเพื่อนวิ่งในสนามเดียวกัน · มีกันชนท้าย ตามติดแล้วกดปุ่มแซงเหมือนแข่งกับ AI" />
      <Btn
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            onRoom(await createRoom("drive"));
          } catch (e) {
            setErr(e instanceof Error ? e.message : "สร้างห้องไม่สำเร็จ");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Users className="inline h-4 w-4" /> {busy ? "กำลังสร้างห้อง…" : "สร้างห้องใหม่"}
      </Btn>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4) onRoom(code.trim().toUpperCase());
        }}
      >
        <label htmlFor="drive-code" className="sr-only">
          รหัสห้อง
        </label>
        <input
          id="drive-code"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="รหัสห้อง เช่น AB3K"
          className="poster min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#08080A] px-3 tracking-[0.3em] text-white"
        />
        <Btn type="submit" tone="white" disabled={code.trim().length < 4}>
          <LogIn className="inline h-4 w-4" /> เข้าห้อง
        </Btn>
      </form>
      {err && <p className="text-xs text-(--color-f1-text)">{err}</p>}
    </Card>
  );
}

const entrantsOf = (snap: DriveSnap, me: string): Entrant[] =>
  snap.grid.flatMap((id) => {
    const p = snap.players.find((x) => x.id === id);
    if (!p) return [];
    const t = TEAMS[p.team] ?? TEAMS[0];
    const d = t.drivers[p.driver] ?? t.drivers[0];
    return [{ id, name: p.name, team: t.id, num: d.num, colour: t.color, ink: t.ink, pace: t.pace, skill: 0, player: id === me, remote: id !== me }];
  });

/** ห้องแข่งออนไลน์: ล็อบบี้ (เลือกรถ/สนาม) → แข่ง → ผล */
function OnlineDrive({ code, name, settings, set, onLeave }: { code: string; name: string; settings: Settings; set: (p: Partial<Settings>) => void; onLeave: () => void }) {
  const link = useDriveLink(code, name);
  const { snap, me, send } = link;
  const mine = snap?.players.find((p) => p.id === me) ?? null;
  const track = useDriveTrack(snap?.config.circuit ?? "monza");
  // เข้าห้องแล้ว: ขอรถที่เลือกไว้ (ถ้ายังว่าง)
  const asked = useRef(false);
  useEffect(() => {
    if (!mine || asked.current) return;
    asked.current = true;
    if (mine.team !== settings.team || mine.driver !== settings.driver) send({ t: "pick", team: settings.team, driver: settings.driver });
  }, [mine, send, settings.team, settings.driver]);

  if (snap && snap.phase !== "lobby" && snap.grid.includes(me) && track && mine)
    return <OnlineRace key={snap.startAt} link={link} snap={snap} track={track} settings={settings} onLeave={onLeave} />;

  const host = !!mine?.host;
  const taken = (ti: number, d: number) => snap?.players.some((p) => p.id !== me && p.team === ti && p.driver === d) ?? false;
  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onLeave}>
        <LogOut className="inline h-4 w-4" /> ออกจากห้อง
      </Btn>
      <Card>
        <Head kicker="ห้องแข่ง · แข่งกับเพื่อน" title={`รหัส ${code}`} sub={link.status === "open" ? "ส่งรหัสนี้ให้เพื่อน แล้วให้เพื่อนเลือก “แข่งกับเพื่อน” → ใส่รหัส" : link.status === "connecting" ? "กำลังเชื่อมต่อ…" : "หลุดการเชื่อมต่อ กำลังต่อใหม่…"} />
        <Btn
          tone="white"
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
          }}
        >
          <Copy className="inline h-4 w-4" /> คัดลอกรหัส
        </Btn>
        {link.error && (
          <p className="text-xs text-(--color-f1-text)" role="alert">
            {link.error}
          </p>
        )}
        {snap && snap.phase !== "lobby" && !snap.grid.includes(me) && <p className="text-sm text-[#facc15]">การแข่งกำลังดำเนินอยู่ รอรอบหน้า</p>}
        <ul className="space-y-1 text-sm">
          {snap?.players.map((p) => {
            const t = TEAMS[p.team] ?? TEAMS[0];
            const d = t.drivers[p.driver] ?? t.drivers[0];
            return (
              <li key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.id === me ? "bg-white/10" : ""} ${p.online ? "" : "opacity-50"}`}>
                <span className="h-5 w-1.5 rounded-full" style={{ background: t.color }} />
                <b className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.id === me && " (คุณ)"}
                </b>
                <span className="text-xs text-white/70">
                  #{d.num} · {t.name}
                </span>
                {p.host && <span className="rounded bg-(--color-f1) px-1.5 text-[10px] font-bold">หัวห้อง</span>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <Head kicker="รถของคุณ" title="เลือกทีมและนักขับ" sub="รถหนึ่งคันมีคนขับได้คนเดียว" />
        <div className="grid gap-2 sm:grid-cols-2">
          {TEAMS.map((t, ti) =>
            t.drivers.map((d, di) => {
              const on = mine?.team === ti && mine?.driver === di;
              const busy = taken(ti, di);
              return (
                <button
                  key={`${t.id}-${di}`}
                  type="button"
                  aria-pressed={on}
                  disabled={busy || snap?.phase !== "lobby"}
                  onClick={() => {
                    set({ team: ti, driver: di });
                    send({ t: "pick", team: ti, driver: di });
                  }}
                  className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left text-xs disabled:opacity-35 ${on ? "border-white bg-white/10" : "border-white/10 hover:border-white/30"}`}
                >
                  <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: t.color }} />
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-white">#{d.num} {d.name}</b> <span className="text-white/60">{t.name}</span>
                  </span>
                  <span className="text-[10px] text-[#facc15]">{"★".repeat(stars(t.pace))}</span>
                </button>
              );
            }),
          )}
        </div>
      </Card>

      <Card>
        <Head kicker="สนาม" title={circuitName(snap?.config.circuit ?? "monza")} sub={host ? "คุณเป็นหัวห้อง: เลือกสนามและจำนวนรอบ" : "หัวห้องเป็นคนเลือกสนามและจำนวนรอบ"} />
        <div className="flex flex-wrap gap-1.5">
          {CIRCUITS.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!host}
              aria-pressed={snap?.config.circuit === c.id}
              onClick={() => send({ t: "config", config: { circuit: c.id } })}
              className={`min-h-9 rounded-full border px-3 text-xs font-bold disabled:cursor-default ${snap?.config.circuit === c.id ? "border-white bg-white text-[#08080A]" : "border-white/15 text-white/75"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <Seg value={snap?.config.laps ?? 5} disabled={!host} onChange={(v) => send({ t: "config", config: { laps: v } })} options={[3, 5, 10].map((v) => ({ v, label: `${v} รอบ` }))} />
        <p className="text-[11px] text-white/55">{hasRealTrack(snap?.config.circuit ?? "monza") ? TRACK_DATA_CREDIT : "ผังสนามแบบคร่าว ๆ (© OpenStreetMap contributors)"}</p>
      </Card>

      {host ? (
        <Btn className="w-full" disabled={!snap || snap.phase !== "lobby" || !track} onClick={() => send({ t: "start" })}>
          <Flag className="inline h-4 w-4" /> เริ่มแข่ง ({snap?.players.filter((p) => p.online).length ?? 0} คน)
        </Btn>
      ) : (
        <p className="text-center text-sm text-white/70">รอหัวห้องกดเริ่มแข่ง…</p>
      )}
    </div>
  );
}

/** การแข่งออนไลน์หนึ่งครั้ง (สร้างใหม่ทุกครั้งที่หัวห้องกดเริ่ม) */
function OnlineRace({ link, snap, track, settings, onLeave }: { link: DriveLink; snap: DriveSnap; track: DriveTrack; settings: Settings; onLeave: () => void }) {
  const [entrants] = useState(() => entrantsOf(snap, link.me));
  const mine = snap.players.find((p) => p.id === link.me);
  const s: Settings = { ...settings, mode: "race", team: mine?.team ?? settings.team, driver: mine?.driver ?? settings.driver, circuit: snap.config.circuit, raceLaps: snap.config.laps };
  return <DriveSession settings={s} track={track} onExit={onLeave} net={{ link, entrants, startAt: snap.startAt, host: !!mine?.host, phase: snap.phase }} />;
}

const stars = (pace: number) => Math.max(1, Math.min(4, 4 - Math.round(pace * 3)));

type Hud = {
  time: HTMLSpanElement | null;
  delta: HTMLSpanElement | null;
  speed: HTMLSpanElement | null;
  gear: HTMLSpanElement | null;
  thr: HTMLDivElement | null;
  brk: HTMLDivElement | null;
  dot: SVGCircleElement | null;
  lap: HTMLSpanElement | null;
  sm: HTMLSpanElement | null;
  /** แข่ง: แบตเตอรี่ · ลมดูด · มีรถข้าง ๆ · เลน · ไฟสตาร์ท · จุดคู่แข่งบนแผนที่ */
  battery: HTMLDivElement | null;
  tow: HTMLSpanElement | null;
  side: HTMLSpanElement | null;
  lane: HTMLSpanElement | null;
  pass: HTMLButtonElement | null;
  lights: HTMLDivElement | null;
  dots: (SVGCircleElement | null)[];
  /** ยาง: ตัวอักษรชนิด · แถบเหลือ · % · ปุ่ม PIT · แผงในพิท (แถบจังหวะ เครื่องหมาย ปุ่ม ข้อความ ไฟ) */
  tyre: HTMLSpanElement | null;
  wear: HTMLDivElement | null;
  wearTxt: HTMLSpanElement | null;
  pitBtn: HTMLButtonElement | null;
  pitPanel: HTMLDivElement | null;
  pitMark: HTMLDivElement | null;
  pitAct: HTMLButtonElement | null;
  pitInfo: HTMLParagraphElement | null;
  pitBar: HTMLDivElement | null;
};

type TowerRow = { id: string; pos: number; num: number; name: string; colour: string; gap: string; me: boolean; pen: number; tyre?: Compound; pit?: boolean; strategy?: string };

/** กลยุทธ์ยางของรถคันหนึ่ง เช่น "M → H (จอด 2.4 วิ)" */
const strategyOf = (c: RaceCar) =>
  c.stints.map((x) => COMPOUND_INFO[x.c].short).join(" → ") + (c.stints.some((x) => x.stop !== null) ? ` · จอด ${c.stints.filter((x) => x.stop !== null).map((x) => x.stop!.toFixed(1)).join("/")} วิ` : "");

/** เลือกยางออกตัว */
function TyrePick({ value, onChange }: { value: Compound; onChange: (v: Compound) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold text-white/70">ยางออกตัว</span>
      <Seg<Compound> value={value} onChange={onChange} options={COMPOUNDS.map((c) => ({ v: c, label: COMPOUND_INFO[c].label }))} />
    </label>
  );
}

/** แข่งออนไลน์: ลิงก์ห้อง · รายชื่อบนกริด · เวลาไฟดับ (นาฬิกาเซิร์ฟเวอร์) */
type Net = { link: DriveLink; entrants: Entrant[]; startAt: number; host: boolean; phase: DriveSnap["phase"] };
/** ไฟสตาร์ทออนไลน์: ไฟติดทีละดวงในช่วง 4.8 วิสุดท้าย */
const NET_LIGHTS = 4.8;
/** ส่งสถานะรถของเราไปที่ห้องทุก ๆ (ms) */
const NET_SEND = 100;

/** ผลการแข่งจากห้อง (เรียงตามเวลารวมโทษแล้ว) */
function netRows(snap: DriveSnap, entrants: Entrant[], me: string): TowerRow[] {
  return (snap.results ?? []).map((r, k) => {
    const e = entrants.find((x) => x.id === r.id);
    const p = snap.players.find((x) => x.id === r.id);
    return { id: r.id, pos: k + 1, num: e?.num ?? 0, name: p?.name ?? e?.name ?? "?", colour: e?.colour ?? "#888", gap: r.time === null ? "ไม่จบ" : fmtTime(r.time), me: r.id === me, pen: r.pen };
  });
}

function DriveSession({ settings, track, onExit, net }: { settings: Settings; track: DriveTrack; onExit: () => void; net?: Net }) {
  const netRef = useRef(net);
  useEffect(() => {
    netRef.current = net;
  });
  const team = TEAMS[settings.team] ?? TEAMS[0];
  const driver = team.drivers[settings.driver] ?? team.drivers[0];
  const host = useRef<HTMLDivElement>(null);
  const input = useRef({ throttle: false, brake: false, touchT: false, touchB: false, smArm: false, pass: false, ot: false, touchO: false, pitReq: undefined as Compound | null | undefined, pitAct: false });
  const isRace = settings.mode === "race";
  // พิท: ยางที่เลือกจะเปลี่ยน · ขอเข้าพิทอยู่ไหม (ฝั่งจอ — ค่าจริงอยู่ใน race)
  const [pitTyre, setPitTyre] = useState<Compound>("hard");
  const [pitOn, setPitOn] = useState(false);
  const pitRef = useRef({ tyre: pitTyre, on: pitOn });
  useEffect(() => {
    pitRef.current = { tyre: pitTyre, on: pitOn };
  }, [pitTyre, pitOn]);
  /** ขอ/ยกเลิกเข้าพิท หรือเปลี่ยนยางที่จะใส่ */
  const requestPit = (on: boolean, tyre = pitRef.current.tyre) => {
    setPitOn(on);
    setPitTyre(tyre);
    pitRef.current = { tyre, on };
    input.current.pitReq = on ? tyre : null;
  };
  const netEntrants = net?.entrants;
  const field = useMemo(() => netEntrants ?? (isRace ? buildField(settings) : []), [netEntrants, isRace, settings]);
  const [tower, setTower] = useState<TowerRow[]>([]);
  const [result, setResult] = useState<TowerRow[] | null>(null);
  const [runId, setRunId] = useState(0);
  const hud = useRef<Hud>({ time: null, delta: null, speed: null, gear: null, thr: null, brk: null, dot: null, lap: null, sm: null, battery: null, tow: null, side: null, lane: null, pass: null, lights: null, dots: [], tyre: null, wear: null, wearTxt: null, pitBtn: null, pitPanel: null, pitMark: null, pitAct: null, pitInfo: null, pitBar: null });
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
  // หยุดชั่วคราว (ออนไลน์: การแข่งเดินต่อ แค่เปิดเมนู)
  const [paused, setPaused] = useState(false);
  // รีเพลย์ (หลังแข่งจบ): ตัวบันทึกของรอบนี้ · คลิปที่กำลังเล่น
  const recRef = useRef<Recorder | null>(null);
  const replayRef = useRef<{ queue: RFrame[][]; idx: number; t: number } | null>(null);
  const [replaying, setReplaying] = useState<null | "finish" | "highlights">(null);
  const [clipCount, setClipCount] = useState({ finish: false, highlights: 0 });
  const stopReplay = () => {
    replayRef.current = null;
    sceneRef.current?.setCamera(camera);
    setReplaying(null);
  };
  const startReplay = (kind: "finish" | "highlights") => {
    const rec = recRef.current;
    const queue = kind === "finish" ? (rec?.finish ? [rec.finish] : []) : (rec?.clips ?? []);
    if (!queue.length || !queue[0].length) return;
    replayRef.current = { queue, idx: 0, t: queue[0][0].t };
    sceneRef.current?.setCamera("orbit");
    setReplaying(kind);
  };
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) Object.assign(input.current, { throttle: false, brake: false, touchT: false, touchB: false, pass: false, ot: false, touchO: false });
  }, [paused]);

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
      else if (k === "ArrowDown" || k === "s" || k === "S" || k === " ") {
        input.current.brake = down;
        // ในพิท: Space = จอด / ไป (รถวิ่งเอง ไม่ต้องเบรก)
        if (k === " " && down && !e.repeat) input.current.pitAct = true;
      }
      else if (down && (k === "c" || k === "C")) setCamera((m) => (m === "tv" ? "chase" : "tv"));
      else if (k === "e" || k === "E" || k === "Shift") {
        // กดหนึ่งครั้ง = เตรียมเปิด/ปิด Straight Mode (โหมดกดเอง)
        if (down && !e.repeat) input.current.smArm = !input.current.smArm;
      }
      else if (k === "d" || k === "D") {
        // กดแซง (ทำงานเมื่อปุ่มแซงพร้อม)
        if (down && !e.repeat) input.current.pass = true;
      } else if (k === "q" || k === "Q") input.current.ot = down;
      else if (k === "p" || k === "P") {
        if (down && !e.repeat) requestPit(!pitRef.current.on);
      } else if (k === "1" || k === "2" || k === "3") {
        if (down && !e.repeat) requestPit(pitRef.current.on, COMPOUNDS[Number(k) - 1]);
      } else if (k === "Enter") {
        if (down && !e.repeat) input.current.pitAct = true;
      } else if (down && k === "Escape") setPaused((p) => !p);
      else return;
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => keys(e, true);
    const up = (e: KeyboardEvent) => keys(e, false);
    // สลับแอป/แท็บ: ปล่อยปุ่มทั้งหมด กันรถเร่งค้าง
    const blur = () => Object.assign(input.current, { throttle: false, brake: false, touchT: false, touchB: false, pass: false, ot: false, touchO: false });
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
      const livery = { team: team.id, colour: team.color, ink: team.ink, num: driver.num };
      // โหมดแข่ง: สร้างการแข่ง (ผู้เล่นอยู่ในกริด) · รถคันอื่น = คู่แข่ง
      const n0 = netRef.current;
      const race: Race | null = isRace ? createRace(track, field, { laps: settings.raceLaps, difficulty: settings.difficulty, seed: (Date.now() & 0xffff) + runId, startTyre: settings.startTyre }) : null;
      // ออนไลน์: ไฟดับตามนาฬิกาเซิร์ฟเวอร์ (ทุกเครื่องออกตัวพร้อมกัน)
      const lightsLeft = () => (n0 ? Math.max(1e-6, (n0.startAt - n0.link.serverNow()) / 1000) : 0);
      if (race && n0) race.lights = lightsLeft();
      const pi = race ? race.cars.findIndex((c) => c.player) : -1;
      const rivalIdx = race ? race.cars.map((_, k) => k).filter((k) => k !== pi) : [];
      const rivals = race ? rivalIdx.map((k) => ({ team: race.cars[k].team, colour: race.cars[k].colour, ink: race.cars[k].ink, num: race.cars[k].num })) : undefined;
      const lightsTotal = n0 ? NET_LIGHTS : (race?.lights ?? 0);
      const pit = race ? { lane: race.pitLane, teams: TEAMS.map((x) => ({ color: x.color, name: x.name })), mine: settings.team } : undefined;
      const scene = createDriveScene({ THREE, addons: { Sky, RoomEnvironment }, merge: mergeGeometries, body, el, track, livery, gfx, rivals, pit });
      // เริ่มใหม่: ยังไม่ได้ขอเข้าพิท · ยางแนะนำ = ชนิดที่วิ่งได้ครึ่งหลังของการแข่ง
      if (race) requestPit(false, suggestCompound(race.laps / 2, race.laps));
      sceneRef.current = scene;
      scene.setCamera(camera);
      scene.setLine(line);
      scene.setGuide(settings.guide);
      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);

      // เสียง (สร้างหลังผู้เล่นกดเริ่มขับแล้ว เบราว์เซอร์จึงยอมให้เล่น) · สั่นบนมือถือ
      const sfx = createSfx();
      const shake = (ms: number | number[]) => {
        if (settings.haptics) buzz(ms);
      };
      let lastGear = 0;
      let prevSlide = 0;
      let kerbAt = 0;
      /** ระยะ (ตามสนาม) ของรถคันอื่นเทียบกับเรา เฟรมก่อน — ไว้จับจังหวะวิ่งผ่านกันแล้วเล่นเสียงฟิ้ว */
      const relPrev = new Map<number, number>();

      const car = race ? race.cars[pi].car : newCar(track);
      recRef.current = race ? new Recorder() : null;
      replayRef.current = null;
      const revents: RaceEvent[] = [];
      let yieldMsgAt = 0;
      let towerAt = 0;
      const rowsOf = (r: Race): TowerRow[] => {
        const lead = r.cars[r.order[0]];
        return r.order.map((k, p) => {
          const c = r.cars[k];
          const g = p === 0 ? null : gapAhead(r, k);
          const lapsDown = Math.floor((lead.car.s - c.car.s) / track.length);
          return {
            id: c.id,
            pos: p + 1,
            num: c.num,
            name: c.name,
            colour: c.colour,
            gap:
              p === 0
                ? c.finish !== null
                  ? fmtTime(c.finish + c.penalty)
                  : `รอบ ${Math.min(r.laps, Math.max(1, c.car.lap + 1))}/${r.laps}`
                : lapsDown >= 1 && c.finish === null
                  ? `+${lapsDown} รอบ`
                  : g === null
                    ? ""
                    : `+${g.toFixed(1)}`,
            me: !!c.player,
            pen: c.penalty,
            tyre: c.tyre.c,
            pit: c.pitOff !== null,
            strategy: strategyOf(c),
          };
        });
      };
      const perf = perfOf(team.pace);
      const events: StepEvent[] = [];
      let last = performance.now();
      let acc = 0;
      let hudAt = 0;
      let wasInvalid = false;
      let prevV = car.v;
      // อัตราเร่งแบบเรียบ (ใช้คาดความเร็วตอนไปถึงโค้ง ให้ข้อความเบรกตรงกับสีเส้นช่วย)
      // โหมดฝึก: ความจำของแต่ละโค้ง (เก็บในเครื่องแยกตามสนาม) · ผ่านโค้งโดยไม่หลุด = จำได้มากขึ้น
      const corners = cornerMap(track);
      const cornerAt = (ss: number) => corners[Math.floor((((ss / DS) % track.n) + track.n) % track.n)];
      let mastery: Mastery = (settings.train && readJson<Mastery>(masteryKey(settings.circuit))) || {};
      let curCorner = cornerAt(car.s);
      let cornerDirty = false;
      // ช่วงแรกที่เริ่มกลางทาง (ออกตัว) ไม่นับ
      let cornerPrimed = false;
      const fadeAt = settings.train ? (ss: number) => mastery[cornerAt(ss)] ?? 0 : undefined;
      // นับถอยหลังสั้น ๆ ก่อนออกตัว (Time Trial) · แข่ง = ไฟสตาร์ท
      let wait = 1.6;
      let resultShown = false;
      let sentAt = 0;
      let seen: DriveSnap | null = null;
      let finishMsg = false;
      if (!race) setMsg({ id: Date.now(), text: "พร้อม…", tone: "info" });

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        // หยุดชั่วคราว: นาฬิกาหยุด (ออนไลน์เดินต่อ) · เงียบ · ภาพค้างไว้
        // รีเพลย์: เล่นตำแหน่งที่บันทึกไว้ด้วยกล้องวนรอบรถ (การแข่งไม่เดิน)
        const rp = replayRef.current;
        if (rp) {
          const dtR = Math.min(0.1, (now - last) / 1000);
          last = now;
          const clip = rp.queue[rp.idx];
          rp.t += dtR;
          if (rp.t > clip[clip.length - 1].t) {
            rp.idx++;
            if (rp.idx >= rp.queue.length) {
              replayRef.current = null;
              scene.setCamera(camera);
              setReplaying(null);
              return;
            }
            rp.t = rp.queue[rp.idx][0].t;
          }
          const f = frameAt(rp.queue[rp.idx], rp.t);
          scene.update({ s: f.me.s, lateral: f.me.lateral, ghost: null, speed: f.me.v, accel: 0, dt: dtR, aero: f.me.aero, rivals: f.rivals.map((c) => ({ s: c.s, lateral: c.lateral, speed: c.v, aero: c.aero })) });
          scene.render();
          sfx?.frame({ rpm: Math.min(1, (f.me.v % 25) / 25), gear: gearOf(f.me.v * 3.6), on: soundRef.current, squeal: 0, grass: false });
          return;
        }
        if (pausedRef.current && !netRef.current) {
          last = now;
          sfx?.frame({ rpm: 0, gear: 1, on: false, squeal: 0, grass: false });
          scene.render();
          return;
        }
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (race) {
          acc += dt;
          const i = input.current;
          const n = netRef.current;
          if (n && race.lights > 0) race.lights = lightsLeft();
          const wasLights = race.lights > 0;
          while (acc >= RACE_STEP) {
            acc -= RACE_STEP;
            const inPitNow = race.cars[pi].pit !== null;
            const want = { throttle: i.throttle || i.touchT, brake: i.brake || i.touchB, sm: settings.sm === "auto" || i.smArm, pass: i.pass, ot: i.ot || i.touchO, pitReq: i.pitReq, pitStop: inPitNow && i.pitAct, pitGo: inPitNow && i.pitAct };
            i.pass = false;
            i.pitReq = undefined;
            i.pitAct = false;
            if (settings.autoBrake) {
              const ideal = idealInput(track, car, 1, tyreGrip(race.cars[pi].tyre));
              want.brake = want.brake || ideal.brake;
              if (ideal.brake) want.throttle = false;
            }
            revents.length = 0;
            const smWas = car.sm;
            stepRace(race, want, revents);
            if (smWas && !car.sm) i.smArm = false;
            const me = race.cars[pi];
            for (const e of revents) {
              if (e.kind === "overtake" && e.by === me.id) {
                recRef.current?.markOvertake(race.t);
                setMsg({ id: now + 1, text: `แซงได้! P${race.order.indexOf(pi) + 1}`, tone: "good" });
              }
              else if (e.kind === "overtake" && e.on === me.id) setMsg({ id: now + 2, text: `โดนแซง · P${race.order.indexOf(pi) + 1}`, tone: "bad" });
              else if (e.kind === "pass" && e.id === me.id) setMsg({ id: now + 3, text: "แซง! ขึ้นไปเคียง · กด OT ใช้แบต", tone: "info" });
              else if (e.kind === "passEnd" && e.id === me.id && e.why !== "done") setMsg({ id: now + 9, text: "แซงไม่สำเร็จ · กลับเข้าแถว", tone: "bad" });
              else if (e.kind === "offtrack" && e.id === me.id) {
                sfx?.thump(1);
                shake([60, 40, 90]);
                setMsg({ id: now + 10, text: e.n <= TRACK_LIMITS ? `หลุดโค้ง! เตือน ${e.n}/${TRACK_LIMITS}` : `หลุดโค้ง! โทษ +${OFF_PENALTY} วิ (รวม +${e.penalty})`, tone: "bad" });
              } else if (e.kind === "bump" && e.id === me.id) {
                sfx?.thump(0.7);
                shake(60);
                setMsg({ id: now + 11, text: "ชนท้าย! เบรกช้าไป", tone: "bad" });
              }
              else if (e.kind === "detect" && e.id === me.id) setMsg({ id: now + 4, text: "ตามติดใน 1 วิ · ได้พลังงาน OVERTAKE", tone: "info" });
              else if (e.kind === "yield" && e.id === me.id && now - yieldMsgAt > 2500) {
                yieldMsgAt = now;
                setMsg({ id: now + 5, text: "อยู่ด้านนอกโค้ง ต้องยอมให้คันใน", tone: "bad" });
              } else if (e.kind === "lap" && e.id === me.id && me.finish === null) {
                // รอบสุดท้ายแล้วยังไม่เข้าพิท: เตือน
                if (me.pits === 0 && !me.pit && e.lap === race.laps - 1) setMsg({ id: now + 6, text: `รอบสุดท้าย! ยังไม่เข้าพิท · ไม่เข้าโทษ +${PIT_MISS_PENALTY} วิ`, tone: "bad" });
                else setMsg({ id: now + 6, text: `รอบ ${e.lap} · ${fmtTime(e.time)}`, tone: "info" });
              } else if (e.kind === "pitIn" && e.id === me.id) {
                setPitOn(false);
                pitRef.current.on = false;
                setMsg({ id: now + 12, text: "เข้าพิท · กด “จอด!” ให้ตรงกรอบอู่", tone: "info" });
              } else if (e.kind === "pitStop" && e.id === me.id) {
                const label = { perfect: "PERFECT!", good: "ดี", early: "จอดก่อนกรอบ", late: "จอดเลยกรอบ" }[e.grade];
                setMsg({ id: now + 13, text: `เปลี่ยนยาง ${COMPOUND_INFO[e.c].label} · ${e.time.toFixed(1)} วิ · ${label}`, tone: e.grade === "perfect" || e.grade === "good" ? "good" : "bad" });
              } else if (e.kind === "pitEarly" && e.id === me.id) setMsg({ id: now + 14, text: "กดไปก่อนไฟเขียว! ช่างยังไม่เสร็จ +0.6 วิ", tone: "bad" });
              else if (e.kind === "pitMiss" && e.id === me.id) setMsg({ id: now + 15, text: `ไม่ได้เข้าพิท · โทษ +${PIT_MISS_PENALTY} วิ`, tone: "bad" });
              else if (e.kind === "tyreLow" && e.id === me.id && me.finish === null) setMsg({ id: now + 16, text: me.pits === 0 ? "ยางเริ่มหมด · กด PIT เข้าพิทได้เลย" : "ยางเริ่มหมด · เกาะถนนน้อยลง", tone: "bad" });
              else if (e.kind === "finish" && e.id === me.id) {
                recRef.current?.markFinish(race.t);
                setMsg({ id: now + 7, text: `เข้าเส้นชัย P${race.order.indexOf(pi) + 1}`, tone: "good" });
              }
            }
          }
          if (wasLights && race.lights <= 0) setMsg({ id: now + 8, text: "ไป!", tone: "good" });
          if (n) {
            // รถเพื่อน: ใช้ข้อมูลชุดล่าสุดจากห้อง แล้ววิ่งต่อเองระหว่างรอชุดถัดไป
            const L = n.link.latest.current;
            if (L.snap && L.snap !== seen) {
              seen = L.snap;
              const age = (now - L.at) / 1000 + 0.05;
              for (const [id, st] of Object.entries(L.snap.states)) if (id !== n.link.me) setRemote(race, id, st, age);
              // คนที่หลุดออกจากห้อง: รถหยุดอยู่กับที่
              for (const p of L.snap.players) if (!p.online) for (const rc of race.cars) if (rc.id === p.id && rc.remote) rc.car.v = 0;
              if (L.snap.phase === "results" && !resultShown) {
                resultShown = true;
                setResult(netRows(L.snap, field, n.link.me));
              }
            } else advanceRemote(race, dt);
            if (now - sentAt > NET_SEND) {
              sentAt = now;
              n.link.send({ t: "state", st: packState(race.cars[pi]) });
            }
            if (race.cars[pi].finish !== null && !finishMsg) {
              finishMsg = true;
              window.setTimeout(() => setMsg({ id: Date.now(), text: "รอเพื่อนเข้าเส้นชัย…", tone: "info" }), 2500);
            }
          }
          // ผลการแข่ง: ผู้เล่นเข้าเส้นชัยแล้ว และรอให้ทุกคันจบ (หรือ 20 วินาที)
          const me = race.cars[pi];
          if (!n && me.finish !== null && !resultShown && (race.cars.every((c) => c.finish !== null) || race.t - me.finish > 20)) {
            resultShown = true;
            setResult(rowsOf(race));
          }
          if (now - towerAt > 400) {
            towerAt = now;
            setTower(rowsOf(race));
          }
        } else if (wait > 0) {
          wait -= dt;
          if (wait <= 0) setMsg({ id: Date.now(), text: "ไป!", tone: "good" });
        } else {
          acc += dt;
          const i = input.current;
          while (acc >= STEP) {
            acc -= STEP;
            const want = { throttle: i.throttle || i.touchT, brake: i.brake || i.touchB, sm: settings.sm === "auto" || i.smArm };
            if (settings.autoBrake) {
              const ideal = idealInput(track, car);
              want.brake = want.brake || ideal.brake;
              if (ideal.brake) want.throttle = false;
            }
            events.length = 0;
            const smWas = car.sm;
            stepCar(track, car, want, perf, events);
            // ปีกพับกลับแล้ว (เบรก/พ้นโซน) → ต้องกดเปิดใหม่ในทางตรงถัดไป
            if (smWas && !car.sm) i.smArm = false;
            for (const e of events) {
              if (e.kind === "off") setMsg({ id: now, text: "หลุดโค้ง! รอบนี้ไม่นับ", tone: "bad" });
              if (e.kind === "excursion") {
                sfx?.thump(1);
                shake([60, 40, 90]);
              }
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
        const lateralOf = (rc: RaceCar) => rc.pitOff ?? laneValue(track, "offset", rc.car.s, rc.car.lat) + rc.car.slide;
        const lateral = race ? lateralOf(race.cars[pi]) : laneValue(track, "offset", car.s, car.lat) + car.slide;
        const b = bestRef.current;
        const ghost = b && car.lapStart !== null ? ghostDistance(b.trace, car.t - car.lapStart) + car.lap * track.length : null;
        const accel = dt > 0 ? (car.v - prevV) / dt : 0;
        prevV = car.v;
        const rivalStates = race
          ? rivalIdx.map((k) => {
              const c = race.cars[k].car;
              return { s: c.s, lateral: lateralOf(race.cars[k]), speed: c.v, aero: c.sm ? 1 : 0 };
            })
          : undefined;
        // บันทึกรีเพลย์ (แข่งเท่านั้น หลังไฟดับ)
        if (race && race.lights <= 0 && rivalStates && recRef.current) {
          const rec = recRef.current;
          const before = rec.clips.length + (rec.finish ? 1 : 0);
          rec.push({ t: race.t, me: { s: car.s, lateral, v: car.v, aero: car.sm ? 1 : 0 }, rivals: rivalStates.map((r) => ({ s: r.s, lateral: r.lateral, v: r.speed, aero: r.aero })) });
          if (rec.clips.length + (rec.finish ? 1 : 0) !== before) setClipCount({ finish: !!rec.finish, highlights: rec.clips.length });
        }
        scene.setLane(car.lat);
        // เส้นช่วยไดนามิก: การเกาะถนนของรถเรา (ทีม × ยาง × อากาศเสียจากคันหน้า)
        const grip = race ? race.cars[pi].perf.grip * tyreGrip(race.cars[pi].tyre) * (1 - DIRTY_GRIP * race.cars[pi].dirty) : perf.grip;
        if (settings.train) {
          if (car.offT > 0) cornerDirty = true;
          const c = cornerAt(car.s);
          if (c !== curCorner) {
            // จบช่วงโค้งหนึ่ง: ไม่หลุดเลย = จำได้มากขึ้น · หลุด = กลับไปเริ่มใหม่
            if (cornerPrimed) {
              mastery = learnCorner(mastery, curCorner, !cornerDirty);
              writeJson(masteryKey(settings.circuit), mastery);
            }
            cornerPrimed = true;
            curCorner = c;
            cornerDirty = false;
          }
        }
        // ในพิท: ไม่แสดงเส้นช่วย (รถวิ่งเอง)
        const guide = race?.cars[pi].pit ? undefined : { lat: car.lat, grip, fadeAt };
        scene.update({ s: car.s, lateral, ghost: race ? null : ghost, speed: car.v, accel, dt, aero: car.sm ? 1 : 0, rivals: rivalStates, guide, boost: car.ot });
        scene.render();

        const kmh = car.v * 3.6;
        if (sfx) {
          const gear = gearOf(kmh);
          const lo = GEARS[gear - 1] ?? 0;
          const hi = GEARS[gear] ?? 340;
          const rpm = Math.min(1, Math.max(0, (kmh - lo) / Math.max(1, hi - lo)));
          const on = soundRef.current && (race ? race.lights <= 0 : wait <= 0);
          if (gear !== lastGear) {
            if (lastGear && gear > lastGear) sfx.shift();
            lastGear = gear;
          }
          // ยางเอี๊ยด: รถกำลังไถลออกจากไลน์ (ระยะไถลเปลี่ยนเร็ว) · ล้อลงหญ้า
          const slideRate = dt > 0 ? Math.abs(car.slide - prevSlide) / dt : 0;
          prevSlide = car.slide;
          sfx.frame({ rpm, gear, on, squeal: car.offT > 0 ? 0 : Math.min(1, slideRate / 2.5), grass: car.offT > 0, boost: car.ot });
          // รถคันอื่นวิ่งผ่านใกล้ ๆ (แซงเราหรือเราแซง): ฟิ้วจากฝั่งที่รถอยู่
          if (race) {
            for (const k of rivalIdx) {
              const o = race.cars[k].car;
              const ds = o.s - car.s;
              const before = relPrev.get(k);
              relPrev.set(k, ds);
              if (before === undefined || Math.sign(before) === Math.sign(ds) || Math.abs(ds) > 8) continue;
              const side = laneValue(track, "offset", o.s, o.lat) + o.slide - lateral;
              if (Math.abs(side) > 5) continue;
              sfx.whoosh(side / 4, Math.abs(o.v - car.v) / 15);
            }
          }
        }
        // ขึ้น kerb: สั่นเบา ๆ
        const edgeR = laneValue(track, "offset", car.s, car.lat) + car.slide;
        const onKerb = car.v > 15 && (edgeR > sampleAt(track, track.wr, car.s) - 0.6 || edgeR < 0.6 - sampleAt(track, track.wl, car.s));
        if (onKerb && now - kerbAt > 250) {
          kerbAt = now;
          shake(12);
        }

        // อัปเดตหน้าปัด ~20 ครั้ง/วิ
        if (now - hudAt > 50) {
          hudAt = now;
          const h = hud.current;
          const i = input.current;
          if (h.speed) {
            h.speed.textContent = String(Math.round(kmh));
            // ใช้แบต: ตัวเลขความเร็วเป็นสีเหลือง
            h.speed.style.color = car.ot ? "#facc15" : "";
          }
          if (h.gear) h.gear.textContent = String(gearOf(kmh));
          if (race) {
            const me = race.cars[pi];
            const pos = race.order.indexOf(pi) + 1;
            const lapNow = Math.min(race.laps, Math.max(1, car.lap + 1));
            if (h.time) h.time.textContent = `P${pos}/${race.cars.length}`;
            if (h.lap) h.lap.textContent = `รอบ ${lapNow}/${race.laps}`;
            const g = gapAhead(race, pi);
            if (h.delta) {
              h.delta.textContent = `รอบ ${lapNow}/${race.laps}${g !== null && me.finish === null ? ` · คันหน้า +${g.toFixed(1)}` : ""}${me.penalty ? ` · โทษ +${me.penalty}` : ""}`;
              h.delta.style.color = "";
            }
            if (h.battery) {
              h.battery.style.width = `${Math.round(car.energy * 100)}%`;
              // เหลือง = กำลังใช้ · เขียว = กำลังชาร์จจากการเบรก · ฟ้า = ปกติ
              const charging = (i.brake || i.touchB) && car.energy < 1;
              h.battery.style.background = car.ot ? "#facc15" : charging ? "#4ade80" : "#38bdf8";
              h.battery.style.boxShadow = car.ot ? "0 0 10px #facc15" : charging ? "0 0 8px #4ade80" : "";
            }
            if (h.tow) h.tow.style.opacity = me.tow > 0.15 ? "1" : "0";
            if (h.side) {
              const sb = sideBySide(race, pi);
              h.side.textContent = `${sb.left ? "◀ มีรถ" : ""}${sb.left && sb.right ? " · " : ""}${sb.right ? "มีรถ ▶" : ""}`;
            }
            if (h.lane) h.lane.textContent = me.pass ? "กำลังแซง" : me.held ? "ตามติด" : "";
            // ปุ่มแซง: ซ่อนเมื่อไม่ได้ตามติด · เทาเมื่อตามติดแต่ยังแซงไม่ได้ (ใกล้โค้ง/ถนนแคบ/ข้างไม่ว่าง) · เหลืองเมื่อกดได้
            if (h.pass) {
              const st = me.pass ? "on" : me.passState === "ready" && me.passLane !== null ? (me.passLane < Math.round(car.lat) ? "left" : "right") : me.passState;
              if (h.pass.dataset.st !== st) {
                h.pass.dataset.st = st;
                const ready = st === "left" || st === "right";
                h.pass.textContent = st === "on" ? "กำลังแซง…" : st === "wait" ? "แซง · รอทางตรง" : st === "left" ? "◀ แซง" : "แซง ▶";
                h.pass.style.opacity = st === "none" ? "0" : "1";
                h.pass.style.pointerEvents = ready ? "auto" : "none";
                h.pass.style.filter = st === "wait" ? "grayscale(1) brightness(0.8)" : "";
                h.pass.classList.toggle("animate-pulse", ready);
              }
            }
            // ยาง: ชนิด + ที่เหลือ (เขียว → เหลือง → แดง)
            if (h.tyre) {
              const info = COMPOUND_INFO[me.tyre.c];
              h.tyre.textContent = info.short;
              h.tyre.style.color = info.color;
              h.tyre.style.borderColor = info.color;
            }
            const left = Math.max(0, 1 - me.tyre.wear);
            if (h.wear) {
              h.wear.style.width = `${Math.round(left * 100)}%`;
              h.wear.style.background = left > 0.45 ? "#4ade80" : left > 0.25 ? "#facc15" : "#ef4444";
            }
            if (h.wearTxt) h.wearTxt.textContent = `${Math.round(left * 100)}%`;
            // ปุ่ม PIT: ขอแล้ว = รอบนี้/รอบหน้า (ผ่านทางเข้าไปแล้ว) · ต้องเข้าแต่ยังไม่เข้า = กะพริบเตือนช่วงท้าย
            if (h.pitBtn) {
              const into = me.car.s > 0 ? me.car.s - Math.floor(me.car.s / track.length) * track.length : 0;
              const nextLap = into > track.length - PIT_IN;
              const st = me.pit ? "in" : me.finish !== null ? "off" : me.pitWant ? (nextLap ? "next" : "on") : "idle";
              const label = st === "in" ? "ในพิท" : st === "on" ? `PIT รอบนี้ · ${COMPOUND_INFO[me.pitWant!].short}` : st === "next" ? `PIT รอบหน้า · ${COMPOUND_INFO[me.pitWant!].short}` : "PIT";
              if (h.pitBtn.textContent !== label) h.pitBtn.textContent = label;
              h.pitBtn.style.opacity = st === "off" || st === "in" ? "0" : "1";
              h.pitBtn.style.pointerEvents = st === "off" || st === "in" ? "none" : "auto";
              const urge = st === "idle" && me.pits === 0 && me.car.lap >= race.laps - 1;
              h.pitBtn.classList.toggle("animate-pulse", urge || st === "on");
              h.pitBtn.dataset.on = st === "on" || st === "next" ? "1" : "";
            }
            // แผงในพิท: แถบจังหวะจอด (จุดหยุดถ้ากดตอนนี้ เทียบกรอบ) → เปลี่ยนยาง → ไฟเขียวกดไป
            if (h.pitPanel) {
              const p = me.pit;
              const show = !!p && (p.phase === "in" || p.phase === "lane" || p.phase === "brake" || p.phase === "stop");
              h.pitPanel.style.opacity = show ? "1" : "0";
              h.pitPanel.style.pointerEvents = show ? "auto" : "none";
              if (p && show) {
                const err = p.phase === "in" || p.phase === "lane" ? stopError(me) : p.err;
                // แถบ: ซ้ายสุด = ยังไกล (−30 ม.) · กลาง = ตรงกรอบ · ขวาสุด = เลยกรอบ (+STOP_MISS)
                const x = Math.max(0, Math.min(1, (err + 30) / (30 + STOP_MISS)));
                if (h.pitMark) h.pitMark.style.left = `${(x * 100).toFixed(1)}%`;
                const canStop = (p.phase === "in" || p.phase === "lane") && err >= -STOP_WINDOW;
                const stopping = p.phase === "brake" || p.phase === "stop";
                if (h.pitBar) h.pitBar.style.width = p.phase === "stop" ? `${Math.min(100, (p.t / Math.max(0.1, p.need)) * 100).toFixed(0)}%` : "0%";
                if (h.pitAct) {
                  const t = p.phase === "stop" ? (p.ready ? "ไป!" : "กำลังเปลี่ยนยาง…") : p.phase === "brake" ? "กำลังจอด…" : canStop ? "จอด!" : "รอ…";
                  if (h.pitAct.textContent !== t) h.pitAct.textContent = t;
                  const live = canStop || (p.phase === "stop" && p.ready);
                  h.pitAct.style.background = p.phase === "stop" ? (p.ready ? "#16a34a" : "#7f1d1d") : live ? "#facc15" : "rgba(255,255,255,0.12)";
                  h.pitAct.style.color = live && p.phase !== "stop" ? "#08080A" : "#fff";
                  h.pitAct.classList.toggle("animate-pulse", live);
                }
                if (h.pitInfo) {
                  const t = stopping ? `ยาง ${COMPOUND_INFO[p.c].label} · ${p.phase === "stop" ? `${p.t.toFixed(1)} วิ` : ""}` : `พิทเลน 80 กม./ชม. · ใส่ยาง ${COMPOUND_INFO[p.c].label}`;
                  if (h.pitInfo.textContent !== t) h.pitInfo.textContent = t;
                }
              }
            }
            if (h.lights) {
              const lit = race.lights > 0 ? Math.min(5, Math.floor((lightsTotal - race.lights) / 0.8) + 1) : 0;
              h.lights.style.opacity = race.lights > 0 ? "1" : "0";
              h.lights.querySelectorAll("span").forEach((el, k) => ((el as HTMLSpanElement).style.background = k < lit ? "#e10600" : "#2a2c31"));
            }
            rivalIdx.forEach((k, n) => {
              const dot = h.dots[n];
              if (!dot) return;
              const p = poseAt(track, race.cars[k].car.s);
              dot.setAttribute("cx", p.x.toFixed(0));
              dot.setAttribute("cy", p.z.toFixed(0));
            });
          } else {
            if (h.time) h.time.textContent = car.lapStart === null ? "รอบเปิด" : fmtTime(car.t - car.lapStart);
            if (h.lap) h.lap.textContent = car.lapStart === null ? "เข้าเส้นสตาร์ท" : `รอบ ${car.lap + 1}`;
            const delta = deltaTo(b?.trace ?? null, car, d);
            if (h.delta) {
              h.delta.textContent = delta === null ? "" : fmtDelta(delta);
              h.delta.style.color = delta === null ? "" : delta <= 0 ? "#4ade80" : "#ff3b2f";
            }
          }
          if (h.thr) h.thr.style.opacity = i.throttle || i.touchT ? "1" : "0.18";
          if (h.brk) h.brk.style.opacity = i.brake || i.touchB ? "1" : "0.18";
          // สถานะ Straight Mode
          if (h.sm) {
            const inZone = track.smZone[Math.floor((((car.s / DS) % track.n) + track.n) % track.n)] === 1;
            const st = car.sm ? "on" : inZone && settings.sm === "manual" ? (i.smArm ? "arm" : "ready") : "off";
            if (h.sm.dataset.st !== st) {
              h.sm.dataset.st = st;
              h.sm.textContent = st === "on" ? "STRAIGHT MODE" : st === "ready" ? "STRAIGHT MODE · กด E" : st === "arm" ? "STRAIGHT MODE · ยกเท้าเบรก" : "";
              h.sm.style.opacity = st === "off" ? "0" : "1";
              h.sm.style.background = st === "on" ? "#16a34a" : "rgba(0,0,0,0.55)";
              h.sm.style.borderColor = st === "on" ? "#4ade80" : "#4ade80";
            }
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
        sceneRef.current = null;
        sfx?.close();
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
    // ตั้งฉากครั้งเดียวต่อเซสชัน (แข่งใหม่ = runId เปลี่ยน) — กล้อง/เส้นช่วยเปลี่ยนผ่าน sceneRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, runId]);

  const pad = "flex select-none items-center justify-center rounded-2xl border-2 text-sm font-black tracking-wide touch-none";

  return createPortal(
    // รีเพลย์: ซ่อนหน้าปัด/ปุ่มขับ เหลือภาพ ตารางอันดับ และป้ายรีเพลย์ (ลูกที่มี data-keep)
    <div data-replay={replaying ? "" : undefined} className="fixed inset-0 z-[60] bg-[#08080A] text-white data-replay:[&>*:not([data-keep])]:hidden">
      <div ref={host} data-keep className="absolute inset-0" />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">เครื่องนี้ไม่รองรับกราฟิก 3D (WebGL)</p>}

      {/* แถบบน */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 sm:p-3">
        <button type="button" onClick={() => setPaused(true)} aria-label="หยุดชั่วคราว" className="pointer-events-auto rounded-full bg-black/55 p-2.5 backdrop-blur">
          <Pause className="h-5 w-5" />
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
            {!isRace && (
              <>
                <p>
                  ดีสุด <b className="text-white">{fmtTime(best?.time ?? null)}</b>
                </p>
                <p>เป้าหมาย {fmtTime(track.refLap)}</p>
              </>
            )}
            {credit && <p className="text-[10px] text-white/50">โมเดลรถ: Meshy (CC BY 4.0)</p>}
            {hasRealTrack(track.circuitId) && <p className="max-w-56 text-[10px] text-white/50">{TRACK_DATA_CREDIT}</p>}
            {laps.slice(0, 4).map((l) => (
              <p key={l.lap} className={l.valid ? "" : "text-(--color-f1-text) line-through"}>
                รอบ {l.lap} {fmtTime(l.time)}
              </p>
            ))}
          </div>
        </div>
      </div>

      {isRace && (
        <>
          {/* ไฟสตาร์ท 5 ดวง */}
          <div ref={(n) => void (hud.current.lights = n)} className="pointer-events-none absolute inset-x-0 top-24 mx-auto flex w-fit gap-2 rounded-2xl bg-black/70 p-3 transition-opacity sm:top-28" aria-hidden>
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className="h-8 w-8 rounded-full bg-[#2a2c31] sm:h-10 sm:w-10" />
            ))}
          </div>

          {/* ตารางอันดับ */}
          <ol className="pointer-events-none absolute left-2 top-16 hidden w-52 space-y-0.5 rounded-xl bg-black/55 p-1.5 text-[11px] tabular-nums backdrop-blur sm:top-24 sm:block">
            {tower.slice(0, 10).map((r) => (
              <li key={r.id} className={`flex items-center gap-1.5 rounded px-1 ${r.me ? "bg-white/20 font-bold" : ""}`}>
                <span className="w-4 text-right text-white/70">{r.pos}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: r.colour }} />
                <span className="min-w-0 flex-1 truncate">
                  #{r.num} {r.name}
                </span>
                <span className="text-white/75">{r.pit ? "PIT" : r.gap}</span>
                {r.tyre && (
                  <span className="w-3 text-center font-black" style={{ color: COMPOUND_INFO[r.tyre].color }}>
                    {COMPOUND_INFO[r.tyre].short}
                  </span>
                )}
                {r.pen > 0 && <span className="text-(--color-f1-text)">+{r.pen}</span>}
              </li>
            ))}
          </ol>

          {/* แบตเตอรี่ · ลมดูด · มีรถข้าง ๆ · เลน */}
          <div className="pointer-events-none absolute inset-x-0 bottom-46 flex flex-col items-center gap-1 sm:bottom-24">
            <span ref={(n) => void (hud.current.tow = n)} className="poster rounded bg-[#0ea5e9]/80 px-2 text-xs tracking-wide opacity-0 transition-opacity">
              SLIPSTREAM
            </span>
            <span ref={(n) => void (hud.current.side = n)} className="text-xs font-bold text-[#facc15] drop-shadow" />
            <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[10px] backdrop-blur">
              <span className="text-white/70">แบต</span>
              <div className="h-2 w-28 overflow-hidden rounded-full bg-white/15">
                <div ref={(n) => void (hud.current.battery = n)} className="h-full rounded-full bg-[#38bdf8]" style={{ width: "60%" }} />
              </div>
              <span ref={(n) => void (hud.current.lane = n)} className="w-16 text-center text-white/80" />
            </div>
            {/* ยาง: ชนิด + ที่เหลือ */}
            <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[10px] tabular-nums backdrop-blur">
              <span ref={(n) => void (hud.current.tyre = n)} className="flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-black" />
              <span className="text-white/70">ยาง</span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-white/15">
                <div ref={(n) => void (hud.current.wear = n)} className="h-full rounded-full bg-[#4ade80]" style={{ width: "100%" }} />
              </div>
              <span ref={(n) => void (hud.current.wearTxt = n)} className="w-8 text-right text-white/80" />
            </div>
          </div>

          {/* ปุ่มแซง: ขึ้นเองเมื่อตามติดคันหน้า · กดครั้งเดียว รถเปลี่ยนเลนและแซงให้ */}
          <button
            ref={(n) => void (hud.current.pass = n)}
            type="button"
            data-st="none"
            aria-label="แซงคันหน้า"
            onPointerDown={() => {
              input.current.pass = true;
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ opacity: 0, pointerEvents: "none" }}
            className={`${pad} poster absolute bottom-30 left-3 h-14 w-32 border-[#facc15] bg-[#facc15]/25 text-base text-[#facc15] transition-opacity active:bg-[#facc15]/60 sm:bottom-26`}
          >
            แซง ▶
          </button>
          <button
            type="button"
            aria-label="OT ใช้แบต (กดค้าง)"
            onPointerDown={() => {
              input.current.touchO = true;
            }}
            onPointerUp={() => {
              input.current.touchO = false;
            }}
            onPointerCancel={() => {
              input.current.touchO = false;
            }}
            onPointerLeave={() => {
              input.current.touchO = false;
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`${pad} absolute bottom-30 right-33 h-12 w-16 border-[#38bdf8] bg-black/40 text-xs text-[#38bdf8] active:bg-[#38bdf8]/40 sm:bottom-26 sm:right-30`}
          >
            OT
          </button>

          {/* PIT: แตะเพื่อขอ/ยกเลิกเข้าพิท · เลือกยางที่จะใส่ */}
          <div className="absolute right-3 top-40 flex flex-col items-end gap-1 sm:top-44">
            <button
              ref={(n) => void (hud.current.pitBtn = n)}
              type="button"
              onClick={() => requestPit(!pitOn)}
              aria-pressed={pitOn}
              className="poster min-h-11 rounded-xl border-2 border-white/70 bg-black/55 px-3 text-sm tracking-wide backdrop-blur data-[on=1]:border-[#facc15] data-[on=1]:bg-[#facc15]/25 data-[on=1]:text-[#facc15]"
            >
              PIT
            </button>
            {pitOn && (
              <div className="flex gap-1" role="group" aria-label="ยางที่จะเปลี่ยน">
                {COMPOUNDS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={pitTyre === c}
                    aria-label={`ยาง ${COMPOUND_INFO[c].label}`}
                    onClick={() => requestPit(true, c)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-black/60 text-sm font-black ${pitTyre === c ? "ring-2 ring-white" : "opacity-70"}`}
                    style={{ color: COMPOUND_INFO[c].color, borderColor: COMPOUND_INFO[c].color }}
                  >
                    {COMPOUND_INFO[c].short}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ในพิท: แถบจังหวะจอด (ช่องเขียว = หยุดตรงกรอบอู่) · เปลี่ยนยาง · ไฟเขียวกดไป */}
          <div
            ref={(n) => void (hud.current.pitPanel = n)}
            style={{ opacity: 0, pointerEvents: "none" }}
            className="absolute inset-x-0 bottom-46 z-[1] mx-auto w-[min(92vw,26rem)] space-y-2 rounded-2xl bg-black/75 p-3 backdrop-blur transition-opacity sm:bottom-28"
          >
            <p ref={(n) => void (hud.current.pitInfo = n)} className="text-center text-xs font-bold text-white/85" />
            <div className="relative h-5 overflow-hidden rounded-full bg-white/10" aria-hidden>
              {/* ช่วงที่กดได้: −STOP_WINDOW..STOP_MISS · เหลือง = ดี · เขียว = ตรงกรอบ */}
              <div className="absolute inset-y-0 bg-white/15" style={{ left: `${((30 - STOP_WINDOW) / (30 + STOP_MISS)) * 100}%`, right: 0 }} />
              <div className="absolute inset-y-0 bg-[#facc15]/60" style={{ left: `${((30 - 2.5) / (30 + STOP_MISS)) * 100}%`, width: `${(5 / (30 + STOP_MISS)) * 100}%` }} />
              <div className="absolute inset-y-0 bg-[#16a34a]" style={{ left: `${((30 - 0.75) / (30 + STOP_MISS)) * 100}%`, width: `${(1.5 / (30 + STOP_MISS)) * 100}%` }} />
              <div ref={(n) => void (hud.current.pitMark = n)} className="absolute inset-y-0 -ml-1 w-2 rounded-full bg-white shadow-[0_0_8px_#fff]" style={{ left: "0%" }} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div ref={(n) => void (hud.current.pitBar = n)} className="h-full bg-[#4ade80]" style={{ width: "0%" }} />
            </div>
            <button
              ref={(n) => void (hud.current.pitAct = n)}
              type="button"
              onPointerDown={() => {
                input.current.pitAct = true;
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="poster h-14 w-full touch-none select-none rounded-2xl text-xl tracking-wide"
            >
              รอ…
            </button>
          </div>

          {/* ผลการแข่ง */}
          {/* กำลังเล่นรีเพลย์ */}
          {replaying && (
            <div data-keep className="absolute inset-x-0 top-16 z-10 flex items-center justify-center gap-2 sm:top-24">
              <span className="poster rounded bg-(--color-f1) px-3 py-1 text-sm tracking-wide">{replaying === "finish" ? "REPLAY · เส้นชัย" : "ไฮไลต์การแซง"}</span>
              <button type="button" onClick={stopReplay} className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold backdrop-blur">
                ข้าม ⏭
              </button>
            </div>
          )}

          {result && !replaying && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md space-y-3 rounded-2xl bg-[#14151a] p-4">
                <p className="poster text-center text-2xl">ผลการแข่ง · {circuitName(settings.circuit)}</p>
                <ol className="max-h-[55vh] space-y-0.5 overflow-auto text-sm tabular-nums">
                  {result.map((r) => (
                    <li key={r.id} className={`flex items-center gap-2 rounded px-2 py-1 ${r.me ? "bg-white/15 font-bold" : ""}`}>
                      <span className="w-6 text-right">{r.pos}</span>
                      <span className="h-4 w-1.5 rounded-full" style={{ background: r.colour }} />
                      <span className="min-w-0 flex-1 truncate">
                        #{r.num} {r.name}
                      </span>
                      {r.strategy && <span className="hidden text-[11px] text-white/60 sm:inline">{r.strategy}</span>}
                      <span className="text-white/75">{r.gap}</span>
                      {r.pen > 0 && <span className="text-xs text-(--color-f1-text)">(โทษ +{r.pen} วิ)</span>}
                    </li>
                  ))}
                </ol>
                {(clipCount.finish || clipCount.highlights > 0) && (
                  <div className="flex gap-2">
                    {clipCount.finish && (
                      <Btn tone="white" className="flex-1" onClick={() => startReplay("finish")}>
                        <Play className="inline h-4 w-4" /> รีเพลย์เส้นชัย
                      </Btn>
                    )}
                    {clipCount.highlights > 0 && (
                      <Btn tone="white" className="flex-1" onClick={() => startReplay("highlights")}>
                        <Play className="inline h-4 w-4" /> ไฮไลต์การแซง ({clipCount.highlights})
                      </Btn>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  {net ? (
                    net.host ? (
                      <Btn className="flex-1" onClick={() => net.link.send({ t: "lobby" })}>
                        กลับล็อบบี้
                      </Btn>
                    ) : (
                      <p className="flex-1 self-center text-center text-xs text-white/70">รอหัวห้องเริ่มรอบใหม่…</p>
                    )
                  ) : (
                    <Btn
                      className="flex-1"
                      onClick={() => {
                        setResult(null);
                        setTower([]);
                        setClipCount({ finish: false, highlights: 0 });
                        setRunId((n) => n + 1);
                      }}
                    >
                      แข่งอีกครั้ง
                    </Btn>
                  )}
                  <Btn tone="ghost" className="flex-1" onClick={onExit}>
                    {net ? "ออกจากห้อง" : "ออก"}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Straight Mode */}
      <span
        ref={(n) => void (hud.current.sm = n)}
        data-st="off"
        aria-live="polite"
        className="poster pointer-events-none absolute right-3 top-38 rounded-lg border-2 px-3 py-1 text-sm tracking-wide opacity-0 transition-opacity duration-200 sm:right-auto sm:left-1/2 sm:top-24 sm:-translate-x-1/2 sm:text-base"
      />

      {msg && (
        <p key={msg.id} className={`radio-toast pointer-events-none absolute inset-x-0 top-24 mx-auto w-fit rounded-xl px-4 py-2 text-center text-base font-bold sm:top-28 sm:text-lg ${msg.tone === "good" ? "bg-[#16a34a]/90" : msg.tone === "bad" ? "bg-(--color-f1)/90" : "bg-black/70"}`}>
          {msg.text}
        </p>
      )}

      {/* แผนที่ย่อ */}
      <svg viewBox={mini.box} className="pointer-events-none absolute right-3 top-16 h-20 w-20 rounded-xl bg-black/45 p-1 sm:top-auto sm:bottom-3 sm:h-32 sm:w-32" aria-hidden>
        <path d={mini.d} fill="none" stroke="white" strokeOpacity={0.7} strokeWidth={mini.w} />
        {field
          .filter((e) => !e.player)
          .map((e, n) => (
            <circle key={e.id} ref={(el) => void (hud.current.dots[n] = el)} r={mini.w * 1.6} fill={e.colour} />
          ))}
        <circle ref={(n) => void (hud.current.dot = n)} r={mini.w * 2.2} fill={team.color} stroke="white" strokeWidth={mini.w * 0.6} />
      </svg>

      {/* หน้าปัด: ความเร็ว เกียร์ และปุ่มที่กดอยู่ */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1">
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

      {/* เมนูหยุดชั่วคราว */}
      {paused && !result && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="หยุดชั่วคราว">
          <div className="w-full max-w-xs space-y-3 rounded-2xl bg-[#14151a] p-4 text-center">
            <p className="poster text-2xl">หยุดชั่วคราว</p>
            {net && <p className="text-xs text-[#facc15]">แข่งออนไลน์: การแข่งยังเดินต่อ รถคุณจะไม่ถูกบังคับ</p>}
            <Btn className="w-full" onClick={() => setPaused(false)}>
              <Play className="inline h-4 w-4" /> เล่นต่อ
            </Btn>
            {!net && (
              <Btn
                tone="white"
                className="w-full"
                onClick={() => {
                  setPaused(false);
                  setResult(null);
                  setTower([]);
                  setLaps([]);
                  setClipCount({ finish: false, highlights: 0 });
                  setRunId((n) => n + 1);
                }}
              >
                <RotateCcw className="inline h-4 w-4" /> {isRace ? "เริ่มแข่งใหม่" : "เริ่มใหม่"}
              </Btn>
            )}
            <Btn tone="ghost" className="w-full" onClick={onExit}>
              <LogOut className="inline h-4 w-4" /> {net ? "ออกจากห้อง" : "ออกไปหน้าตั้งค่า"}
            </Btn>
            <p className="text-[11px] text-white/50">คีย์บอร์ด: Esc = หยุด/เล่นต่อ</p>
          </div>
        </div>
      )}

      {/* ปุ่ม Straight Mode (โหมดกดเอง) */}
      {settings.sm === "manual" && (
        <button
          type="button"
          aria-label="เปิด/ปิด Straight Mode"
          onPointerDown={() => {
            input.current.smArm = !input.current.smArm;
          }}
          onContextMenu={(e) => e.preventDefault()}
          className={`${pad} absolute bottom-30 right-3 h-14 w-28 border-[#4ade80] bg-black/40 text-xs active:bg-[#16a34a]/60 sm:bottom-64 sm:w-24`}
        >
          SM
        </button>
      )}

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
