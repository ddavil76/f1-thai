"use client";

import { useEffect, useRef, useState } from "react";
import { Rotate3d, X } from "lucide-react";
import type { TrackPath } from "@/lib/circuits";
import { dotsAt, type ReplayDriver, type ReplayFrame } from "@/lib/replay";
import { trackGroundPoints } from "@/lib/track3d";

/**
 * รีเพลย์บนสนาม 3D — รถเป็นจุดสีทีมพร้อมรหัสนักขับ ตำแหน่งเดียวกับผัง 2D (dotsAt)
 * · มุม "ภาพรวม": แตะเพื่อหมุน/ซูมเหมือนผังสนาม 3D
 * · มุม "ตามรถ": กล้องไล่หลังนักขับที่เลือก
 * สร้าง WebGL ไม่ได้ → onFail() ให้ผู้เรียกสลับกลับไป 2D
 */
export default function Replay3D({
  track,
  frames,
  drivers,
  timeRef,
  onFail,
}: {
  track: TrackPath;
  frames: ReplayFrame[];
  drivers: Record<number, ReplayDriver>;
  timeRef: React.RefObject<number>;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const followRef = useRef<number | null>(null);
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [follow, setFollow] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    followRef.current = follow;
    // เลือกตามรถ = ปิดการหมุนเอง (กล้องคุมโดยโหมดตามรถ)
    if (follow !== null) setActiveRef.current(false);
  }, [follow]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { buildTrack, buildGrid, fitDistance } = await import("@/lib/three-track");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x08080a, 16, 34);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
      const VIEW_DIR = new THREE.Vector3(3.5, 6.8, 7.2).normalize();

      const grid = buildGrid(THREE);
      scene.add(grid.grid);
      const t3 = buildTrack(THREE, trackGroundPoints(track).map(([x, z]) => [x, 0, z]));
      scene.add(t3.group);

      /* ---- รถ: ลูกกลมสีทีม + ป้ายรหัส ---- */
      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
      const carGeo = keep(new THREE.SphereGeometry(0.1, 14, 10));
      const cars = new Map<number, { obj: InstanceType<typeof THREE.Group>; mat: InstanceType<typeof THREE.MeshBasicMaterial>; label: InstanceType<typeof THREE.SpriteMaterial> }>();
      for (const d of Object.values(drivers)) {
        const g = new THREE.Group();
        const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(d.colour), transparent: true }));
        g.add(new THREE.Mesh(carGeo, mat));
        // ป้ายรหัสนักขับ (canvas → sprite) ลอยเหนือรถ
        const c = document.createElement("canvas");
        c.width = 128;
        c.height = 56;
        const x = c.getContext("2d")!;
        x.font = "bold 40px system-ui, sans-serif";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.lineWidth = 8;
        x.strokeStyle = "rgba(8,8,10,0.9)";
        x.strokeText(d.code, 64, 30);
        x.fillStyle = "#fff";
        x.fillText(d.code, 64, 30);
        // sizeAttenuation:false = ขนาดบนจอคงที่ ไม่ใหญ่คับจอตอนกล้องตามรถเข้าใกล้
        const label = keep(new THREE.SpriteMaterial({
          map: keep(new THREE.CanvasTexture(c)), depthWrite: false, transparent: true, sizeAttenuation: false,
        }));
        const s = new THREE.Sprite(label);
        s.scale.set(0.075, 0.033, 1);
        s.position.y = 0.3;
        g.add(s);
        scene.add(g);
        cars.set(d.num, { obj: g, mat, label });
      }

      /* ---- กล้อง ---- */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.44;
      const setInteractive = (on: boolean) => {
        controls.enabled = on;
        renderer.domElement.style.touchAction = on ? "none" : "pan-y";
        setActive(on);
      };
      setActiveRef.current = setInteractive;
      setInteractive(false);
      const onTap = () => {
        if (followRef.current === null && !controls.enabled) setInteractive(true);
      };
      renderer.domElement.addEventListener("click", onTap);

      let overview = 10;
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        overview = fitDistance(t3.radius, camera.fov, camera.aspect);
        controls.minDistance = overview * 0.35;
        controls.maxDistance = overview * 1.6;
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      camera.position.copy(VIEW_DIR).multiplyScalar(overview);

      const want = new THREE.Vector3();
      const look = new THREE.Vector3();
      const lookNow = new THREE.Vector3();
      const tick = () => {
        const dots = dotsAt(frames, timeRef.current ?? 0);
        let followed: { u: number } | null = null;
        for (const d of dots) {
          const car = cars.get(d.num);
          if (!car) continue;
          const u = ((d.frac % 1) + 1) % 1;
          const p = t3.curve.getPointAt(u);
          car.obj.position.set(p.x, 0.1, p.z);
          const alpha = d.out ? 0.25 : 1;
          car.mat.opacity = alpha;
          car.label.opacity = alpha;
          if (d.num === followRef.current) followed = { u };
        }

        if (followed) {
          // กล้องไล่หลังรถ: ถอยตามทิศวิ่ง สูงขึ้นนิดหน่อย มองไปข้างหน้า
          const p = t3.curve.getPointAt(followed.u);
          const t = t3.curve.getTangentAt(followed.u);
          // สูงพอจะมองข้ามรถคันที่ตามอยู่ข้างหลัง (อยู่ระหว่างกล้องกับรถที่เลือก)
          want.set(p.x - t.x * 3.6, 2.6, p.z - t.z * 3.6);
          look.set(p.x + t.x * 1.5, 0.1, p.z + t.z * 1.5);
          camera.position.lerp(want, 0.08);
          lookNow.lerp(look, 0.12);
          camera.lookAt(lookNow);
        } else if (!controls.enabled && camera.position.distanceTo(controls.target) < overview * 0.7) {
          // เพิ่งเลิกตามรถ → ถอยกลับไปมุมภาพรวมนุ่ม ๆ
          want.copy(VIEW_DIR).multiplyScalar(overview);
          camera.position.lerp(want, 0.06);
          lookNow.lerp(controls.target, 0.1);
          camera.lookAt(lookNow);
        } else {
          lookNow.copy(controls.target);
          controls.update();
        }
        renderer.render(scene, camera);
      };

      let onScreen = true;
      const sync = () => {
        renderer.setAnimationLoop(onScreen && document.visibilityState === "visible" ? tick : null);
      };
      const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
      io.observe(el);
      document.addEventListener("visibilitychange", sync);
      sync();

      cleanup = () => {
        renderer.setAnimationLoop(null);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", sync);
        renderer.domElement.removeEventListener("click", onTap);
        controls.dispose();
        t3.dispose();
        grid.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
      if (disposed) cleanup();
    })().catch(() => onFailRef.current());

    return () => {
      disposed = true;
      cleanup();
    };
  }, [track, frames, drivers, timeRef]);

  const list = Object.values(drivers).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <figure className="card relative aspect-[4/3] w-full overflow-hidden p-0 sm:aspect-[5/2]">
      <div ref={host} className="absolute inset-0" role="img" aria-label="รีเพลย์บนผังสนาม 3 มิติ" />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/70">3D</span>
        <label className="sr-only" htmlFor="replay-follow">มุมกล้อง</label>
        <select
          id="replay-follow"
          value={follow ?? ""}
          onChange={(e) => setFollow(e.target.value ? Number(e.target.value) : null)}
          className="rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur"
        >
          <option value="">ภาพรวม</option>
          {list.map((d) => (
            <option key={d.num} value={d.num}>
              ตาม {d.code}
            </option>
          ))}
        </select>
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => setActiveRef.current(false)}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
        >
          <X className="h-3.5 w-3.5" /> เสร็จ
        </button>
      ) : (
        follow === null && (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
            <Rotate3d className="h-3.5 w-3.5" /> แตะเพื่อหมุน
          </span>
        )
      )}
    </figure>
  );
}
