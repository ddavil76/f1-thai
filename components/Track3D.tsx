"use client";

import { useEffect, useRef, useState } from "react";
import { Rotate3d, X } from "lucide-react";
import type { Material } from "three";

/**
 * ผังสนามแบบ 3D — เส้นสนามเรืองแสงบนพื้นมืด หมุน/ซูมได้ มีจุดแสงวิ่งรอบสนาม
 *
 * · แสดงผัง 2D (children) ไปก่อน three.js (~150 KB) โหลดแยก chunk เฉพาะตอนมาถึงหน้านี้
 *   พร้อมเมื่อไหร่ค่อยวาง 3D ทับ — ไม่มี WebGL หรือผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ก็คง 2D ไว้
 * · ต้องแตะก่อนถึงจะหมุนได้ ไม่งั้นนิ้วที่ปัดผ่านสนามจะเลื่อนหน้าไม่ได้ (มือถือ)
 * · หยุดวาดตอนเลื่อนพ้นจอหรือสลับแอป กันกินแบต
 * · ข้อมูลผังไม่มีเนินสนาม — พื้นจึงแบนราบตามจริงที่มี ไม่แต่งความสูงขึ้นเอง
 */
export default function Track3D({
  points,
  name,
  children,
}: {
  /** จุดบนพื้น [x, z] จาก trackGroundPoints() */
  points: [number, number][];
  name: string;
  /** ผัง 2D — แสดงระหว่างโหลดและเป็นตัวสำรอง */
  children: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || points.length < 3) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // ไม่มี WebGL (เครื่องเก่า/ปิดไว้) → คง 2D
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x08080a, 14, 30);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      // มุมทแยงเอียงลง ~40° — เห็นทั้งรูปสนามและความลึก (ระยะคำนวณใน resize ให้พอดีกรอบ)
      const VIEW_DIR = new THREE.Vector3(4.6, 6.2, 7.4).normalize();
      const radius = Math.max(...points.map(([x, z]) => Math.hypot(x, z)));

      /* ---- เส้นสนาม ---- */
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        true,
        "centripetal",
      );
      const N = 700;
      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      // พื้นแอสฟัลต์: ริบบิ้นกว้างตามเส้น (สร้างเองจาก tangent เพื่อให้แบนราบกับพื้น)
      const half = 0.24;
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const p = curve.getPointAt(u % 1);
        const t = curve.getTangentAt(u % 1);
        const nx = -t.z;
        const nz = t.x;
        const len = Math.hypot(nx, nz) || 1;
        pos.push(p.x + (nx / len) * half, 0, p.z + (nz / len) * half);
        pos.push(p.x - (nx / len) * half, 0, p.z - (nz / len) * half);
        if (i < N) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const ribbon = keep(new THREE.BufferGeometry());
      ribbon.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      ribbon.setIndex(idx);
      scene.add(new THREE.Mesh(ribbon, keep(new THREE.MeshBasicMaterial({ color: 0x1d1d24, side: THREE.DoubleSide }))));

      // เส้นกลางสีแดง + ชั้นเรืองแสงบาง ๆ รอบนอก
      const line = keep(new THREE.TubeGeometry(curve, N, 0.045, 6, true));
      const red = new THREE.Color("#e10600");
      scene.add(new THREE.Mesh(line, keep(new THREE.MeshBasicMaterial({ color: red }))));
      const glowGeo = keep(new THREE.TubeGeometry(curve, N, 0.15, 8, true));
      scene.add(
        new THREE.Mesh(
          glowGeo,
          keep(new THREE.MeshBasicMaterial({
            color: red, transparent: true, opacity: 0.16,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })),
        ),
      );

      /* ---- พื้น grid จาง ๆ ให้รู้สึกถึงมุมมอง ---- */
      const grid = new THREE.GridHelper(40, 40, 0x3a1212, 0x1c1012);
      grid.position.y = -0.02;
      (grid.material as Material).transparent = true;
      (grid.material as Material).opacity = 0.7;
      keep(grid.geometry);
      keep(grid.material as Material);
      scene.add(grid);

      /* ---- เส้นสตาร์ท: แผ่นตาหมากรุกขวางสนาม ---- */
      const checker = document.createElement("canvas");
      checker.width = 8;
      checker.height = 2;
      const cx = checker.getContext("2d")!;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
        cx.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        cx.fillRect(x, y, 1, 1);
      }
      const checkerTex = keep(new THREE.CanvasTexture(checker));
      checkerTex.magFilter = THREE.NearestFilter;
      const start = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(half * 2.2, 0.14)),
        keep(new THREE.MeshBasicMaterial({ map: checkerTex, side: THREE.DoubleSide })),
      );
      const p0 = curve.getPointAt(0);
      const t0 = curve.getTangentAt(0);
      start.position.set(p0.x, 0.01, p0.z);
      start.rotation.x = -Math.PI / 2;
      start.rotation.z = -Math.atan2(t0.z, t0.x) + Math.PI / 2;
      scene.add(start);

      /* ---- จุดแสงวิ่งรอบสนาม ---- */
      const car = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.08, 16, 12)),
        keep(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      );
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 64;
      const gx = glowCanvas.getContext("2d")!;
      const grad = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,80,60,0.8)");
      grad.addColorStop(1, "rgba(225,6,0,0)");
      gx.fillStyle = grad;
      gx.fillRect(0, 0, 64, 64);
      const halo = new THREE.Sprite(
        keep(new THREE.SpriteMaterial({
          map: keep(new THREE.CanvasTexture(glowCanvas)),
          blending: THREE.AdditiveBlending, depthWrite: false,
        })),
      );
      halo.scale.setScalar(0.9);
      car.add(halo);
      scene.add(car);

      /* ---- กล้อง + การหมุน ---- */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;

      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.44; // ไม่ให้มุดลงใต้พื้น
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.7;
      controls.enabled = false;

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

      /* ---- ขนาด + วาดเฉพาะตอนมองเห็น ---- */
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.fov = 38;
        camera.updateProjectionMatrix();
        // ถอยกล้องจนวงกลมที่ครอบสนามพอดีด้านที่แคบกว่าของกรอบ (สนามกว้างอย่าง Las Vegas ไม่ล้น)
        const vHalf = (camera.fov * Math.PI) / 360;
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        // 0.88: กล้องเอียง ความลึกของสนามจึงดูสั้นกว่าวงกลมที่ครอบ เผื่อเท่านี้ก็ไม่ล้น
        const dist = (radius * 0.88) / Math.sin(Math.min(vHalf, hHalf));
        if (!controls.enabled) camera.position.copy(VIEW_DIR).multiplyScalar(dist);
        controls.minDistance = dist * 0.45;
        controls.maxDistance = dist * 1.6;
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
        lap = (lap + dt / LAP_S) % 1;
        const p = curve.getPointAt(lap);
        car.position.set(p.x, 0.09, p.z);
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
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      // โหลด three ไม่ได้ / สร้าง context ไม่ได้ → อยู่กับ 2D ต่อไป
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [points]);

  return (
    // flow-root: กัน mt-5 ของผัง 2D ทะลุออกนอกกล่อง ไม่งั้นชั้น 3D (top-5) วางเลื่อนลงมา
    <div className="relative flow-root">
      {children}
      {/* ทับเฉพาะกรอบผัง (ผัง 2D มี mt-5) — ยังไม่พร้อมก็โปร่งใสและไม่รับการแตะ */}
      <div
        className={`absolute inset-x-0 bottom-0 top-5 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0e] transition-opacity duration-500 ${
          ready ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!ready}
      >
        <div ref={host} className="absolute inset-0" role="img" aria-label={`ผังสนาม 3 มิติ ${name}`} />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/70">
          3D
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
        <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 text-xs font-medium text-white/85">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-f1)" />
          {name}
        </span>
      </div>
    </div>
  );
}
