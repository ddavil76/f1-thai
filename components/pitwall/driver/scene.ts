/**
 * ฉาก 3D ของโหมดนักขับ (หน่วยเมตร)
 * — ถนนมีลายยางมะตอย เส้นยางดำ ขอบสนาม kerb ทราย กำแพง รั้วกันเศษ อัฒจันทร์ ต้นไม้ ป้ายนับระยะเบรก
 * — ท้องฟ้า + แสงอาทิตย์ + เงา (กราฟิกสูง) · สะท้อนแสงรอบตัวบนตัวรถ
 * — รถ: ตัวถัง (สร้างในโค้ด หรือโหลดไฟล์ .glb) + ล้อ 4 ล้อแยกชิ้น หมุนตามความเร็ว ล้อหน้าเลี้ยวตามโค้ง
 *   ตัวรถเอียงออกนอกโค้ง หัวทิ่มตอนเบรก ท้ายย่อตอนเร่ง ท้ายปัดตอนไถล
 * ผู้เรียกโหลด three และ addon แบบ dynamic แล้วส่งเข้ามา (ไม่ให้ three เข้า bundle หลักของหน้า)
 */
import type * as THREE_NS from "three";
import { DS, HALF_WIDTH, VMAX, poseAt, sample, type DriveTrack, type Zone } from "@/lib/pitwall/drive/line";
import type { CarFactory } from "@/lib/three-car";

type Three = typeof THREE_NS;
type Obj = THREE_NS.Object3D;

export type CameraMode = "tv" | "chase";
export type Gfx = "high" | "low";

const ZONE_COLOR: Record<Zone, number> = { throttle: 0x22c55e, lift: 0xfacc15, brake: 0xef4444 };
/** ความกว้างของเส้นช่วย (เมตร) */
const LINE_W = 0.9;
/** ระยะกำแพงจากเส้นกลาง (เมตร) */
const WALL_AT = 17;
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

/** ตัวถังจากไฟล์ .glb (ผ่าน normaliseBody แล้ว) · tint = ย้อมสีทีมทับ (โมเดลสีขาวกลาง) */
export type BodyModel = { scene: Obj; tint: boolean };

export type DriveScene = {
  update(p: { s: number; lateral: number; ghost: number | null; speed: number; accel: number; dt: number }): void;
  setCamera(m: CameraMode): void;
  setLine(on: boolean): void;
  resize(): void;
  render(): void;
  dispose(): void;
};

export function createDriveScene(opts: {
  THREE: Three;
  addons: { Sky: new () => THREE_NS.Mesh; RoomEnvironment: new () => THREE_NS.Scene };
  factory: CarFactory;
  body: BodyModel | null;
  el: HTMLElement;
  track: DriveTrack;
  colour: string;
  gfx: Gfx;
}): DriveScene {
  const { THREE, addons, factory, el, track: t, colour, gfx } = opts;
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

  /* ---------- พื้นหญ้า ---------- */
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) {
    minX = Math.min(minX, t.x[i]);
    maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]);
    maxZ = Math.max(maxZ, t.z[i]);
  }
  const gw = maxX - minX + 3000;
  const gh = maxZ - minZ + 3000;
  grassTex.repeat.set(gw / 24, gh / 24);
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(gw, gh)), keep(new THREE.MeshLambertMaterial({ map: grassTex })));
  ground.rotation.x = -Math.PI / 2;
  // ต่ำกว่าถนนพอสมควร กันพื้นหญ้าทับถนนเพราะความละเอียดของ depth buffer (บางเครื่อง)
  ground.position.set((minX + maxX) / 2, -0.3, (minZ + maxZ) / 2);
  ground.receiveShadow = high;
  scene.add(ground);

  /**
   * แถบตามสนามระหว่างระยะเยื้อง a..b (เมตร) ที่ความสูง y · สีต่อช่วงจาก colorOf (null = ไม่วาดช่วงนั้น)
   * uv: u ข้ามถนน (0..1) · v ตามระยะ (1 หน่วย = vScale เมตร) ไว้ปูพื้นผิวซ้ำ
   */
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
      pos.push(p0a.x, y, p0a.z, p1a.x, y, p1a.z, p0b.x, y, p0b.z, p0b.x, y, p0b.z, p1a.x, y, p1a.z, p1b.x, y, p1b.z);
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

  /* ---------- ถนนและขอบ ---------- */
  const W = HALF_WIDTH;
  const corner = (i: number) => Math.abs(t.curve[i]) > 0.006;
  addFlat(new THREE.Mesh(strip(() => -W, () => W, 0, () => 0xffffff, 6), lit(asphalt)));
  // เส้นยางดำตามไลน์ที่รถวิ่ง
  addFlat(new THREE.Mesh(strip((i) => t.lineOffset[i] - 1.0, (i) => t.lineOffset[i] + 1.0, 0.004, () => 0x1c1c20), flat(-1, 0.18)));
  scene.add(new THREE.Mesh(strip(() => W - 0.45, () => W - 0.2, 0.006, () => 0xf2f2f2), flat(-1)));
  scene.add(new THREE.Mesh(strip(() => -W + 0.2, () => -W + 0.45, 0.006, () => 0xf2f2f2), flat(-1)));
  // kerb แดง/ขาวในโค้ง ทั้งสองฝั่ง · ทางวิ่งนอกถนน (runoff) สีทราย/หญ้าเทียม
  const kerb = (i: number) => (corner(i) ? (i % 2 ? 0xd71920 : 0xf4f4f4) : null);
  addFlat(new THREE.Mesh(strip(() => W, () => W + 1.4, 0.03, kerb), lit()));
  addFlat(new THREE.Mesh(strip(() => -W - 1.4, () => -W, 0.03, kerb), lit()));
  addFlat(new THREE.Mesh(strip(() => W, () => W + 9, 0.002, (i) => (corner(i) ? null : 0x5f6d59)), lit()));
  addFlat(new THREE.Mesh(strip(() => -W - 9, () => -W, 0.002, (i) => (corner(i) ? null : 0x5f6d59)), lit()));
  addFlat(new THREE.Mesh(strip(() => W + 1.4, () => W + 12, 0.002, (i) => (corner(i) ? 0xcdb68d : null)), lit()));
  addFlat(new THREE.Mesh(strip(() => -W - 12, () => -W - 1.4, 0.002, (i) => (corner(i) ? 0xcdb68d : null)), lit()));

  // เส้นช่วยสามสี (racing line)
  const lineMesh = new THREE.Mesh(
    strip((i) => t.lineOffset[i] - LINE_W / 2, (i) => t.lineOffset[i] + LINE_W / 2, 0.02, (i) => ZONE_COLOR[t.zone[i]]),
    flat(-2, 0.9),
  );
  scene.add(lineMesh);

  // เส้นสตาร์ท/เส้นชัยลายตาหมากรุก
  {
    const tex = canvasTex(64, 8, (g) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }, false);
    tex.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * 2, 1.6)), keep(new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3 })));
    const p = poseAt(t, 0);
    // แผ่นวางราบ ด้านกว้าง (แกน x) ขวางถนน: หมุนรอบแกนตั้ง -heading - 90°
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.y = -p.heading - Math.PI / 2;
    holder.position.set(p.x, 0.03, p.z);
    holder.add(m);
    scene.add(holder);
  }

  /* ---------- กำแพง + รั้วกันเศษ ---------- */
  const wallStrip = (side: number, y0: number, y1: number, colorOf: (i: number) => [number, number, number], vScale = 4) => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < t.n; i++) {
      const a = poseAt(t, i * DS, side * WALL_AT);
      const b = poseAt(t, (i + 1) * DS, side * WALL_AT);
      pos.push(a.x, y0, a.z, b.x, y0, b.z, a.x, y1, a.z, a.x, y1, a.z, b.x, y0, b.z, b.x, y1, b.z);
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
    const w = new THREE.Mesh(wallStrip(side, 0, 1.1, (i) => (Math.floor(i / 3) % 2 ? [0.86, 0.86, 0.88] : [0.13, 0.32, 0.72])), wallMat);
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
          const p = poseAt(t, i * DS - d, side * (W + 3.5));
          const m = new THREE.Mesh(geo, mats[label]);
          m.position.set(p.x, 1.2, p.z);
          // หันหน้าป้าย (แกน z) เข้าหารถที่วิ่งมา
          m.rotation.y = Math.atan2(-Math.cos(p.heading), -Math.sin(p.heading));
          m.castShadow = high;
          scene.add(m);
        }
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
      const off = WALL_AT + 14 + r() ** 1.6 * 160;
      const p = poseAt(t, i * DS, side * off);
      if (nearTrack(p.x, p.z, WALL_AT + 10)) continue;
      const s = 0.7 + r() * 0.8;
      pos.set(p.x, -0.3, p.z);
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
      const p = poseAt(t, mid, side * (WALL_AT + 6));
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
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
  type Rig = { root: THREE_NS.Group; body: THREE_NS.Group; steer: THREE_NS.Group[]; spin: THREE_NS.Group[] };
  const tyreMat = keep(new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85 }));
  const rimMat = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.85 }));
  const stripeMat = keep(new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.6 }));
  const wheelGeos = (w: number) => {
    const tyre = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, w, 28, 1));
    tyre.rotateZ(Math.PI / 2);
    const rim = keep(new THREE.CylinderGeometry(0.2, 0.2, w + 0.012, 18, 1));
    rim.rotateZ(Math.PI / 2);
    // ซี่ล้อ 2 แท่งไขว้ ให้เห็นล้อหมุน
    const spoke = keep(new THREE.BoxGeometry(w + 0.02, 0.36, 0.05));
    const ring = keep(new THREE.TorusGeometry(WHEEL_R * 0.78, 0.012, 6, 28));
    ring.rotateY(Math.PI / 2);
    return { tyre, rim, spoke, ring };
  };
  const geoF = wheelGeos(0.3);
  const geoR = wheelGeos(0.4);

  const makeRig = (colourHex: string, isGhost: boolean): Rig => {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);
    if (opts.body && !isGhost) {
      const clone = opts.body.scene.clone(true);
      if (opts.body.tint) {
        const c = new THREE.Color(colourHex);
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
      const made = factory.make(colourHex);
      // ล้อของรถสำเร็จรูปติดกับตัวถัง — ซ่อนไว้ ใช้ล้อแยกชิ้นข้างล่างแทน
      made.obj.children.forEach((ch, k) => {
        if (k === 2 || k === 3) ch.visible = false;
      });
      made.body.roughness = 0.25;
      made.body.metalness = 0.45;
      bodyGroup.add(made.obj);
      if (isGhost) made.setOpacity(0.3);
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
    for (const [x, z, w, front] of WHEELS) {
      const holder = new THREE.Group();
      holder.position.set(x, WHEEL_R, z);
      const sp = new THREE.Group();
      const g = w === 0.3 ? geoF : geoR;
      sp.add(new THREE.Mesh(g.tyre, tm), new THREE.Mesh(g.rim, rm));
      const s1 = new THREE.Mesh(g.spoke, rm);
      const s2 = new THREE.Mesh(g.spoke, rm);
      s2.rotation.x = Math.PI / 2;
      sp.add(s1, s2);
      // แถบสีข้างยาง (สองฝั่ง)
      for (const side of [-1, 1]) {
        const ringMesh = new THREE.Mesh(g.ring, st);
        ringMesh.position.x = side * (w / 2 + 0.002);
        sp.add(ringMesh);
      }
      sp.traverse((o) => (o.castShadow = high && !isGhost));
      holder.add(sp);
      root.add(holder);
      if (front) steer.push(holder);
      spin.push(sp);
    }
    bodyGroup.traverse((o) => (o.castShadow = high && !isGhost));
    return { root, body: bodyGroup, steer, spin };
  };

  const car = makeRig(colour, false);
  scene.add(car.root);
  const ghost = makeRig("#ffffff", true);
  ghost.root.visible = false;
  scene.add(ghost.root);

  let mode: CameraMode = "tv";
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  // การเคลื่อนไหวของตัวรถ (เกลี่ยให้นุ่ม)
  const motion = { roll: 0, pitch: 0, steer: 0, yaw: 0, spin: 0, lastLat: 0 };
  let baseFov = 66;

  const place = (obj: Obj, s: number, lateral: number, yaw = 0) => {
    const p = poseAt(t, s, lateral);
    obj.position.set(p.x, 0, p.z);
    tmp.set(p.x + Math.cos(p.heading + yaw), 0, p.z + Math.sin(p.heading + yaw));
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
    update({ s, lateral, ghost: g, speed, accel, dt }) {
      const curve = sample(t, t.curve, s);
      const k = Math.min(1, dt * 8);
      // ไถล: ท้ายปัดตามความเร็วที่หลุดออกด้านข้าง
      const latRate = dt > 0 ? (lateral - motion.lastLat) / dt : 0;
      motion.lastLat = lateral;
      const slideYaw = speed > 3 ? -Math.atan2(latRate, speed) * 1.4 : 0;
      motion.yaw += (Math.max(-0.35, Math.min(0.35, slideYaw)) - motion.yaw) * k;
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
      car.body.rotation.set(motion.pitch, 0, motion.roll);
      for (const st of car.steer) st.rotation.y = motion.steer;
      for (const sp of car.spin) sp.rotation.x = motion.spin;

      if (g === null) ghost.root.visible = false;
      else {
        ghost.root.visible = true;
        place(ghost.root, g, t.lineOffset[Math.floor((((g / DS) % t.n) + t.n) % t.n)]);
        for (const sp of ghost.spin) sp.rotation.x = motion.spin;
      }

      // ความรู้สึกเร็ว: มุมกล้องกว้างขึ้นตามความเร็ว + สั่นเล็กน้อย (มากขึ้นตอนขึ้น kerb)
      const sp01 = Math.min(1, speed / VMAX);
      const fov = baseFov + sp01 * 9;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      const onKerb = Math.abs(lateral) > HALF_WIDTH - 0.6 ? 1 : 0;
      const amp = sp01 * sp01 * 0.012 + onKerb * sp01 * 0.03;
      const sx = (Math.random() - 0.5) * amp;
      const sy = (Math.random() - 0.5) * amp;

      fwd.set(0, 0, 1).applyQuaternion(car.root.quaternion);
      if (mode === "tv") {
        // เหนือหัวนักขับ เห็นหมวก จมูกรถ และล้อหน้าด้านล่างจอ · เอียงตามตัวรถนิดหน่อย
        camPos.copy(car.root.position).addScaledVector(fwd, 0.15).setY(1.32 + sy);
        camLook.copy(car.root.position).addScaledVector(fwd, 16).setY(0.35);
        camera.position.copy(camPos);
        camera.position.x += sx;
        camera.lookAt(camLook);
        camera.rotateZ(-motion.roll * 0.6);
      } else {
        // ตามหลังแบบหน่วงนิด ๆ ให้เห็นรถเลี้ยว
        const back = Math.min(9.5, 7 + speed * 0.03);
        tmp.copy(car.root.position).addScaledVector(fwd, -back).setY(2.7);
        camPos.lerp(tmp, camPos.lengthSq() === 0 ? 1 : 0.18);
        camLook.copy(car.root.position).addScaledVector(fwd, 6).setY(0.9);
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
      camPos.set(0, 0, 0);
    },
    setLine(on) {
      lineMesh.visible = on;
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
