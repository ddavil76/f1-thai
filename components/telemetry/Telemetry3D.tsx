"use client";

import { useEffect, useRef, useState } from "react";
import { Mountain, Rotate3d, X } from "lucide-react";
import { whenVisible } from "@/lib/visible";
import { ELEVATION_EXAGGERATION, locationToTrack } from "@/lib/elevation";
import type { Trace } from "@/lib/telemetry";

export type Car3D = { code: string; colour: string; frac: number | null };

/**
 * สนาม 3D ของรอบที่เทียบ — เส้นทางและเนินจากตำแหน่งจริงของรถ (openf1 location)
 * เส้นกลางสนามระบายสีตาม colors (ใครเร็วกว่า/ความเร็ว) · รถสองคันตามตำแหน่งที่ชี้/ที่เล่นอยู่
 * สร้าง WebGL ไม่ได้ / ผู้ใช้ตั้งลดการเคลื่อนไหว → onFail() ให้ผู้เรียกกลับไปผัง 2D
 */
export default function Telemetry3D({
  trace,
  colors,
  cars,
  onFail,
}: {
  trace: Trace;
  /** สีของแต่ละจุดในรอบ (ยาวเท่า trace.t) */
  colors: string[];
  cars: Car3D[];
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const colorsRef = useRef(colors);
  const carsRef = useRef(cars);
  const onFailRef = useRef(onFail);
  const applyColors = useRef<(c: string[]) => void>(() => {});
  const placeCars = useRef<(c: Car3D[]) => void>(() => {});
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [hilly, setHilly] = useState(false);

  useEffect(() => {
    colorsRef.current = colors;
    applyColors.current(colors);
  }, [colors]);
  useEffect(() => {
    carsRef.current = cars;
    placeCars.current(cars);
  }, [cars]);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fail = () => onFailRef.current();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fail();
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return fail();
    if (!trace.x || !trace.y || !trace.z) return fail();
    const pts = locationToTrack(
      trace.x.map((x, i) => ({ x, y: trace.y![i], z: trace.z![i] })),
      10,
      ELEVATION_EXAGGERATION,
    );
    if (!pts) return fail();

    let disposed = false;
    let cleanup = () => {};
    const visible = whenVisible(el);

    (async () => {
      await visible.ready;
      if (disposed) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { buildTrack, buildGrid, fitDistance, glowTexture } = await import("@/lib/three-track");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x08080a, 14, 30);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      const VIEW_DIR = new THREE.Vector3(4.6, 6.2, 7.4).normalize();

      const grid = buildGrid(THREE);
      scene.add(grid.grid);
      const track = buildTrack(THREE, pts, { centerLine: false });
      scene.add(track.group);
      setHilly(track.height > 0.05);

      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      /* ---- เส้นกลางสนามระบายสีทีละจุด (vertex colors) ---- */
      const SEG = 600;
      const RADIAL = 6;
      const tube = keep(new THREE.TubeGeometry(track.curve, SEG, 0.075, RADIAL, true));
      const colAttr = new THREE.Float32BufferAttribute(new Float32Array(tube.attributes.position.count * 3), 3);
      tube.setAttribute("color", colAttr);
      scene.add(new THREE.Mesh(tube, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))));
      const c = new THREE.Color();
      const n = trace.t.length;
      applyColors.current = (list) => {
        // TubeGeometry เรียง vertex เป็นวงตามแนวสนาม: วงที่ j มี RADIAL+1 จุด ที่ตำแหน่ง u = j/SEG
        for (let j = 0; j <= SEG; j++) {
          c.set(list[Math.round((j / SEG) * (n - 1))] ?? "#888888");
          for (let r = 0; r <= RADIAL; r++) colAttr.setXYZ(j * (RADIAL + 1) + r, c.r, c.g, c.b);
        }
        colAttr.needsUpdate = true;
      };
      applyColors.current(colorsRef.current);

      /* ---- รถสองคัน: ลูกกลม + วงแสง + ป้ายรหัส ---- */
      const carGeo = keep(new THREE.SphereGeometry(0.13, 16, 12));
      const carObjs = [0, 1].map((k) => {
        const g = new THREE.Group();
        const mat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
        g.add(new THREE.Mesh(carGeo, mat));
        const haloTex = keep(glowTexture(THREE, "rgba(255,255,255,0.55)"));
        const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
          map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
        })));
        halo.scale.setScalar(0.9);
        g.add(halo);
        const cv = document.createElement("canvas");
        cv.width = 128;
        cv.height = 56;
        const labelTex = keep(new THREE.CanvasTexture(cv));
        const label = new THREE.Sprite(keep(new THREE.SpriteMaterial({
          map: labelTex, depthWrite: false, transparent: true, sizeAttenuation: false,
        })));
        label.scale.set(0.075, 0.033, 1);
        label.position.y = 0.2;
        // ป้ายคันที่สองซ้อนขึ้นไปหนึ่งป้าย — เลื่อนด้วย center (หน่วยเป็นขนาดป้ายบนจอ)
        // จึงไม่ทับกันแม้รถอยู่ติดกัน ไม่ว่ากล้องจะอยู่ใกล้หรือไกล
        label.center.set(0.5, k === 0 ? -0.15 : -1.3);
        g.add(label);
        g.visible = false;
        scene.add(g);
        return { g, mat, halo, cv, labelTex, code: "" };
      });
      placeCars.current = (list) => {
        list.forEach((car, k) => {
          const o = carObjs[k];
          if (!o) return;
          if (car.frac == null) {
            o.g.visible = false;
            return;
          }
          o.g.visible = true;
          const p = track.curve.getPointAt(Math.max(0, Math.min(0.9999, car.frac)));
          o.g.position.set(p.x, p.y + 0.12, p.z);
          o.mat.color.set(car.colour);
          (o.halo.material as InstanceType<typeof THREE.SpriteMaterial>).color.set(car.colour);
          if (o.code !== car.code + car.colour) {
            o.code = car.code + car.colour;
            const x = o.cv.getContext("2d")!;
            x.clearRect(0, 0, 128, 56);
            x.font = "bold 40px system-ui, sans-serif";
            x.textAlign = "center";
            x.textBaseline = "middle";
            x.lineWidth = 8;
            x.strokeStyle = "rgba(8,8,10,0.9)";
            x.strokeText(car.code, 64, 30);
            x.fillStyle = car.colour;
            x.fillText(car.code, 64, 30);
            o.labelTex.needsUpdate = true;
          }
        });
      };
      placeCars.current(carsRef.current);

      /* ---- กล้อง + การหมุน (แตะก่อนถึงหมุนได้ ไม่งั้นนิ้วที่ปัดผ่านเลื่อนหน้าไม่ได้) ---- */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.44;
      controls.autoRotateSpeed = 0.5;
      const setInteractive = (on: boolean) => {
        controls.enabled = on;
        controls.autoRotate = !on;
        renderer.domElement.style.touchAction = on ? "none" : "pan-y";
        renderer.domElement.style.cursor = on ? "grab" : "pointer";
        setActive(on);
      };
      setActiveRef.current = setInteractive;
      setInteractive(false);
      const onTap = () => {
        if (!controls.enabled) setInteractive(true);
      };
      renderer.domElement.addEventListener("click", onTap);

      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const dist = fitDistance(track.radius, camera.fov, camera.aspect);
        if (!controls.enabled) camera.position.copy(VIEW_DIR).multiplyScalar(dist);
        controls.target.set(0, track.height / 2, 0);
        controls.minDistance = dist * 0.4;
        controls.maxDistance = dist * 1.6;
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const tick = () => {
        controls.update();
        renderer.render(scene, camera);
      };
      let onScreen = true;
      const sync = () => renderer.setAnimationLoop(onScreen && document.visibilityState === "visible" ? tick : null);
      const io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        sync();
      });
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
        applyColors.current = () => {};
        placeCars.current = () => {};
        controls.dispose();
        track.dispose();
        grid.dispose();
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
  }, [trace]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#0b0b0e] sm:aspect-[16/9]">
      <div ref={host} className="absolute inset-0" role="img" aria-label="สนาม 3 มิติ ระบายสีตามการเทียบ" />
      {!ready && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-white/40">กำลังสร้างสนาม 3D…</span>
      )}
      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/70">3D</span>
        {hilly && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
            <Mountain className="h-3 w-3" /> เนินจริง ×{ELEVATION_EXAGGERATION}
          </span>
        )}
      </span>
      {ready &&
        (active ? (
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
        ))}
    </div>
  );
}
