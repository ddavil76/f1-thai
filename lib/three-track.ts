/* ---------- ประกอบสนามเป็นวัตถุ 3D (ใช้ร่วมกัน: ผังสนาม 3D + รีเพลย์ 3D) ---------- */
// รับ three เป็นพารามิเตอร์ — ไฟล์นี้ไม่ import three เอง ให้ผู้เรียกโหลดแบบ dynamic
// (three ~190 KB ไม่ควรติดไปกับหน้าเว็บตั้งแต่แรก)

import type * as THREE_NS from "three";

type Three = typeof THREE_NS;
export type Vec3 = [number, number, number];

export const F1_RED = "#e10600";

export type TrackMeshes = {
  group: THREE_NS.Group;
  curve: THREE_NS.CatmullRomCurve3;
  /** รัศมีบนพื้น (แนวนอน) ของสนาม — ใช้คำนวณระยะกล้อง */
  radius: number;
  /** สูงสุดของสนาม (หลังขยาย) — 0 = แบน */
  height: number;
  dispose(): void;
};

/** เท็กซ์เจอร์วงแสงนุ่ม ๆ สำหรับ Sprite (จุดรถ/หมุด) */
export function glowTexture(THREE: Three, inner = "rgba(255,80,60,0.8)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, inner);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * สนามจากจุด 3D (ปิดวง): พื้นแอสฟัลต์เป็นริบบิ้น, เส้นกลางแดงเรืองแสง, เส้นสตาร์ทตาหมากรุก
 * ถ้ามีความสูง เพิ่มม่านจาง ๆ จากเส้นสนามลงพื้น ให้มองออกว่าช่วงไหนสูง/ต่ำ
 */
export function buildTrack(THREE: Three, pts: Vec3[], { samples = 700, half = 0.24 } = {}): TrackMeshes {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    "centripetal",
  );
  const radius = Math.max(...pts.map(([x, , z]) => Math.hypot(x, z)));
  const height = Math.max(0, ...pts.map((p) => p[1]));

  // ริบบิ้นพื้นสนาม — ด้านข้างคำนวณจาก tangent บนระนาบพื้น จึงแบนราบไม่บิดตามเนิน
  const pos: number[] = [];
  const curtain: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = (i / samples) % 1;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const len = Math.hypot(t.x, t.z) || 1;
    const nx = -t.z / len;
    const nz = t.x / len;
    pos.push(p.x + nx * half, p.y, p.z + nz * half, p.x - nx * half, p.y, p.z - nz * half);
    curtain.push(p.x, p.y, p.z, p.x, 0, p.z);
    if (i < samples) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const ribbon = keep(new THREE.BufferGeometry());
  ribbon.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  ribbon.setIndex(idx);
  group.add(new THREE.Mesh(ribbon, keep(new THREE.MeshBasicMaterial({ color: 0x1d1d24, side: THREE.DoubleSide }))));

  if (height > 0.05) {
    const wall = keep(new THREE.BufferGeometry());
    wall.setAttribute("position", new THREE.Float32BufferAttribute(curtain, 3));
    wall.setIndex(idx);
    group.add(
      new THREE.Mesh(
        wall,
        keep(new THREE.MeshBasicMaterial({
          color: F1_RED, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false,
        })),
      ),
    );
  }

  const red = new THREE.Color(F1_RED);
  group.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, samples, 0.045, 6, true)), keep(new THREE.MeshBasicMaterial({ color: red }))));
  group.add(
    new THREE.Mesh(
      keep(new THREE.TubeGeometry(curve, samples, 0.15, 8, true)),
      keep(new THREE.MeshBasicMaterial({
        color: red, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
      })),
    ),
  );

  // เส้นสตาร์ท: แผ่นตาหมากรุกขวางสนาม
  const checker = document.createElement("canvas");
  checker.width = 8;
  checker.height = 2;
  const cx = checker.getContext("2d")!;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
    cx.fillStyle = (x + y) % 2 ? "#111" : "#fff";
    cx.fillRect(x, y, 1, 1);
  }
  const tex = keep(new THREE.CanvasTexture(checker));
  tex.magFilter = THREE.NearestFilter;
  const start = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(half * 2.2, 0.14)),
    keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })),
  );
  const p0 = curve.getPointAt(0);
  const t0 = curve.getTangentAt(0);
  start.position.set(p0.x, p0.y + 0.01, p0.z);
  start.rotation.x = -Math.PI / 2;
  start.rotation.z = -Math.atan2(t0.z, t0.x) + Math.PI / 2;
  group.add(start);

  return {
    group,
    curve,
    radius,
    height,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** พื้น grid จาง ๆ ให้รู้สึกถึงมุมมอง */
export function buildGrid(THREE: Three) {
  const grid = new THREE.GridHelper(40, 40, 0x3a1212, 0x1c1012);
  grid.position.y = -0.02;
  const mat = grid.material as THREE_NS.Material;
  mat.transparent = true;
  mat.opacity = 0.7;
  return { grid, dispose: () => { grid.geometry.dispose(); mat.dispose(); } };
}

/** ระยะกล้องที่ทำให้วงกลมรัศมี r พอดีด้านที่แคบกว่าของกรอบ (กล้องเอียง จึงเผื่อ 0.88) */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 0.88) {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return (radius * margin) / Math.sin(Math.min(vHalf, hHalf));
}
