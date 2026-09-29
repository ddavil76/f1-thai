"use client";

import { useEffect, useRef, useState } from "react";
import { Mountain, Rotate3d, X } from "lucide-react";
import { whenVisible } from "@/lib/visible";
import { ELEVATION_EXAGGERATION, locationToTrack } from "@/lib/elevation";
import type { Trace } from "@/lib/telemetry";
import { fogColor, isNightCircuit, REAL_EXAGGERATION, skyBackground, useSceneStyle } from "@/lib/three-style";
import type { CircuitMeshes } from "@/lib/three-circuit";
import SceneStyleToggle from "../SceneStyleToggle";

/** ค่าบนหน้าปัดของรถ ณ เวลาที่ชี้/ที่เล่นอยู่ */
export type CarHud = { speed: number; gear: number; throttle: number; brake: number };
export type Car3D = { code: string; colour: string; frac: number | null; hud?: CarHud | null };

/** เลนของรถสองคันในแบบสมจริง — วิ่งเส้นเดียวกัน เยื้องกันเล็กน้อยให้เห็นทั้งคู่ตอนตีคู่ */
const LANES = [-0.045, 0.045];

/**
 * สนาม 3D ของรอบที่เทียบ — เส้นทางและเนินจากตำแหน่งจริงของรถ (openf1 location)
 * เส้นทางวิ่งระบายสีตาม colors (ใครเร็วกว่า/ความเร็ว) · รถสองคันตามตำแหน่งที่ชี้/ที่เล่นอยู่
 * · แบบสมจริง: สนามแต่งแล้ว + รถ F1 สีทีม · แบบเรียบ: เส้นเรืองแสง + จุด
 * · กล้อง "ตามรถ": ไล่หลังคันที่เลือกแบบกล้องถ่ายทอดสด พร้อมหน้าปัด ความเร็ว/เกียร์/คันเร่ง/เบรก
 * สร้าง WebGL ไม่ได้ / ผู้ใช้ตั้งลดการเคลื่อนไหว → onFail() ให้ผู้เรียกกลับไปผัง 2D
 */
export default function Telemetry3D({
  trace,
  colors,
  cars,
  circuitId,
  onFail,
}: {
  trace: Trace;
  /** สีของแต่ละจุดในรอบ (ยาวเท่า trace.t) */
  colors: string[];
  cars: Car3D[];
  /** สนามไนต์เรซ → ฉากกลางคืน */
  circuitId?: string;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const colorsRef = useRef(colors);
  const carsRef = useRef(cars);
  const onFailRef = useRef(onFail);
  const applyColors = useRef<(c: string[]) => void>(() => {});
  const placeCars = useRef<(c: Car3D[]) => void>(() => {});
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const followRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [hilly, setHilly] = useState(false);
  const [follow, setFollow] = useState<number | null>(null);
  const style = useSceneStyle();
  const real = style === "real";
  const night = isNightCircuit(circuitId);

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
    followRef.current = follow;
    // ตามรถ = กล้องคุมเอง ปิดการหมุนด้วยนิ้ว · วางรถใหม่ (คันที่ยังไม่มีตำแหน่งไปรอที่เส้นสตาร์ท)
    if (follow !== null) setActiveRef.current(false);
    placeCars.current(carsRef.current);
  }, [follow]);

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
      real ? REAL_EXAGGERATION : ELEVATION_EXAGGERATION,
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
      const { chase, chaseRig, release } = await import("@/lib/three-chase");
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
      const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 150);
      const VIEW_DIR = new THREE.Vector3(4.6, real ? 4.6 : 6.2, 7.4).normalize();

      const grid = real ? null : buildGrid(THREE);
      if (grid) scene.add(grid.grid);
      const track = kit
        ? kit.buildCircuit(THREE, kit.mergeGeometries, pts, { night })
        : buildTrack(THREE, pts, { centerLine: false });
      scene.add(track.group);
      setHilly(track.height > 0.05);

      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      /* ---- เส้นทางวิ่งระบายสีทีละจุด (vertex colors) ---- */
      const SEG = 600;
      const c = new THREE.Color();
      const n = trace.t.length;
      const colourAt = (j: number, list: string[]) => c.set(list[Math.round((j / SEG) * (n - 1))] ?? "#888888");
      if (kit) {
        // สมจริง: แถบสีบาง ๆ ทาบบนผิวแทร็ก (เหมือนเส้นกราฟิกในการถ่ายทอดสด)
        const W = 0.035;
        const pos: number[] = [];
        const idx: number[] = [];
        for (let j = 0; j <= SEG; j++) {
          const u = (j / SEG) % 1;
          const p = track.curve.getPointAt(u);
          const s = (track as CircuitMeshes).sideAt(u);
          pos.push(p.x + s.x * W, p.y + 0.012, p.z + s.z * W, p.x - s.x * W, p.y + 0.012, p.z - s.z * W);
          if (j < SEG) idx.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
        }
        const line = keep(new THREE.BufferGeometry());
        line.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        line.setIndex(idx);
        const colAttr = new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3);
        line.setAttribute("color", colAttr);
        scene.add(new THREE.Mesh(line, keep(new THREE.MeshBasicMaterial({
          vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
        }))));
        applyColors.current = (list) => {
          for (let j = 0; j <= SEG; j++) {
            colourAt(j, list);
            colAttr.setXYZ(j * 2, c.r, c.g, c.b);
            colAttr.setXYZ(j * 2 + 1, c.r, c.g, c.b);
          }
          colAttr.needsUpdate = true;
        };
      } else {
        const RADIAL = 6;
        const tube = keep(new THREE.TubeGeometry(track.curve, SEG, 0.075, RADIAL, true));
        const colAttr = new THREE.Float32BufferAttribute(new Float32Array(tube.attributes.position.count * 3), 3);
        tube.setAttribute("color", colAttr);
        scene.add(new THREE.Mesh(tube, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))));
        applyColors.current = (list) => {
          // TubeGeometry เรียง vertex เป็นวงตามแนวสนาม: วงที่ j มี RADIAL+1 จุด ที่ตำแหน่ง u = j/SEG
          for (let j = 0; j <= SEG; j++) {
            colourAt(j, list);
            for (let r = 0; r <= RADIAL; r++) colAttr.setXYZ(j * (RADIAL + 1) + r, c.r, c.g, c.b);
          }
          colAttr.needsUpdate = true;
        };
      }
      applyColors.current(colorsRef.current);

      /* ---- รถสองคัน: รถ F1 (สมจริง) หรือลูกกลม + วงแสง (เรียบ) + ป้ายรหัส ---- */
      const factory = kit ? keep(kit.carFactory(THREE, kit.mergeGeometries)) : null;
      const shadow = kit ? keep(kit.carShadow(THREE)) : null;
      const carGeo = keep(new THREE.SphereGeometry(0.13, 16, 12));
      const carObjs = [0, 1].map((k) => {
        const g = new THREE.Group();
        let paint: (hex: string) => void;
        let body: InstanceType<typeof THREE.Object3D>;
        if (factory && shadow) {
          const car = factory.make("#ffffff");
          car.obj.add(shadow.mesh());
          body = car.obj;
          g.add(body);
          paint = (hex) => car.body.color.set(hex);
        } else {
          const mat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
          body = new THREE.Mesh(carGeo, mat);
          g.add(body);
          const haloTex = keep(glowTexture(THREE, "rgba(255,255,255,0.55)"));
          const haloMat = keep(new THREE.SpriteMaterial({
            map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
          }));
          const halo = new THREE.Sprite(haloMat);
          halo.scale.setScalar(0.9);
          g.add(halo);
          paint = (hex) => {
            mat.color.set(hex);
            haloMat.color.set(hex);
          };
        }
        const cv = document.createElement("canvas");
        cv.width = 128;
        cv.height = 56;
        const labelTex = keep(new THREE.CanvasTexture(cv));
        const label = new THREE.Sprite(keep(new THREE.SpriteMaterial({
          map: labelTex, depthWrite: false, transparent: true, sizeAttenuation: false,
        })));
        label.scale.set(0.075, 0.033, 1);
        label.position.y = kit ? 0.12 : 0.2;
        // ป้ายคันที่สองซ้อนขึ้นไปหนึ่งป้าย — เลื่อนด้วย center (หน่วยเป็นขนาดป้ายบนจอ)
        // จึงไม่ทับกันแม้รถอยู่ติดกัน ไม่ว่ากล้องจะอยู่ใกล้หรือไกล
        label.center.set(0.5, k === 0 ? -0.15 : -1.3);
        g.add(label);
        g.visible = false;
        scene.add(g);
        return { g, body, paint, label, cv, labelTex, code: "", u: 0 };
      });
      placeCars.current = (list) => {
        list.forEach((car, k) => {
          const o = carObjs[k];
          if (!o) return;
          // ยังไม่มีตำแหน่ง (ยังไม่เล่น/ไม่ได้ชี้) → ซ่อน ยกเว้นคันที่กล้องตามอยู่ ให้รอที่เส้นสตาร์ท
          const frac = car.frac ?? (followRef.current === k ? 0 : null);
          if (frac == null) {
            o.g.visible = false;
            return;
          }
          o.g.visible = true;
          o.u = Math.max(0, Math.min(0.9999, frac));
          if (kit) {
            kit.placeCar(track as CircuitMeshes, o.g, o.u, LANES[k]);
          } else {
            const p = track.curve.getPointAt(o.u);
            o.g.position.set(p.x, p.y + 0.12, p.z);
          }
          // ตอนตามรถ ป้ายของคันที่ตามอยู่บังหน้าจอ → ซ่อน
          o.label.visible = followRef.current !== k;
          if (o.code !== car.code + car.colour) {
            o.code = car.code + car.colour;
            o.paint(car.colour);
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
        overview = fitDistance(track.radius, camera.fov, camera.aspect);
        if (!controls.enabled && followRef.current === null) camera.position.copy(VIEW_DIR).multiplyScalar(overview);
        controls.target.set(0, track.height / 2, 0);
        controls.minDistance = overview * 0.4;
        controls.maxDistance = overview * 1.6;
        if (real && scene.fog instanceof THREE.Fog) {
          scene.fog.near = overview * 1.6;
          scene.fog.far = overview * 4.5;
        }
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const want = new THREE.Vector3();
      const lookNow = new THREE.Vector3().copy(controls.target);
      const rig = chaseRig(THREE);
      let last: number | null = null;
      const tick = (time: number) => {
        // ค่อย ๆ เลื่อนกล้องด้วยอัตราเดียวกันไม่ว่าเครื่องจะได้กี่เฟรม/วินาที
        const dt = last === null ? 1 / 60 : Math.min(0.2, (time - last) / 1000);
        last = time;
        const ease = (a: number) => 1 - Math.pow(1 - a, dt * 60);
        const f = followRef.current;
        const o = f === null ? null : carObjs[f];
        // รถตามสเกลจริงเล็กมากเมื่อมองจากไกล → ขยายตามระยะกล้อง (ตอนตามรถใช้ขนาดจริง)
        const zoom = o ? 1 : Math.min(1.9, Math.max(1, camera.position.distanceTo(controls.target) / 7));
        if (kit) for (const x of carObjs) x.body.scale.setScalar(zoom);

        if (o && o.g.visible) {
          // ไล่หลังต่ำ ๆ ใกล้ ๆ มองไปข้างหน้าเลยรถไปนิดหนึ่ง
          chase(rig, camera, lookNow, o.g.position, track.curve.getTangentAt(o.u), dt, f,
            // มองไปข้างหน้าไม่ไกล → รถอยู่กลางจอค่อนบน ไม่โดนหน้าปัดด้านล่างบัง
            kit ? { back: 1.1, up: 0.42, ahead: 0.7 } : { back: 1.6, up: 0.75, ahead: 0.7 });
        } else if (!controls.enabled && camera.position.distanceTo(controls.target) < overview * 0.7) {
          // เพิ่งเลิกตามรถ → ถอยกลับไปมุมภาพรวม
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
  }, [trace, real, night]);

  const followed = follow === null ? null : cars[follow];

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#0b0b0e] sm:aspect-[16/9]"
      style={real ? { background: skyBackground(night) } : undefined}
    >
      <div ref={host} className="absolute inset-0" role="img" aria-label="สนาม 3 มิติ ระบายสีตามการเทียบ" />
      {!ready && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-white/70">กำลังสร้างสนาม 3D…</span>
      )}
      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/80">3D</span>
        <SceneStyleToggle value={style} />
        {hilly && (
          <span className="hidden items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/80 sm:inline-flex">
            <Mountain className="h-3 w-3" /> เนินจริง ×{real ? REAL_EXAGGERATION : ELEVATION_EXAGGERATION}
          </span>
        )}
      </span>

      {/* มุมกล้อง */}
      {ready && (
        <div className="absolute right-3 top-3 flex rounded-full bg-black/55 p-0.5 text-[10px] font-semibold backdrop-blur" role="group" aria-label="มุมกล้อง">
          {[null, 0, 1].map((k) => {
            const on = follow === k;
            const car = k === null ? null : cars[k];
            return (
              <button
                key={k ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setFollow(k)}
                className={`rounded-full px-2 py-0.5 transition ${on ? "bg-white text-black" : "text-white/75 hover:text-white"}`}
              >
                {car ? `ตาม ${car.code}` : "ภาพรวม"}
              </button>
            );
          })}
        </div>
      )}

      {ready && followed && <Hud car={followed} />}

      {ready &&
        follow === null &&
        (active ? (
          <button
            type="button"
            onClick={() => setActiveRef.current(false)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
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

/** หน้าปัดของรถที่กล้องตามอยู่: ความเร็ว เกียร์ คันเร่ง เบรก */
function Hud({ car }: { car: Car3D }) {
  const h = car.hud;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex items-stretch gap-1.5 rounded-xl bg-black/65 px-2 py-1.5 text-white backdrop-blur sm:bottom-3 sm:left-3 sm:gap-2 sm:px-3 sm:py-2">
      <div className="flex flex-col justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold">
          <span className="h-2 w-2 rounded-full" style={{ background: car.colour }} />
          {car.code}
        </span>
        <span className="font-mono text-lg font-bold leading-none tabular-nums sm:text-2xl">
          {h ? Math.round(h.speed) : "–"}
          <span className="ml-0.5 text-[10px] font-semibold text-white/60">km/h</span>
        </span>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg bg-white/10 px-1.5 sm:px-2">
        <span className="text-[9px] text-white/55">เกียร์</span>
        <span className="font-mono text-base font-bold leading-none sm:text-xl">{h ? (h.gear > 0 ? h.gear : "N") : "–"}</span>
      </div>
      <div className="flex items-end gap-1">
        <Bar label="คันเร่ง" value={h ? h.throttle / 100 : 0} colour="#22c55e" />
        <Bar label="เบรก" value={h ? h.brake : 0} colour="#ef4444" />
      </div>
    </div>
  );
}

function Bar({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-6 w-2 overflow-hidden rounded-full bg-white/15 sm:h-9 sm:w-2.5">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{ height: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: colour }}
        />
      </div>
      <span className="text-[8px] text-white/55">{label}</span>
    </div>
  );
}
