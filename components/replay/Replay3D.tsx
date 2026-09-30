"use client";

import { useEffect, useRef, useState } from "react";
import { whenVisible } from "@/lib/visible";
import { Rotate3d, X } from "lucide-react";
import type { TrackPath } from "@/lib/circuits";
import { dotsAt, type ReplayDriver, type ReplayFrame } from "@/lib/replay";
import { trackGroundPoints } from "@/lib/track3d";
import { fogColor, isNightCircuit, skyBackground, useSceneStyle } from "@/lib/three-style";
import type { CircuitMeshes } from "@/lib/three-circuit";
import SceneStyleToggle from "../SceneStyleToggle";
import OsmCredit from "../OsmCredit";

/**
 * รีเพลย์บนสนาม 3D — ตำแหน่งเดียวกับผัง 2D (dotsAt) พร้อมรหัสนักขับ
 * · แบบสมจริง: รถ F1 สีทีม (ไม่มีลาย/โลโก้จริง) บนสนามที่แต่งแล้ว · แบบเรียบ: จุดสีทีม
 * · มุม "ภาพรวม": แตะเพื่อหมุน/ซูมเหมือนผังสนาม 3D
 * · มุม "ตามรถ": กล้องไล่หลังนักขับที่เลือก
 * สร้าง WebGL ไม่ได้ → onFail() ให้ผู้เรียกสลับกลับไป 2D
 */
export default function Replay3D({
  track,
  frames,
  drivers,
  timeRef,
  circuitId,
  follow,
  onFollow,
  onFail,
}: {
  track: TrackPath;
  /** เบอร์รถที่กล้องตามอยู่ (null = ภาพรวม) — ผู้เรียกถือค่าไว้ ใช้ต่อกับปุ่มเทียบรอบ */
  follow: number | null;
  onFollow: (num: number | null) => void;
  /** สนามไนต์เรซ → ฉากกลางคืน */
  circuitId?: string;
  frames: ReplayFrame[];
  drivers: Record<number, ReplayDriver>;
  timeRef: React.RefObject<number>;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const followRef = useRef<number | null>(null);
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [active, setActive] = useState(false);
  const style = useSceneStyle();
  const real = style === "real";
  const night = isNightCircuit(circuitId);
  const [osmOn, setOsmOn] = useState(false);
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

    // สร้างฉากเมื่อมองเห็นจริงเท่านั้น (แท็บที่ยังไม่เปิด / ยังเลื่อนไม่ถึง → ยังไม่โหลดอะไร)
    const visible = whenVisible(el);

    (async () => {
      await visible.ready;
      if (disposed) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { buildTrack, buildGrid, fitDistance } = await import("@/lib/three-track");
      const { chase, chaseRig, release } = await import("@/lib/three-chase");
      const kit = real
        ? {
            ...(await import("three/addons/utils/BufferGeometryUtils.js")),
            ...(await import("@/lib/three-circuit")),
            ...(await import("@/lib/three-car")),
            ...(await import("@/lib/osm-scene")),
          }
        : null;
      // ฉากรอบสนามจริง (OSM) ถ้ามี — ผังรีเพลย์ผูกกับแผนที่อยู่แล้ว วางซ้อนได้ตรง
      const osm = kit ? await kit.loadOsmScene(circuitId) : null;
      if (disposed) return;
      setOsmOn(!!osm);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.fog = real ? new THREE.Fog(fogColor(night), 24, 70) : new THREE.Fog(0x08080a, 16, 34);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 150);
      const VIEW_DIR = new THREE.Vector3(3.5, real ? 5 : 6.8, 7.2).normalize();

      const grid = real ? null : buildGrid(THREE);
      if (grid) scene.add(grid.grid);
      const ground = trackGroundPoints(track).map(([x, z]) => [x, 0, z] as [number, number, number]);
      const t3 = kit ? kit.buildCircuit(THREE, kit.mergeGeometries, ground, { night, osm }) : buildTrack(THREE, ground);
      scene.add(t3.group);

      /* ---- รถ: รถ F1 สีทีม (สมจริง) หรือลูกกลมสีทีม (เรียบ) + ป้ายรหัส ---- */
      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
      const carGeo = keep(new THREE.SphereGeometry(0.1, 14, 10));
      const factory = kit ? keep(kit.carFactory(THREE, kit.mergeGeometries)) : null;
      const shadow = kit ? keep(kit.carShadow(THREE)) : null;
      const cars = new Map<number, {
        obj: InstanceType<typeof THREE.Group>;
        body: InstanceType<typeof THREE.Object3D>;
        fade(a: number): void;
        label: InstanceType<typeof THREE.SpriteMaterial>;
        lane: number;
      }>();
      for (const d of Object.values(drivers)) {
        const g = new THREE.Group();
        let body: InstanceType<typeof THREE.Object3D>;
        let fade: (a: number) => void;
        if (factory && shadow) {
          const c = factory.make(d.colour);
          c.obj.add(shadow.mesh());
          body = c.obj;
          fade = c.setOpacity;
        } else {
          const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(d.colour), transparent: true }));
          body = new THREE.Mesh(carGeo, mat);
          fade = (a) => (mat.opacity = a);
        }
        g.add(body);
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
        s.position.y = real ? 0.22 : 0.3;
        g.add(s);
        scene.add(g);
        // แบบสมจริงแยกเลนตามเบอร์รถ — คันที่ตำแหน่งใกล้กันไม่ซ้อนทับเป็นคันเดียว
        cars.set(d.num, { obj: g, body, fade, label, lane: real ? (((d.num * 7) % 5) - 2) * 0.035 : 0 });
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
      const lookNow = new THREE.Vector3();
      const rig = chaseRig(THREE);
      let last: number | null = null;
      const tick = (time: number) => {
        // ค่อย ๆ เลื่อนกล้องด้วยอัตราเดียวกันไม่ว่าเครื่องจะได้กี่เฟรม/วินาที
        const dt = last === null ? 1 / 60 : Math.min(0.2, (time - last) / 1000);
        last = time;
        const ease = (a: number) => 1 - Math.pow(1 - a, dt * 60);
        const dots = dotsAt(frames, timeRef.current ?? 0);
        let followed: { u: number; num: number } | null = null;
        const following = followRef.current !== null;
        // มองจากไกล รถตามสเกลจริงเล็กจนมองไม่เห็น → ขยายตามระยะกล้อง (ตอนตามรถใช้ขนาดจริง)
        const zoom = following ? 1 : Math.min(1.9, Math.max(1, camera.position.distanceTo(controls.target) / 7));
        for (const d of dots) {
          const car = cars.get(d.num);
          if (!car) continue;
          const u = ((d.frac % 1) + 1) % 1;
          if (kit) {
            kit.placeCar(t3 as CircuitMeshes, car.obj, u, car.lane);
            car.body.scale.setScalar(zoom);
          } else {
            const p = t3.curve.getPointAt(u);
            car.obj.position.set(p.x, 0.1, p.z);
          }
          const alpha = d.out ? 0.25 : 1;
          car.fade(alpha);
          car.label.opacity = alpha;
          if (d.num === followRef.current) followed = { u, num: d.num };
        }

        if (followed) {
          // กล้องไล่หลังรถ: ถอยตามทิศวิ่ง สูงขึ้นนิดหน่อย มองไปข้างหน้า
          const car = cars.get(followed.num)!;
          chase(rig, camera, lookNow, car.obj.position, t3.curve.getTangentAt(followed.u), dt, followed.num,
            kit
              ? // สมจริง: กล้องต่ำ ใกล้ ๆ แบบกล้องถ่ายทอดสดตามหลังรถ
                { back: 1.15, up: 0.42, ahead: 1.4 }
              : // สูงพอจะมองข้ามรถคันที่ตามอยู่ข้างหลัง (อยู่ระหว่างกล้องกับรถที่เลือก)
                { back: 3.6, up: 2.5, ahead: 1.5 });
        } else if (!controls.enabled && camera.position.distanceTo(controls.target) < overview * 0.7) {
          // เพิ่งเลิกตามรถ → ถอยกลับไปมุมภาพรวมนุ่ม ๆ
          release(rig);
          want.copy(VIEW_DIR).multiplyScalar(overview);
          camera.position.lerp(want, ease(0.06));
          lookNow.lerp(controls.target, ease(0.1));
          camera.lookAt(lookNow);
        } else {
          release(rig);
          lookNow.copy(controls.target);
          controls.update();
        }
        renderer.render(scene, camera);
      };

      let onScreen = true;
      const sync = () => {
        last = null;
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
        grid?.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        // คืน WebGL context ทันที ไม่รอ GC — Safari บน iPhone จำกัดจำนวน context ที่เปิดค้างได้เข้มกว่า
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      if (disposed) cleanup();
    })().catch(() => onFailRef.current());

    return () => {
      disposed = true;
      visible.cancel();
      cleanup();
    };
  }, [track, frames, drivers, timeRef, real, night, circuitId]);

  const list = Object.values(drivers).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <figure
      className="card relative aspect-[4/3] w-full overflow-hidden p-0 sm:aspect-[5/2]"
      style={real ? { background: skyBackground(night) } : undefined}
    >
      <div ref={host} className="absolute inset-0" role="img" aria-label="รีเพลย์บนผังสนาม 3 มิติ" />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/80">3D</span>
        <SceneStyleToggle value={style} />
        <label className="sr-only" htmlFor="replay-follow">มุมกล้อง</label>
        <select
          id="replay-follow"
          value={follow ?? ""}
          onChange={(e) => onFollow(e.target.value ? Number(e.target.value) : null)}
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
      {real && osmOn && <OsmCredit className="bottom-3 left-3" />}
    </figure>
  );
}
