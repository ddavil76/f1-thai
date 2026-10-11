"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import OsmCredit from "@/components/OsmCredit";
import { TyreDot, teamOf } from "@/components/pitwall/ui";
import { useDriveTrack } from "@/components/pitwall/driver/driveTrack";
import type { CameraMode, DriveScene } from "@/components/pitwall/driver/scene";
import { pitLane } from "@/lib/pitwall/drive/pit";
import { hasRealTrack, TRACK_DATA_CREDIT } from "@/lib/pitwall/drive/tracks";
import { sample } from "@/lib/pitwall/drive/line";
import { standings } from "@/lib/pitwall/race";
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

/** เป้าของรถหนึ่งคัน (ข้อมูลล่าสุดจากการจำลอง) · pos = ช่องสะสม · pitStart = ตำแหน่งตอนเข้าพิท (ไม่อยู่ในพิท = null) */
type Target = { pos: number; pitStart: number | null; side: number; hide: boolean; tyre: string; started: boolean };
type Anim = { from: number; to: number; t0: number; dur: number };

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
  // รถที่ตาม: คันที่เลือก · ยังไม่เลือก/ออกจากการแข่ง/เข้าเส้นชัยแล้ว (หายจากสนาม) = คันที่ยังวิ่งอยู่อันดับดีสุด
  const order = r ? standings(r, track.lapCells) : [];
  const onTrack = (id: number) => !!r && !r.cars[id]?.out && r.cars[id]?.finished === null;
  const focusId = focus !== null && (!r || onTrack(focus)) ? focus : (order.find((c) => onTrack(c.id))?.id ?? focus ?? 0);
  const targets = useRef<Target[]>([]);
  const anims = useRef(new Map<number, Anim>());
  const shown = useRef(new Map<number, number>());
  const view = useRef({ focus: focusId, interval });

  // ข้อมูลใหม่: ตั้งให้รถวิ่งจากตำแหน่งที่เห็นอยู่ไปตำแหน่งใหม่ภายในช่วงเวลาก่อนข้อมูลชุดถัดไป
  useLayoutEffect(() => {
    view.current = { focus: focusId, interval };
    if (!r) return;
    const now = performance.now();
    targets.current = r.cars.map((c) => ({
      pos: c.pos,
      pitStart: c.pit ? c.pit.start : null,
      side: c.side,
      hide: !!c.out || c.finished !== null,
      tyre: COMPOUND_INFO[c.compound].color,
      started: r.started,
    }));
    for (const c of r.cars) {
      const a = anims.current.get(c.id);
      const cur = a ? a.from + (a.to - a.from) * Math.min(1, (now - a.t0) / a.dur) : shown.current.get(c.id);
      if (cur === undefined || c.pos < cur - 0.01 || c.pos - cur > 4) {
        anims.current.delete(c.id);
        shown.current.set(c.id, c.pos);
      } else anims.current.set(c.id, { from: cur, to: c.pos, t0: now, dur: interval * 1.15 });
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
          const a = anims.current.get(id);
          const pos = a ? a.from + (a.to - a.from) * Math.min(1, (now - a.t0) / a.dur) : (shown.current.get(id) ?? c.pos);
          shown.current.set(id, pos);
          const team = snap.cars[id]?.team ?? 0;
          if (c.pitStart !== null) return { ...map.pitPose(c.pitStart, (pos - c.pitStart) / track.pitCells, team), pit: true };
          return { s: map.sOf(pos), lat: NaN, pit: false };
        });
        const rivals = tg.map((c, id) => {
          const p = poses[id];
          let lat = p.lat;
          if (!p.pit) {
            // ตามเส้นแข่ง · วิ่งคู่/ต่อท้ายใกล้ ๆ = แยกฝั่งตามการจำลอง · บนกริดเยื้องสลับฝั่ง
            const line = sample(dt, dt.lineOffset, p.s);
            const close = !c.started || poses.some((q, k) => k !== id && !q.pit && !tg[k].hide && Math.abs(q.s - p.s) < SIDE_NEAR);
            const want = line + (close ? c.side * (c.started ? SIDE_LAT : 2.2) : 0);
            const edge = c.side > 0 ? sample(dt, dt.wr, p.s) - 1.3 : -sample(dt, dt.wl, p.s) + 1.3;
            lat = c.side > 0 ? Math.min(edge, want) : Math.max(edge, want);
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
          return { s: st.s, lateral: st.lat, speed: st.v, aero: 0, tyre: c.tyre, hide: c.hide };
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

  const rc = r?.cars[focusId];
  const spec = snap.cars[focusId];
  const team = spec ? teamOf(spec) : null;
  const place = order.findIndex((c) => c.id === focusId) + 1;

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
      {spec && team && rc && (
        // ป้ายชื่อแบบถ่ายทอดสด: อันดับ · หมายเลข · ชื่อ · ทีม · ยาง
        <div className="pointer-events-none absolute left-2 top-12 z-10 flex max-w-[calc(100%-1rem)] items-stretch sm:top-2 sm:max-w-[48%] overflow-hidden rounded-md bg-[#08080A]/80 shadow-lg backdrop-blur">
          <span className="poster flex w-9 items-center justify-center bg-white text-base text-[#08080A] tabular-nums">{place || "–"}</span>
          <span className="w-1.5" style={{ background: team.color }} />
          <span className="flex min-w-0 flex-col justify-center px-2 py-1">
            <span className="truncate text-[13px] font-bold">
              <span className="tabular-nums">#{spec.num}</span> {spec.name}
            </span>
            <span className="truncate text-[10px] text-white/60">{team.name}</span>
          </span>
          {rc.pit ? <span className="poster flex items-center bg-white/15 px-2 text-[11px]">PIT</span> : null}
          <span className="flex items-center px-2">
            <TyreDot c={rc.compound} size={18} />
          </span>
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
