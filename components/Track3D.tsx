"use client";

import { useEffect, useRef, useState } from "react";
import { whenVisible } from "@/lib/visible";
import { Mountain, Rotate3d, X } from "lucide-react";
import { ELEVATION_EXAGGERATION } from "@/lib/elevation";
import { fogColor, isNightCircuit, REAL_EXAGGERATION, skyBackground, useSceneStyle } from "@/lib/three-style";
import type { CircuitMeshes } from "@/lib/three-circuit";
import SceneStyleToggle from "./SceneStyleToggle";

/** รถสาธิตในแบบสมจริง — สีทั่วไป ไม่ใช่ลายทีมจริง */
const DEMO_CARS = [
  { colour: "#e10600", lane: 0 },
  { colour: "#c3c7cf", lane: 0.05 },
  { colour: "#1f5fd6", lane: -0.05 },
];

/**
 * ผังสนามแบบ 3D หมุน/ซูมได้ สองแบบ (ผู้ใช้เลือก จำไว้ในเครื่อง):
 * · สมจริง: แอสฟัลต์ kerb บ่อกรวด อัฒจันทร์ ต้นไม้ ท้องฟ้า (กลางคืนสำหรับสนามไนต์เรซ) + รถ F1 สามคันวิ่ง
 *   ชะลอเข้าโค้ง เร่งบนทางตรง
 * · เรียบ: เส้นสนามเรืองแสงบนพื้นมืด มีจุดแสงวิ่งรอบสนาม
 *
 * · แสดงผัง 2D (children) ไปก่อน three.js (~190 KB) โหลดแยก chunk เฉพาะตอนมาถึงหน้านี้
 *   พร้อมเมื่อไหร่ค่อยวาง 3D ทับ — ไม่มี WebGL หรือผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ก็คง 2D ไว้
 * · เริ่มจากสนามแบน (ผังที่มี) แล้วค่อยดึงเนินจริงจาก openf1 เบื้องหลัง ได้เมื่อไหร่สลับให้
 *   (สนามใหม่ที่ไม่เคยจัด / openf1 ล่ม → อยู่แบบแบนต่อไป)
 * · ต้องแตะก่อนถึงจะหมุนได้ ไม่งั้นนิ้วที่ปัดผ่านสนามจะเลื่อนหน้าไม่ได้ (มือถือ)
 * · หยุดวาดตอนเลื่อนพ้นจอหรือสลับแอป กันกินแบต
 */
export default function Track3D({
  points,
  name,
  circuitId,
  elevation,
  children,
}: {
  /** จุดบนพื้น [x, z] จาก trackGroundPoints() */
  points: [number, number][];
  name: string;
  /** สนามไนต์เรซ → ท้องฟ้ากลางคืนในแบบสมจริง */
  circuitId?: string;
  /** ข้อมูลสำหรับหาเนินจริง — ไม่ส่ง = แบนตลอด */
  elevation?: { circuitId: string; season: number; country: string; locality: string };
  /** ผัง 2D — แสดงระหว่างโหลดและเป็นตัวสำรอง */
  children: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [hilly, setHilly] = useState(false);
  const style = useSceneStyle();
  const real = style === "real";
  const night = isNightCircuit(circuitId);
  // string แทน object — กัน effect รันซ้ำทุก render
  const elevKey = elevation
    ? [elevation.circuitId, elevation.season, elevation.country, elevation.locality].join("|")
    : "";

  useEffect(() => {
    const el = host.current;
    if (!el || points.length < 3) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // ไม่มี WebGL (เครื่องเก่า/ปิดไว้) → คง 2D
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return;
    const [circuitId, season, country, locality] = elevKey.split("|");

    let disposed = false;
    let cleanup = () => {};

    // สร้างฉากเมื่อมองเห็นจริงเท่านั้น (แท็บที่ยังไม่เปิด / ยังเลื่อนไม่ถึง → ยังไม่โหลดอะไร)
    const visible = whenVisible(el);

    (async () => {
      await visible.ready;
      if (disposed) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { buildTrack, buildGrid, fitDistance, glowTexture } = await import("@/lib/three-track");
      const kit = real
        ? {
            ...(await import("three/addons/utils/BufferGeometryUtils.js")),
            ...(await import("@/lib/three-circuit")),
            ...(await import("@/lib/three-car")),
          }
        : null;
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.fog = real ? new THREE.Fog(fogColor(night), 20, 60) : new THREE.Fog(0x08080a, 14, 30);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
      // มุมทแยงเอียงลง ~40° — เห็นทั้งรูปสนามและความลึก
      // แบบสมจริงกดมุมต่ำลงหน่อย ให้เห็นขอบฟ้า/ท้องฟ้าด้านบน
      const VIEW_DIR = new THREE.Vector3(4.6, real ? 4.4 : 6.2, 7.4).normalize();

      const grid = real ? null : buildGrid(THREE);
      if (grid) scene.add(grid.grid);

      const make = (pts: [number, number, number][]) =>
        kit ? kit.buildCircuit(THREE, kit.mergeGeometries, pts, { night }) : buildTrack(THREE, pts);
      let track = make(points.map(([x, z]) => [x, 0, z]));
      scene.add(track.group);

      /* ---- แบบเรียบ: จุดแสงวิ่งรอบสนาม ---- */
      const carGeo = new THREE.SphereGeometry(0.08, 16, 12);
      const carMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const car = new THREE.Mesh(carGeo, carMat);
      const haloTex = glowTexture(THREE);
      const haloMat = new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(0.9);
      car.add(halo);
      if (!kit) scene.add(car);

      /* ---- แบบสมจริง: รถ F1 สามคัน ---- */
      const factory = kit ? kit.carFactory(THREE, kit.mergeGeometries) : null;
      const shadow = kit ? kit.carShadow(THREE) : null;
      const demo = factory && shadow
        ? DEMO_CARS.map((d, k) => {
            const c = factory.make(d.colour);
            c.obj.add(shadow.mesh());
            scene.add(c.obj);
            return { ...d, obj: c.obj, u: -k * 0.012 };
          })
        : [];

      /* ---- กล้อง + การหมุน ---- */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.44; // ไม่ให้มุดลงใต้พื้น
      controls.autoRotateSpeed = 0.7;

      // ยังไม่แตะ = ให้นิ้วเลื่อนหน้าได้ตามปกติ (OrbitControls ตั้ง touch-action:none ให้เอง ต้องทับ)
      const setInteractive = (on: boolean) => {
        controls.enabled = on;
        controls.autoRotate = !on;
        renderer.domElement.style.touchAction = on ? "none" : "pan-y";
        renderer.domElement.style.cursor = on ? "grab" : "pointer";
        setActive(on);
      };
      setActiveRef.current = setInteractive;
      setInteractive(false);
      const onTap = () => { if (!controls.enabled) setInteractive(true); };
      renderer.domElement.addEventListener("click", onTap);

      /* ---- ขนาด: ถอยกล้องจนสนามพอดีกรอบ (สนามกว้างอย่าง Las Vegas ไม่ล้น) ---- */
      const fit = () => {
        const dist = fitDistance(track.radius, camera.fov, camera.aspect);
        if (!controls.enabled) camera.position.copy(VIEW_DIR).multiplyScalar(dist);
        if (real && scene.fog instanceof THREE.Fog) {
          scene.fog.near = dist * 1.6;
          scene.fog.far = dist * 4.5;
        }
        controls.target.set(0, track.height / 2, 0);
        controls.minDistance = dist * 0.45;
        controls.maxDistance = dist * 1.6;
      };
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        fit();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const LAP_S = 16;
      let lap = 0;
      let last: number | null = null;
      const tick = (time: number) => {
        const dt = last === null ? 0 : Math.min((time - last) / 1000, 0.1);
        last = time;
        if (kit) {
          // ความเร็วตามช่วงสนาม: ทางตรงเต็มที่ โค้งแคบเหลือ ~45% — ทั้งรอบราว LAP_S วินาที
          const c = track as CircuitMeshes;
          const len = c.curve.getLength();
          const zoom = Math.min(1.9, Math.max(1, camera.position.length() / 7));
          for (const d of demo) {
            const v = (len / LAP_S) * 1.35 * (1 - 0.55 * c.cornerAt(((d.u % 1) + 1) % 1));
            d.u = (d.u + (v * dt) / len) % 1;
            kit.placeCar(c, d.obj, d.u, d.lane);
            // มองจากไกล (ภาพรวม) รถจริงตามสเกลเล็กจนมองไม่เห็น → ขยายขึ้นตามระยะกล้อง
            d.obj.scale.setScalar(zoom);
          }
        } else {
          lap = (lap + dt / LAP_S) % 1;
          const p = track.curve.getPointAt(lap);
          car.position.set(p.x, p.y + 0.09, p.z);
        }
        controls.update();
        renderer.render(scene, camera);
      };

      let onScreen = true;
      const sync = () => {
        const run = onScreen && document.visibilityState === "visible";
        last = null; // ทิ้งช่วงที่หยุดไป ไม่ให้จุดกระโดด
        renderer.setAnimationLoop(run ? tick : null);
      };
      const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
      io.observe(el);
      document.addEventListener("visibilitychange", sync);
      sync();
      setReady(true);

      cleanup = () => {
        renderer.setAnimationLoop(null);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", sync);
        renderer.domElement.removeEventListener("click", onTap);
        controls.dispose();
        track.dispose();
        grid?.dispose();
        factory?.dispose();
        shadow?.dispose();
        [carGeo, carMat, haloTex, haloMat].forEach((d) => d.dispose());
        renderer.dispose();
        // คืน WebGL context ทันที ไม่รอ GC — Safari บน iPhone จำกัดจำนวน context ที่เปิดค้างได้เข้มกว่า
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };

      /* ---- เนินจริงจาก openf1 (เบื้องหลัง) ---- */
      if (circuitId) {
        const { getTrackElevation } = await import("@/lib/elevation");
        const pts = await getTrackElevation(circuitId, Number(season), country, locality);
        if (!disposed && pts) {
          scene.remove(track.group);
          track.dispose();
          // แคชเก็บความสูงที่ขยาย ×5 — แบบสมจริงลดเหลือ ×2 (มีรถวิ่ง ×5 ดูเหมือนไต่เขา)
          const k = real ? REAL_EXAGGERATION / ELEVATION_EXAGGERATION : 1;
          track = make(pts.map(([x, h, z]) => [x, h * k, z]));
          scene.add(track.group);
          fit();
          setHilly(true);
        }
      }
    })().catch(() => {
      // โหลด three ไม่ได้ / สร้าง context ไม่ได้ → อยู่กับ 2D ต่อไป
    });

    return () => {
      disposed = true;
      visible.cancel();
      cleanup();
    };
  }, [points, elevKey, real, night]);

  return (
    // flow-root: กัน mt-5 ของผัง 2D ทะลุออกนอกกล่อง ไม่งั้นชั้น 3D (top-5) วางเลื่อนลงมา
    <div className="relative flow-root">
      {children}
      {/* ทับเฉพาะกรอบผัง (ผัง 2D มี mt-5) — ยังไม่พร้อมก็โปร่งใสและไม่รับการแตะ */}
      <div
        className={`absolute inset-x-0 bottom-0 top-5 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0e] transition-opacity duration-500 ${
          ready ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={real ? { background: skyBackground(night) } : undefined}
        aria-hidden={!ready}
      >
        <div ref={host} className="absolute inset-0" role="img" aria-label={`ผังสนาม 3 มิติ ${name}`} />
        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/80">
            3D
          </span>
          <SceneStyleToggle value={style} />
          {hilly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/80">
              <Mountain className="h-3 w-3" /> เนินจริง ×{real ? REAL_EXAGGERATION : ELEVATION_EXAGGERATION}
            </span>
          )}
        </span>
        {active ? (
          <button
            type="button"
            onClick={() => setActiveRef.current(false)}
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
          >
            <X className="h-3.5 w-3.5" /> เสร็จ
          </button>
        ) : (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
            <Rotate3d className="h-3.5 w-3.5" /> แตะเพื่อหมุน
          </span>
        )}
        <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 text-xs font-medium text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-f1)" />
          {name}
        </span>
      </div>
    </div>
  );
}
