"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import OsmCredit from "@/components/OsmCredit";
import { TyreDot, fmtGap, fmtLap, teamOf } from "@/components/pitwall/ui";
import { useDriveTrack } from "@/components/pitwall/driver/driveTrack";
import type { CameraMode, DriveScene } from "@/components/pitwall/driver/scene";
import { BOX_GAP, GARAGE_D, PIT_W, pitLane } from "@/lib/pitwall/drive/pit";
import { hasRealTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import { sample } from "@/lib/pitwall/drive/line";
import { MODE } from "@/lib/pitwall/model";
import { PIT_BOX, segOrder, type QCar, type QualiState } from "@/lib/pitwall/quali";
import { standings, type RaceState } from "@/lib/pitwall/race";
import type { Snapshot } from "@/lib/pitwall/room";
import { TEAMS } from "@/lib/pitwall/teams";
import type { TrackModel } from "@/lib/pitwall/track";
import { COMPOUND_INFO } from "@/lib/pitwall/types";
import { cellMapper, SIDE_LAT, SIDE_NEAR } from "@/lib/pitwall/view3d";

/** มุมกล้องที่ให้เลือก (ค่าเริ่มต้น = กล้องถ่ายทอดสดข้างสนาม) */
const CAMS: [CameraMode, string][] = [
  ["broadcast", "TV"],
  ["heli", "มุมสูง"],
  ["chase", "ตามหลัง"],
  ["tv", "ออนบอร์ด"],
];
const CAM_KEY = "pitwall-race3d-cam";

/**
 * เป้าของรถหนึ่งคัน (ข้อมูลล่าสุดจากการจำลอง) · pos = ช่องสะสม · pitStart = ตำแหน่งตอนเริ่มพิทเลน (ไม่อยู่ในพิทเลน = null)
 * garage = จอดในอู่ (ควอลิฟาย) · slow = รอบอุ่นยาง/กลับพิทของควอลิฟาย (หลบออกจากเส้นแข่งให้รถรอบเร่ง) · drs = ปีกหลังเปิด
 */
type Target = {
  pos: number;
  pitStart: number | null;
  garage: boolean;
  side: number;
  hide: boolean;
  tyre: string;
  started: boolean;
  slow: boolean;
  drs: boolean;
  /** cool = เข้าเส้นชัยแล้ว วิ่งต่อช้า ๆ (รอบเย็นเครื่อง) · stop = ออกจากการแข่ง ชะลอแล้วจอดข้างทาง */
  end: "cool" | "stop" | null;
};

/** สถานะรถในควอลิฟาย → เป้าบนฉาก */
function qualiTarget(q: QCar, track: TrackModel): Target {
  const tyre = q.run ? COMPOUND_INFO[q.run.compound].color : "#3a3a40";
  const lane = q.lane;
  // พิทเลน: ออก = จากอู่ (กลางพิทเลน) ถึงทางออก · เข้า = จากทางเข้าถึงอู่
  const pitStart = lane ? (lane.kind === "out" ? lane.end - track.pitCells : lane.end - PIT_BOX) : null;
  return {
    pos: q.pos,
    pitStart,
    garage: q.status === "garage",
    side: q.id % 2 ? 1 : -1,
    hide: q.status === "eliminated",
    tyre,
    started: true,
    slow: q.status === "out" || q.status === "in",
    drs: false,
    end: null,
  };
}

/** คันที่น่าดูในควอลิฟายเมื่อคันที่เลือกจอดอยู่: รถรอบเร่งที่ใกล้จบรอบที่สุด → รถที่กำลังวิ่ง */
function qualiStar(q: QualiState): number | null {
  const push = q.cars.filter((c) => c.status === "push" && c.lap).sort((a, b) => (q.t - b.lap!.start) / b.lap!.time - (q.t - a.lap!.start) / a.lap!.time);
  return push[0]?.id ?? q.cars.find((c) => c.status === "out" || c.status === "in")?.id ?? null;
}
/**
 * ตำแหน่งที่วาด: ข้อมูลจากการจำลองมาไม่สม่ำเสมอ (บางรอบไม่ขยับ บางรอบขยับสองก้าว) — ถ้าเกลี่ยแค่ระหว่างข้อมูลสองชุด
 * รถจะวิ่ง-หยุด-วิ่ง (ภาพกระตุก) จึงประมาณความเร็วจากข้อมูลที่ผ่านมา แล้วให้รถวิ่งต่อด้วยความเร็วนั้น ค่อย ๆ ดึงเข้าหาตำแหน่งจริง
 * pos/at = ตำแหน่งล่าสุดที่เปลี่ยนและเวลาที่ได้รับ · v = ช่องต่อ ms · shown = ตำแหน่งที่วาดอยู่
 */
type Track = { pos: number; at: number; v: number; shown: number; endAt?: number };
/** รอบเย็นเครื่อง: ความเร็วลดลงเหลือราวหนึ่งในสาม · หายจากภาพหลังกี่วินาที */
const COOL_HIDE = 20;

/**
 * การแข่งของโหมดผู้จัดการทีมแบบ 3D: ใช้ฉากเดียวกับโหมดนักขับ (โหมดผู้ชม — รถทุกคันเป็น AI)
 * ตำแหน่งมาเป็นระยะ ๆ จากการจำลอง → เกลี่ยระหว่างข้อมูล แล้วแปลงเป็นระยะบนสนามจริง (lib/pitwall/view3d)
 * กล้องแบบถ่ายทอดสด: ตั้งข้างสนาม ซูมตามรถที่โฟกัส ตัดภาพไปกล้องถัดไปเมื่อรถพ้นระยะ
 */
export default function Race3D({ snap, track, focus, team: myTeam, interval, onFail }: { snap: Snapshot; track: TrackModel; focus: number | null; team: number; interval: number; onFail: () => void }) {
  const dt = useDriveTrack(snap.circuit);
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DriveScene | null>(null);
  const [cam, setCam] = useState<CameraMode>(() => {
    try {
      const v = window.localStorage.getItem(CAM_KEY);
      return CAMS.some(([k]) => k === v) ? (v as CameraMode) : "broadcast";
    } catch {
      return "broadcast";
    }
  });
  const [ready, setReady] = useState(false);
  const pit = useMemo(() => (dt ? pitLane(dt, TEAMS.length) : null), [dt]);
  const map = useMemo(() => (dt && pit ? cellMapper(track, dt, pit) : null), [dt, pit, track]);

  const r = snap.race;
  const q = snap.quali;
  // รถที่ตาม: คันที่เลือก · เรซ: ออกจากการแข่ง/เข้าเส้นชัยแล้ว (หายจากสนาม) = คันที่ยังวิ่งอยู่อันดับดีสุด
  // ควอลิฟาย: คันที่เลือกจอดในอู่/ตกรอบ = รถรอบเร่งที่ใกล้จบรอบ
  const order = r ? standings(r, track.lapCells) : [];
  const onTrack = (id: number) => (r ? !r.cars[id]?.out && r.cars[id]?.finished === null : !!q && q.cars[id] && q.cars[id].status !== "garage" && q.cars[id].status !== "eliminated");
  const fallback = r ? order.find((c) => onTrack(c.id))?.id : q ? qualiStar(q) : null;
  const focusId = focus !== null && onTrack(focus) ? focus : (fallback ?? focus ?? 0);
  const targets = useRef<Target[]>([]);
  const motion = useRef(new Map<number, Track>());
  const view = useRef({ focus: focusId, interval });

  // ข้อมูลใหม่: ตั้งให้รถวิ่งจากตำแหน่งที่เห็นอยู่ไปตำแหน่งใหม่ภายในช่วงเวลาก่อนข้อมูลชุดถัดไป
  useLayoutEffect(() => {
    view.current = { focus: focusId, interval };
    const list = r ? r.cars : q ? q.cars : null;
    if (!list) return;
    const now = performance.now();
    targets.current = r
      ? r.cars.map((c) => ({
          pos: c.pos,
          pitStart: c.pit ? c.pit.start : null,
          garage: false,
          side: c.side,
          hide: false,
          tyre: COMPOUND_INFO[c.compound].color,
          started: r.started,
          slow: false,
          drs: c.drs,
          end: c.finished !== null ? ("cool" as const) : c.out ? ("stop" as const) : null,
        }))
      : q!.cars.map((c) => qualiTarget(c, track));
    for (const c of list) {
      const m = motion.current.get(c.id);
      if (!m || c.pos < m.pos - 0.01 || c.pos - m.pos > 4) {
        // เริ่มใหม่ / กระโดด (เข้าอู่ ข้ามเวลา): วางที่ตำแหน่งจริงเลย
        motion.current.set(c.id, { pos: c.pos, at: now, v: 0, shown: c.pos });
      } else if (c.pos !== m.pos) {
        const gap = now - m.at;
        if (gap > 15) m.v = m.v === 0 ? (c.pos - m.pos) / gap : m.v * 0.6 + ((c.pos - m.pos) / gap) * 0.4;
        m.pos = c.pos;
        m.at = now;
      }
    }
  });

  // ฉาก 3D + ลูปวาด
  useEffect(() => {
    const el = host.current;
    if (!el || !dt || !pit || !map) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
        onFail();
        return;
      }
      const THREE = await import("three");
      const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
      const { Sky } = await import("three/addons/objects/Sky.js");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const { createDriveScene } = await import("@/components/pitwall/driver/scene");
      if (disposed) return;
      const low = matchMedia("(pointer: coarse)").matches || el.clientWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4;
      const liveries = snap.cars.map((c) => {
        const t = teamOf(c);
        return { team: t.id, colour: t.color, ink: t.ink, num: c.num };
      });
      let scene: DriveScene;
      try {
        scene = createDriveScene({
          THREE,
          addons: { Sky, RoomEnvironment },
          merge: mergeGeometries,
          body: null,
          el,
          track: dt,
          livery: liveries[0],
          gfx: low ? "low" : "high",
          rivals: liveries,
          pit: { lane: pit, teams: TEAMS.map((x) => ({ color: x.color, name: x.name })), mine: myTeam },
          spectator: true,
        });
      } catch {
        onFail();
        return;
      }
      sceneRef.current = scene;
      scene.setLine(false);
      scene.setCamera(cam);
      setReady(true);
      const onResize = () => scene.resize();
      window.addEventListener("resize", onResize);
      const ro = new ResizeObserver(onResize);
      ro.observe(el);

      /** สถานะที่วาดของแต่ละคัน: ระยะ · ระยะเยื้อง · ความเร็ว */
      const state = new Map<number, { s: number; lat: number; v: number }>();
      let last = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const step = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (step <= 0) return;
        const tg = targets.current;
        const poses = tg.map((c, id) => {
          const m = motion.current.get(id);
          let pos = c.pos;
          let gone = false;
          if (m && c.end) {
            // จบแล้ว: ไม่มีข้อมูลตำแหน่งใหม่ — วิ่งต่อเองแล้วชะลอ (เข้าเส้นชัย = รอบเย็นเครื่อง · ออกจากการแข่ง = จอด)
            m.endAt ??= now;
            const t = (now - m.endAt) / 1000;
            const v = c.end === "cool" ? m.v * Math.max(0.32, Math.exp(-t / 4)) : m.v * Math.max(0, 1 - t / 2.5);
            m.shown += v * step * 1000;
            pos = m.shown;
            gone = c.end === "cool" && t > COOL_HIDE;
          } else if (m) {
            // วิ่งต่อด้วยความเร็วที่ประมาณไว้ (ไม่เกิน 1.5 ช่วงข้อมูล ถ้าข้อมูลหยุดมา = รถหยุด) แล้วดึงเข้าหาตำแหน่งที่ควรเป็น
            const expect = m.pos + m.v * Math.min(now - m.at, view.current.interval * 1.5);
            const next = m.shown + m.v * step * 1000 + (expect - m.shown) * Math.min(1, step * 5);
            m.shown = Math.max(m.shown, Math.min(next, expect + 0.05));
            pos = m.shown;
          }
          const team = snap.cars[id]?.team ?? 0;
          if (c.garage) {
            // จอดในอู่ของทีม: สองคันของทีมจอดเยื้องกันในอู่
            const box = map.pitPose(track.pitEntry.start + track.lapCells, 0.5, team);
            return { s: box.s + (id % 2 ? 1 : -1) * BOX_GAP * 0.2, lat: box.lat + pit.side * (PIT_W / 2 + GARAGE_D * 0.35), pit: true, gone: false };
          }
          if (c.pitStart !== null) return { ...map.pitPose(c.pitStart, (pos - c.pitStart) / track.pitCells, team), pit: true, gone };
          return { s: map.sOf(pos), lat: NaN, pit: false, gone };
        });
        const rivals = tg.map((c, id) => {
          const p = poses[id];
          let lat = p.lat;
          if (!p.pit) {
            // ตามเส้นแข่ง · วิ่งคู่/ต่อท้ายใกล้ ๆ = แยกฝั่งตามการจำลอง · บนกริดเยื้องสลับฝั่ง
            const line = sample(dt, dt.lineOffset, p.s);
            // ควอลิฟาย: รอบอุ่นยาง/กลับพิทหลบออกข้างทางให้รถรอบเร่ง
            const close = c.slow || !c.started || !!c.end || poses.some((o, k) => k !== id && !o.pit && !tg[k].hide && Math.abs(o.s - p.s) < SIDE_NEAR);
            const want = line + (close ? c.side * (c.slow || c.end === "cool" ? 3.2 : c.started ? SIDE_LAT : 2.2) : 0);
            // ออกจากการแข่ง: จอดเลยขอบถนนออกไป
            const edge = c.end === "stop" ? (c.side > 0 ? sample(dt, dt.wr, p.s) + 3.5 : -sample(dt, dt.wl, p.s) - 3.5) : c.side > 0 ? sample(dt, dt.wr, p.s) - 1.3 : -sample(dt, dt.wl, p.s) + 1.3;
            lat = c.end === "stop" ? edge : c.side > 0 ? Math.min(edge, want) : Math.max(edge, want);
          }
          const prev = state.get(id);
          if (!prev || Math.abs(p.s - prev.s) > 200) {
            state.set(id, { s: p.s, lat, v: 0 });
          } else {
            const v = Math.max(0, (p.s - prev.s) / step);
            prev.v += (v - prev.v) * Math.min(1, step * 6);
            prev.s = p.s;
            // ในพิทเลนตามเส้นทางพิทตรง ๆ · บนสนามเปลี่ยนฝั่งนุ่ม ๆ
            prev.lat = p.pit ? lat : prev.lat + (lat - prev.lat) * Math.min(1, step * 1.6);
          }
          const st = state.get(id)!;
          return { s: st.s, lateral: st.lat, speed: st.v, aero: c.drs ? 1 : 0, tyre: c.tyre, hide: c.hide || p.gone };
        });
        const f = view.current.focus;
        const me = rivals[f] ?? rivals[0];
        if (!me) return;
        scene.update({ s: me.s, lateral: me.lateral, ghost: null, speed: me.speed, accel: 0, dt: step, rivals, focus: f });
        scene.render();
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        ro.disconnect();
        scene.dispose();
        sceneRef.current = null;
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
    // ฉากสร้างใหม่เฉพาะเมื่อสนามเปลี่ยน (กล้อง/รถที่โฟกัสอ่านจาก ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dt, pit, map, myTeam]);

  // ไม่มีผังสนามนี้ → กลับไปใช้แผนที่
  useEffect(() => {
    if (dt === null) onFail();
  }, [dt, onFail]);

  useEffect(() => {
    sceneRef.current?.setCamera(cam);
    try {
      window.localStorage.setItem(CAM_KEY, cam);
    } catch {
      // ไม่มีที่เก็บ — ใช้ค่าเริ่มต้นครั้งหน้า
    }
  }, [cam]);

  const spec = snap.cars[focusId];
  const team = spec ? teamOf(spec) : null;
  const rc = r?.cars[focusId];
  const qc = q?.cars[focusId];
  const place = r ? order.findIndex((c) => c.id === focusId) + 1 : q ? segOrder(q).indexOf(focusId) + 1 : 0;
  const compound = rc?.compound ?? qc?.run?.compound ?? null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#08080A]">
      <div ref={host} className="absolute inset-0" aria-label="ภาพการแข่ง 3D" role="img" />
      {!ready && <p className="poster absolute inset-0 flex items-center justify-center text-sm text-white/60">กำลังโหลดสนาม 3D…</p>}
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur" role="group" aria-label="มุมกล้อง">
        {CAMS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cam === k} onClick={() => setCam(k)} className={`min-h-8 rounded-full px-2.5 text-[11px] font-bold ${cam === k ? "bg-white text-[#08080A]" : "text-white/75 hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>
      {r?.flag && (
        <p className="poster pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs text-[#08080A] shadow-lg sm:top-14" role="status">
          🏁 ธงตาหมากรุก
        </p>
      )}
      {r?.neutral && (
        <p className="poster pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full bg-[#facc15] px-3 py-1 text-xs text-[#08080A] shadow-lg sm:top-14" role="status">
          {r.neutral.kind === "sc" ? "SAFETY CAR" : "VIRTUAL SAFETY CAR"}
        </p>
      )}
      {spec && team && (rc || qc) && (
        // ป้ายชื่อแบบถ่ายทอดสด: อันดับ · หมายเลข · ชื่อ · ทีม · ยาง + แถวสถานะ (เรซ: ช่องห่าง/โหมด/แบต · ควอลิฟาย: รอบ/เวลา)
        <div className="pointer-events-none absolute left-2 top-12 z-10 max-w-[calc(100%-1rem)] overflow-hidden rounded-md bg-[#08080A]/80 shadow-lg backdrop-blur sm:top-2 sm:max-w-[48%]">
          <div className="flex items-stretch">
            <span className="poster flex w-9 items-center justify-center bg-white text-base text-[#08080A] tabular-nums">{place || "–"}</span>
            <span className="w-1.5" style={{ background: team.color }} />
            <span className="flex min-w-0 flex-col justify-center px-2 py-1">
              <span className="truncate text-[13px] font-bold">
                <span className="tabular-nums">#{spec.num}</span> {spec.name}
              </span>
              <span className="truncate text-[10px] text-white/60">{team.name}</span>
            </span>
            {rc?.pit || qc?.lane || qc?.status === "garage" ? <span className="poster flex items-center bg-white/15 px-2 text-[11px]">PIT</span> : null}
            {compound && (
              <span className="flex items-center px-2">
                <TyreDot c={compound} size={18} />
              </span>
            )}
          </div>
          {r && rc && <RaceLine r={r} id={focusId} cars={snap.cars} />}
          {q && qc && <QualiLine q={q} c={qc} />}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[60%] text-[9px] leading-tight text-white/55">
        {hasRealTrack(snap.circuit) && (
          <>
            <span className="hidden sm:inline">{TRACK_DATA_CREDIT}</span>
            <span className="sm:hidden">ผังสนาม: TUMFTM racetrack-database (LGPL-3.0)</span> ·{" "}
          </>
        )}ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </p>
      <OsmCredit className="bottom-2 right-2 z-10" />
    </div>
  );
}

/** แถวสถานะของรถที่ตามในเรซ: กำลังแซง/โดนแซง · ช่องห่างหน้า/หลัง · โหมดขับ · แบต · DRS */
function RaceLine({ r, id, cars }: { r: RaceState; id: number; cars: Snapshot["cars"] }) {
  const c = r.cars[id];
  const by = r.cars.find((o) => o.duel?.rival === id);
  const duel = c.duel ? `แซง #${cars[c.duel.rival].num}` : by ? `โดน #${cars[by.id].num} ขึ้นเทียบ` : null;
  return (
    <div className="flex items-center gap-2 border-t border-white/10 px-2 py-1 text-[10px] tabular-nums text-white/80">
      {duel ? <span className="poster rounded bg-(--color-f1) px-1.5 py-0.5 text-[10px] text-white">{duel}</span> : null}
      <span>หน้า {fmtGap(c.gapAhead)}</span>
      <span>หลัง {c.gapBehind === null ? "—" : c.gapBehind.toFixed(2)}</span>
      {c.mode !== "normal" && <span className={c.mode === "push" ? "text-[#fb923c]" : "text-[#86efac]"}>{MODE[c.mode].label}</span>}
      <span className="flex items-center gap-1">
        ERS
        <span className="h-1.5 w-8 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full bg-[#38bdf8]" style={{ width: `${Math.round(c.ers * 100)}%` }} />
        </span>
      </span>
      {c.drs && <span className="rounded bg-[#22c55e] px-1 font-bold text-[#08080A]">DRS</span>}
    </div>
  );
}

const QSTATUS: Record<QCar["status"], string> = { garage: "ในพิท", out: "รอบอุ่นยาง", push: "รอบเร่ง", in: "กลับพิท", eliminated: "ตกรอบ" };

/** แถวสถานะในควอลิฟาย: ทำอะไรอยู่ · เวลารอบที่กำลังวิ่ง + เซกเตอร์ (ม่วง = ดีสุดของช่วง · เขียว = ดีสุดของตัวเอง · เหลือง = ช้ากว่า) · เวลาดีสุด */
function QualiLine({ q, c }: { q: QualiState; c: QCar }) {
  const status = c.lane ? (c.lane.kind === "out" ? "ออกจากพิท" : "เข้าพิท") : QSTATUS[c.status];
  const run = c.status === "push" && c.lap ? q.t - c.lap.start : null;
  const sessionBest = [0, 1, 2].map((k) => Math.min(...q.cars.map((o) => o.bestSec[k] ?? Infinity)));
  const colour = (k: number, v: number) => (v <= sessionBest[k] + 1e-6 ? "#a855f7" : c.bestSec[k] === null || v <= c.bestSec[k]! + 1e-6 ? "#22c55e" : "#facc15");
  return (
    <div className="flex items-center gap-2 border-t border-white/10 px-2 py-1 text-[10px] tabular-nums text-white/80">
      <span className="font-bold">{status}</span>
      {run !== null && <span className="text-white">{fmtLap(run).replace(/\.\d{2}$/, "")}</span>}
      {run !== null &&
        c.shown.map((v, k) => <span key={k} className="h-1.5 w-4 rounded-full" style={{ background: v === null ? "rgba(255,255,255,0.18)" : colour(k, v) }} aria-label={`เซกเตอร์ ${k + 1}`} />)}
      <span className="text-white/60">ดีสุด {fmtLap(c.best)}</span>
    </div>
  );
}
