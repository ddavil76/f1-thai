"use client";

import { useEffect, useRef, useState } from "react";
import { whenVisible } from "@/lib/visible";
import Link from "next/link";
import { ArrowRight, Rotate3d, X } from "lucide-react";

export type GlobeRace = {
  round: string;
  name: string;
  flag: string;
  /** วันแข่ง (เวลาไทย) ที่จัดรูปไว้แล้วจากฝั่ง server */
  dateText: string;
  lat: number;
  lng: number;
  status: "done" | "next" | "future";
  winner?: { name: string; color: string };
};

/** lat/lng → จุดบนทรงกลมรัศมี r (แกน y ชี้ขั้วโลกเหนือ) */
function toVec(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

/**
 * ลูกโลกปฏิทินทั้งฤดูกาล — จุดแผ่นดิน, หมุดทุกสนาม, เส้นโค้งเชื่อมสนามตามลำดับ
 * · หมุด: จบแล้ว = สีทีมผู้ชนะ · ถัดไป = แดงกะพริบ · ยังไม่แข่ง = ขาวจาง
 * · แตะหมุด → การ์ดสนาม + ลิงก์ · แตะที่อื่น → หมุน/ซูมได้ (ก่อนแตะเลื่อนหน้าได้ปกติ)
 * · ไม่มี WebGL / ลดการเคลื่อนไหว → ซ่อนไปเลย (รายการสนามด้านล่างมีข้อมูลครบอยู่แล้ว)
 */
export default function SeasonGlobe({ races }: { races: GlobeRace[] }) {
  const host = useRef<HTMLDivElement>(null);
  const setActiveRef = useRef<(on: boolean) => void>(() => {});
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<GlobeRace | null>(
    () => races.find((r) => r.status === "next") ?? null,
  );
  const key = races.map((r) => `${r.round}:${r.status}:${r.winner?.color ?? ""}`).join("|");
  const racesRef = useRef(races);
  useEffect(() => {
    racesRef.current = races;
  }, [races]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const probe = document.createElement("canvas");
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (!probe.getContext("webgl2") && !probe.getContext("webgl"))
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- รู้ได้ฝั่ง client เท่านั้น
      setState("off");
      return;
    }
    const list = racesRef.current;

    let disposed = false;
    let cleanup = () => {};

    // สร้างฉากเมื่อมองเห็นจริงเท่านั้น (แท็บที่ยังไม่เปิด / ยังเลื่อนไม่ถึง → ยังไม่โหลดอะไร)
    const visible = whenVisible(el);

    (async () => {
      await visible.ready;
      if (disposed) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { LAND_DOTS } = await import("@/lib/globe-land");
      const { glowTexture } = await import("@/lib/three-track");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      /* ---- ตัวโลก + ขอบเรืองแสง ---- */
      const globe = new THREE.Mesh(
        keep(new THREE.SphereGeometry(1, 64, 48)),
        keep(new THREE.MeshBasicMaterial({ color: 0x0d0d12 })),
      );
      scene.add(globe);
      const rim = new THREE.Mesh(
        keep(new THREE.SphereGeometry(1.06, 64, 48)),
        keep(new THREE.MeshBasicMaterial({
          color: 0xe10600, transparent: true, opacity: 0.08, side: THREE.BackSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })),
      );
      scene.add(rim);

      /* ---- จุดแผ่นดิน ---- */
      const landPos: number[] = [];
      for (let i = 0; i < LAND_DOTS.length; i += 2) landPos.push(...toVec(LAND_DOTS[i], LAND_DOTS[i + 1], 1.002));
      const landGeo = keep(new THREE.BufferGeometry());
      landGeo.setAttribute("position", new THREE.Float32BufferAttribute(landPos, 3));
      scene.add(new THREE.Points(landGeo, keep(new THREE.PointsMaterial({ color: 0x4a4a58, size: 0.018 }))));

      /* ---- เส้นโค้งเชื่อมสนามตามลำดับ (great circle ยกสูงตามระยะ) ---- */
      const arcMatDone = keep(new THREE.LineBasicMaterial({ color: 0xe10600, transparent: true, opacity: 0.55 }));
      const arcMatNext = keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
      for (let i = 1; i < list.length; i++) {
        const a = new THREE.Vector3(...toVec(list[i - 1].lat, list[i - 1].lng, 1));
        const b = new THREE.Vector3(...toVec(list[i].lat, list[i].lng, 1));
        const angle = a.angleTo(b);
        if (angle < 1e-3) continue;
        const pts: InstanceType<typeof THREE.Vector3>[] = [];
        for (let k = 0; k <= 48; k++) {
          const t = k / 48;
          // slerp บนทรงกลม แล้วยกขึ้นกลางเส้น
          const v = a.clone().multiplyScalar(Math.sin((1 - t) * angle)).add(b.clone().multiplyScalar(Math.sin(t * angle)));
          v.divideScalar(Math.sin(angle)).multiplyScalar(1 + Math.sin(Math.PI * t) * angle * 0.12);
          pts.push(v);
        }
        const done = list[i].status === "done";
        scene.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(pts)), done ? arcMatDone : arcMatNext));
      }

      /* ---- หมุด ---- */
      const pinGeo = keep(new THREE.SphereGeometry(0.018, 12, 8));
      const hitGeo = keep(new THREE.SphereGeometry(0.06, 8, 6)); // ใหญ่กว่าตัวหมุด ให้นิ้วแตะโดนง่าย
      const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
      const hits: InstanceType<typeof THREE.Mesh>[] = [];
      let nextHalo: InstanceType<typeof THREE.Sprite> | null = null;
      for (const r of list) {
        const color = r.status === "done" ? r.winner?.color ?? "#e10600" : r.status === "next" ? "#e10600" : "#ffffff";
        const pin = new THREE.Mesh(pinGeo, keep(new THREE.MeshBasicMaterial({
          color, transparent: r.status === "future", opacity: r.status === "future" ? 0.6 : 1,
        })));
        const pos = toVec(r.lat, r.lng, 1.012);
        pin.position.set(...pos);
        scene.add(pin);
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.set(...pos);
        hit.userData.round = r.round;
        scene.add(hit);
        hits.push(hit);
        if (r.status === "next") {
          nextHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
            map: keep(glowTexture(THREE)), blending: THREE.AdditiveBlending, depthWrite: false,
          })));
          nextHalo.position.set(...toVec(r.lat, r.lng, 1.02));
          scene.add(nextHalo);
        }
      }

      /* ---- กล้อง: เริ่มหันหาสนามถัดไป ---- */
      const focus = list.find((r) => r.status === "next") ?? list.at(-1);
      const DIST = 4.3; // โลกกินราว 3/4 ของกรอบ เห็นขอบฟ้ากับเส้นโค้งครบ
      const start: [number, number, number] = focus ? toVec(focus.lat + 12, focus.lng, DIST) : [0, 1, DIST];
      camera.position.set(...start);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 1.9;
      controls.maxDistance = 6;
      controls.rotateSpeed = 0.6;
      controls.autoRotateSpeed = 0.35;
      const setInteractive = (on: boolean) => {
        controls.enabled = on;
        controls.autoRotate = !on;
        renderer.domElement.style.touchAction = on ? "none" : "pan-y";
        setActive(on);
      };
      setActiveRef.current = setInteractive;
      setInteractive(false);

      /* ---- แตะ: โดนหมุด (ที่อยู่ด้านหน้าโลก) → เลือกสนาม · ไม่โดน → เริ่มหมุน ---- */
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let downAt: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        // ลากหมุน ≠ แตะ
        if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const globeHit = ray.intersectObject(globe)[0]?.distance ?? Infinity;
        const hit = ray.intersectObjects(hits)[0];
        if (hit && hit.distance < globeHit + 0.02) {
          setPicked(racesRef.current.find((r) => r.round === hit.object.userData.round) ?? null);
        } else if (!controls.enabled) {
          setInteractive(true);
        }
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      const resize = () => {
        const { clientWidth: w, clientHeight: h } = el;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const tick = (time: number) => {
        if (nextHalo) nextHalo.scale.setScalar(0.16 + Math.sin(time / 300) * 0.04);
        controls.update();
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
      setState("ready");

      cleanup = () => {
        renderer.setAnimationLoop(null);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", sync);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        // คืน WebGL context ทันที ไม่รอ GC — Safari บน iPhone จำกัดจำนวน context ที่เปิดค้างได้เข้มกว่า
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      if (disposed) cleanup();
    })().catch(() => setState("off"));

    return () => {
      disposed = true;
      visible.cancel();
      cleanup();
    };
  }, [key]);

  if (state === "off") return null;

  return (
    <section className="card relative aspect-square w-full overflow-hidden p-0 sm:aspect-[16/9]">
      <div ref={host} className="absolute inset-0" role="img" aria-label="ลูกโลกแสดงสนามทั้งฤดูกาล" />
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />}
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
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
          <Rotate3d className="h-3.5 w-3.5" /> แตะหมุดหรือหมุนโลก
        </span>
      )}

      {picked && (
        <Link
          href={`/race/${picked.round}`}
          className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 backdrop-blur transition hover:bg-black/80"
        >
          <span className="text-2xl leading-none">{picked.flag}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              <span className="text-white/45">R{picked.round} · </span>
              {picked.name}
            </span>
            <span className="flex items-center gap-1.5 truncate text-xs text-white/60">
              {picked.dateText}
              {picked.status === "next" && <span className="font-semibold text-(--color-f1)">· สนามถัดไป</span>}
              {picked.winner && (
                <>
                  <span>·</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: picked.winner.color }} />
                  {picked.winner.name}
                </>
              )}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/50" />
        </Link>
      )}
    </section>
  );
}
