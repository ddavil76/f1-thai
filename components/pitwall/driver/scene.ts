/**
 * ฉาก 3D ของโหมดนักขับ (หน่วยเมตร) — ถนน ขอบสนาม kerb กำแพง ป้ายนับระยะเบรก เส้นช่วยสามสี
 * รถของเรา + รถเงา และกล้องแบบ TV pod (เหนือหัวนักขับ) หรือกล้องตามหลัง
 * ผู้เรียกโหลด three แบบ dynamic แล้วส่งเข้ามา (ไม่ให้ three เข้า bundle หลักของหน้า)
 */
import type * as THREE_NS from "three";
import { DS, HALF_WIDTH, poseAt, type DriveTrack, type Zone } from "@/lib/pitwall/drive/line";
import type { CarFactory } from "@/lib/three-car";

type Three = typeof THREE_NS;

export type CameraMode = "tv" | "chase";

const ZONE_COLOR: Record<Zone, number> = { throttle: 0x22c55e, lift: 0xfacc15, brake: 0xef4444 };
/** ความกว้างของเส้นช่วย (เมตร) */
const LINE_W = 0.9;
/** ระยะกำแพงจากเส้นกลาง (เมตร) */
const WALL_AT = 17;

export type DriveScene = {
  update(p: { s: number; lateral: number; ghost: number | null; speed: number }): void;
  setCamera(m: CameraMode): void;
  setLine(on: boolean): void;
  resize(): void;
  render(): void;
  dispose(): void;
};

export function createDriveScene(opts: {
  THREE: Three;
  factory: CarFactory;
  el: HTMLElement;
  track: DriveTrack;
  colour: string;
  low: boolean;
}): DriveScene {
  const { THREE, factory, el, track: t, colour, low } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.75));
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const SKY = 0xbcd8ee;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 120, low ? 520 : 820);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.25, 1200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4b6b3a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // พื้นหญ้า
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) {
    minX = Math.min(minX, t.x[i]);
    maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]);
    maxZ = Math.max(maxZ, t.z[i]);
  }
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(maxX - minX + 2000, maxZ - minZ + 2000)),
    keep(new THREE.MeshLambertMaterial({ color: 0x4f7d3c })),
  );
  ground.rotation.x = -Math.PI / 2;
  // ต่ำกว่าถนนพอสมควร กันพื้นหญ้าทับถนนเพราะความละเอียดของ depth buffer (บางเครื่อง)
  ground.position.set((minX + maxX) / 2, -0.3, (minZ + maxZ) / 2);
  scene.add(ground);

  /** แถบตามสนามระหว่างระยะเยื้อง a..b (เมตร) ที่ความสูง y · สีต่อช่วงจาก colorOf (null = ไม่วาดช่วงนั้น) */
  const strip = (a: (i: number) => number, b: (i: number) => number, y: number, colorOf: (i: number) => number | null) => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < t.n; i++) {
      const hex = colorOf(i);
      if (hex === null) continue;
      const j = (i + 1) % t.n;
      const p0a = poseAt(t, i * DS, a(i));
      const p0b = poseAt(t, i * DS, b(i));
      const p1a = poseAt(t, j * DS + (j === 0 ? t.length : 0), a(j));
      const p1b = poseAt(t, j * DS + (j === 0 ? t.length : 0), b(j));
      pos.push(p0a.x, y, p0a.z, p1a.x, y, p1a.z, p0b.x, y, p0b.z, p0b.x, y, p0b.z, p1a.x, y, p1a.z, p1b.x, y, p1b.z);
      c.setHex(hex);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const flat = (polygonOffset: number) =>
    keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: polygonOffset, polygonOffsetUnits: polygonOffset }));
  const lit = () => keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  const W = HALF_WIDTH;
  const corner = (i: number) => Math.abs(t.curve[i]) > 0.006;
  // ถนน + เส้นขาวขอบถนน
  scene.add(new THREE.Mesh(strip(() => -W, () => W, 0, () => 0x3b3c41), lit()));
  scene.add(new THREE.Mesh(strip(() => W - 0.45, () => W - 0.2, 0.005, () => 0xf2f2f2), flat(-1)));
  scene.add(new THREE.Mesh(strip(() => -W + 0.2, () => -W + 0.45, 0.005, () => 0xf2f2f2), flat(-1)));
  // kerb แดง/ขาวในโค้ง ทั้งสองฝั่ง · ทางวิ่งนอกถนน (runoff) สีทราย
  const kerb = (i: number) => (corner(i) ? (Math.floor(i / 1) % 2 ? 0xd71920 : 0xf4f4f4) : null);
  scene.add(new THREE.Mesh(strip(() => W, () => W + 1.4, 0.01, kerb), lit()));
  scene.add(new THREE.Mesh(strip(() => -W - 1.4, () => -W, 0.01, kerb), lit()));
  scene.add(new THREE.Mesh(strip(() => W, () => W + 9, 0.002, (i) => (corner(i) ? null : 0x6b6b5e)), lit()));
  scene.add(new THREE.Mesh(strip(() => -W - 9, () => -W, 0.002, (i) => (corner(i) ? null : 0x6b6b5e)), lit()));
  scene.add(new THREE.Mesh(strip(() => W + 1.4, () => W + 11, 0.002, (i) => (corner(i) ? 0xc9b38a : null)), lit()));
  scene.add(new THREE.Mesh(strip(() => -W - 11, () => -W - 1.4, 0.002, (i) => (corner(i) ? 0xc9b38a : null)), lit()));

  // เส้นช่วยสามสี (racing line)
  const lineMesh = new THREE.Mesh(
    strip((i) => t.lineOffset[i] - LINE_W / 2, (i) => t.lineOffset[i] + LINE_W / 2, 0.02, (i) => ZONE_COLOR[t.zone[i]]),
    flat(-2),
  );
  scene.add(lineMesh);

  // เส้นสตาร์ท/เส้นชัยลายตาหมากรุก
  {
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 8;
    const g = cv.getContext("2d")!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
      g.fillRect(x * 4, y * 4, 4, 4);
    }
    const tex = keep(new THREE.CanvasTexture(cv));
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

  // กำแพงยาง/แบริเออร์ทั้งสองข้าง — ช่วยให้รู้สึกถึงความเร็ว
  {
    const pos: number[] = [];
    const col: number[] = [];
    const H = 1.1;
    for (const side of [-1, 1]) {
      for (let i = 0; i < t.n; i++) {
        const j = (i + 1) % t.n;
        const a = poseAt(t, i * DS, side * WALL_AT);
        const b = poseAt(t, j * DS + (j === 0 ? t.length : 0), side * WALL_AT);
        pos.push(a.x, 0, a.z, b.x, 0, b.z, a.x, H, a.z, a.x, H, a.z, b.x, 0, b.z, b.x, H, b.z);
        const stripe = Math.floor(i / 3) % 2 ? [0.85, 0.85, 0.86] : [0.12, 0.33, 0.75];
        for (let k = 0; k < 6; k++) col.push(...stripe);
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, lit()));
  }

  // ป้ายนับระยะเบรก 150 / 100 / 50 ม. ก่อนโซนเบรกที่ต่อจากทางเร่ง
  {
    const boardTex = (label: string) => {
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 64;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#111";
      g.font = "bold 30px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 32, 34);
      return keep(new THREE.CanvasTexture(cv));
    };
    const mats = Object.fromEntries(["150", "100", "50"].map((l) => [l, keep(new THREE.MeshLambertMaterial({ map: boardTex(l) }))]));
    const geo = keep(new THREE.BoxGeometry(1.4, 1.4, 0.12));
    for (let i = 0; i < t.n; i++) {
      const prev = (i - 1 + t.n) % t.n;
      if (t.zone[i] !== "brake" || t.zone[prev] !== "throttle") continue;
      for (const [d, label] of [[150, "150"], [100, "100"], [50, "50"]] as const) {
        const s = i * DS - d;
        for (const side of [-1, 1]) {
          const p = poseAt(t, s, side * (W + 3.5));
          const m = new THREE.Mesh(geo, mats[label]);
          m.position.set(p.x, 1.2, p.z);
          // หันหน้าป้าย (แกน z) เข้าหารถที่วิ่งมา
          m.rotation.y = Math.atan2(-Math.cos(p.heading), -Math.sin(p.heading));
          scene.add(m);
        }
      }
    }
  }

  // รถของเรา + รถเงา
  const car = factory.make(colour);
  scene.add(car.obj);
  const ghost = factory.make("#ffffff");
  ghost.setOpacity(0.32);
  ghost.obj.visible = false;
  scene.add(ghost.obj);

  let mode: CameraMode = "tv";
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const place = (obj: THREE_NS.Object3D, s: number, lateral: number) => {
    const p = poseAt(t, s, lateral);
    obj.position.set(p.x, 0, p.z);
    tmp.set(p.x + Math.cos(p.heading), 0, p.z + Math.sin(p.heading));
    obj.lookAt(tmp);
  };

  const resize = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // จอแนวตั้ง (มือถือ) กว้างมุมขึ้น จะได้เห็นโค้งข้างหน้า
    camera.fov = w < h ? 82 : 66;
    camera.updateProjectionMatrix();
  };
  resize();

  return {
    update({ s, lateral, ghost: g, speed }) {
      place(car.obj, s, lateral);
      if (g === null) ghost.obj.visible = false;
      else {
        ghost.obj.visible = true;
        place(ghost.obj, g, t.lineOffset[Math.floor((((g / DS) % t.n) + t.n) % t.n)]);
      }
      // กล้องผูกกับรถ: TV pod เหนือหัวนักขับมองไปข้างหน้า / ตามหลังสูงขึ้น
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.obj.quaternion);
      if (mode === "tv") {
        // เหนือหัวนักขับ เห็นหมวก จมูกรถ และล้อหน้าด้านล่างจอ
        camPos.copy(car.obj.position).addScaledVector(fwd, 0.15).setY(1.32);
        camLook.copy(car.obj.position).addScaledVector(fwd, 16).setY(0.35);
        camera.position.copy(camPos);
      } else {
        // ตามหลังแบบหน่วงนิด ๆ ให้เห็นรถเลี้ยว
        const back = Math.min(9.5, 7 + speed * 0.03);
        tmp.copy(car.obj.position).addScaledVector(fwd, -back).setY(2.7);
        camPos.lerp(tmp, camPos.lengthSq() === 0 ? 1 : 0.18);
        camLook.copy(car.obj.position).addScaledVector(fwd, 6).setY(0.9);
        camera.position.copy(camPos);
      }
      camera.lookAt(camLook);
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
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
