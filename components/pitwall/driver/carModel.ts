/**
 * รถของโหมดนักขับแบบละเอียด (หน่วยเมตร) — ทรงรถยุค ground effect (แบบรถปี 2022 ขึ้นไป)
 * จมูกยาวเรียวต่อปีกหน้า · ปีกหน้า 4 ชั้นโค้งยกขึ้นด้านนอก · sidepod ใหญ่ ปากรับลมแบน ด้านบนลาดลงท้าย ใต้ sidepod เว้าลึก
 * ฝาครอบเครื่องกว้าง · ปีกหลังปลายโค้งมนลงหาแผ่นข้าง + beam wing · พื้นรถมีครีบด้านหน้าและปีกขอบพื้น · halo กระจกมองข้าง
 * — ผิวตัวถัง/ปีกทำจากหน้าตัดหลายจุดลากต่อกันเป็นโค้งเรียบ · ลิเวอรีและสปอนเซอร์สมมติวาดบน canvas (liveries.ts)
 * — ไม่มีล้อ (ฉากใส่ล้อแยกชิ้นที่หมุน/เลี้ยวได้เอง) · หน้ารถชี้ +z ล้อหน้า z = +1.8 ล้อหลัง z = -1.8
 */
import type * as THREE_NS from "three";
import { designOf, drawLogo, drawNumber, paintBody, type Design } from "./liveries";

type Three = typeof THREE_NS;
type Geo = THREE_NS.BufferGeometry;
type Mat = THREE_NS.Material;
type V3 = [number, number, number];

/** team = id ทีมในเกม (เลือกลิเวอรี) · colour/ink = สีทีม (ใช้เมื่อไม่มีลิเวอรีของทีมนั้น) */
export type Livery = { team: string; colour: string; ink: string; num: number };

/** หน้าตัดของตัวถัง: z, กึ่งกลาง x/y, ครึ่งกว้าง, ครึ่งสูง */
type Section = [z: number, xc: number, yc: number, w: number, h: number];

// ลำตัว: จมูกยาวเรียวลงไปแตะปีกหน้า → ห้องนักขับ → ฝาครอบเครื่องสูงหลังหัว → ท้ายเรียว
const TUB: Section[] = [
  [3.06, 0, 0.16, 0.05, 0.035],
  [2.8, 0, 0.2, 0.09, 0.06],
  [2.35, 0, 0.27, 0.13, 0.1],
  [1.85, 0, 0.35, 0.18, 0.145],
  [1.35, 0, 0.42, 0.23, 0.185],
  [0.9, 0, 0.46, 0.27, 0.215],
  [0.45, 0, 0.47, 0.29, 0.225],
  [0.08, 0, 0.53, 0.28, 0.3],
  [-0.35, 0, 0.55, 0.27, 0.32],
  [-0.9, 0, 0.5, 0.22, 0.27],
  [-1.4, 0, 0.42, 0.16, 0.19],
  [-1.85, 0, 0.35, 0.1, 0.13],
  [-2.2, 0, 0.31, 0.05, 0.07],
];
// sidepod ขวา (ซ้ายสะท้อน): ปากรับลมแบนกว้างอยู่สูง ด้านบนลาดลงหาท้าย (downwash) ใต้ sidepod ยกสูงจากพื้นรถมาก
const POD: Section[] = [
  [1.02, 0.42, 0.47, 0.16, 0.07],
  [0.82, 0.5, 0.47, 0.22, 0.12],
  [0.42, 0.53, 0.44, 0.26, 0.17],
  [-0.1, 0.48, 0.38, 0.25, 0.2],
  [-0.62, 0.38, 0.31, 0.2, 0.18],
  [-1.1, 0.27, 0.25, 0.13, 0.13],
  [-1.5, 0.17, 0.22, 0.06, 0.08],
];

/** ค่าแบบโค้งเรียบผ่านทุกจุด (Catmull-Rom) */
function catmull(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * ลากผิวผ่านหน้าตัด (ทรง superellipse — เหลี่ยมมนแบบตัวถังรถ) · ปิดหัวท้ายเป็นกลุ่มวัสดุที่ 1
 * UV: u = ตามความยาว (หน้า 0 → ท้าย 1), v = รอบตัว (ใต้ท้อง 0 → ข้าง +x → หลังคา 0.5 → ข้าง −x → 1)
 */
function loft(THREE: Three, secs: Section[], along: number, around: number, exp: number, mirror = false): Geo {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = secs.length;
  const ring = around + 1;
  const sec = (i: number) => secs[Math.max(0, Math.min(n - 1, i))];
  const rings: Section[] = [];
  for (let k = 0; k <= along; k++) {
    const f = (k / along) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    const s = [0, 1, 2, 3, 4].map((j) => catmull(sec(i - 1)[j], sec(i)[j], sec(i + 1)[j], sec(i + 2)[j], t)) as Section;
    rings.push(s);
    for (let a = 0; a <= around; a++) {
      const th = -Math.PI / 2 + (a / around) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const px = Math.sign(c) * Math.abs(c) ** (2 / exp) * s[3];
      const py = Math.sign(sn) * Math.abs(sn) ** (2 / exp) * s[4];
      pos.push((s[1] + px) * (mirror ? -1 : 1), s[2] + py, s[0]);
      uv.push(k / along, a / around);
    }
  }
  for (let k = 0; k < along; k++) {
    for (let a = 0; a < around; a++) {
      const p = k * ring + a;
      const q = p + ring;
      if (mirror) idx.push(p, p + 1, q, q, p + 1, q + 1);
      else idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const sideCount = idx.length;
  for (const [k, flip] of [[0, true], [along, false]] as const) {
    const s = rings[k];
    const centre = pos.length / 3;
    pos.push(s[1] * (mirror ? -1 : 1), s[2], s[0]);
    uv.push(k / along, 0.5);
    for (let a = 0; a < around; a++) {
      const p = k * ring + a;
      if (flip === mirror) idx.push(centre, p + 1, p);
      else idx.push(centre, p, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, sideCount, 0);
  g.addGroup(sideCount, idx.length - sideCount, 1);
  g.computeVertexNormals();
  return g;
}

/** จุดตามความยาวปีก: ขอบหน้า (x, y, z) · ความยาวคอร์ด · มุมเงย · ความหนา · แนวตั้งฉากกับปีกในระนาบ x-y (ปลายปีกโค้งลงได้) */
type Station = { x: number; y: number; z: number; chord: number; angle: number; thick: number; nx: number; ny: number };

/**
 * ปีกแบบแอร์ฟอยล์ลากตามจุด Station (ปีกโค้ง/บิด/ปลายม้วนลงได้)
 * UV: u = ตามความยาวปีก (จุดแรก 0 → จุดสุดท้าย 1) · v = รอบแอร์ฟอยล์ (0–0.5 ผิวบนจากขอบท้ายถึงขอบหน้า, 0.5–1 ผิวล่าง)
 */
function wingLoft(THREE: Three, st: Station[], N = 8): Geo {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ring = 2 * N + 1;
  st.forEach((s, k) => {
    const ca = Math.cos(s.angle);
    const sa = Math.sin(s.angle);
    // ทิศคอร์ด: ถอยหลัง (−z) แล้วเงยขึ้นตามแนวตั้งฉากปีก · ทิศความหนา: ตั้งฉากกับคอร์ด
    const dir: V3 = [s.nx * sa, s.ny * sa, -ca];
    const perp: V3 = [s.nx * ca, s.ny * ca, sa];
    const camber = (t: number) => Math.sqrt(t) * (1 - t) * 2.6 * s.thick;
    for (let j = 0; j <= 2 * N; j++) {
      const upper = j <= N;
      const t = upper ? 1 - j / N : (j - N) / N;
      const off = upper ? camber(t) : -camber(t) * 0.3;
      pos.push(s.x + dir[0] * t * s.chord + perp[0] * off, s.y + dir[1] * t * s.chord + perp[1] * off, s.z + dir[2] * t * s.chord + perp[2] * off);
      uv.push(k / (st.length - 1), j / (2 * N));
    }
  });
  for (let k = 0; k < st.length - 1; k++)
    for (let j = 0; j < 2 * N; j++) {
      const p = k * ring + j;
      const q = p + ring;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  // ฝาปิดปลายปีก
  for (const k of [0, st.length - 1]) {
    const c = pos.length / 3;
    const s = st[k];
    pos.push(s.x + (s.chord / 2) * Math.sin(s.angle) * s.nx, s.y + (s.chord / 2) * Math.sin(s.angle) * s.ny, s.z - (s.chord / 2) * Math.cos(s.angle));
    uv.push(k / (st.length - 1), 0.5);
    for (let j = 0; j < 2 * N; j++) idx.push(c, k * ring + j, k * ring + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** แผ่นบาง ๆ จากโครงร่าง 2D บนระนาบ zy วางที่ x */
function plate(THREE: Three, pts: [number, number][], x: number, thick: number): Geo {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(x + thick / 2, 0, 0);
  return g;
}

/**
 * แผ่นเรียบรูปทรงตามโครงร่าง (z, y) ตั้งฉากแกน x ที่ x · facing = +1 หันออก +x · UV 0..1 ตามกรอบรูป (u ตาม z, v ตาม y)
 * ใช้กับแผ่นข้างปีกที่มีลายสปอนเซอร์
 */
function panel(THREE: Three, pts: [number, number][], x: number, facing: 1 | -1): Geo {
  const zs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [z0, z1, y0, y1] = [Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)];
  // หมุนรอบแกน y ±90° → แกน x ของรูป = z ของโลก (กลับเครื่องหมายเมื่อหันออก +x)
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(facing > 0 ? -z : z, y))));
  g.rotateY((facing * Math.PI) / 2);
  g.translate(x, 0, 0);
  const p = g.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getZ(i) - z0) / (z1 - z0);
    uv[i * 2 + 1] = (p.getY(i) - y0) / (y1 - y0);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  // ให้ด้านหน้าของแผ่นหันออกตาม facing เสมอ (ลำดับจุดของรูปอาจกลับด้านหลังหมุน)
  g.computeVertexNormals();
  if (Math.sign(g.getAttribute("normal").getX(0)) !== facing) {
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** แท่งกลมจาก a ไป b */
function rod(THREE: Three, a: V3, b: V3, r: number): Geo {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate(va.x, va.y, va.z);
  return g;
}

/* ---------- ลิเวอรี ---------- */

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

/** พื้นผิวตัวถัง: ลวดลาย + สปอนเซอร์หลักข้างฝาครอบเครื่อง + รอง 2 ข้างจมูก + เลขรถบนจมูก/ข้างฝาครอบ */
function tubTexture(d: Design, num: number) {
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  paintBody(g, W, H, d, "tub");
  // u (แกน x) = หน้า → ท้าย ตามความยาวลำตัว z 3.06 → −2.2
  const U = (z: number) => ((3.06 - z) / 5.26) * W;
  // ข้าง +x อยู่ครึ่งล่าง (อ่านตรง) · ข้าง −x ครึ่งบน (หมุน 180° ให้อ่านตรง)
  const both = (z: number, v: number, draw: () => void) => {
    for (const [y, rot] of [[H * (1 - v), 0], [H * v, Math.PI]] as const) {
      g.save();
      g.translate(U(z), y);
      g.rotate(rot);
      draw();
      g.restore();
    }
  };
  both(-0.75, 0.3, () => drawLogo(g, d.sponsors[0], 440, 120, d.styles[0], d.ink, d.base));
  both(2.05, 0.3, () => drawLogo(g, d.sponsors[2], 300, 70, d.styles[2], d.ink, d.base));
  both(0.0, 0.32, () => drawNumber(g, num, 90, d.ink, d.base));
  // เลขรถบนจมูก หันให้อ่านได้จากกล้องหลังนักขับ
  g.save();
  g.translate(U(2.55), H * 0.5);
  g.rotate(-Math.PI / 2);
  drawNumber(g, num, 110, d.ink, d.base);
  g.restore();
  return c;
}

/** พื้นผิว sidepod: สปอนเซอร์รอง 1 ตัวใหญ่ด้านนอก · flip = sidepod ฝั่ง −x (เรขาคณิตสะท้อน ตัวอักษรต้องกลับซ้ายขวา) */
function podTexture(d: Design, flip: boolean) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  paintBody(g, W, H, d, "pod");
  g.save();
  g.translate(W * 0.42, H * 0.72);
  if (flip) g.scale(-1, 1);
  drawLogo(g, d.sponsors[1], 520, 120, d.styles[1], d.ink, d.base);
  g.restore();
  return c;
}

/** พื้นผิวปีก: สีหลัก + ขอบท้ายสีเน้น + สปอนเซอร์ตามความยาวปีกบนผิวบน (ซ้าย/ขวา หรือกลางปีก) */
function wingTexture(d: Design, name: string, layout: "centre" | "pair") {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = d.base;
  g.fillRect(0, 0, W, H);
  // ขอบท้ายปีก (v ≈ 0 และ 1) สีเน้น
  g.fillStyle = d.accent;
  g.fillRect(0, H - 14, W, 14);
  g.fillRect(0, 0, W, 10);
  // ผิวล่างสีเข้ม
  g.fillStyle = d.second;
  g.fillRect(0, 0, W, H * 0.48);
  // ผิวบน: v 0..0.5 → แถว canvas H..H/2 · กลับซ้ายขวาให้อ่านตรงเมื่อมองจากด้านหลังรถ
  const at = layout === "centre" ? [0.5] : [0.25, 0.75];
  for (const u of at) {
    g.save();
    g.translate(W * u, H * 0.74);
    g.scale(-1, 1);
    drawLogo(g, name, layout === "centre" ? W * 0.5 : W * 0.3, H * 0.34, "box", d.ink, d.base);
    g.restore();
  }
  return c;
}

/**
 * ลายแผ่นข้างปีก: สีหลัก ขอบล่างสีรอง และโลโก้สปอนเซอร์ · u = ตามความยาวรถ (z น้อย → มาก = ท้าย → หน้า)
 * ฝั่ง +x มองจากด้านข้างหน้ารถอยู่ซ้ายมือ (u ลดลงเมื่ออ่านจากซ้ายไปขวา) → กลับซ้ายขวา
 */
function panelTexture(d: Design, name: string, style: Design["styles"][number], facing: 1 | -1) {
  const W = 512;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = d.base;
  g.fillRect(0, 0, W, H);
  g.fillStyle = d.second;
  g.fillRect(0, H * 0.8, W, H * 0.2);
  g.fillStyle = d.accent;
  g.fillRect(0, H * 0.78, W, H * 0.025);
  g.save();
  g.translate(W / 2, H * 0.45);
  if (facing > 0) g.scale(-1, 1);
  drawLogo(g, name, W * 0.8, H * 0.24, style, d.ink, d.base);
  g.restore();
  return c;
}

/** ลายคาร์บอนเล็ก ๆ (สานไขว้) */
function carbonTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = "#16171a";
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? "#1f2024" : "#121316";
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  return c;
}

/** setAero(0..1): 0 = ปีกปกติ (โค้ง) · 1 = ปีกพับราบ (Straight Mode — ลดแรงต้านบนทางตรง) */
export type CarModel = { obj: THREE_NS.Group; setAero(open: number): void; dispose(): void };

/** แกนหมุนของปีกพับ [y, z] (ขอบหน้าแผ่นปีก) และมุมพับสูงสุด (เรเดียน, ลบ = ขอบท้ายลดลง) */
const FW_PIVOT = [0.14, 2.8] as const;
const RW_PIVOT = [0.96, -2.42] as const;
const FW_OPEN = -0.35;
const RW_OPEN = -0.4;

export function buildCar(THREE: Three, merge: (g: Geo[]) => Geo | null, l: Livery, opts: { ghost?: boolean } = {}): CarModel {
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (own.push(x), x);
  const ghost = !!opts.ghost;
  const d = designOf(l.team, l.colour, l.ink);
  const fade = <T extends Mat>(m: T) => {
    if (ghost) {
      m.transparent = true;
      m.opacity = 0.3;
      m.depthWrite = false;
    }
    return keep(m);
  };
  const tex = (c: HTMLCanvasElement, repeat = false) => {
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
    }
    return t;
  };
  /** สีกึ่งด้าน + เคลือบใส (ลิเวอรีสมัยใหม่) */
  const paintMat = (map: THREE_NS.Texture | null, colour = 0xffffff, side: THREE_NS.Side = THREE.FrontSide, coat = 0.7) =>
    fade(new THREE.MeshPhysicalMaterial({ color: ghost ? 0xffffff : colour, map: ghost ? null : map, roughness: 0.42, metalness: 0.1, clearcoat: coat, clearcoatRoughness: 0.2, side }));

  const tubMat = paintMat(ghost ? null : tex(tubTexture(d, l.num)));
  const podR = paintMat(ghost ? null : tex(podTexture(d, false)));
  const podL = paintMat(ghost ? null : tex(podTexture(d, true)));
  // ปีกเคลือบน้อยกว่า (มุมแคบสะท้อนฟ้าจนขาว)
  const rwMat = paintMat(ghost ? null : tex(wingTexture(d, d.sponsors[0], "centre")), 0xffffff, THREE.DoubleSide, 0.2);
  const fwMat = paintMat(ghost ? null : tex(wingTexture(d, d.sponsors[2], "pair")), 0xffffff, THREE.DoubleSide, 0.2);
  const accent = paintMat(null, ghost ? 0xffffff : new THREE.Color(d.base).getHex(), THREE.DoubleSide);
  const second = paintMat(null, ghost ? 0xffffff : new THREE.Color(d.second).getHex(), THREE.DoubleSide);
  const carbon = fade(new THREE.MeshStandardMaterial({ color: ghost ? 0xdddddd : 0x6a6a6a, map: ghost ? null : tex(carbonTexture(), true), roughness: 0.38, metalness: 0.25, side: THREE.DoubleSide }));
  const black = fade(new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.7, side: THREE.DoubleSide }));
  const metal = fade(new THREE.MeshStandardMaterial({ color: 0x9da3ab, roughness: 0.25, metalness: 0.9 }));
  const helmetMat = fade(new THREE.MeshPhysicalMaterial({ color: ghost ? 0xffffff : new THREE.Color(d.accent).getHex(), roughness: 0.2, clearcoat: 1 }));
  const visor = fade(new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 }));

  const obj = new THREE.Group();
  // ปีกพับได้ของ Straight Mode (หมุนรอบขอบหน้าของแผ่นปีก)
  const frontFlap = new THREE.Group();
  const rearFlap = new THREE.Group();
  const add = (g: Geo, m: Mat | Mat[]) => {
    keep(g);
    obj.add(new THREE.Mesh(g, m));
  };
  const merged = (list: Geo[]) => {
    const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
    flat.forEach((g) => {
      g.clearGroups();
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
      if (!g.getAttribute("normal")) g.computeVertexNormals();
    });
    const m = merge(flat);
    list.forEach((g) => g.dispose());
    flat.forEach((g) => g.dispose());
    if (!m) throw new Error("merge failed");
    return m;
  };

  /* ลำตัว + sidepods (ปากรับลมสีดำ) */
  add(loft(THREE, TUB, 80, 44, 2.6), [tubMat, black]);
  add(loft(THREE, POD, 40, 32, 3.6), [podR, black]);
  add(loft(THREE, POD, 40, 32, 3.6, true), [podL, black]);

  /* ห้องนักขับ หมวก */
  const cockpit = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cockpit.scale(0.2, 0.06, 0.42);
  cockpit.translate(0, 0.66, 0.52);
  add(cockpit, black);
  const helmet = new THREE.SphereGeometry(0.15, 20, 14);
  helmet.scale(1, 1.05, 1.15);
  helmet.translate(0, 0.79, 0.4);
  add(helmet, helmetMat);
  const visorGeo = new THREE.SphereGeometry(0.152, 20, 6, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.38, Math.PI * 0.16);
  visorGeo.scale(1, 1.05, 1.15);
  visorGeo.translate(0, 0.79, 0.4);
  add(visorGeo, visor);

  /* ช่องรับอากาศเหนือหัว (ทรงหยดน้ำ) + ช่องข้าง + กล้องบนหลังคา + ครีบเล็ก */
  {
    const box = new THREE.CylinderGeometry(0.085, 0.12, 0.42, 18, 1);
    box.rotateX(Math.PI / 2);
    box.scale(1, 1.15, 1);
    box.translate(0, 0.87, -0.2);
    add(box, accent);
    const inlet = new THREE.CircleGeometry(0.075, 18);
    inlet.scale(1, 1.2, 1);
    inlet.translate(0, 0.875, 0.012);
    add(inlet, black);
    const ears: Geo[] = [];
    for (const s of [1, -1]) {
      const e = new THREE.CircleGeometry(0.035, 12);
      e.translate(s * 0.13, 0.78, -0.12);
      ears.push(e);
    }
    // กล้องบนหลังคาทรง T: เสา + กระเปาะซ้ายขวา
    const stalk = new THREE.BoxGeometry(0.03, 0.12, 0.05);
    stalk.translate(0, 1.04, -0.22);
    ears.push(stalk);
    for (const sx of [1, -1]) {
      const pod = new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10);
      pod.rotateX(Math.PI / 2);
      pod.translate(sx * 0.07, 1.1, -0.22);
      ears.push(pod);
    }
    add(merged(ears), black);
    add(plate(THREE, [[-0.45, 0.86], [-1.2, 0.66], [-1.35, 0.7], [-0.9, 0.82], [-0.5, 0.9]], 0, 0.008), second);
  }

  const carbonParts: Geo[] = [];
  /* พื้นรถ: ขอบหน้ามีครีบ (floor fences) · ปีกขอบพื้น · ดิฟฟิวเซอร์ใหญ่ */
  {
    const pts: [number, number][] = [
      [0.24, 1.42], [0.55, 1.26], [0.84, 1.02], [0.88, 0.6], [0.88, -1.12], [0.76, -1.38], [0.55, -1.55], [0.5, -2.05],
    ];
    const outline = [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z] as [number, number])];
    const floor = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 0.03, bevelEnabled: false });
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.045, 0);
    carbonParts.push(floor);
    for (const s of [1, -1]) {
      // ขอบพื้นม้วนขึ้น + ปีกขอบพื้น
      carbonParts.push(plate(THREE, [[0.62, 0.075], [-1.1, 0.075], [-1.1, 0.12], [0.62, 0.15]], s * 0.875, 0.012));
      const ew = new THREE.BoxGeometry(0.16, 0.012, 0.42);
      ew.rotateX(-0.12);
      ew.translate(s * 0.8, 0.17, 0.72);
      carbonParts.push(ew);
      // แผ่นตั้งโค้งหน้า sidepod (ขอบพื้นยกขึ้นเป็นครีบ)
      for (const [x, h] of [[0.66, 0.3], [0.76, 0.22]] as const) {
        const fp = plate(THREE, [[1.32, 0.06], [0.86, 0.06], [0.9, h], [1.12, h + 0.02], [1.28, h * 0.6]], 0, 0.01);
        fp.rotateY(s * 0.12);
        fp.translate(s * x, 0, 0);
        carbonParts.push(fp);
      }
      // ครีบพื้นรถด้านหน้า 4 แผ่น
      for (let k = 0; k < 4; k++) {
        const fx = s * (0.2 + k * 0.11);
        carbonParts.push(plate(THREE, [[1.38 - k * 0.06, 0.05], [0.95 - k * 0.04, 0.05], [0.98 - k * 0.04, 0.2 - k * 0.015], [1.3 - k * 0.06, 0.16]], fx, 0.01));
      }
    }
    const diff = new THREE.BoxGeometry(1.0, 0.02, 0.6);
    diff.rotateX(-0.3);
    diff.translate(0, 0.15, -1.98);
    carbonParts.push(diff);
    for (const s of [-1, -0.4, 0.4, 1]) carbonParts.push(plate(THREE, [[-1.72, 0.07], [-2.28, 0.07], [-2.28, 0.3]], s * 0.45, 0.012));
  }

  /* ปีกหน้า 4 ชั้น: กลางต่ำแนบจมูก ด้านนอกยกสูงและกวาดถอยหลัง */
  {
    const HALF = 0.95;
    const els = [
      { y: 0.07, rise: 0.025, z: 3.2, sweep: 0.06, chord: 0.34, angle: 0.04, thick: 0.028 },
      { y: 0.098, rise: 0.06, z: 2.93, sweep: 0.11, chord: 0.2, angle: 0.28, thick: 0.02 },
      { y: 0.124, rise: 0.095, z: 2.8, sweep: 0.15, chord: 0.15, angle: 0.5, thick: 0.017 },
      { y: 0.15, rise: 0.13, z: 2.7, sweep: 0.19, chord: 0.12, angle: 0.72, thick: 0.015 },
    ];
    const main: Geo[] = [];
    const xs: number[] = [];
    for (let k = -14; k <= 14; k++) xs.push((k / 14) * HALF);
    const wings: Geo[] = [];
    const flaps: Geo[] = [];
    els.forEach((e, k) => {
      (k === 0 ? main : k === 1 ? wings : flaps).push(
        wingLoft(
          THREE,
          xs.map((x) => {
            const a = Math.abs(x) / HALF;
            const out = smooth(0.25, 1, a);
            return { x, y: e.y + e.rise * out, z: e.z - e.sweep * a * a, chord: e.chord * (1 - 0.3 * a), angle: e.angle + 0.25 * out, thick: e.thick, nx: 0, ny: 1 };
          }),
        ),
      );
    });
    // แผ่นหลัก = มีชื่อสปอนเซอร์ · แผ่นบน = สีทีมเรียบ
    add(merged(main), fwMat);
    add(merged(wings), accent);
    // แผ่นบนสองแผ่น = ปีกพับได้ (Straight Mode) หมุนรอบขอบหน้า
    const fwFlap = merged(flaps);
    fwFlap.translate(0, -FW_PIVOT[0], -FW_PIVOT[1]);
    keep(fwFlap);
    frontFlap.position.set(0, FW_PIVOT[0], FW_PIVOT[1]);
    frontFlap.add(new THREE.Mesh(fwFlap, accent));
    obj.add(frontFlap);
    // แผ่นปิดข้างสูงโค้ง (มีโลโก้ด้านนอก)
    const EPF: [number, number][] = [[3.24, 0.03], [2.58, 0.03], [2.52, 0.2], [2.6, 0.34], [2.78, 0.37], [3.0, 0.29], [3.18, 0.13]];
    const ends: Geo[] = [];
    for (const s of [1, -1] as const) {
      add(panel(THREE, EPF, s * (HALF + 0.016), s), paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[2], d.styles[2], s)), 0xffffff));
      ends.push(panel(THREE, EPF, s * (HALF + 0.004), s === 1 ? -1 : 1));
      // เสายึดจมูก
      ends.push(rod(THREE, [s * 0.04, 0.15, 2.98], [s * 0.04, 0.08, 3.0], 0.012));
    }
    add(merged(ends), second);
  }

  /* ปีกหลัง: ปลายโค้งมนม้วนลงหาแผ่นข้าง · beam wing ด้านล่าง · เสาคอห่านกลาง */
  {
    const FLAT = 0.36;
    const RX = 0.105;
    const tipWing = (y0: number, ry: number, z: number, chord: number, angle: number, thick: number) => {
      const st: Station[] = [];
      const steps = 10;
      const push = (sgn: number, x: number, y: number, nx: number, ny: number) => st.push({ x: sgn * x, y, z, chord, angle, thick, nx: sgn * nx, ny });
      // ปลายซ้าย → กลาง → ปลายขวา
      for (let k = steps; k >= 1; k--) {
        const f = ((k / steps) * Math.PI) / 2;
        const tx = RX * Math.cos(f);
        const ty = -ry * Math.sin(f);
        const len = Math.hypot(tx, ty) || 1;
        push(-1, FLAT + RX * Math.sin(f), y0 - ry * (1 - Math.cos(f)), -ty / len, tx / len);
      }
      for (let k = -6; k <= 6; k++) push(1, (k / 6) * FLAT, y0, 0, 1);
      for (let k = 1; k <= steps; k++) {
        const f = ((k / steps) * Math.PI) / 2;
        const tx = RX * Math.cos(f);
        const ty = -ry * Math.sin(f);
        const len = Math.hypot(tx, ty) || 1;
        push(1, FLAT + RX * Math.sin(f), y0 - ry * (1 - Math.cos(f)), -ty / len, tx / len);
      }
      return wingLoft(THREE, st);
    };
    add(tipWing(0.83, 0.12, -2.18, 0.34, 0.14, 0.034), rwMat);
    // แผ่นบน = ปีกพับได้ (Straight Mode) หมุนรอบขอบหน้า
    const rwFlap = tipWing(0.96, 0.25, -2.42, 0.2, 0.48, 0.024);
    rwFlap.translate(0, -RW_PIVOT[0], -RW_PIVOT[1]);
    keep(rwFlap);
    rearFlap.position.set(0, RW_PIVOT[0], RW_PIVOT[1]);
    rearFlap.add(new THREE.Mesh(rwFlap, rwMat));
    obj.add(rearFlap);
    // แผ่นข้างปีกหลังขนาดใหญ่ ขอบหน้ามน ลาดลงหา beam wing (โลโก้สปอนเซอร์หลักด้านนอก)
    const EP = FLAT + RX + 0.006;
    const EPR: [number, number][] = [
      [-2.13, 0.62], [-2.15, 0.86], [-2.22, 0.95], [-2.34, 0.99], [-2.62, 0.99], [-2.68, 0.94], [-2.66, 0.55], [-2.52, 0.38], [-2.3, 0.33], [-2.17, 0.4],
    ];
    for (const s of [1, -1] as const) {
      add(panel(THREE, EPR, s * (EP + 0.006), s), paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[0], d.styles[0], s)), 0xffffff));
      add(panel(THREE, EPR, s * (EP - 0.004), s === 1 ? -1 : 1), second);
    }
    // ท่อไอเสียกลมใต้ beam wing + โครงกันกระแทกท้าย
    const ex = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 14, 1, true);
    ex.rotateX(Math.PI / 2);
    ex.translate(0, 0.46, -2.2);
    add(ex, metal);
    const exIn = new THREE.CircleGeometry(0.04, 14);
    exIn.rotateY(Math.PI);
    exIn.translate(0, 0.46, -2.28);
    add(exIn, black);
    const crash = new THREE.CylinderGeometry(0.05, 0.09, 0.45, 8);
    crash.rotateX(Math.PI / 2);
    crash.scale(1.2, 0.8, 1);
    crash.translate(0, 0.33, -2.0);
    carbonParts.push(crash);
    // beam wing 2 ชั้น
    const beam = (y: number, z: number, chord: number, angle: number) =>
      wingLoft(THREE, [-1, -0.5, 0, 0.5, 1].map((f) => ({ x: f * (EP - 0.02), y, z, chord, angle, thick: 0.02, nx: 0, ny: 1 })));
    add(merged([beam(0.4, -2.16, 0.2, 0.2), beam(0.5, -2.3, 0.16, 0.45)]), second);
    carbonParts.push(rod(THREE, [0, 0.38, -1.95], [0, 0.82, -2.24], 0.02));
    carbonParts.push(rod(THREE, [0, 0.82, -2.24], [0, 0.98, -2.44], 0.015));
  }

  /* เสาอากาศบนจมูก */
  for (const s of [1, -1]) carbonParts.push(rod(THREE, [s * 0.06, 0.5, 1.55], [s * 0.06, 0.74, 1.6], 0.004));

  /* halo + ครอบ */
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.27, 0.66, 0.06),
      new THREE.Vector3(-0.25, 0.86, 0.2),
      new THREE.Vector3(-0.17, 0.9, 0.62),
      new THREE.Vector3(0, 0.91, 0.76),
      new THREE.Vector3(0.17, 0.9, 0.62),
      new THREE.Vector3(0.25, 0.86, 0.2),
      new THREE.Vector3(0.27, 0.66, 0.06),
    ]);
    carbonParts.push(new THREE.TubeGeometry(curve, 40, 0.03, 8, false));
    const pillar = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.62, 1.04), new THREE.Vector3(0, 0.78, 0.94), new THREE.Vector3(0, 0.9, 0.78)]);
    carbonParts.push(new THREE.TubeGeometry(pillar, 10, 0.028, 8, false));
  }

  /* กระจกมองข้าง (บนขอบ sidepod) มีครีบเล็ก */
  for (const s of [1, -1]) {
    carbonParts.push(rod(THREE, [s * 0.3, 0.56, 0.86], [s * 0.46, 0.68, 0.82], 0.01));
    carbonParts.push(rod(THREE, [s * 0.42, 0.56, 0.7], [s * 0.47, 0.67, 0.8], 0.008));
    const m = new THREE.BoxGeometry(0.16, 0.06, 0.05);
    m.translate(s * 0.5, 0.69, 0.82);
    carbonParts.push(m);
  }

  /* ปีกนก (suspension) ถึงดุมล้อ — หน้า x 0.8 · หลัง x 0.76 · ดุม y 0.36 */
  for (const s of [1, -1]) {
    for (const [z, hub] of [[1.8, 0.64], [-1.8, 0.55]] as const) {
      const zf = z + 0.22;
      const zb = z - 0.22;
      const top = z > 0 ? 0.47 : 0.42;
      carbonParts.push(
        rod(THREE, [s * 0.16, top, zf], [s * hub, 0.48, z], 0.016),
        rod(THREE, [s * 0.16, top, zb], [s * hub, 0.48, z], 0.016),
        rod(THREE, [s * 0.14, 0.24, zf], [s * hub, 0.24, z], 0.016),
        rod(THREE, [s * 0.14, 0.24, zb], [s * hub, 0.24, z], 0.016),
        rod(THREE, [s * 0.15, 0.27, z + 0.06], [s * hub, 0.4, z + 0.08], 0.016),
      );
    }
  }
  add(merged(carbonParts), carbon);

  // ตัวยึดล้อ (upright)
  const uprights: Geo[] = [];
  for (const s of [1, -1])
    for (const [z, hub] of [[1.8, 0.64], [-1.8, 0.55]] as const) {
      const u = new THREE.BoxGeometry(0.04, 0.28, 0.08);
      u.translate(s * hub, 0.36, z);
      uprights.push(u);
    }
  add(merged(uprights), metal);

  // ไฟท้าย (ไฟฝน)
  const rain = new THREE.BoxGeometry(0.12, 0.05, 0.03);
  rain.translate(0, 0.38, -2.22);
  add(rain, fade(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a10, emissiveIntensity: 1.6 })));

  obj.traverse((o) => {
    o.castShadow = !ghost;
    if (ghost) (o as THREE_NS.Mesh).renderOrder = 2;
  });

  return {
    obj,
    setAero(open) {
      frontFlap.rotation.x = FW_OPEN * open;
      rearFlap.rotation.x = RW_OPEN * open;
    },
    dispose() {
      own.forEach((x) => x.dispose());
    },
  };
}
