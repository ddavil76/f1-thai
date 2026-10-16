/**
 * รถของโหมดนักขับแบบละเอียด (หน่วยเมตร สเกล 1:1) — ทรงรถตามกติกาปี 2026 (ทรงกลาง ไม่อิงรถทีมใด)
 * ฐานล้อ 3.4 ม. · กว้าง 1.9 ม. · ล้อ 18 นิ้ว · ไม่มี beam wing · ปีกหน้า/หลังแอคทีฟ (โหมดเข้าโค้ง ↔ โหมดทางตรง)
 * — ลำตัว/sidepod/airbox ลากผิวผ่านหน้าตัด superellipse (บน/ล่างสูงต่างกัน) แล้วเกลี่ยให้โค้งเรียบ
 * — ลิเวอรีและสปอนเซอร์สมมติวาดบน canvas (liveries.ts) · ชิ้นนิ่งรวมเป็นเมชเดียวต่อวัสดุ (ประหยัด draw call)
 * — ไม่มีล้อ (ฉากใส่ล้อแยกชิ้นที่หมุน/เลี้ยวได้เอง) · หน้ารถชี้ +z ล้อหน้า z = +1.7 ล้อหลัง z = −1.7
 * พิกัดต้นแบบวัดจากเพลาหน้า (xa: หน้า +, ท้าย −) แล้วแปลงเป็นพิกัดเกมด้วย A()
 */
import type * as THREE_NS from "three";
import { designOf, drawLogo, drawNumber, paintBody, type Design } from "./liveries";

type Three = typeof THREE_NS;
type Geo = THREE_NS.BufferGeometry;
type Mat = THREE_NS.Material;
type V3 = [number, number, number];

/** team = id ทีมในเกม (เลือกลิเวอรี) · colour/ink = สีทีม (ใช้เมื่อไม่มีลิเวอรีของทีมนั้น) */
export type Livery = { team: string; colour: string; ink: string; num: number };

/** เพลาหน้าอยู่ที่ xa = 0 เพลาหลัง xa = −3.4 → เลื่อนให้กึ่งกลางฐานล้ออยู่ z = 0 */
const OFF = 1.7;
/** พิกัดต้นแบบ (xa ตามความยาว หน้า +, y สูง, za ด้านข้าง) → พิกัดเกม [x, y, z] (หน้ารถชี้ +z) */
const A = (xa: number, y: number, za = 0): V3 => [-za, y, xa + OFF];
/** ปลายจมูก/ท้ายลำตัว (z ของเกม) — ใช้วางลายบนตัวถัง */
const NOSE_Z = 1.0 + OFF;
const TAIL_Z = -3.66 + OFF;

/** หน้าตัด: xa, กึ่งกลางด้านข้าง, กึ่งกลางสูง, ครึ่งกว้าง, ครึ่งสูงด้านบน, ครึ่งสูงด้านล่าง, ความเหลี่ยม (2 = วงรี · มาก = เหลี่ยม) */
type Key = [xa: number, cz: number, cy: number, w: number, ht: number, hb: number, n: number];

/** แบ่งหน้าตัดถี่ ๆ ตามความยาว (เส้นตรงระหว่างจุดกำหนด) แล้วเกลี่ยซ้ำ passes รอบให้โค้งต่อเนื่อง */
function stations(keys: Key[], N: number, passes: number): Key[] {
  const x0 = keys[0][0];
  const x1 = keys[keys.length - 1][0];
  const out: Key[] = [];
  for (let i = 0; i < N; i++) {
    const x = x0 + ((x1 - x0) * i) / (N - 1);
    let k = 0;
    while (k < keys.length - 2 && x < keys[k + 1][0]) k++;
    const a = keys[k];
    const b = keys[k + 1];
    const t = (a[0] - x) / (a[0] - b[0]);
    out.push([x, ...([1, 2, 3, 4, 5, 6] as const).map((j) => a[j] + (b[j] - a[j]) * t)] as Key);
  }
  for (let p = 0; p < passes; p++) {
    const c = out.map((s) => s.slice() as Key);
    for (let i = 1; i < N - 1; i++) for (let j = 1; j < 7; j++) out[i][j] = (c[i - 1][j] + 2 * c[i][j] + c[i + 1][j]) / 4;
  }
  return out;
}
const sp = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
/** ความสูงผิวบนของชุดหน้าตัดที่ตำแหน่ง xa (นอกช่วง = −1) */
function topAt(st: Key[], xa: number) {
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    if (xa <= a[0] && xa >= b[0]) {
      const t = (a[0] - xa) / (a[0] - b[0]);
      return a[2] + a[4] + (b[2] + b[4] - (a[2] + a[4])) * t;
    }
  }
  return -1;
}

/**
 * ลากผิวผ่านหน้าตัด · ฝาหัวท้ายเป็นกลุ่มวัสดุที่ 1 · mirror = สะท้อนไปฝั่ง −x (ลายบนผิวกลับซ้ายขวา)
 * UV: u = ตามความยาว (หน้า 0 → ท้าย 1), v = รอบตัว (ใต้ท้อง 0 → ข้าง +x 0.25 → หลังคา 0.5 → ข้าง −x 0.75 → 1)
 */
function loft(THREE: Three, st: Key[], around: number, mirror = false): Geo {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ring = around + 1;
  const along = st.length - 1;
  const m = mirror ? -1 : 1;
  st.forEach((s, k) => {
    const [xa, cz, cy, w, ht, hb, n] = s;
    for (let a = 0; a <= around; a++) {
      const th = -Math.PI / 2 + (a / around) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      pos.push((cz + w * sp(c, 2 / n)) * m, cy + (sn >= 0 ? ht : hb) * sp(sn, 2 / n), xa + OFF);
      uv.push(k / along, a / around);
    }
  });
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
    const s = st[k];
    const centre = pos.length / 3;
    pos.push(s[1] * m, s[2], s[0] + OFF);
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

/* ---------- ลิเวอรี ---------- */

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

/** พื้นผิวตัวถัง: ลวดลาย + สปอนเซอร์หลักข้างฝาครอบเครื่อง + รอง 2 ข้างจมูก + เลขรถบนจมูก/ข้างฝาครอบ */
function tubTexture(d: Design, num: number, q = 1) {
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W * q, H * q);
  g.scale(q, q);
  paintBody(g, W, H, d, "tub");
  // u (แกน x) = หน้า → ท้าย ตามความยาวลำตัว z NOSE_Z → TAIL_Z
  const U = (z: number) => ((NOSE_Z - z) / (NOSE_Z - TAIL_Z)) * W;
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
  both(1.75, 0.3, () => drawLogo(g, d.sponsors[2], 260, 64, d.styles[2], d.ink, d.base));
  both(0.0, 0.32, () => drawNumber(g, num, 90, d.ink, d.base));
  // เลขรถบนจมูก หันให้อ่านได้จากกล้องหลังนักขับ
  g.save();
  g.translate(U(2.2), H * 0.5);
  g.rotate(-Math.PI / 2);
  drawNumber(g, num, 110, d.ink, d.base);
  g.restore();
  return c;
}

/** พื้นผิว sidepod: สปอนเซอร์รอง 1 ตัวใหญ่ด้านนอก · flip = sidepod ฝั่ง −x (เรขาคณิตสะท้อน ตัวอักษรต้องกลับซ้ายขวา) */
function podTexture(d: Design, flip: boolean, q = 1) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W * q, H * q);
  g.scale(q, q);
  paintBody(g, W, H, d, "pod");
  g.save();
  g.translate(W * 0.42, H * 0.72);
  if (flip) g.scale(-1, 1);
  drawLogo(g, d.sponsors[1], 520, 120, d.styles[1], d.ink, d.base);
  g.restore();
  return c;
}

/** พื้นผิวปีก: สีหลัก + ขอบท้ายสีเน้น + สปอนเซอร์ตามความยาวปีกบนผิวบน (ซ้าย/ขวา หรือกลางปีก) */
function wingTexture(d: Design, name: string, layout: "centre" | "pair", q = 1) {
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W * q, H * q);
  g.scale(q, q);
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
function panelTexture(d: Design, name: string, style: Design["styles"][number], facing: 1 | -1, q = 1) {
  const W = 512;
  const H = 512;
  const [c, g] = canvas(W * q, H * q);
  g.scale(q, q);
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

/** setAero(0..1): 0 = โหมดเข้าโค้ง (ปีกเงยเต็ม) · 1 = โหมดทางตรง (ปีกลดมุม ลดแรงต้าน) */
export type CarModel = { obj: THREE_NS.Group; setAero(open: number): void; dispose(): void };

/** ช่องวัสดุของแม่แบบรถ (เรขาคณิตใช้ร่วมกันทุกคัน · วัสดุ/ลายแยกตามคัน) */
type Slot =
  | "tub" | "podR" | "podL" | "rw" | "fw" | "accent" | "second" | "carbon" | "black" | "metal" | "helmet" | "visor" | "rain"
  | "epf1" | "epf-1" | "epr1" | "epr-1";

/** แม่แบบรถ (สร้างครั้งเดียวต่อ three หนึ่งชุด ต่อระดับความละเอียด) — รถแต่ละคัน clone แล้วใส่วัสดุของตัวเอง */
const templates = new WeakMap<object, THREE_NS.Group[]>();

/** ลำตัว: จมูก → ห้องนักขับ → ฝาครอบเครื่อง → ท้ายเรียว */
const BODY: Key[] = [
  [1.0, 0, 0.17, 0.05, 0.04, 0.04, 2.2],
  [0.7, 0, 0.22, 0.09, 0.07, 0.07, 2.4],
  [0.3, 0, 0.3, 0.15, 0.11, 0.11, 2.8],
  [-0.1, 0, 0.38, 0.21, 0.16, 0.15, 3.0],
  [-0.5, 0, 0.43, 0.27, 0.2, 0.22, 3.2],
  [-0.9, 0, 0.42, 0.32, 0.22, 0.3, 3.4],
  [-1.4, 0, 0.42, 0.31, 0.24, 0.32, 3.4],
  [-1.65, 0, 0.45, 0.27, 0.36, 0.35, 3.0],
  [-2.0, 0, 0.42, 0.22, 0.34, 0.32, 2.8],
  [-2.5, 0, 0.38, 0.17, 0.22, 0.28, 2.6],
  [-3.0, 0, 0.34, 0.12, 0.12, 0.24, 2.4],
  [-3.4, 0, 0.34, 0.09, 0.08, 0.18, 2.4],
  [-3.66, 0, 0.34, 0.05, 0.05, 0.06, 2.2],
];
/** ช่องรับอากาศเหนือหัวนักขับ */
const AIRBOX: Key[] = [
  [-1.54, 0, 0.86, 0.085, 0.075, 0.07, 2.6],
  [-1.7, 0, 0.86, 0.11, 0.1, 0.11, 2.6],
  [-2.1, 0, 0.75, 0.1, 0.09, 0.13, 2.6],
  [-2.65, 0, 0.6, 0.05, 0.04, 0.1, 2.4],
];
/** sidepod ฝั่ง +x (เว้าใต้ ลาดลงท้าย) */
const POD: Key[] = [
  [-0.66, 0.47, 0.42, 0.17, 0.13, 0.21, 2.6],
  [-0.92, 0.5, 0.4, 0.2, 0.18, 0.25, 3.0],
  [-1.6, 0.47, 0.36, 0.21, 0.14, 0.24, 3.0],
  [-2.3, 0.38, 0.28, 0.15, 0.1, 0.16, 2.8],
  [-2.95, 0.25, 0.25, 0.06, 0.06, 0.1, 2.4],
];

/** detail: 1 = รถผู้เล่น · 0.5 = รถคู่แข่ง/ไกลกล้อง */
function buildTemplate(THREE: Three, merge: (g: Geo[]) => Geo | null, detail: number): THREE_NS.Group {
  const slots = new Map<Slot, Mat>();
  const slot = (name: Slot) => {
    let m = slots.get(name);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ name });
      slots.set(name, m);
    }
    return m;
  };
  const D = (n: number, min = 6) => Math.max(min, Math.round(n * detail));
  const obj = new THREE.Group();
  /** ชิ้นนิ่ง: สะสมตามวัสดุ แล้วรวมเป็นเมชเดียวตอนท้าย */
  const parts = new Map<Slot, Geo[]>();
  const put = (name: Slot, ...g: Geo[]) => {
    const list = parts.get(name) ?? [];
    list.push(...g);
    parts.set(name, list);
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
  const at = (g: Geo, p: V3) => g.translate(p[0], p[1], p[2]);
  /** แท่งกลมจาก a ไป b (พิกัดต้นแบบ) */
  const bar = (a: V3, b: V3, r: number) => {
    const va = new THREE.Vector3(...A(...a));
    const vb = new THREE.Vector3(...A(...b));
    const len = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r, r, len, D(8, 5), 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
    return g.translate(va.x, va.y, va.z);
  };
  /** แผ่นบางตั้งฉากแกน x ของเกม: โครงร่าง (xa, y) วางที่ za */
  const fin = (pts: [number, number][], za: number, thick: number) => plate(THREE, pts.map(([xa, y]) => [xa + OFF, y]), -za, thick);

  /* ---------- ลำตัว · airbox · sidepods ---------- */
  const bodySt = stations(BODY, D(140, 40), Math.round(14 * detail));
  obj.add(new THREE.Mesh(loft(THREE, bodySt, D(56, 24)), [slot("tub"), slot("black")]));
  const abSt = stations(AIRBOX, D(40, 14), Math.round(6 * detail));
  obj.add(new THREE.Mesh(loft(THREE, abSt, D(40, 16)), [slot("accent"), slot("black")]));
  const podSt = stations(POD, D(70, 24), Math.round(8 * detail));
  obj.add(new THREE.Mesh(loft(THREE, podSt, D(44, 16)), [slot("podR"), slot("black")]));
  obj.add(new THREE.Mesh(loft(THREE, podSt, D(44, 16), true), [slot("podL"), slot("black")]));

  /* ---------- ห้องนักขับ · หมวก ---------- */
  {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const x = 0.2 * sp(Math.sin(t), 0.8);
      const y = 0.33 * sp(Math.cos(t), 0.8);
      if (i) sh.lineTo(x, y);
      else sh.moveTo(x, y);
    }
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    put("black", at(g, A(-1.12, 0.668)));
    put("helmet", at(new THREE.SphereGeometry(0.12, D(28, 12), D(20, 8)), A(-1.3, 0.72)));
    const visor = new THREE.SphereGeometry(0.122, D(28, 12), 6, -0.9, 1.8, 1.15, 0.42);
    visor.rotateY(Math.PI / 2);
    put("visor", at(visor, A(-1.3, 0.72)));
    // ปากช่องรับอากาศเหนือหัว
    const inlet = new THREE.CircleGeometry(1, D(24, 12));
    inlet.scale(abSt[0][3] * 0.78, abSt[0][4] * 0.78, 1);
    put("black", at(inlet, A(abSt[0][0] + 0.004, abSt[0][2])));
  }

  /* ---------- ครีบบนฝาครอบเครื่อง (shark fin) ---------- */
  {
    const top = (x: number) => Math.max(topAt(bodySt, x), topAt(abSt, x));
    const pts: [number, number][] = [];
    const xs: number[] = [];
    for (let x = -1.95; x >= -3.25; x -= 0.05) xs.push(x);
    xs.forEach((x) => pts.push([x, top(x) - 0.03]));
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i];
      const t = (-1.95 - x) / 1.3;
      pts.push([x, top(-1.95) + (top(x) - top(-1.95)) * 0.25 + 0.02 + 0.1 * t ** 1.3]);
    }
    put("second", fin(pts, 0, 0.008));
  }

  /* ---------- halo ---------- */
  {
    const R: V3[] = [[-1.48, 0.655, 0.27], [-1.38, 0.8, 0.285], [-1.18, 0.885, 0.26], [-0.99, 0.895, 0.18], [-0.88, 0.895, 0]];
    const pts = [...R, ...R.slice(0, 4).reverse().map(([x, y, z]) => [x, y, -z] as V3)].map((p) => new THREE.Vector3(...A(...p)));
    put("carbon", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), D(64, 24), 0.026, D(10, 6), false));
    const pillar = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([A(-0.88, 0.895), A(-0.8, 0.82), A(-0.72, 0.66)].map((p) => new THREE.Vector3(...p))),
      D(16, 6),
      0.024,
      D(8, 5),
      false,
    );
    pillar.scale(1.6, 1, 1);
    put("carbon", pillar);
  }

  /* ---------- ช่วงล่าง (ปีกนกคู่ · pullrod หน้า · pushrod หลัง · เพลาขับ) · กระจกมองข้าง ---------- */
  for (const s of [1, -1]) {
    const m = (p: V3): V3 => [p[0], p[1], p[2] * s];
    const fu: V3 = [0.0, 0.5, 0.66];
    const fl: V3 = [0.02, 0.2, 0.68];
    const ru: V3 = [-3.4, 0.56, 0.6];
    const rl: V3 = [-3.38, 0.16, 0.62];
    put(
      "carbon",
      bar(m([0.16, 0.5, 0.2]), m(fu), 0.016),
      bar(m([-0.26, 0.53, 0.22]), m(fu), 0.016),
      bar(m([0.26, 0.26, 0.15]), m(fl), 0.016),
      bar(m([-0.3, 0.29, 0.2]), m(fl), 0.016),
      bar(m([0.0, 0.49, 0.64]), m([-0.22, 0.24, 0.18]), 0.013),
      bar(m([0.1, 0.33, 0.16]), m([0.1, 0.33, 0.66]), 0.011),
      bar(m([-3.12, 0.48, 0.14]), m(ru), 0.016),
      bar(m([-3.58, 0.5, 0.14]), m(ru), 0.016),
      bar(m([-3.08, 0.2, 0.17]), m(rl), 0.016),
      bar(m([-3.62, 0.21, 0.15]), m(rl), 0.016),
      bar(m([-3.38, 0.18, 0.6]), m([-3.28, 0.5, 0.12]), 0.013),
      bar(m([-3.58, 0.3, 0.14]), m([-3.56, 0.3, 0.6]), 0.011),
      bar(m([-0.86, 0.6, 0.3]), m([-0.9, 0.67, 0.45]), 0.012),
    );
    put("metal", bar(m([-3.4, 0.34, 0.1]), m([-3.4, 0.36, 0.6]), 0.028));
    // กระจกมองข้าง: ฝาครอบสีทีม + กระจกสีเข้มหันไปด้านหลัง
    const shell = new THREE.SphereGeometry(1, D(16, 8), D(12, 6));
    shell.scale(0.085, 0.04, 0.035);
    put("accent", at(shell, A(-0.91, 0.68, 0.5 * s)));
    const glass = new THREE.CircleGeometry(1, D(16, 8));
    glass.scale(0.07, 0.03, 1);
    glass.rotateY(Math.PI);
    put("black", at(glass, A(-0.946, 0.68, 0.5 * s)));
  }

  /* ---------- พื้นรถ · ครีบพื้น · ขอบพื้น · แผ่นคุมลมล้อ · ดิฟฟิวเซอร์ ---------- */
  {
    const R: [number, number][] = [[-0.3, 0.18], [-0.6, 0.42], [-0.92, 0.72], [-2.95, 0.72], [-3.0, 0.55], [-3.08, 0.5]];
    const outline = [...R, ...R.slice().reverse().map(([x, z]) => [x, -z] as [number, number])];
    // รูปบนระนาบ (x เกม, z เกม) แล้วหมุนให้นอนราบ ความหนาลงล่าง
    const floor = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([xa, za]) => new THREE.Vector2(-za, -(xa + OFF)))), { depth: 0.02, bevelEnabled: false });
    floor.rotateX(Math.PI / 2);
    floor.scale(1, 1, -1);
    floor.translate(0, 0.07, 0);
    put("carbon", floor);
    for (const s of [1, -1]) {
      const lip = new THREE.BoxGeometry(0.008, 0.05, 2.0);
      put("carbon", at(lip, A(-1.95, 0.095, 0.716 * s)));
      const ew = new THREE.BoxGeometry(0.06, 0.008, 0.5);
      ew.rotateZ(-0.25 * s);
      put("carbon", at(ew, A(-2.6, 0.135, 0.69 * s)));
      [0.12, 0.2, 0.28].forEach((z, i) =>
        put("carbon", fin([[-0.22, 0.21], [-0.24, 0.03], [-0.82 - 0.04 * i, 0.05], [-0.86 - 0.04 * i, 0.13]], (z + 0.02 * i) * s, 0.008)),
      );
      put("carbon", fin([[-0.4, 0.36], [-0.4, 0.1], [-0.78, 0.08], [-0.74, 0.3]], 0.56 * s, 0.01));
    }
    const quad = (a: V3, b: V3, c: V3, d: V3) => {
      const g = new THREE.BufferGeometry();
      const P = [a, b, c, a, c, d].flatMap((p) => A(...p));
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.computeVertexNormals();
      put("carbon", g);
    };
    quad([-3.08, 0.05, -0.5], [-3.08, 0.05, 0.5], [-3.78, 0.31, 0.5], [-3.78, 0.31, -0.5]);
    for (const z of [-0.5, -0.22, 0.22, 0.5]) quad([-3.08, 0.05, z], [-3.78, 0.03, z], [-3.78, 0.34, z], [-3.08, 0.08, z]);
    quad([-3.08, 0.09, -0.5], [-3.08, 0.09, 0.5], [-3.6, 0.3, 0.5], [-3.6, 0.3, -0.5]);
  }

  /* ---------- ปีก: แผ่นปีกหมุนรอบขอบหน้า · ปีกแอคทีฟเก็บมุมสองโหมดไว้ใน userData.aero ---------- */
  const deg = Math.PI / 180;
  const wing = (mat: Slot, c: number, th: number, le: [number, number], spans: [number, number][], corner: number, straight: number) => {
    const geos = spans.map(([z0, z1]) => {
      const st: Station[] = [];
      for (let k = 0; k <= 8; k++) {
        const za = z0 + ((z1 - z0) * k) / 8;
        st.push({ x: -za, y: 0, z: 0, chord: c, angle: 0, thick: th * c * 0.5, nx: 0, ny: 1 });
      }
      return wingLoft(THREE, st, D(10, 6));
    });
    const piv = new THREE.Group();
    const [x, y, z] = A(le[0], le[1]);
    piv.position.set(x, y, z);
    piv.rotation.x = corner * deg;
    if (straight !== corner) piv.userData.aero = [corner * deg, straight * deg];
    piv.add(new THREE.Mesh(geos.length > 1 ? merged(geos) : geos[0], slot(mat)));
    obj.add(piv);
  };
  // ปีกหน้า: แผ่นหลักเต็มความกว้าง + แฟลปปรับมุมได้ 2 ชั้น
  wing("fw", 0.3, 0.08, [1.13, 0.085], [[-0.86, 0.86]], 4, 4);
  const halves: [number, number][] = [[0.2, 0.86], [-0.86, -0.2]];
  wing("accent", 0.2, 0.09, [0.86, 0.14], halves, 16, 4);
  wing("accent", 0.16, 0.09, [0.69, 0.2], halves, 28, 8);
  // ปีกหลัง: แผ่นหลัก + แฟลป (เปิดในโหมดทางตรง) · ไม่มี beam wing
  wing("rw", 0.32, 0.1, [-3.58, 0.8], [[-0.48, 0.48]], 8, 3);
  wing("rw", 0.2, 0.1, [-3.835, 0.875], [[-0.48, 0.48]], 30, 4);
  // แผ่นปิดข้างปีก: ด้านนอกมีโลโก้สปอนเซอร์ · ด้านในสีรอง
  const EPF: [number, number][] = [[1.17, 0.035], [1.17, 0.21], [1.03, 0.3], [0.6, 0.335], [0.52, 0.29], [0.53, 0.06], [0.78, 0.02]];
  const EPR: [number, number][] = [[-3.5, 0.5], [-3.52, 0.95], [-3.62, 1.0], [-4.02, 1.0], [-4.07, 0.94], [-4.05, 0.55], [-3.86, 0.42], [-3.6, 0.42]];
  for (const s of [1, -1] as const) {
    const zy = (pts: [number, number][]) => pts.map(([xa, y]) => [xa + OFF, y] as [number, number]);
    obj.add(new THREE.Mesh(panel(THREE, zy(EPF), s * 0.871, s), slot(s > 0 ? "epf1" : "epf-1")));
    put("second", panel(THREE, zy(EPF), s * 0.859, s === 1 ? -1 : 1));
    obj.add(new THREE.Mesh(panel(THREE, zy(EPR), s * 0.492, s), slot(s > 0 ? "epr1" : "epr-1")));
    put("second", panel(THREE, zy(EPR), s * 0.478, s === 1 ? -1 : 1));
  }
  // เสากลางยึดปีกหลัง · ท่อไอเสีย · ไฟท้าย (ไฟฝน)
  put("carbon", fin([[-3.48, 0.38], [-3.64, 0.38], [-3.72, 0.78], [-3.6, 0.8], [-3.53, 0.6]], 0, 0.014));
  {
    const ex = new THREE.CylinderGeometry(0.045, 0.05, 0.18, D(20, 10), 1, true);
    ex.rotateX(Math.PI / 2);
    put("metal", at(ex, A(-3.66, 0.44)));
    const exIn = new THREE.CircleGeometry(0.042, D(20, 10));
    exIn.rotateY(Math.PI);
    put("black", at(exIn, A(-3.74, 0.44)));
    put("rain", at(new THREE.BoxGeometry(0.12, 0.07, 0.03), A(-3.67, 0.3)));
  }

  for (const [name, list] of parts) obj.add(new THREE.Mesh(merged(list), slot(name)));
  return obj;
}

/**
 * รถหนึ่งคันตามลิเวอรี · ghost = รถเงาโปร่งใส · quality = ความละเอียดลาย (0.5 สำหรับรถคู่แข่งหลายคัน ประหยัดหน่วยความจำ)
 */
export function buildCar(THREE: Three, merge: (g: Geo[]) => Geo | null, l: Livery, opts: { ghost?: boolean; quality?: number } = {}): CarModel {
  const q = opts.quality ?? 1;
  // รถผู้เล่น = แม่แบบละเอียด · รถคู่แข่ง (quality < 1) = แม่แบบเบา (ลดจำนวนสามเหลี่ยม)
  const lod = q >= 1 ? 1 : 0;
  let byThree = templates.get(THREE);
  if (!byThree) templates.set(THREE, (byThree = []));
  const tpl = (byThree[lod] ??= buildTemplate(THREE, merge, lod === 1 ? 1 : 0.5));
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
  const lazy = <T,>(f: () => T) => {
    let v: T | undefined;
    return () => (v ??= f());
  };
  // สร้างวัสดุ/ลายเมื่อมีชิ้นส่วนใช้จริง (รถเงาไม่ต้องวาดลาย)
  const mats: Record<Slot, () => Mat> = {
    tub: lazy(() => paintMat(ghost ? null : tex(tubTexture(d, l.num, q)))),
    podR: lazy(() => paintMat(ghost ? null : tex(podTexture(d, false, q)))),
    podL: lazy(() => paintMat(ghost ? null : tex(podTexture(d, true, q)))),
    // ปีกเคลือบน้อยกว่า (มุมแคบสะท้อนฟ้าจนขาว)
    rw: lazy(() => paintMat(ghost ? null : tex(wingTexture(d, d.sponsors[0], "centre", q)), 0xffffff, THREE.DoubleSide, 0.2)),
    fw: lazy(() => paintMat(ghost ? null : tex(wingTexture(d, d.sponsors[2], "pair", q)), 0xffffff, THREE.DoubleSide, 0.2)),
    accent: lazy(() => paintMat(null, ghost ? 0xffffff : new THREE.Color(d.base).getHex(), THREE.DoubleSide)),
    second: lazy(() => paintMat(null, ghost ? 0xffffff : new THREE.Color(d.second).getHex(), THREE.DoubleSide)),
    carbon: lazy(() => fade(new THREE.MeshStandardMaterial({ color: ghost ? 0xdddddd : 0x6a6a6a, map: ghost ? null : tex(carbonTexture(), true), roughness: 0.38, metalness: 0.25, side: THREE.DoubleSide }))),
    black: lazy(() => fade(new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.7, side: THREE.DoubleSide }))),
    metal: lazy(() => fade(new THREE.MeshStandardMaterial({ color: 0x9da3ab, roughness: 0.25, metalness: 0.9 }))),
    helmet: lazy(() => fade(new THREE.MeshPhysicalMaterial({ color: ghost ? 0xffffff : new THREE.Color(d.accent).getHex(), roughness: 0.2, clearcoat: 1 }))),
    visor: lazy(() => fade(new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 }))),
    rain: lazy(() => fade(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a10, emissiveIntensity: 1.6 }))),
    epf1: lazy(() => paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[2], d.styles[2], 1, q)))),
    "epf-1": lazy(() => paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[2], d.styles[2], -1, q)))),
    epr1: lazy(() => paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[0], d.styles[0], 1, q)))),
    "epr-1": lazy(() => paintMat(ghost ? null : tex(panelTexture(d, d.sponsors[0], d.styles[0], -1, q)))),
  };
  const pick = (m: Mat) => mats[m.name as Slot]?.() ?? m;
  // clone ใช้เรขาคณิตร่วมกับแม่แบบ แล้วเปลี่ยนวัสดุเป็นของคันนี้
  const obj = tpl.clone(true);
  obj.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(pick) : pick(mesh.material);
    o.castShadow = !ghost;
    if (ghost) mesh.renderOrder = 2;
  });
  // ปีกแอคทีฟ: มุมโหมดเข้าโค้ง (a0) → มุมโหมดทางตรง (a1)
  const movers: THREE_NS.Object3D[] = [];
  obj.traverse((o) => {
    if (o.userData.aero) movers.push(o);
  });

  return {
    obj,
    setAero(open) {
      for (const m of movers) {
        const [a0, a1] = m.userData.aero as [number, number];
        m.rotation.x = a0 + (a1 - a0) * open;
      }
    },
    dispose() {
      own.forEach((x) => x.dispose());
    },
  };
}
