/**
 * ฉาก 3D ของโหมดนักขับ (หน่วยเมตร)
 * — ถนนมีลายยางมะตอย เส้นยางดำ ขอบสนาม kerb ทราย กำแพง รั้วกันเศษ อัฒจันทร์ ต้นไม้ ป้ายนับระยะเบรก
 * — ท้องฟ้า + แสงอาทิตย์ + เงา (กราฟิกสูง) · สะท้อนแสงรอบตัวบนตัวรถ
 * — รถ: ตัวถัง (สร้างในโค้ด หรือโหลดไฟล์ .glb) + ล้อ 4 ล้อแยกชิ้น หมุนตามความเร็ว ล้อหน้าเลี้ยวตามโค้ง
 *   ตัวรถเอียงออกนอกโค้ง หัวทิ่มตอนเบรก ท้ายย่อตอนเร่ง ท้ายปัดตอนไถล
 * ผู้เรียกโหลด three และ addon แบบ dynamic แล้วส่งเข้ามา (ไม่ให้ three เข้า bundle หลักของหน้า)
 */
import type * as THREE_NS from "three";
import { DS, VMAX, VSM, heightAt, laneValue, poseAt, sample, surfaceAt, type DriveTrack, type Zone } from "@/lib/pitwall/drive/line";
import { guideColor, guideFade, guideNeeded, guideRisk, projectedSpeed } from "@/lib/pitwall/drive/guide";
import { buildCar, type Livery } from "./carModel";
import { buildTerrain, STAND_DEPTH, STAND_RISE, STAND_ROOF, STAND_TIERS } from "./terrain";
import { BOX_SHIFT, GARAGE_D, PIT_W, pitLateral, wallFrom, wallTo, type PitLane } from "@/lib/pitwall/drive/pit";

type Three = typeof THREE_NS;
type Obj = THREE_NS.Object3D;

/** orbit = กล้องรีเพลย์ วนรอบรถช้า ๆ */
export type CameraMode = "tv" | "chase" | "orbit";
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
/** pit = ขอเข้าพิทไว้: ลูกศรแยกเข้าพิทเลน (base = ระยะสะสมของเส้นชัยที่พิทคร่อม · from = ระยะเยื้องตอนเริ่มเลี้ยวเข้า) */
export type DriveSceneGuide = { lat: number; grip: number; fadeAt?: (s: number) => number; pit?: { base: number; from: number } };

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
    rivals?: { s: number; lateral: number; speed: number; aero: number; tyre?: string }[];
    /** สีแก้มยางของรถเรา (ตามชนิดยางที่ใส่) */
    tyre?: string;
    /** เส้นช่วยไดนามิก: เลนที่รถอยู่ (lat) · ตัวคูณการเกาะถนน (ทีม × อากาศเสีย) · fadeAt = โหมดฝึก ความจำของโค้งที่ระยะ s (0..1) */
    guide?: DriveSceneGuide;
    /** กำลังใช้แบต Overtake (มุมกล้องกว้างขึ้น ให้รู้สึกพุ่ง) */
    boost?: boolean;
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
  /** พิทเลน (โหมดแข่ง): อู่ของแต่ละทีมตามลำดับ (สี + ชื่อทีมของเกม) · mine = อู่ของเรา */
  pit?: { lane: PitLane; teams: { color: string; name: string }[]; mine: number };
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
  // ระยะเทียบเส้นชัย (−ครึ่งรอบ..ครึ่งรอบ) · ทางเลี้ยวเข้า/ออกพิท (ฝั่งพิท): กำแพง kerb ทราย ป้าย เปิดทางให้ถนนพิท
  const relOf = (i: number) => (i * DS > t.length / 2 ? i * DS - t.length : i * DS);
  const pitGap = (i: number, side: number) => {
    if (!opts.pit || side !== opts.pit.lane.side) return false;
    const rel = relOf(i);
    const p = opts.pit.lane;
    return (rel >= p.entry - 8 && rel <= wallFrom(p)) || (rel >= wallTo(p) && rel <= p.exit + 8);
  };
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

  /* ---------- พื้นดิน (คำนวณก่อน ให้ของรอบสนามตั้งบนพื้นจริง ไม่ลอย) ---------- */
  const terra = buildTerrain(t, { high, hillSeed: r() * 100, pit: opts.pit?.lane });
  /** ความสูงพื้นตามที่วาดจริง (ตาข่ายสามเหลี่ยม) */
  const groundAt = terra.meshAt;
  // สะพาน: มีถนนช่วงอื่นลอดใต้ (ต่ำกว่า 3 ม. ขึ้นไป) — ไม่ต่อกำแพงลงถึงพื้น (ไม่งั้นบังถนนข้างล่าง)
  const bridge = new Uint8Array(t.n);
  for (let i = 0; i < t.n; i++)
    for (let j = 0; j < t.n; j += 2) {
      const ds = Math.abs(i - j) * DS;
      if (Math.min(ds, t.length - ds) < 150 || t.y[j] > t.y[i] - 3) continue;
      if (Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]) < Math.max(t.wl[j], t.wr[j]) + RUN + Math.max(t.wl[i], t.wr[i]) + 4) {
        bridge[i] = 1;
        break;
      }
    }

  // เสาป้าย: จากพื้น (หรือผิวข้างถนน ถ้าต่ำกว่า) ขึ้นไปถึงขอบล่างของป้าย — ป้ายไม่ลอยกลางอากาศ
  const postMat = keep(new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.6, metalness: 0.3 }));
  const postGeo = keep(new THREE.BoxGeometry(0.1, 1, 0.1));
  const addPost = (x: number, z: number, surface: number, top: number) => {
    const bottom = Math.min(surface, groundAt(x, z)) - 0.3;
    if (top <= bottom) return;
    const m = new THREE.Mesh(postGeo, postMat);
    m.scale.y = top - bottom;
    m.position.set(x, (top + bottom) / 2, z);
    scene.add(m);
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
  const kerb = (side: number) => (i: number) => (corner(i) && !pitGap(i, side) ? (i % 2 ? 0xd71920 : 0xf4f4f4) : null);
  addFlat(new THREE.Mesh(strip(R, (i) => R(i) + KW, 0.03, kerb(1)), lit()));
  addFlat(new THREE.Mesh(strip((i) => -L(i) - KW, (i) => -L(i), 0.03, kerb(-1)), lit()));
  if (RUN > 2) {
    const VG = Math.min(9, RUN - 1);
    const SD = Math.min(12, RUN);
    const verge = (side: number) => (i: number) => (corner(i) || pitGap(i, side) ? null : 0x5f6d59);
    const sand = (side: number) => (i: number) => (corner(i) && !pitGap(i, side) ? 0xcdb68d : null);
    addFlat(new THREE.Mesh(strip(R, (i) => R(i) + VG, 0.002, verge(1)), lit()));
    addFlat(new THREE.Mesh(strip((i) => -L(i) - VG, (i) => -L(i), 0.002, verge(-1)), lit()));
    addFlat(new THREE.Mesh(strip((i) => R(i) + KW, (i) => R(i) + SD, 0.002, sand(1)), lit()));
    addFlat(new THREE.Mesh(strip((i) => -L(i) - SD, (i) => -L(i) - KW, 0.002, sand(-1)), lit()));
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
  const ROAD = new THREE.Color(0x3a3b40);
  let accelSmooth = 0;
  /** วางลูกศรข้างหน้า: มองไกลราว 2.3 วินาทีของความเร็ว (60–215 ม.) · สีคิดจากความเร็วที่จะมีตอนไปถึงแต่ละจุด */
  const drawGuide = (s: number, speed: number, accel: number, dt: number, g: DriveSceneGuide | undefined) => {
    accelSmooth += (accel - accelSmooth) * Math.min(1, dt * 4);
    if (!g || !lineOn || guideMode === "static") {
      guideMesh.count = 0;
      return;
    }
    const reach = Math.max(60, Math.min(GUIDE_N * GUIDE_GAP, speed * 2.3));
    const vtop = VSM * g.grip;
    let n = 0;
    for (let d = 5; d <= reach && n < GUIDE_N; d += GUIDE_GAP) {
      const ss = s + d;
      // เส้นแยกเข้าพิท: เลยทางเข้าไปแล้ว ลูกศรตามพิทเลน (สีฟ้า — รถวิ่งเองในพิท)
      const pr = g.pit && opts.pit ? ss - g.pit.base : null;
      const inPitPath = pr !== null && pr >= opts.pit!.lane.entry && pr <= wallFrom(opts.pit!.lane);
      if (pr !== null && pr > wallFrom(opts.pit!.lane)) break;
      const risk = inPitPath ? 0 : guideRisk(t, ss, g.lat, projectedSpeed(speed, accelSmooth, d, vtop), g.grip);
      if (!inPitPath && guideMode === "corners" && !guideNeeded(t, ss, g.lat, risk)) continue;
      const off = inPitPath ? pitLateral(opts.pit!.lane, pr!, g.pit!.from, g.pit!.from) : laneValue(t, "offset", ss, g.lat);
      const p = poseAt(t, ss, off);
      gFwd.set(Math.cos(p.heading), 0, Math.sin(p.heading));
      gRight.set(-Math.sin(p.heading), 0, Math.cos(p.heading));
      gMat.makeBasis(gFwd, gUp, gRight).setPosition(p.x, surfaceAt(t, ss, off) + 0.04, p.z);
      guideMesh.setMatrixAt(n, gMat);
      gCol.setHex(inPitPath ? 0x38bdf8 : guideColor(risk));
      // โหมดฝึก: โค้งที่จำได้แล้ว เส้นจางกลืนกับถนน
      if (g.fadeAt && !inPitPath) gCol.lerp(ROAD, guideFade(g.fadeAt(ss), risk));
      guideMesh.setColorAt(n, gCol);
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
  const wallStrip = (side: number, y0: number, y1: number, colorOf: (i: number) => [number, number, number], vScale = 4, toGround = false) => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < t.n; i++) {
      if (pitGap(i, side)) continue;
      const j = (i + 1) % t.n;
      const a = poseAt(t, i * DS, wallAt(i, side));
      const b = poseAt(t, (i + 1) * DS, wallAt(j, side));
      const ha = groundY(i, wallAt(i, side));
      const hb = groundY(j, wallAt(j, side));
      // toGround: กำแพงกันดินจากใต้ขอบกำแพง (y1) ลงถึงพื้นจริง — ข้างถนนบนเนิน/คันดิน พื้นอาจต่ำกว่าถนนมาก (ยกเว้นบนสะพาน)
      const ba = toGround ? (bridge[i] ? ha + y1 : Math.min(ha + y1, groundAt(a.x, a.z) - 0.5)) : ha + y0;
      const bb = toGround ? (bridge[j] ? hb + y1 : Math.min(hb + y1, groundAt(b.x, b.z) - 0.5)) : hb + y0;
      if (toGround && ba >= ha + y1 - 0.01 && bb >= hb + y1 - 0.01) continue;
      pos.push(a.x, ba, a.z, b.x, bb, b.z, a.x, ha + y1, a.z, a.x, ha + y1, a.z, b.x, bb, b.z, b.x, hb + y1, b.z);
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
    // ใต้กำแพง: กำแพงกันดินคอนกรีตลงถึงพื้น (ไม่เห็นช่องโหว่ใต้สนาม)
    scene.add(new THREE.Mesh(wallStrip(side, 0, -1.4, () => [0.55, 0.56, 0.58], 4, true), wallMat));
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

  /* ---------- สะพาน (ถนนช่วงอื่นลอดใต้): ขอบสะพาน + ตอม่อลงถึงพื้น ---------- */
  {
    const concrete = keep(new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.85 }));
    const pier = keep(new THREE.BoxGeometry(1.2, 1, 1.6));
    const deck = keep(new THREE.BoxGeometry(DS * 2 + 0.1, 1.4, 0.5));
    for (let i = 0; i < t.n; i += 2) {
      if (!bridge[i]) continue;
      for (const side of [-1, 1]) {
        const lat = wallAt(i, side);
        const q = poseAt(t, i * DS, lat);
        const top = groundY(i, lat);
        // แผ่นขอบสะพาน (ใต้ผิวถนน)
        const d = new THREE.Mesh(deck, concrete);
        d.position.set(q.x, top - 0.7, q.z);
        d.rotation.y = -q.heading;
        scene.add(d);
        // ตอม่อทุก ~24 ม.
        if (i % 6 !== 0) continue;
        const bottom = groundAt(q.x, q.z) - 0.5;
        if (top - 1.4 <= bottom) continue;
        // ห้ามตั้งตอม่อบนถนนที่ลอดใต้
        let onRoad = false;
        for (let j = 0; j < t.n && !onRoad; j += 2) onRoad = t.y[j] < top - 3 && Math.hypot(t.x[j] - q.x, t.z[j] - q.z) < Math.max(t.wl[j], t.wr[j]) + 3;
        if (onRoad) continue;
        const m = new THREE.Mesh(pier, concrete);
        m.scale.y = top - 1.4 - bottom;
        m.position.set(q.x, (top - 1.4 + bottom) / 2, q.z);
        m.rotation.y = -q.heading;
        scene.add(m);
      }
    }
  }

  /* ---------- พิทเลน: ถนน · ช่องจอดของแต่ละทีม · อู่ · เส้นจำกัดความเร็ว ---------- */
  if (opts.pit) {
    const { lane, teams, mine } = opts.pit;
    const side = lane.side;
    const edge = (rel: number) => side * sample(t, side > 0 ? t.wr : t.wl, rel);
    const center = (rel: number) => pitLateral(lane, rel, edge(rel), edge(rel));
    const outer = Math.abs(lane.offset) + PIT_W / 2;
    // แถบตามพิทเลนช่วง rel0..rel1 ระหว่างระยะเยื้อง a(rel)..b(rel) ที่ความสูงถนน + dy
    const pitStrip = (rel0: number, rel1: number, a: (r: number) => number, b: (r: number) => number, dy: number, show: (r: number) => boolean = () => true) => {
      const pos: number[] = [];
      for (let r = rel0; r < rel1; r += DS) {
        const r1 = Math.min(rel1, r + DS);
        if (!show(r)) continue;
        const q = [poseAt(t, r, a(r)), poseAt(t, r1, a(r1)), poseAt(t, r, b(r)), poseAt(t, r1, b(r1))];
        const y0 = heightAt(t, r) + dy;
        const y1 = heightAt(t, r1) + dy;
        pos.push(q[0].x, y0, q[0].z, q[1].x, y1, q[1].z, q[2].x, y0, q[2].z, q[2].x, y0, q[2].z, q[1].x, y1, q[1].z, q[3].x, y1, q[3].z);
      }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const solid = (color: number, offset = -1) => keep(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset }));
    // ถนนพิทเลน (เลี้ยวเข้า → ขนานทางตรง → เลี้ยวออก)
    const road = new THREE.Mesh(pitStrip(lane.entry, lane.exit, (r) => center(r) - PIT_W / 2, (r) => center(r) + PIT_W / 2, 0.01), lit(asphalt));
    (road.material as THREE_NS.MeshStandardMaterial).vertexColors = false;
    addFlat(road);
    // ขอบถนนพิทยื่นลงใต้ดิน (ช่วงเลี้ยวเข้า/ออก พื้นข้าง ๆ ต่ำกว่าถนน — ไม่เห็นถนนลอย)
    const skirt = (lat: (r: number) => number) => {
      const pos: number[] = [];
      for (let r = lane.entry; r < lane.exit; r += DS) {
        const r1 = Math.min(lane.exit, r + DS);
        const a = poseAt(t, r, lat(r));
        const b = poseAt(t, r1, lat(r1));
        const ya = heightAt(t, r);
        const yb = heightAt(t, r1);
        pos.push(a.x, ya, a.z, b.x, yb, b.z, a.x, ya - 2, a.z, a.x, ya - 2, a.z, b.x, yb, b.z, b.x, yb - 2, b.z);
      }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ color: 0x5a5d63, roughness: 0.9, side: THREE.DoubleSide }))));
    };
    skirt((r) => center(r) - PIT_W / 2);
    skirt((r) => center(r) + PIT_W / 2);
    // ขอบขาวสองข้าง (ขอบด้านสนามเริ่มวาดเมื่อพ้นขอบถนนแล้ว = เส้นแยกทางเข้า/ออกพิท ไม่ลากตัดถนน) · เส้นแบ่งเลนวิ่งกับช่องจอด (ช่วงอู่)
    const inner = (r: number) => center(r) - (side * PIT_W) / 2;
    const out = (r: number) => center(r) + (side * PIT_W) / 2;
    const offRoad = (r: number) => Math.abs(inner(r)) > Math.abs(edge(r)) + 0.3;
    scene.add(new THREE.Mesh(pitStrip(lane.entry, lane.exit, inner, (r) => inner(r) + side * 0.25, 0.02, offRoad), solid(0xf2f2f2)));
    scene.add(new THREE.Mesh(pitStrip(lane.entry, lane.exit, (r) => out(r) - side * 0.2, out, 0.02), solid(0xf2f2f2)));
    const b0 = lane.boxes[0] - 12;
    const b1 = lane.boxes[lane.boxes.length - 1] + 12;
    scene.add(new THREE.Mesh(pitStrip(b0, b1, (r) => center(r) + side * 1.4, (r) => center(r) + side * 1.55, 0.02), solid(0xf2f2f2)));
    // เส้นจำกัดความเร็ว (สุดทางเลี้ยวเข้า / ต้นทางเลี้ยวออก)
    for (const r of [wallFrom(lane), wallTo(lane)]) scene.add(new THREE.Mesh(pitStrip(r, r + 0.8, (x) => center(x) - PIT_W / 2, (x) => center(x) + PIT_W / 2, 0.025), solid(0xffffff, -2)));
    // ช่องจอด: กรอบสีทีมบนพื้น (ของเราสว่าง + ลูกศร) · อู่สีทีมพร้อมป้ายชื่อ
    const place = (o: THREE_NS.Object3D, rel: number, lat: number, dy = 0) => {
      const q = poseAt(t, rel, lat);
      o.position.set(q.x, heightAt(t, rel) + dy, q.z);
      o.rotation.y = -q.heading;
      scene.add(o);
    };
    const boxLat = Math.abs(lane.offset) + BOX_SHIFT;
    const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.6 }));
    lane.boxes.forEach((rel, k) => {
      const tm = teams[k];
      if (!tm) return;
      const col = new THREE.Color(tm.color);
      const me = k === mine;
      // กรอบจอด 5.6 × 2.4 ม. (เส้นหนา 0.15)
      const box = new THREE.Group();
      const bar = (w: number, d: number, x: number, z: number) => {
        const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), solid(me ? 0xffffff : col.getHex(), -3));
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.03, z);
        box.add(m);
      };
      bar(5.6, 0.15, 0, -1.2);
      bar(5.6, 0.15, 0, 1.2);
      bar(0.15, 2.4, -2.8, 0);
      bar(0.3, 2.4, 2.8, 0);
      if (me) {
        const fill = new THREE.Mesh(keep(new THREE.PlaneGeometry(5.4, 2.2)), keep(new THREE.MeshBasicMaterial({ color: col.getHex(), transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.025;
        box.add(fill);
      }
      place(box, rel, side * boxLat);
      // อู่: ผนังหลังสีทีม + ป้ายชื่อทีมเหนือประตู
      const garage = new THREE.Group();
      const w = 14.5;
      // ฐานอู่ลงไปใต้ดิน (พื้นข้างพิทต่ำกว่าถนนเล็กน้อย — ไม่เห็นช่องใต้อู่)
      const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(w + 0.4, 3, GARAGE_D + 0.4)), frameMat);
      slab.position.set(0, -1.48, (side * GARAGE_D) / 2);
      garage.add(slab);
      const back = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 5.5, 0.4)), keep(new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 0.7 })));
      back.position.set(0, 2.75, side * GARAGE_D);
      garage.add(back);
      for (const x of [-w / 2, w / 2]) {
        const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 5.5, GARAGE_D)), frameMat);
        wall.position.set(x, 2.75, (side * GARAGE_D) / 2);
        garage.add(wall);
      }
      const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(w + 0.4, 0.4, GARAGE_D + 1)), frameMat);
      roof.position.set(0, 5.7, (side * (GARAGE_D - 1)) / 2);
      garage.add(roof);
      const sign = canvasTex(256, 48, (g) => {
        g.fillStyle = tm.color;
        g.fillRect(0, 0, 256, 48);
        g.fillStyle = "#ffffff";
        g.globalAlpha = 0.92;
        g.font = "italic 900 26px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(tm.name.toUpperCase(), 128, 25);
      }, false);
      const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(w - 1, 1.6)), keep(new THREE.MeshBasicMaterial({ map: sign, side: THREE.DoubleSide })));
      board.position.set(0, 4.6, side * -0.25);
      // หันป้ายเข้าหาพิทเลน
      board.rotation.y = side > 0 ? Math.PI : 0;
      garage.add(board);
      garage.traverse((o) => {
        o.castShadow = high;
        o.receiveShadow = high;
      });
      place(garage, rel, side * (outer + 0.5));
    });
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
          if (pitGap(k, side)) continue;
          const edge = side > 0 ? R(k) : L(k);
          // สนามกำแพงชิดถนน: ป้ายอยู่หลังกำแพง
          const off = side * (RUN > 4 ? edge + 3.5 : edge + RUN + 0.7);
          const p = poseAt(t, i * DS - d, off);
          const m = new THREE.Mesh(geo, mats[label]);
          const sy = surfaceAt(t, i * DS - d, off);
          m.position.set(p.x, sy + 1.2, p.z);
          addPost(p.x, p.z, sy, sy + 0.5);
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
        if (pitGap(i, side)) continue;
        const off = side * ((side > 0 ? R(i) : L(i)) + Math.min(3, RUN));
        const q = poseAt(t, i * DS, off);
        const m = new THREE.Mesh(boardGeo, boardMat);
        const sy = surfaceAt(t, i * DS, off);
        m.position.set(q.x, sy + 1.4, q.z);
        // สองเสาใต้ป้าย (ป้ายกว้าง 2.4 ม. ขวางทิศถนน)
        for (const k of [-0.9, 0.9]) addPost(q.x + Math.cos(q.heading) * k, q.z + Math.sin(q.heading) * k, sy, sy + 0.95);
        m.rotation.y = Math.atan2(-Math.cos(q.heading), -Math.sin(q.heading));
        scene.add(m);
      }
    }
  }

  /* ---------- ฉากรอบสนาม: พื้น ต้นไม้ อัฒจันทร์ (ไม่บังถนนข้างหน้าจากมุมกล้อง — ดู terrain.ts) ---------- */
  const nearTrack = terra.nearTrack;
  const MARGIN = terra.margin;
  const SEG = terra.seg;
  {
    const seg = SEG;
    const gw = maxX - minX + 2 * MARGIN;
    const gh = maxZ - minZ + 2 * MARGIN;
    const geo = keep(new THREE.PlaneGeometry(gw, gh, Math.round(gw / seg), Math.round(gh / seg)));
    geo.rotateX(-Math.PI / 2);
    geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, terra.heightAt(p.getX(k), p.getZ(k)));
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
      const gy = groundAt(p.x, p.z);
      // ยอดไม้ (9.5 ม. × ขนาด × ยืดสูงสุด 1.3) ต้องไม่ขึ้นมาบังเส้นสายตาไปถนนข้างหน้า
      if (gy + 9.5 * s * 1.3 > terra.sightFloor(p.x, p.z)) continue;
      pos.set(p.x, gy - 0.1, p.z);
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
    for (const st of terra.stands) {
      const { len, side } = st;
      const g = new THREE.Group();
      g.position.set(st.x, st.y, st.z);
      // แกน x ของกลุ่มตามทิศถนน · แกน z ชี้ออกจากถนน (ฝั่ง side)
      g.rotation.y = -st.heading;
      const tiers = STAND_TIERS;
      const top = tiers * STAND_RISE + STAND_ROOF;
      // ฐานคอนกรีต: ลงไปถึงพื้นต่ำสุดใต้อัฒจันทร์ (บนเนิน ด้านหลังไม่ลอย)
      {
        const depth = tiers * STAND_DEPTH;
        let low = st.y;
        for (let a = -len / 2; a <= len / 2; a += 10)
          for (const b of [0, depth / 2, depth]) {
            const x = st.x + Math.cos(st.heading) * a - Math.sin(st.heading) * b * side;
            const z = st.z + Math.sin(st.heading) * a + Math.cos(st.heading) * b * side;
            low = Math.min(low, groundAt(x, z));
          }
        const h = st.y - low + 0.6;
        const base = new THREE.Mesh(keep(new THREE.BoxGeometry(len, h, depth)), frameMat);
        base.position.set(0, -h / 2 + 0.05, (side * depth) / 2);
        g.add(base);
      }
      for (let k = 0; k < tiers; k++) {
        const step = new THREE.Mesh(keep(new THREE.BoxGeometry(len, STAND_RISE, STAND_DEPTH)), k % 2 ? standMat : frameMat);
        step.position.set(0, STAND_RISE / 2 + k * STAND_RISE, side * (STAND_DEPTH / 2 + k * STAND_DEPTH));
        g.add(step);
      }
      const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.3, tiers * STAND_DEPTH + 2)), roofMat);
      roof.position.set(0, top, side * ((tiers * STAND_DEPTH) / 2 + 0.5));
      g.add(roof);
      for (const x of [-len / 2, 0, len / 2]) {
        const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, top, 0.4)), frameMat);
        post.position.set(x, top / 2, side * (tiers * STAND_DEPTH + 0.6));
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
  type Rig = { root: THREE_NS.Group; body: THREE_NS.Group; steer: THREE_NS.Group[]; spin: THREE_NS.Group[]; setAero?: (open: number) => void; setTyre: (color: string) => void };
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
    // แถบสีแก้มยาง (สีตามชนิดยาง: Soft แดง · Medium เหลือง · Hard ขาว)
    const ring = keep(new THREE.TorusGeometry(R * 0.8, 0.016, 6, 32));
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
    // แถบแก้มยางของรถแต่ละคันแยกวัสดุ (เปลี่ยนสีตามยางที่ใส่)
    const st = isGhost ? ghostMat(stripeMat) : keep(stripeMat.clone());
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
    let tyreHex = "";
    const setTyre = (color: string) => {
      if (color === tyreHex) return;
      tyreHex = color;
      st.color.set(color);
    };
    return { root, body: bodyGroup, steer, spin, setAero, setTyre };
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
  let orbitAngle = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const chaseDir = new THREE.Vector3();
  // การเคลื่อนไหวของตัวรถ (เกลี่ยให้นุ่ม)
  const motion = { roll: 0, pitch: 0, steer: 0, yaw: 0, spin: 0, lastLat: 0, aero: 0, boost: 0 };
  let baseFov = 66;

  /** วางรถ: หันหัวตามทิศของ racing line (ไม่ใช่เส้นกลางถนน) — ระยะเยื้องจากไลน์ (ไถล) คงที่ตลอดช่วงที่ดูทิศ */
  // หันหัวรถตามการเคลื่อนด้านข้าง (เปลี่ยนเลน · เลี้ยวเข้า/ออกพิท) — ไม่ไถลข้างแบบปู
  const sideYaw = new WeakMap<Obj, { s: number; lat: number; yaw: number }>();
  const place = (obj: Obj, s: number, lateral: number, yaw = 0) => {
    const prev = sideYaw.get(obj);
    let turn = prev?.yaw ?? 0;
    if (prev && Math.abs(s - prev.s) < 50) {
      const ds = s - prev.s;
      const want = ds > 0.05 ? Math.max(-0.5, Math.min(0.5, Math.atan2(lateral - prev.lat, ds))) : ds >= 0 ? turn * 0.9 : 0;
      turn += (want - turn) * 0.35;
    } else turn = 0;
    sideYaw.set(obj, { s, lat: lateral, yaw: turn });
    yaw += turn;
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
    update({ s, lateral, ghost: g, speed, accel, dt, aero = 0, rivals: rivalStates, guide, boost = false, tyre }) {
      if (tyre) car.setTyre(tyre);
      drawGuide(s, speed, accel, dt, guide);
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
        if (r.tyre) rv.rig.setTyre(r.tyre);
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
      motion.boost += ((boost ? 1 : 0) - motion.boost) * Math.min(1, dt * 5);
      const fov = baseFov + sp01 * 9 + motion.boost * 7;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      const onKerb = lateral > sample(t, t.wr, s) - 0.6 || lateral < 0.6 - sample(t, t.wl, s) ? 1 : 0;
      const amp = sp01 * sp01 * 0.012 + onKerb * sp01 * 0.03;
      const sx = (Math.random() - 0.5) * amp;
      const sy = (Math.random() - 0.5) * amp;

      fwd.set(0, 0, 1).applyQuaternion(car.root.quaternion);
      if (mode === "orbit") {
        // รีเพลย์: วนรอบรถช้า ๆ เห็นรถคันอื่นรอบ ๆ
        orbitAngle += dt * 0.35;
        const r = 11;
        camPos.copy(car.root.position);
        camPos.x += Math.cos(orbitAngle) * r;
        camPos.z += Math.sin(orbitAngle) * r;
        camPos.y = Math.max(heightAt(t, s), car.root.position.y) + 3.2;
        camera.position.copy(camPos);
        camLook.copy(car.root.position).setY(car.root.position.y + 0.6);
        camera.lookAt(camLook);
      } else if (mode === "tv") {
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
