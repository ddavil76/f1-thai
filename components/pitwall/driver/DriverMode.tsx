"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Copy, Flag, LogIn, LogOut, Route, Users, Volume2, VolumeX } from "lucide-react";
import { Btn, Card, Head, Seg } from "@/components/pitwall/ui";
import { setSoundOn, soundOn } from "@/components/pitwall/sound";
import { createRoom, onlineReady } from "@/components/pitwall/session";
import { useDriveLink, type DriveLink } from "./driveSession";
import { deltaTo, DIRTY_GRIP, ghostDistance, idealInput, lapDistance, newCar, perfOf, STEP, stepCar, type LapResult, type StepEvent } from "@/lib/pitwall/drive/car";
import { buildDriveTrack, DS, laneValue, laneZone, poseAt, type DriveTrack } from "@/lib/pitwall/drive/line";
import { advanceRemote, createRace, gapAhead, OFF_PENALTY, packState, setRemote, sideBySide, STEP as RACE_STEP, stepRace, TRACK_LIMITS, type Difficulty, type Entrant, type Race, type RaceEvent } from "@/lib/pitwall/drive/race";
import type { DriveSnap } from "@/lib/pitwall/drive/room";
import { cornerMap, learnCorner, type Mastery } from "@/lib/pitwall/drive/guide";
import { cornerAhead } from "@/lib/pitwall/drive/corners";
import { hasRealTrack, loadRawTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import { CIRCUITS, TEAMS, circuitName } from "@/lib/pitwall/teams";
import type { BodyModel, CameraMode, DriveScene, Gfx, GuideMode } from "./scene";

type Settings = {
  team: number;
  driver: number;
  circuit: string;
  line: boolean;
  /** แบบเส้นช่วย: ไดนามิก (สีตามความเร็วตอนนี้) · เฉพาะโค้ง · คงที่ (สามสีตายตัว) */
  guide: GuideMode;
  /** โหมดฝึก: เส้นช่วยค่อย ๆ จางในโค้งที่ผ่านได้ดีติดกัน (หลุดโค้ง = กลับมาเต็ม) */
  train: boolean;
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
    return { team: 0, driver: 0, circuit: "monza", line: true, guide: "dynamic", train: false, autoBrake: false, camera: "tv", gfx: "auto", sm: "auto", mode: "tt", raceLaps: 5, field: 10, difficulty: "normal", grid: "back", ...saved };
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
                ? "ออกตัวจากกริดพร้อมคู่แข่ง AI ตามติดคันหน้า กด “แซง” ให้รถขึ้นไปเคียง แล้วกด OT ใช้แบตเร่งผ่าน · เบรกเองเข้าโค้ง หลุดโค้งเกิน 3 ครั้งโดนโทษ"
                : "ขับเองหนึ่งคัน กดคันเร่งและเบรกตามเส้นช่วยบนถนน ยิ่งกดตรงจังหวะยิ่งเร็ว ทำเวลาให้ดีที่สุด"
          }
        />
        <Seg<Settings["mode"]>
          value={settings.mode === "online" && !online ? "race" : settings.mode}
          onChange={(v) => set({ mode: v })}
          options={[{ v: "tt", label: "Time Trial" }, { v: "race", label: "แข่งกับ AI" }, ...(onlineReady() ? [{ v: "online" as const, label: "แข่งกับเพื่อน" }] : [])]}
        />
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
                <b className="text-[#4ade80]">เขียว</b> ความเร็วนี้ผ่านโค้งได้
              </p>
              <p>
                <b className="text-[#facc15]">เหลือง → ส้ม</b> เร็วเสี่ยงหลุด ผ่อน/เริ่มเบรก
              </p>
              <p>
                <b className="text-(--color-f1-text)">แดง</b> เร็วเกิน ต้องเบรกเดี๋ยวนี้
              </p>
            </div>
            <p className="text-[11px] text-white/60">
              ลูกศรบนถนนเปลี่ยนสีตามความเร็วที่คุณจะมีตอนไปถึงจุดนั้น (กำลังเร่ง = แดงเร็วขึ้น · กำลังเบรก = ค่อย ๆ กลับเป็นเขียว) · ตามติดคันหน้าในโค้ง (อากาศเสีย) สีจะแดงเร็วขึ้น · โหมดฝึก: ผ่านโค้งไหนได้ไม่หลุด 3 ครั้ง เส้นของโค้งนั้นจะจางเกือบหาย (หลุดเมื่อไหร่กลับมาเต็ม)
            </p>
          </div>
        )}
        <p className="text-xs text-white/60">
          คอม: <b>↑</b> หรือ <b>W</b> = คันเร่ง · <b>↓</b> <b>S</b> หรือ <b>Space</b> = เบรก · <b>E</b> หรือ <b>Shift</b> = Straight Mode · <b>C</b> = สลับกล้อง · <b>Esc</b> = ออก · มือถือ: ปุ่มเบรกซ้าย คันเร่งขวา
          {settings.mode !== "tt" && (
            <>
              {" "}
              · แข่ง: <b>D</b> = แซง (เมื่อปุ่มแซงพร้อม) · <b>Q</b> (กดค้าง) = OT ใช้แบต · มือถือ: ปุ่ม “แซง” และ “OT”
            </>
          )}
        </p>
      </Card>

      {online && <JoinCard onRoom={onRoom} />}

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
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-white/65">
            <li>
              <b className="text-white">ตามติด:</b> ตามทันคันหน้าบนทางตรง ความเร็วถูกจำกัดให้ค้างห่างราว 0.2 วินาที · เข้าโค้งต้องเบรกเอง ไม่เบรก = ชนท้าย เสียความเร็วมาก
            </li>
            <li>
              <b className="text-white">แซง:</b> ปุ่ม “แซง” พร้อมเมื่อตามติดที่ ~0.2 วิ เหลือทางตรงพอ และฝั่งข้างว่าง/ถนนกว้างพอ (ใกล้โค้งปุ่มเป็นสีเทา) · กดแล้วรถขึ้นไปเคียงเอง แล้วกลับ racing line เมื่อพ้น · ถึงจุดเบรกแล้วยังขึ้นไม่ถึงครึ่งคัน รถถอยกลับไปต่อท้าย
            </li>
            <li>
              <b className="text-white">ลมดูด / แบต (OT):</b> ออกจากท้ายคันหน้าได้ลมดูดพาไปครู่หนึ่ง · กด OT ค้างใช้แบตเร่ง · แบตชาร์จคืนตอนเบรก · ตามหลังไม่เกิน 1 วิตอนผ่านต้นโซนทางตรงได้พลังงานเพิ่ม
            </li>
            <li>
              <b className="text-white">หลุดโค้ง:</b> เข้าโค้งเร็วเกิน รถลงหญ้า ความเร็วหายเกือบครึ่ง · เตือน 3 ครั้ง ครั้งต่อไปโดน +5 วินาทีทุกครั้ง
            </li>
            <li>
              <b className="text-white">AI:</b> ใช้กติกาเดียวกัน — แซงบนทางตรงยาว เก็บแบตไว้ใช้ตอนแซง ป้องกันได้ครั้งเดียวต่อทางตรง
            </li>
          </ul>
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
            ? `ผังสนามและความกว้างถนนตามจริง · มีชื่อโค้งดัง · ความสูงเนินเป็นค่าประมาณ — ${TRACK_DATA_CREDIT}`
            : "ผังสนามแบบคร่าว ๆ (© OpenStreetMap contributors) · ความสูงเนินเป็นค่าประมาณ"}
        </p>
      </Card>
      )}

      <Card>
        <Head kicker="ตัวช่วย" title="ตั้งค่าการขับ" />
        <div className="grid gap-3 sm:grid-cols-2">
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
      </Card>

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
  hint: HTMLSpanElement | null;
  dot: SVGCircleElement | null;
  lap: HTMLSpanElement | null;
  corner: HTMLParagraphElement | null;
  sm: HTMLSpanElement | null;
  /** แข่ง: แบตเตอรี่ · ลมดูด · มีรถข้าง ๆ · เลน · ไฟสตาร์ท · จุดคู่แข่งบนแผนที่ */
  battery: HTMLDivElement | null;
  tow: HTMLSpanElement | null;
  side: HTMLSpanElement | null;
  lane: HTMLSpanElement | null;
  pass: HTMLButtonElement | null;
  lights: HTMLDivElement | null;
  dots: (SVGCircleElement | null)[];
};

type TowerRow = { id: string; pos: number; num: number; name: string; colour: string; gap: string; me: boolean; pen: number };

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
  const input = useRef({ throttle: false, brake: false, touchT: false, touchB: false, smArm: false, pass: false, ot: false, touchO: false });
  const isRace = settings.mode === "race";
  const netEntrants = net?.entrants;
  const field = useMemo(() => netEntrants ?? (isRace ? buildField(settings) : []), [netEntrants, isRace, settings]);
  const [tower, setTower] = useState<TowerRow[]>([]);
  const [result, setResult] = useState<TowerRow[] | null>(null);
  const [runId, setRunId] = useState(0);
  const hud = useRef<Hud>({ time: null, delta: null, speed: null, gear: null, thr: null, brk: null, hint: null, dot: null, lap: null, corner: null, sm: null, battery: null, tow: null, side: null, lane: null, pass: null, lights: null, dots: [] });
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
      else if (k === "e" || k === "E" || k === "Shift") {
        // กดหนึ่งครั้ง = เตรียมเปิด/ปิด Straight Mode (โหมดกดเอง)
        if (down && !e.repeat) input.current.smArm = !input.current.smArm;
      }
      else if (k === "d" || k === "D") {
        // กดแซง (ทำงานเมื่อปุ่มแซงพร้อม)
        if (down && !e.repeat) input.current.pass = true;
      } else if (k === "q" || k === "Q") input.current.ot = down;
      else if (down && k === "Escape") onExit();
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
      const race: Race | null = isRace ? createRace(track, field, { laps: settings.raceLaps, difficulty: settings.difficulty, seed: (Date.now() & 0xffff) + runId }) : null;
      // ออนไลน์: ไฟดับตามนาฬิกาเซิร์ฟเวอร์ (ทุกเครื่องออกตัวพร้อมกัน)
      const lightsLeft = () => (n0 ? Math.max(1e-6, (n0.startAt - n0.link.serverNow()) / 1000) : 0);
      if (race && n0) race.lights = lightsLeft();
      const pi = race ? race.cars.findIndex((c) => c.player) : -1;
      const rivalIdx = race ? race.cars.map((_, k) => k).filter((k) => k !== pi) : [];
      const rivals = race ? rivalIdx.map((k) => ({ team: race.cars[k].team, colour: race.cars[k].colour, ink: race.cars[k].ink, num: race.cars[k].num })) : undefined;
      const lightsTotal = n0 ? NET_LIGHTS : (race?.lights ?? 0);
      const scene = createDriveScene({ THREE, addons: { Sky, RoomEnvironment }, merge: mergeGeometries, body, el, track, livery, gfx, rivals });
      sceneRef.current = scene;
      scene.setCamera(camera);
      scene.setLine(line);
      scene.setGuide(settings.guide);
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

      const car = race ? race.cars[pi].car : newCar(track);
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
            const want = { throttle: i.throttle || i.touchT, brake: i.brake || i.touchB, sm: settings.sm === "auto" || i.smArm, pass: i.pass, ot: i.ot || i.touchO };
            i.pass = false;
            if (settings.autoBrake) {
              const ideal = idealInput(track, car);
              want.brake = want.brake || ideal.brake;
              if (ideal.brake) want.throttle = false;
            }
            revents.length = 0;
            const smWas = car.sm;
            stepRace(race, want, revents);
            if (smWas && !car.sm) i.smArm = false;
            const me = race.cars[pi];
            for (const e of revents) {
              if (e.kind === "overtake" && e.by === me.id) setMsg({ id: now + 1, text: `แซงได้! P${race.order.indexOf(pi) + 1}`, tone: "good" });
              else if (e.kind === "overtake" && e.on === me.id) setMsg({ id: now + 2, text: `โดนแซง · P${race.order.indexOf(pi) + 1}`, tone: "bad" });
              else if (e.kind === "pass" && e.id === me.id) setMsg({ id: now + 3, text: "แซง! ขึ้นไปเคียง · กด OT ใช้แบต", tone: "info" });
              else if (e.kind === "passEnd" && e.id === me.id && e.why !== "done") setMsg({ id: now + 9, text: "แซงไม่สำเร็จ · กลับเข้าแถว", tone: "bad" });
              else if (e.kind === "offtrack" && e.id === me.id)
                setMsg({ id: now + 10, text: e.n <= TRACK_LIMITS ? `หลุดโค้ง! เตือน ${e.n}/${TRACK_LIMITS}` : `หลุดโค้ง! โทษ +${OFF_PENALTY} วิ (รวม +${e.penalty})`, tone: "bad" });
              else if (e.kind === "bump" && e.id === me.id) setMsg({ id: now + 11, text: "ชนท้าย! เบรกช้าไป", tone: "bad" });
              else if (e.kind === "detect" && e.id === me.id) setMsg({ id: now + 4, text: "ตามติดใน 1 วิ · ได้พลังงาน OVERTAKE", tone: "info" });
              else if (e.kind === "yield" && e.id === me.id && now - yieldMsgAt > 2500) {
                yieldMsgAt = now;
                setMsg({ id: now + 5, text: "อยู่ด้านนอกโค้ง ต้องยอมให้คันใน", tone: "bad" });
              } else if (e.kind === "lap" && e.id === me.id && me.finish === null) setMsg({ id: now + 6, text: `รอบ ${e.lap} · ${fmtTime(e.time)}`, tone: "info" });
              else if (e.kind === "finish" && e.id === me.id) setMsg({ id: now + 7, text: `เข้าเส้นชัย P${race.order.indexOf(pi) + 1}`, tone: "good" });
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
        const lateral = laneValue(track, "offset", car.s, car.lat) + car.slide;
        const b = bestRef.current;
        const ghost = b && car.lapStart !== null ? ghostDistance(b.trace, car.t - car.lapStart) + car.lap * track.length : null;
        const accel = dt > 0 ? (car.v - prevV) / dt : 0;
        prevV = car.v;
        const rivalStates = race
          ? rivalIdx.map((k) => {
              const c = race.cars[k].car;
              return { s: c.s, lateral: laneValue(track, "offset", c.s, c.lat) + c.slide, speed: c.v, aero: c.sm ? 1 : 0 };
            })
          : undefined;
        scene.setLane(car.lat);
        // เส้นช่วยไดนามิก: การเกาะถนนของรถเรา (ทีม × อากาศเสียจากคันหน้า)
        const grip = race ? race.cars[pi].perf.grip * (1 - DIRTY_GRIP * race.cars[pi].dirty) : perf.grip;
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
        scene.update({ s: car.s, lateral, ghost: race ? null : ghost, speed: car.v, accel, dt, aero: car.sm ? 1 : 0, rivals: rivalStates, guide: { lat: car.lat, grip, fadeAt } });
        scene.render();

        const kmh = car.v * 3.6;
        if (audio) {
          const gear = gearOf(kmh);
          const lo = GEARS[gear - 1] ?? 0;
          const hi = GEARS[gear] ?? 340;
          const rpm = Math.min(1, Math.max(0, (kmh - lo) / Math.max(1, hi - lo)));
          audio.osc.frequency.setTargetAtTime(70 + rpm * 160 + gear * 6, audio.ctx.currentTime, 0.05);
          audio.gain.gain.setTargetAtTime(soundRef.current && (race ? race.lights <= 0 : wait <= 0) ? 0.035 : 0, audio.ctx.currentTime, 0.1);
        }

        // อัปเดตหน้าปัด ~20 ครั้ง/วิ
        if (now - hudAt > 50) {
          hudAt = now;
          const h = hud.current;
          const i = input.current;
          if (h.speed) h.speed.textContent = String(Math.round(kmh));
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
              h.battery.style.background = car.ot ? "#facc15" : "#38bdf8";
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
          // บอกล่วงหน้าเมื่อโซนเบรกใกล้เข้ามา
          if (h.hint) {
            let dist: number | null = null;
            for (let k = 0; k <= 260; k += DS) {
              const z = laneZone(track, car.s + k, car.lat);
              if (z === "brake") {
                dist = k;
                break;
              }
            }
            // ช้าพอแล้ว (ไม่เร็วกว่าความเร็วอ้างอิงตรงนั้น) ไม่ต้องเตือน
            const fast = dist !== null && car.v > laneValue(track, "vref", car.s + dist, car.lat) + 2;
            h.hint.textContent = !fast || dist === null ? "" : dist < 8 ? "เบรก!" : `เบรกใน ${Math.round(dist)} ม.`;
          }
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
          // ชื่อโค้งดังที่กำลังจะถึง (เช่น EAU ROUGE)
          if (h.corner) {
            const c = d >= 0 ? cornerAhead(track.circuitId, d, track.length) : null;
            const name = c?.name ?? "";
            if (h.corner.textContent !== name) h.corner.textContent = name;
            h.corner.style.opacity = name ? "1" : "0";
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
        audio?.ctx.close().catch(() => {});
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
                <span className="text-white/75">{r.gap}</span>
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

          {/* ผลการแข่ง */}
          {result && (
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
                      <span className="text-white/75">{r.gap}</span>
                      {r.pen > 0 && <span className="text-xs text-(--color-f1-text)">(โทษ +{r.pen} วิ)</span>}
                    </li>
                  ))}
                </ol>
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

      {/* ชื่อโค้ง */}
      <p
        ref={(n) => void (hud.current.corner = n)}
        aria-live="polite"
        className="poster pointer-events-none absolute left-3 top-16 border-l-4 border-(--color-f1) bg-black/55 px-3 py-1 text-lg uppercase tracking-wide opacity-0 backdrop-blur transition-opacity duration-300 sm:top-24 sm:text-2xl"
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
