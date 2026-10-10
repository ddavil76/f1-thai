/**
 * ฉาก 3D ของโหมดนักขับ (หน่วยเมตร)
 * — ถนนมีลายยางมะตอย เส้นยางดำ ขอบสนาม kerb ทราย กำแพง รั้วกันเศษ อัฒจันทร์ ต้นไม้ ป้ายนับระยะเบรก
 * — ท้องฟ้า + แสงอาทิตย์ + เงา (กราฟิกสูง) · สะท้อนแสงรอบตัวบนตัวรถ
 * — รถ: ตัวถัง (สร้างในโค้ด หรือโหลดไฟล์ .glb) + ล้อ 4 ล้อแยกชิ้น หมุนตามความเร็ว ล้อหน้าเลี้ยวตามโค้ง
 *   ตัวรถเอียงออกนอกโค้ง หัวทิ่มตอนเบรก ท้ายย่อตอนเร่ง ท้ายปัดตอนไถล
 * ผู้เรียกโหลด three และ addon แบบ dynamic แล้วส่งเข้ามา (ไม่ให้ three เข้า bundle หลักของหน้า)
 */
import type * as THREE_NS from "three";
import { DS, VMAX, heightAt, laneValue, poseAt, sample, surfaceAt, type DriveTrack, type Zone } from "@/lib/pitwall/drive/line";
import { guideColor, guideNeeded, guideRisk } from "@/lib/pitwall/drive/guide";
import { buildCar, type Livery } from "./carModel";

type Three = typeof THREE_NS;
type Obj = THREE_NS.Object3D;

export type CameraMode = "tv" | "chase";
export type Gfx = "high" | "low";

const ZONE_COLOR: Record<Zone, number> = { throttle: 0x22c55e, lift: 0xfacc15, brake: 0xef4444 };
/** ความกว้างของเส้นช่วย (เมตร) */
const LINE_W = 0.9;
/** รัศมีล้อ (เมตร) และตำแหน่งล้อ: [x, z, ความกว้างยาง, ล้อหน้า] */
const WHEEL_R = 0.36;
const WHEELS: [number, number, number, boolean][] = [
  [0.8, 1.8, 0.3, true],
  [-0.8, 1.8, 0.3, true],
  [0.76, -1.8, 0.4, false],
  [-0.76, -1.8, 0.4, false],
];
const WHEELBASE = 3.6;
/** ความยาวรถ (เมตร) */
export const CAR_LEN = 5.6;

/** ตัวสุ่มที่ได้ค่าเดิมทุกครั้ง (ต้นไม้/อัฒจันทร์ไม่ย้ายที่เมื่อเล่นซ้ำ) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export type GuideMode = "dynamic" | "corners" | "static";

/** ตัวถังจากไฟล์ .glb (ผ่าน normaliseBody แล้ว) · tint = ย้อมสีทีมทับ (โมเดลสีขาวกลาง) */
export type BodyModel = { scene: Obj; tint: boolean };

export type DriveScene = {
  /** aero: 0 = ปีกปกติ · 1 = Straight Mode (ปีกพับราบ) */
  update(p: {
    s: number;
    lateral: number;
    ghost: number | null;
    speed: number;
    accel: number;
    dt: number;
    aero?: number;
    /** รถคู่แข่ง (ลำดับเดียวกับ opts.rivals) · s = ระยะสะสม · lateral = ระยะเยื้องจากเส้นกลาง (ม.) */
    rivals?: { s: number; lateral: number; speed: number; aero: number }[];
    /** เส้นช่วยไดนามิก: เลนที่รถอยู่ (lat) · ตัวคูณการเกาะถนน (ทีม × อากาศเสีย) */
    guide?: { lat: number; grip: number };
  }): void;
  setCamera(m: CameraMode): void;
  setLine(on: boolean): void;
  /** แบบเส้นช่วย: dynamic = สีตามความเร็วตอนนี้ · corners = ไดนามิกเฉพาะช่วงโค้ง · static = สามสีตายตัว */
  setGuide(mode: GuideMode): void;
  /** เส้นช่วยของเลนไหน (−1 ซ้าย · 0 racing line · 1 ขวา) */
  setLane(lane: number): void;
  resize(): void;
  render(): void;
  dispose(): void;
};

export function createDriveScene(opts: {
  THREE: Three;
  addons: { Sky: new () => THREE_NS.Mesh; RoomEnvironment: new () => THREE_NS.Scene };
  merge: (g: THREE_NS.BufferGeometry[]) => THREE_NS.BufferGeometry | null;
  body: BodyModel | null;
  el: HTMLElement;
  track: DriveTrack;
  livery: Livery;
  gfx: Gfx;
  /** ลิเวอรีของรถคู่แข่ง (โหมดแข่ง) */
  rivals?: Livery[];
}): DriveScene {
  const { THREE, addons, merge, el, track: t, livery, gfx } = opts;
  const high = gfx === "high";
  const renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.75 : 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const scene = new THREE.Scene();
  const HAZE = 0xcfe0ee;
  scene.fog = new THREE.Fog(HAZE, 220, high ? 1400 : 700);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.25, 4000);

  // ท้องฟ้าแบบมีดวงอาทิตย์ + แสงสะท้อนรอบตัว (ให้ตัวรถเงาวาว)
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(140));
  const sky = new addons.Sky();
  sky.scale.setScalar(3500);
  const su = (sky.material as THREE_NS.ShaderMaterial).uniforms;
  su.turbidity.value = 4;
  su.rayleigh.value = 1.4;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = keep(new THREE.PMREMGenerator(renderer));
  const env = keep(pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture);
  scene.environment = env;
  // แสงสะท้อนรอบตัวไว้ให้ตัวรถเงา ไม่ให้พื้น/ฉากสว่างจ้า
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x55703f, 0.65));
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = high;
  if (high) {
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 50;
    sc.far = 400;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);
  scene.add(sun.target);

  /* ---------- พื้นผิว (วาดด้วย canvas ไม่ต้องโหลดรูป) ---------- */
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) => {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    draw(cv.getContext("2d")!);
    const tex = keep(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = high ? 8 : 2;
    return tex;
  };
  const r = rng(hash(t.circuitId));
  const asphalt = canvasTex(256, 256, (g) => {
    g.fillStyle = "#3d3e43";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${v},${v},${v + 3})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
  const grassTex = canvasTex(256, 256, (g) => {
    // ลายตัดหญ้าเป็นแถบ
    for (let y = 0; y < 256; y += 64) {
      g.fillStyle = y % 128 ? "#4f8a3a" : "#5a9842";
      g.fillRect(0, y, 256, 64);
    }
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(30,60,20,0.35)" : "rgba(140,190,90,0.25)";
      g.fillRect(r() * 256, r() * 256, 1, 2);
    }
  });

  /* ---------- ขอบเขตสนาม ---------- */
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) {
    minX = Math.min(minX, t.x[i]);
    maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]);
    maxZ = Math.max(maxZ, t.z[i]);
  }

  /**
   * แถบตามสนามระหว่างระยะเยื้อง a..b (เมตร) ที่ความสูง y · สีต่อช่วงจาก colorOf (null = ไม่วาดช่วงนั้น)
   * uv: u ข้ามถนน (0..1) · v ตามระยะ (1 หน่วย = vScale เมตร) ไว้ปูพื้นผิวซ้ำ
   */
  /** ความสูงพื้นที่จุด i เยื้อง lat (ถนนเอียงในโค้งเอียง · นอกขอบถนนไม่เอียงต่อ) */
  const groundY = (i: number, lat: number) =>
    t.bank[i] === 0 ? t.y[i] : t.y[i] + Math.max(-t.wl[i], Math.min(t.wr[i], lat)) * Math.tan(t.bank[i]);
  const R = (i: number) => t.wr[i];
  const L = (i: number) => t.wl[i];
  const RUN = t.runoff;
  /** กำแพงห่างจากเส้นกลาง (ฝั่ง side) */
  const wallAt = (i: number, side: number) => (side > 0 ? R(i) + RUN : -(L(i) + RUN));
  let maxEdge = 0;
  for (let i = 0; i < t.n; i++) maxEdge = Math.max(maxEdge, t.wl[i], t.wr[i]);
  maxEdge += RUN;
  const strip = (a: (i: number) => number, b: (i: number) => number, y: number, colorOf: (i: number) => number | null, vScale = 8) => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < t.n; i++) {
      const hex = colorOf(i);
      if (hex === null) continue;
      const j = i + 1;
      const p0a = poseAt(t, i * DS, a(i));
      const p0b = poseAt(t, i * DS, b(i));
      const p1a = poseAt(t, j * DS, a(j % t.n));
      const p1b = poseAt(t, j * DS, b(j % t.n));
      const jj = j % t.n;
      const y0a = y + groundY(i, a(i));
      const y0b = y + groundY(i, b(i));
      const y1a = y + groundY(jj, a(jj));
      const y1b = y + groundY(jj, b(jj));
      pos.push(p0a.x, y0a, p0a.z, p1a.x, y1a, p1a.z, p0b.x, y0b, p0b.z, p0b.x, y0b, p0b.z, p1a.x, y1a, p1a.z, p1b.x, y1b, p1b.z);
      const v0 = (i * DS) / vScale;
      const v1 = (j * DS) / vScale;
      uv.push(0, v0, 0, v1, 1, v0, 1, v0, 0, v1, 1, v1);
      c.setHex(hex);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const flat = (polygonOffset: number, opacity = 1) =>
    keep(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: polygonOffset,
        polygonOffsetUnits: polygonOffset,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
  const lit = (map?: THREE_NS.Texture) =>
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, map: map ?? null, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  const addFlat = (m: THREE_NS.Mesh) => {
    m.receiveShadow = high;
    scene.add(m);
    return m;
  };

  /* ---------- ถนนและขอบ (ความกว้างจริงต่อจุด) ---------- */
  const corner = (i: number) => Math.abs(t.curve[i]) > 0.006;
  addFlat(new THREE.Mesh(strip((i) => -L(i), R, 0, () => 0xffffff, 6), lit(asphalt)));
  // เส้นยางดำตามไลน์ที่รถวิ่ง
  addFlat(new THREE.Mesh(strip((i) => t.lineOffset[i] - 1.0, (i) => t.lineOffset[i] + 1.0, 0.004, () => 0x1c1c20), flat(-1, 0.18)));
  scene.add(new THREE.Mesh(strip((i) => R(i) - 0.45, (i) => R(i) - 0.2, 0.006, () => 0xf2f2f2), flat(-1)));
  scene.add(new THREE.Mesh(strip((i) => -L(i) + 0.2, (i) => -L(i) + 0.45, 0.006, () => 0xf2f2f2), flat(-1)));
  // kerb แดง/ขาวในโค้ง ทั้งสองฝั่ง · ทางวิ่งนอกถนน (runoff) สีทราย/หญ้าเทียม — สนามกำแพงชิด (โมนาโก) มีแค่ kerb แคบ ๆ
  const KW = Math.min(1.4, RUN - 0.1);
  const kerb = (i: number) => (corner(i) ? (i % 2 ? 0xd71920 : 0xf4f4f4) : null);
  addFlat(new THREE.Mesh(strip(R, (i) => R(i) + KW, 0.03, kerb), lit()));
  addFlat(new THREE.Mesh(strip((i) => -L(i) - KW, (i) => -L(i), 0.03, kerb), lit()));
  if (RUN > 2) {
    const VG = Math.min(9, RUN - 1);
    const SD = Math.min(12, RUN);
    addFlat(new THREE.Mesh(strip(R, (i) => R(i) + VG, 0.002, (i) => (corner(i) ? null : 0x5f6d59)), lit()));
    addFlat(new THREE.Mesh(strip((i) => -L(i) - VG, (i) => -L(i), 0.002, (i) => (corner(i) ? null : 0x5f6d59)), lit()));
    addFlat(new THREE.Mesh(strip((i) => R(i) + KW, (i) => R(i) + SD, 0.002, (i) => (corner(i) ? 0xcdb68d : null)), lit()));
    addFlat(new THREE.Mesh(strip((i) => -L(i) - SD, (i) => -L(i) - KW, 0.002, (i) => (corner(i) ? 0xcdb68d : null)), lit()));
  }

  // เส้นช่วยสามสีของแต่ละเลน (แสดงเฉพาะเลนที่รถอยู่) — เลนกลาง = racing line
  const lineMat = flat(-2, 0.9);
  const laneMeshes = t.lanes.map((ln) => {
    const m = new THREE.Mesh(strip((i) => ln.offset[i] - LINE_W / 2, (i) => ln.offset[i] + LINE_W / 2, 0.02, (i) => ZONE_COLOR[ln.zone[i]]), lineMat);
    scene.add(m);
    return m;
  });
  let lineOn = true;
  let laneShown = 1;
  let guideMode: GuideMode = "dynamic";
  const showLines = () => laneMeshes.forEach((m, k) => (m.visible = lineOn && guideMode === "static" && k === laneShown));
  showLines();

  // เส้นช่วยไดนามิก: ลูกศรบั้งข้างหน้ารถ สีคำนวณใหม่ทุกเฟรมจากความเร็วตอนนี้ (lib/pitwall/drive/guide.ts)
  const GUIDE_N = 64;
  const GUIDE_GAP = 3.4;
  const chevron = keep(new THREE.BufferGeometry());
  {
    // หัวลูกศรชี้ไปข้างหน้า (แกน x = หน้า · z = ขวา) ยาว ~1.7 ม. กว้าง 1.2 ม.
    const P = [[-0.8, -0.6], [0.2, -0.6], [0.9, 0], [-0.1, 0], [0.2, 0.6], [-0.8, 0.6]];
    const tri = [0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5];
    chevron.setAttribute("position", new THREE.Float32BufferAttribute(tri.flatMap((k) => [P[k][0], 0, P[k][1]]), 3));
  }
  const guideMesh = new THREE.InstancedMesh(
    chevron,
    keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
    GUIDE_N,
  );
  guideMesh.frustumCulled = false;
  guideMesh.count = 0;
  scene.add(guideMesh);
  const gMat = new THREE.Matrix4();
  const gFwd = new THREE.Vector3();
  const gRight = new THREE.Vector3();
  const gUp = new THREE.Vector3(0, 1, 0);
  const gCol = new THREE.Color();
  /** วางลูกศรข้างหน้า: มองไกลราว 2.3 วินาทีของความเร็ว (60–215 ม.) */
  const drawGuide = (s: number, speed: number, g: { lat: number; grip: number } | undefined) => {
    if (!g || !lineOn || guideMode === "static") {
      guideMesh.count = 0;
      return;
    }
    const reach = Math.max(60, Math.min(GUIDE_N * GUIDE_GAP, speed * 2.3));
    let n = 0;
    for (let d = 5; d <= reach && n < GUIDE_N; d += GUIDE_GAP) {
      const ss = s + d;
      const risk = guideRisk(t, ss, g.lat, speed, g.grip);
      if (guideMode === "corners" && !guideNeeded(t, ss, g.lat, risk)) continue;
      const off = laneValue(t, "offset", ss, g.lat);
      const p = poseAt(t, ss, off);
      gFwd.set(Math.cos(p.heading), 0, Math.sin(p.heading));
      gRight.set(-Math.sin(p.heading), 0, Math.cos(p.heading));
      gMat.makeBasis(gFwd, gUp, gRight).setPosition(p.x, surfaceAt(t, ss, off) + 0.04, p.z);
      guideMesh.setMatrixAt(n, gMat);
      guideMesh.setColorAt(n, gCol.setHex(guideColor(risk)));
      n++;
    }
    guideMesh.count = n;
    guideMesh.instanceMatrix.needsUpdate = true;
    if (guideMesh.instanceColor) guideMesh.instanceColor.needsUpdate = true;
  };

  // เส้นสตาร์ท/เส้นชัยลายตาหมากรุก
  {
    const tex = canvasTex(64, 8, (g) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }, false);
    tex.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(L(0) + R(0), 1.6)), keep(new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3 })));
    const p = poseAt(t, 0, (R(0) - L(0)) / 2);
    // แผ่นวางราบ ด้านกว้าง (แกน x) ขวางถนน: หมุนรอบแกนตั้ง -heading - 90°
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.y = -p.heading - Math.PI / 2;
    holder.position.set(p.x, t.y[0] + 0.03, p.z);
    holder.add(m);
    scene.add(holder);
  }

  /* ---------- กำแพง + รั้วกันเศษ ---------- */
  const wallStrip = (side: number, y0: number, y1: number, colorOf: (i: number) => [number, number, number], vScale = 4) => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const a = poseAt(t, i * DS, wallAt(i, side));
      const b = poseAt(t, (i + 1) * DS, wallAt(j, side));
      const ha = groundY(i, wallAt(i, side));
      const hb = groundY(j, wallAt(j, side));
      pos.push(a.x, ha + y0, a.z, b.x, hb + y0, b.z, a.x, ha + y1, a.z, a.x, ha + y1, a.z, b.x, hb + y0, b.z, b.x, hb + y1, b.z);
      const u0 = (i * DS) / vScale;
      const u1 = ((i + 1) * DS) / vScale;
      uv.push(u0, 0, u1, 0, u0, 1, u0, 1, u1, 0, u1, 1);
      const c = colorOf(i);
      for (let k = 0; k < 6; k++) col.push(...c);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const wallMat = lit();
  for (const side of [-1, 1]) {
    // แถบกำแพงสีสลับ (ไม่มีโลโก้)
    // กำแพงยื่นลงใต้ดิน (พื้นข้างสนามต่ำกว่าถนนเล็กน้อย จะได้ไม่เห็นช่องใต้กำแพง)
    const w = new THREE.Mesh(wallStrip(side, -1.4, 1.1, (i) => (Math.floor(i / 3) % 2 ? [0.86, 0.86, 0.88] : [0.13, 0.32, 0.72])), wallMat);
    w.castShadow = high;
    scene.add(w);
  }
  if (high) {
    const fence = canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = "rgba(60,64,70,0.9)";
      g.lineWidth = 2;
      for (let k = -64; k < 128; k += 12) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 64, 64);
        g.moveTo(k + 64, 0);
        g.lineTo(k, 64);
        g.stroke();
      }
      g.fillStyle = "rgba(40,40,44,1)";
      g.fillRect(0, 0, 3, 64);
    });
    const fenceMat = keep(new THREE.MeshBasicMaterial({ map: fence, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true }));
    for (const side of [-1, 1]) scene.add(new THREE.Mesh(wallStrip(side, 1.1, 4.2, () => [1, 1, 1], 3), fenceMat));
  }

  /* ---------- ป้ายนับระยะเบรก 150 / 100 / 50 ม. ---------- */
  {
    const boardTex = (label: string) =>
      canvasTex(64, 64, (g) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#111";
        g.font = "bold 30px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, 32, 34);
      }, false);
    const mats = Object.fromEntries(["150", "100", "50"].map((l) => [l, keep(new THREE.MeshLambertMaterial({ map: boardTex(l) }))]));
    const geo = keep(new THREE.BoxGeometry(1.4, 1.4, 0.12));
    for (let i = 0; i < t.n; i++) {
      const prev = (i - 1 + t.n) % t.n;
      if (t.zone[i] !== "brake" || t.zone[prev] !== "throttle") continue;
      for (const [d, label] of [[150, "150"], [100, "100"], [50, "50"]] as const) {
        for (const side of [-1, 1]) {
          const k = ((Math.round((i * DS - d) / DS) % t.n) + t.n) % t.n;
          const edge = side > 0 ? R(k) : L(k);
          // สนามกำแพงชิดถนน: ป้ายอยู่หลังกำแพง
          const off = side * (RUN > 4 ? edge + 3.5 : edge + RUN + 0.7);
          const p = poseAt(t, i * DS - d, off);
          const m = new THREE.Mesh(geo, mats[label]);
          m.position.set(p.x, surfaceAt(t, i * DS - d, off) + 1.2, p.z);
          // หันหน้าป้าย (แกน z) เข้าหารถที่วิ่งมา
          m.rotation.y = Math.atan2(-Math.cos(p.heading), -Math.sin(p.heading));
          m.castShadow = high;
          scene.add(m);
        }
      }
    }
  }

  /* ---------- จุดเริ่มโซน Straight Mode: เส้นขวางถนน + ป้ายสองข้าง ---------- */
  {
    const smTex = canvasTex(256, 96, (g) => {
      g.fillStyle = "#0b3d22";
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = "#4ade80";
      g.fillRect(0, 0, 256, 10);
      g.fillStyle = "#ffffff";
      g.font = "italic 900 34px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("STRAIGHT", 128, 40);
      g.fillText("MODE", 128, 74);
    }, false);
    const boardMat = keep(new THREE.MeshLambertMaterial({ map: smTex }));
    const boardGeo = keep(new THREE.BoxGeometry(2.4, 0.9, 0.1));
    const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0x4ade80, polygonOffset: true, polygonOffsetFactor: -3 }));
    for (let i = 0; i < t.n; i++) {
      if (t.smZone[i] !== 1 || t.smZone[(i - 1 + t.n) % t.n] === 1) continue;
      const p = poseAt(t, i * DS, (R(i) - L(i)) / 2);
      const ln = new THREE.Mesh(keep(new THREE.PlaneGeometry(L(i) + R(i), 0.5)), lineMat);
      ln.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.rotation.y = -p.heading - Math.PI / 2;
      holder.position.set(p.x, t.y[i] + 0.035, p.z);
      holder.add(ln);
      scene.add(holder);
      for (const side of [-1, 1]) {
        const off = side * ((side > 0 ? R(i) : L(i)) + Math.min(3, RUN));
        const q = poseAt(t, i * DS, off);
        const m = new THREE.Mesh(boardGeo, boardMat);
        m.position.set(q.x, surfaceAt(t, i * DS, off) + 1.4, q.z);
        m.rotation.y = Math.atan2(-Math.cos(q.heading), -Math.sin(q.heading));
        scene.add(m);
      }
    }
  }

  /* ---------- ฉากรอบสนาม: ต้นไม้ อัฒจันทร์ ---------- */
  // ตารางค้นหาจุดสนามใกล้ ๆ (กันวางของทับถนน)
  const CELL = 40;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < t.n; i += 2) {
    const k = `${Math.floor(t.x[i] / CELL)},${Math.floor(t.z[i] / CELL)}`;
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  const nearTrack = (x: number, z: number, d: number) => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const reach = Math.ceil(d / CELL);
    for (let a = -reach; a <= reach; a++)
      for (let b = -reach; b <= reach; b++) {
        for (const i of grid.get(`${cx + a},${cz + b}`) ?? []) if (Math.hypot(t.x[i] - x, t.z[i] - z) < d) return true;
      }
    return false;
  };

  /* ---------- พื้นดิน: ตามความสูงของสนาม + เนินไกล ๆ ---------- */
  // ตารางหยาบ: ช่องที่มีถนน = ความสูงถนน (ต่ำกว่านิด) · ช่องอื่นเกลี่ยจากรอบ ๆ ให้เป็นเนินต่อเนื่อง
  const MARGIN = 1500;
  const FC = 50;
  const fx0 = minX - MARGIN;
  const fz0 = minZ - MARGIN;
  const fw = Math.ceil((maxX - minX + 2 * MARGIN) / FC) + 1;
  const fh = Math.ceil((maxZ - minZ + 2 * MARGIN) / FC) + 1;
  const field = new Float32Array(fw * fh);
  const fixed = new Uint8Array(fw * fh);
  const dist = new Float32Array(fw * fh).fill(1e9);
  {
    const sum = new Float32Array(fw * fh);
    const cnt = new Uint16Array(fw * fh);
    let mean = 0;
    for (let i = 0; i < t.n; i++) {
      const k = Math.round((t.z[i] - fz0) / FC) * fw + Math.round((t.x[i] - fx0) / FC);
      // ทางที่ซ้อนกัน (สะพาน) ใช้ระดับล่าง
      sum[k] = cnt[k] ? Math.min(sum[k] / cnt[k], t.y[i]) * (cnt[k] + 1) : t.y[i];
      cnt[k]++;
      mean += t.y[i] / t.n;
    }
    for (let k = 0; k < fw * fh; k++) {
      if (cnt[k]) {
        field[k] = sum[k] / cnt[k] - 0.4;
        fixed[k] = 1;
        dist[k] = 0;
      } else field[k] = mean;
    }
    // ระยะห่างจากถนน (หน่วยช่อง) แบบไล่สองทิศ
    for (let pass = 0; pass < 2; pass++)
      for (let zz = 0; zz < fh; zz++)
        for (let xx = 0; xx < fw; xx++) {
          const X = pass ? fw - 1 - xx : xx;
          const Z = pass ? fh - 1 - zz : zz;
          const k = Z * fw + X;
          const d = pass ? 1 : -1;
          const nx = X - d;
          const nz = Z - d;
          if (nx >= 0 && nx < fw) dist[k] = Math.min(dist[k], dist[Z * fw + nx] + 1);
          if (nz >= 0 && nz < fh) dist[k] = Math.min(dist[k], dist[nz * fw + X] + 1);
        }
    const tmpF = new Float32Array(fw * fh);
    for (let it = 0; it < 160; it++) {
      for (let zz = 0; zz < fh; zz++)
        for (let xx = 0; xx < fw; xx++) {
          const k = zz * fw + xx;
          if (fixed[k]) {
            tmpF[k] = field[k];
            continue;
          }
          const l = field[zz * fw + Math.max(0, xx - 1)];
          const rr = field[zz * fw + Math.min(fw - 1, xx + 1)];
          const u = field[Math.max(0, zz - 1) * fw + xx];
          const dd = field[Math.min(fh - 1, zz + 1) * fw + xx];
          tmpF[k] = (l + rr + u + dd) / 4;
        }
      field.set(tmpF);
    }
  }
  const fieldAt = (arr: Float32Array, x: number, z: number) => {
    const gx = Math.max(0, Math.min(fw - 1.001, (x - fx0) / FC));
    const gz = Math.max(0, Math.min(fh - 1.001, (z - fz0) / FC));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const ax = gx - ix;
    const az = gz - iz;
    const k = iz * fw + ix;
    return (arr[k] * (1 - ax) + arr[k + 1] * ax) * (1 - az) + (arr[k + fw] * (1 - ax) + arr[k + fw + 1] * ax) * az;
  };
  const hillSeed = r() * 100;
  /** รัศมีที่พื้นต้องอิงระดับถนน (เมตร) · ความชันคันดินข้างสนามสูงสุด */
  const NEAR = 120;
  const SINK = 1.1;
  const BANK = 0.3;
  const SEG = high ? 24 : 40;
  const FLAT = Math.max(maxEdge + 6, SEG * 1.5);
  /** ความสูงพื้นดินที่ (x, z): ใกล้ถนน = ต่ำกว่าถนนเล็กน้อย · ไกลออกไปมีเนินเขาเพิ่มขึ้นเรื่อย ๆ */
  function terrainAt(x: number, z: number) {
    let h = fieldAt(field, x, z);
    const far = Math.min(1, Math.max(0, (fieldAt(dist, x, z) * FC - 120) / 600));
    h +=
      far *
      (16 * Math.sin(x / 210 + hillSeed) * Math.sin(z / 260 - hillSeed * 0.7) +
        7 * Math.sin(x / 90 - z / 120 + hillSeed * 1.3) +
        24 * far * Math.max(0, Math.sin(x / 520 + z / 610 + hillSeed)));
    // ใกล้ถนน: พื้นต้องตามระดับถนน (ต่ำกว่านิด) แล้วค่อยลาดขึ้น/ลงได้ไม่เกินความชันคันดิน — กันพื้นโผล่ทับถนนตรงเนินชัน
    // ถนนทุกเส้นที่อยู่ใกล้: พื้นต้องต่ำกว่าทุกเส้น (สนามที่ถนนสองช่วงสูงต่างกันอยู่ใกล้กัน) ·
    // และไม่ต่ำกว่าเส้นที่ใกล้สุดเกินความชันคันดิน (ไม่เป็นหน้าผา)
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = NEAR;
    let lower = -Infinity;
    let upper = Infinity;
    for (let a = -3; a <= 3; a++)
      for (let b = -3; b <= 3; b++)
        for (const i of grid.get(`${cx + a},${cz + b}`) ?? []) {
          const d = Math.hypot(t.x[i] - x, t.z[i] - z);
          if (d >= NEAR) continue;
          // ถนนเอียง: ขอบด้านในต่ำกว่ากลางถนน
          const low = t.y[i] - SINK - Math.abs(Math.tan(t.bank[i])) * Math.max(t.wl[i], t.wr[i]);
          const room = Math.max(0, d - FLAT) * BANK;
          upper = Math.min(upper, low + room);
          if (d < best) {
            best = d;
            lower = low - room;
          }
        }
    if (upper !== Infinity) h = Math.min(upper, Math.max(lower, h));
    return h;
  }
  {
    const seg = SEG;
    const gw = maxX - minX + 2 * MARGIN;
    const gh = maxZ - minZ + 2 * MARGIN;
    const geo = keep(new THREE.PlaneGeometry(gw, gh, Math.round(gw / seg), Math.round(gh / seg)));
    geo.rotateX(-Math.PI / 2);
    geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, terrainAt(p.getX(k), p.getZ(k)));
    geo.computeVertexNormals();
    grassTex.repeat.set(gw / 24, gh / 24);
    const ground = new THREE.Mesh(geo, keep(new THREE.MeshLambertMaterial({ map: grassTex })));
    ground.receiveShadow = high;
    scene.add(ground);
  }

  {
    const count = high ? 900 : 300;
    const trunkGeo = keep(new THREE.CylinderGeometry(0.25, 0.35, 3, 6));
    trunkGeo.translate(0, 1.5, 0);
    const leafGeo = keep(new THREE.ConeGeometry(2.6, 7, 7));
    leafGeo.translate(0, 6, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, keep(new THREE.MeshLambertMaterial({ color: 0x5b4330 })), count);
    const leaves = new THREE.InstancedMesh(leafGeo, keep(new THREE.MeshLambertMaterial({ color: 0xffffff })), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const tint = new THREE.Color();
    let placed = 0;
    for (let tries = 0; tries < count * 6 && placed < count; tries++) {
      const i = Math.floor(r() * t.n);
      const side = r() < 0.5 ? -1 : 1;
      const off = maxEdge + 14 + r() ** 1.6 * 160;
      const p = poseAt(t, i * DS, side * off);
      if (nearTrack(p.x, p.z, maxEdge + 10)) continue;
      const s = 0.7 + r() * 0.8;
      pos.set(p.x, terrainAt(p.x, p.z) - 0.1, p.z);
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      sc.set(s, s * (0.8 + r() * 0.5), s);
      m.compose(pos, q, sc);
      trunks.setMatrixAt(placed, m);
      leaves.setMatrixAt(placed, m);
      leaves.setColorAt(placed, tint.setHSL(0.27 + r() * 0.08, 0.45, 0.2 + r() * 0.1));
      placed++;
    }
    trunks.count = placed;
    leaves.count = placed;
    leaves.castShadow = high;
    scene.add(trunks, leaves);
  }

  {
    // อัฒจันทร์บนทางตรงยาว ๆ (ด้านนอก) + คนดูเป็นจุดสี
    const crowd = canvasTex(128, 32, (g) => {
      g.fillStyle = "#2a2d33";
      g.fillRect(0, 0, 128, 32);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `hsl(${Math.floor(r() * 360)},${50 + r() * 40}%,${40 + r() * 35}%)`;
        g.fillRect(r() * 128, r() * 32, 2, 2);
      }
    });
    crowd.repeat.set(8, 1);
    const standMat = keep(new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 }));
    const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.6, metalness: 0.2 }));
    const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 }));
    // ทางตรงยาว = ช่วงคันเร่งต่อเนื่อง
    const runs: { i: number; len: number }[] = [];
    for (let i = 0; i < t.n; i++) {
      if (t.zone[i] !== "throttle" || t.zone[(i - 1 + t.n) % t.n] === "throttle") continue;
      let len = 0;
      while (len < t.n && t.zone[(i + len) % t.n] === "throttle") len++;
      runs.push({ i, len });
    }
    runs.sort((a, b) => b.len - a.len);
    // เส้นสตาร์ทมีอัฒจันทร์เสมอ
    const spots = [{ i: t.n - Math.round(150 / DS), len: Math.round(300 / DS) }, ...runs.slice(0, high ? 4 : 2)];
    for (const run of spots) {
      const len = Math.min(run.len * DS * 0.7, 260);
      const mid = run.i * DS + (run.len * DS) / 2;
      // ด้านนอก = ฝั่งตรงข้ามกับโค้งถัดไป
      const side = sample(t, t.curve, run.i * DS + run.len * DS + 40) > 0 ? -1 : 1;
      const k = Math.round(mid / DS) % t.n;
      const p = poseAt(t, mid, side > 0 ? R(k) + RUN + 6 : -(L(k) + RUN + 6));
      const g = new THREE.Group();
      g.position.set(p.x, heightAt(t, mid), p.z);
      // แกน x ของกลุ่มตามทิศถนน · แกน z ชี้ออกจากถนน (ฝั่ง side)
      g.rotation.y = -p.heading;
      const tiers = 6;
      for (let k = 0; k < tiers; k++) {
        const step = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 1.2, 2.2)), k % 2 ? standMat : frameMat);
        step.position.set(0, 0.6 + k * 1.2, side * (1.1 + k * 2.2));
        g.add(step);
      }
      const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.3, tiers * 2.2 + 2)), roofMat);
      roof.position.set(0, tiers * 1.2 + 4, side * (tiers * 1.1 + 0.5));
      g.add(roof);
      for (const x of [-len / 2, 0, len / 2]) {
        const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, tiers * 1.2 + 4, 0.4)), frameMat);
        post.position.set(x, (tiers * 1.2 + 4) / 2, side * (tiers * 2.2 + 0.6));
        g.add(post);
      }
      g.traverse((o) => {
        o.castShadow = high;
        o.receiveShadow = high;
      });
      scene.add(g);
    }
  }

  /* ---------- รถ ---------- */
  type Rig = { root: THREE_NS.Group; body: THREE_NS.Group; steer: THREE_NS.Group[]; spin: THREE_NS.Group[]; setAero?: (open: number) => void };
  const tyreMat = keep(new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85 }));
  const rimMat = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.85 }));
  const stripeMat = keep(new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.6 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.5, side: THREE.DoubleSide }));
  // ฝาครอบล้อ (ล้อ 18 นิ้ว): แผ่นเรียบสีเข้ม มีลายซี่ให้เห็นล้อหมุน
  const coverTex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#1a1c20";
    g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    g.fillStyle = "#2c2f35";
    for (let k = 0; k < 5; k++) {
      g.rotate((Math.PI * 2) / 5);
      g.beginPath();
      g.moveTo(-10, 18);
      g.lineTo(10, 18);
      g.lineTo(26, 120);
      g.lineTo(-26, 120);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#9aa0a8";
    g.beginPath();
    g.arc(0, 0, 16, 0, Math.PI * 2);
    g.fill();
  }, false);
  const coverMat = keep(new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide }));
  /** ขอบล้อ 18 นิ้ว (รัศมีขอบล้อ ≈ 0.23 ม.) ยางแก้มเตี้ย */
  const RIM_R = 0.235;
  const wheelGeos = (w: number) => {
    // ยางขอบมน (หมุนโครงหน้าตัดรอบแกน) ไม่ใช่ทรงกระบอกเหลี่ยม
    const h = w / 2;
    const R = WHEEL_R;
    const profile = [
      [RIM_R, -h + 0.012], [R - 0.04, -h], [R - 0.01, -h + 0.03], [R, -h + 0.07],
      [R, h - 0.07], [R - 0.01, h - 0.03], [R - 0.04, h], [RIM_R, h - 0.012],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const tyre = keep(new THREE.LatheGeometry(profile, 40));
    tyre.rotateZ(Math.PI / 2);
    const rim = keep(new THREE.CylinderGeometry(RIM_R, RIM_R, w - 0.03, 28, 1, true));
    rim.rotateZ(Math.PI / 2);
    const cover = keep(new THREE.CircleGeometry(RIM_R - 0.004, 28));
    cover.rotateY(Math.PI / 2);
    const lip = keep(new THREE.TorusGeometry(RIM_R, 0.008, 6, 32));
    lip.rotateY(Math.PI / 2);
    const ring = keep(new THREE.TorusGeometry(R * 0.8, 0.01, 6, 32));
    ring.rotateY(Math.PI / 2);
    return { tyre, rim, cover, lip, ring };
  };
  const geoF = wheelGeos(0.3);
  const geoR = wheelGeos(0.4);
  // ครีบเหนือล้อหน้า (ติดกับชุดเบรก เลี้ยวตามล้อแต่ไม่หมุน)
  const deflector = keep(new THREE.CylinderGeometry(WHEEL_R + 0.05, WHEEL_R + 0.05, 0.16, 16, 1, true, -Math.PI * 0.3, Math.PI * 0.45));
  deflector.rotateZ(Math.PI / 2);

  const makeRig = (l: Livery, isGhost: boolean, quality = 1): Rig => {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    let setAero: ((open: number) => void) | undefined;
    root.add(bodyGroup);
    if (opts.body && !isGhost) {
      const clone = opts.body.scene.clone(true);
      if (opts.body.tint) {
        const c = new THREE.Color(l.colour);
        clone.traverse((o) => {
          const mesh = o as THREE_NS.Mesh;
          if (!mesh.isMesh) return;
          const tintOne = (m: THREE_NS.Material) => {
            const mm = keep((m as THREE_NS.MeshStandardMaterial).clone());
            if (mm.color) mm.color.multiply(c);
            return mm;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tintOne) : tintOne(mesh.material);
        });
      }
      bodyGroup.add(clone);
    } else {
      const made = keep(buildCar(THREE, merge, l, { ghost: isGhost, quality }));
      bodyGroup.add(made.obj);
      setAero = made.setAero;
    }
    const steer: THREE_NS.Group[] = [];
    const spin: THREE_NS.Group[] = [];
    const ghostMat = (m: THREE_NS.MeshStandardMaterial) => {
      if (!isGhost) return m;
      const c = keep(m.clone());
      c.transparent = true;
      c.opacity = 0.3;
      return c;
    };
    const tm = ghostMat(tyreMat);
    const rm = ghostMat(rimMat);
    const st = ghostMat(stripeMat);
    const cm = ghostMat(coverMat);
    const dm = ghostMat(darkMat);
    for (const [x, z, w, front] of WHEELS) {
      const holder = new THREE.Group();
      holder.position.set(x, WHEEL_R, z);
      const sp = new THREE.Group();
      const g = w === 0.3 ? geoF : geoR;
      sp.add(new THREE.Mesh(g.tyre, tm), new THREE.Mesh(g.rim, rm));
      for (const side of [-1, 1]) {
        const cv = new THREE.Mesh(g.cover, cm);
        cv.position.x = side * (w / 2 - 0.006);
        const lp = new THREE.Mesh(g.lip, rm);
        lp.position.x = side * (w / 2 - 0.004);
        // แถบสีข้างยาง
        const rg = new THREE.Mesh(g.ring, st);
        rg.position.x = side * (w / 2 + 0.002);
        sp.add(cv, lp, rg);
      }
      if (front) {
        const df = new THREE.Mesh(deflector, dm);
        df.position.x = (x > 0 ? -1 : 1) * 0.02;
        holder.add(df);
      }
      sp.traverse((o) => (o.castShadow = high && !isGhost));
      holder.add(sp);
      root.add(holder);
      if (front) steer.push(holder);
      spin.push(sp);
    }
    bodyGroup.traverse((o) => (o.castShadow = high && !isGhost));
    return { root, body: bodyGroup, steer, spin, setAero };
  };

  const car = makeRig(livery, false);
  scene.add(car.root);
  const ghost = makeRig({ team: "", colour: "#ffffff", ink: "#ffffff", num: 0 }, true);
  ghost.root.visible = false;
  scene.add(ghost.root);
  // รถคู่แข่ง: ลายความละเอียดครึ่งหนึ่ง (หลายคัน) · กราฟิกต่ำไม่ทอดเงา
  const rivals = (opts.rivals ?? []).map((l) => {
    const rig = makeRig(l, false, high ? 0.5 : 0.35);
    if (!high) rig.root.traverse((o) => (o.castShadow = false));
    scene.add(rig.root);
    return { rig, aero: 0, spin: 0, steer: 0 };
  });

  let mode: CameraMode = "tv";
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const chaseDir = new THREE.Vector3();
  // การเคลื่อนไหวของตัวรถ (เกลี่ยให้นุ่ม)
  const motion = { roll: 0, pitch: 0, steer: 0, yaw: 0, spin: 0, lastLat: 0, aero: 0 };
  let baseFov = 66;

  /** วางรถ: หันหัวตามทิศของ racing line (ไม่ใช่เส้นกลางถนน) — ระยะเยื้องจากไลน์ (ไถล) คงที่ตลอดช่วงที่ดูทิศ */
  const place = (obj: Obj, s: number, lateral: number, yaw = 0) => {
    const p = poseAt(t, s, lateral);
    const rel = lateral - sample(t, t.lineOffset, s);
    const a = poseAt(t, s - 3, sample(t, t.lineOffset, s - 3) + rel);
    const b = poseAt(t, s + 3, sample(t, t.lineOffset, s + 3) + rel);
    const h = Math.atan2(b.z - a.z, b.x - a.x);
    // เงย/ก้มตามความชันของถนน
    const y = surfaceAt(t, s, lateral);
    const rise = (heightAt(t, s + 3) - heightAt(t, s - 3)) / 6;
    obj.position.set(p.x, y, p.z);
    tmp.set(p.x + Math.cos(h + yaw), y + rise, p.z + Math.sin(h + yaw));
    obj.lookAt(tmp);
  };

  const resize = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // จอแนวตั้ง (มือถือ) กว้างมุมขึ้น จะได้เห็นโค้งข้างหน้า
    baseFov = w < h ? 82 : 66;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  resize();

  return {
    update({ s, lateral, ghost: g, speed, accel, dt, aero = 0, rivals: rivalStates, guide }) {
      drawGuide(s, speed, guide);
      // ปีกพับ/กาง ใช้เวลาราว 0.3 วินาที
      const ka = Math.min(1, dt * 7);
      if (Math.abs(aero - motion.aero) > 0.001) {
        motion.aero += (aero - motion.aero) * ka;
        car.setAero?.(motion.aero);
      }
      const curve = sample(t, t.curve, s);
      const k = Math.min(1, dt * 8);
      // ไถล: ท้ายปัดตามความเร็วที่หลุดออกด้านข้าง
      // ใช้เฉพาะส่วนที่ไถลออกจากไลน์ (ไม่รวมการที่ไลน์เองเบี่ยงข้ามถนน — ทิศรถตามไลน์อยู่แล้ว)
      const rel = lateral - sample(t, t.lineOffset, s);
      const latRate = dt > 0 ? (rel - motion.lastLat) / dt : 0;
      motion.lastLat = rel;
      const slideYaw = speed > 3 ? -Math.atan2(latRate, speed) * 1.4 : 0;
      motion.yaw += (Math.max(-0.22, Math.min(0.22, slideYaw)) - motion.yaw) * k;
      // เอียงออกนอกโค้ง (แรงเหวี่ยง) · หัวทิ่มเมื่อเบรก ท้ายย่อเมื่อเร่ง
      const lat = speed * speed * curve;
      // แกน z ของรถ = หน้ารถ: หมุนบวก = ฝั่งซ้ายยกขึ้น → เลี้ยวขวา (lat > 0) ต้องหมุนลบให้ฝั่งซ้าย (ด้านนอก) ยุบลง
      motion.roll += (Math.max(-0.055, Math.min(0.055, -lat * 0.0016)) - motion.roll) * k;
      // แกน x: หมุนบวก = หัวทิ่ม → เบรก (accel < 0) หัวทิ่ม
      motion.pitch += (Math.max(-0.025, Math.min(0.03, -accel * 0.0011)) - motion.pitch) * k;
      // ล้อหน้าเลี้ยวตามโค้ง (Ackermann คร่าว ๆ) + แก้ท้ายปัด
      const steerTarget = Math.max(-0.5, Math.min(0.5, -Math.atan(WHEELBASE * curve) * 1.6 + motion.yaw * 0.8));
      motion.steer += (steerTarget - motion.steer) * Math.min(1, dt * 12);
      motion.spin += (speed / WHEEL_R) * dt;

      place(car.root, s, lateral, motion.yaw);
      // ถนนเอียง (bank > 0 = ฝั่งขวาสูง) → ตัวรถเอียงตาม (หมุน z บวก = ฝั่งซ้ายยก)
      const bankRoll = -sample(t, t.bank, s);
      car.body.rotation.set(motion.pitch, 0, motion.roll + bankRoll);
      for (const st of car.steer) st.rotation.y = motion.steer;
      for (const sp of car.spin) sp.rotation.x = motion.spin;

      // รถคู่แข่ง: วางตามตำแหน่ง ล้อหมุน/เลี้ยว ปีกพับ ตัวเอียงตามโค้ง
      rivalStates?.forEach((r, k) => {
        const rv = rivals[k];
        if (!rv) return;
        place(rv.rig.root, r.s, r.lateral);
        const cv = sample(t, t.curve, r.s);
        rv.rig.body.rotation.set(0, 0, Math.max(-0.05, Math.min(0.05, -r.speed * r.speed * cv * 0.0016)) - sample(t, t.bank, r.s));
        rv.spin += (r.speed / WHEEL_R) * dt;
        for (const sp of rv.rig.spin) sp.rotation.x = rv.spin;
        rv.steer += (Math.max(-0.5, Math.min(0.5, -Math.atan(WHEELBASE * cv) * 1.6)) - rv.steer) * Math.min(1, dt * 12);
        for (const st of rv.rig.steer) st.rotation.y = rv.steer;
        if (Math.abs(r.aero - rv.aero) > 0.001) {
          rv.aero += (r.aero - rv.aero) * Math.min(1, dt * 7);
          rv.rig.setAero?.(rv.aero);
        }
      });

      if (g === null) ghost.root.visible = false;
      else {
        ghost.root.visible = true;
        place(ghost.root, g, sample(t, t.lineOffset, g));
        for (const sp of ghost.spin) sp.rotation.x = motion.spin;
      }

      // ความรู้สึกเร็ว: มุมกล้องกว้างขึ้นตามความเร็ว + สั่นเล็กน้อย (มากขึ้นตอนขึ้น kerb)
      const sp01 = Math.min(1, speed / VMAX);
      const fov = baseFov + sp01 * 9;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      const onKerb = lateral > sample(t, t.wr, s) - 0.6 || lateral < 0.6 - sample(t, t.wl, s) ? 1 : 0;
      const amp = sp01 * sp01 * 0.012 + onKerb * sp01 * 0.03;
      const sx = (Math.random() - 0.5) * amp;
      const sy = (Math.random() - 0.5) * amp;

      fwd.set(0, 0, 1).applyQuaternion(car.root.quaternion);
      if (mode === "tv") {
        // เหนือหัวนักขับ เห็นหมวก จมูกรถ และล้อหน้าด้านล่างจอ · เอียงตามตัวรถนิดหน่อย
        camPos.copy(car.root.position).addScaledVector(fwd, 0.15).setY(car.root.position.y + 1.32 + sy);
        camLook.copy(car.root.position).addScaledVector(fwd, 16).setY(heightAt(t, s + 16) + 0.35);
        camera.position.copy(camPos);
        camera.position.x += sx;
        camera.lookAt(camLook);
        camera.rotateZ(-(motion.roll * 0.6 + bankRoll));
      } else {
        // ตามหลังระยะคงที่ หน่วงแค่ทิศ (ไม่หน่วงตำแหน่ง — ไม่งั้นรถยิ่งเร็ว/เครื่องยิ่งช้า กล้องยิ่งหลุดห่าง) ให้เห็นรถเลี้ยว
        const back = Math.min(9.5, 7 + speed * 0.03);
        if (chaseDir.lengthSq() === 0) chaseDir.copy(fwd);
        else chaseDir.lerp(fwd, 1 - Math.exp(-dt * 5)).normalize();
        camPos.copy(car.root.position).addScaledVector(chaseDir, -back);
        camPos.y = Math.max(heightAt(t, s - back), car.root.position.y) + 2.7;
        camLook.copy(car.root.position).addScaledVector(fwd, 6).setY(heightAt(t, s + 6) + 0.9);
        camera.position.copy(camPos);
        camera.position.y += sy;
        camera.lookAt(camLook);
      }

      // เงาตามรถ (กล้องเงาเล็ก ๆ รอบรถ ได้เงาคมโดยไม่กินเครื่อง)
      if (high) {
        sun.target.position.copy(car.root.position);
        sun.position.copy(car.root.position).addScaledVector(sunDir, 200);
      }
      sky.position.copy(camera.position);
    },
    setCamera(m) {
      mode = m;
      chaseDir.set(0, 0, 0);
    },
    setLine(on) {
      lineOn = on;
      showLines();
    },
    setGuide(m) {
      guideMode = m;
      showLines();
    },
    setLane(lane) {
      const k = Math.max(0, Math.min(2, Math.round(lane + 1)));
      if (k === laneShown) return;
      laneShown = k;
      showLines();
    },
    resize,
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      (sky.material as THREE_NS.Material).dispose();
      sky.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/**
 * จัดโมเดล .glb ให้เข้ากับเกม: ยาวตามแกน z หน้ารถชี้ +z ยาว CAR_LEN เมตร ตั้งบนพื้น กึ่งกลางที่ (0, 0)
 * — หาแกนยาวจากกล่องรอบโมเดล · หน้ารถ = ปลายที่เตี้ยกว่า (ปีกหลังสูงกว่าปีกหน้า)
 */
export function normaliseBody(THREE: Three, root: Obj): Obj {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(root);
  // แกนยาวเป็น x → หมุน 90° ให้เป็น z
  if (size.x > size.z) inner.rotation.y = Math.PI / 2;
  inner.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c2 = b2.getCenter(new THREE.Vector3());
  const s2 = b2.getSize(new THREE.Vector3());
  // ความสูงสุดของปลายหน้า/หลัง (20% แรกและท้ายตามแกน z)
  let plusTop = -Infinity;
  let minusTop = -Infinity;
  const v = new THREE.Vector3();
  inner.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(p.count / 4000));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      const f = (v.z - b2.min.z) / s2.z;
      if (f > 0.8) plusTop = Math.max(plusTop, v.y);
      else if (f < 0.2) minusTop = Math.max(minusTop, v.y);
    }
  });
  const shift = new THREE.Group();
  shift.add(inner);
  inner.position.set(-c2.x, -b2.min.y, -c2.z);
  const holder = new THREE.Group();
  holder.add(shift);
  holder.scale.setScalar(CAR_LEN / s2.z);
  // ปลาย +z สูงกว่า = ท้ายรถอยู่ +z → กลับ 180° ให้หน้ารถชี้ +z
  if (plusTop > minusTop) holder.rotation.y = Math.PI;
  return holder;
}
