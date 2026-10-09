/**
 * รถของโหมดนักขับแบบละเอียด (หน่วยเมตร) — ทรงรถยุคกฎ 2026: แคบ สั้น จมูกต่ำ sidepod เว้าใต้ลึก
 * ปีกหน้า 3 ชั้น ปีกหลัง 2 ชั้น halo พื้นรถ ปีกนก กระจกมองข้าง
 * — ตัวถังทำจากหน้าตัดหลายจุดลากต่อกันแบบโค้งเรียบ (ไม่ใช่กล่อง) · สีเคลือบเงา clearcoat
 * — ลายสีวาดบน canvas: สีทีมด้านบน คาร์บอนด้านล่าง เส้นสปีด และเลขรถสมมติ — ไม่มีโลโก้/ลิเวอรีของทีมจริง
 * — ไม่มีล้อ (ฉากใส่ล้อแยกชิ้นที่หมุน/เลี้ยวได้เอง) · หน้ารถชี้ +z ล้อหน้า z = +1.8 ล้อหลัง z = -1.8
 */
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;
type Geo = THREE_NS.BufferGeometry;
type Mat = THREE_NS.Material;

export type Livery = { colour: string; ink: string; num: number };

/** หน้าตัดของตัวถัง: z, กึ่งกลาง x/y, ครึ่งกว้าง, ครึ่งสูง */
type Section = [z: number, xc: number, yc: number, w: number, h: number];

// ลำตัว: จมูก → ห้องนักขับ → ฝาครอบเครื่องสูงหลังหัว → ท้ายเรียว
const TUB: Section[] = [
  [2.92, 0, 0.21, 0.05, 0.045],
  [2.6, 0, 0.24, 0.11, 0.075],
  [2.15, 0, 0.3, 0.16, 0.115],
  [1.6, 0, 0.37, 0.21, 0.16],
  [1.05, 0, 0.43, 0.26, 0.2],
  [0.6, 0, 0.46, 0.29, 0.22],
  [0.2, 0, 0.47, 0.3, 0.23],
  [-0.1, 0, 0.55, 0.28, 0.33],
  [-0.45, 0, 0.56, 0.25, 0.33],
  [-0.95, 0, 0.5, 0.2, 0.26],
  [-1.45, 0, 0.41, 0.14, 0.18],
  [-1.9, 0, 0.34, 0.09, 0.12],
  [-2.2, 0, 0.31, 0.05, 0.07],
];
// sidepod ขวา (ซ้ายสะท้อน): ปากรับลมกว้าง แล้วเรียวลงหาท้าย ใต้ sidepod ยกสูงจากพื้นรถ (undercut)
const POD: Section[] = [
  [0.98, 0.42, 0.43, 0.17, 0.12],
  [0.75, 0.45, 0.43, 0.22, 0.14],
  [0.3, 0.44, 0.41, 0.23, 0.15],
  [-0.3, 0.37, 0.36, 0.2, 0.13],
  [-0.85, 0.27, 0.3, 0.15, 0.1],
  [-1.35, 0.18, 0.25, 0.09, 0.06],
];

/** ค่าแบบโค้งเรียบผ่านทุกจุด (Catmull-Rom) */
function catmull(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

/**
 * ลากผิวผ่านหน้าตัด (ทรง superellipse — เหลี่ยมมนแบบตัวถังรถ) · ปิดหัวท้ายเป็นกลุ่มวัสดุที่ 1
 * UV: u = ตามความยาว (หน้า 0 → ท้าย 1), v = รอบตัว (ใต้ท้อง 0 → ข้างขวา → หลังคา 0.5 → ข้างซ้าย → 1)
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
  // ฝาปิดหัว/ท้าย (พัดจากจุดกลาง)
  for (const [k, flip] of [[0, true], [along, false]] as const) {
    const s = rings[k];
    const centre = pos.length / 3;
    pos.push(s[1] * (mirror ? -1 : 1), s[2], s[0]);
    uv.push(k / along, 0.5);
    for (let a = 0; a < around; a++) {
      const p = k * ring + a;
      const f = flip === mirror;
      if (f) idx.push(centre, p + 1, p);
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

/** แผ่นปีกหน้าตัดแอร์ฟอยล์ ยาวตามแกน x · chord ตามแกน z (ขอบหน้าที่ z0) เงยหัว angle เรเดียน */
function wing(THREE: Three, span: number, chord: number, thick: number, z0: number, y: number, angle: number): Geo {
  const sh = new THREE.Shape();
  const N = 12;
  const camber = (t: number) => Math.sqrt(t) * (1 - t) * 2.6 * thick;
  sh.moveTo(0, 0);
  for (let i = 1; i <= N; i++) sh.lineTo((i / N) * chord, camber(i / N));
  for (let i = N - 1; i >= 1; i--) sh.lineTo((i / N) * chord, -camber(i / N) * 0.3);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 4 });
  // shape อยู่บนระนาบ xy (x = chord) → หมุนให้ chord ชี้ถอยหลัง (-z) ความยาวปีกตามแกน x · ขอบท้ายเชิดขึ้น
  g.rotateY(Math.PI / 2);
  g.translate(-span / 2, 0, 0);
  g.rotateX(angle);
  g.translate(0, y, z0);
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

/** แท่งกลมจาก a ไป b */
function rod(THREE: Three, a: [number, number, number], b: [number, number, number], r: number): Geo {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate(va.x, va.y, va.z);
  return g;
}

/** ปีกนก (suspension arm) จาก a ไป b */
const arm = (THREE: Three, a: [number, number, number], b: [number, number, number]) => rod(THREE, a, b, 0.016);

/** ลายตัวถัง: สีทีมด้านบน คาร์บอนใต้ท้อง เส้นสปีดสีตัดตามข้าง เลขรถบนฝาครอบเครื่อง */
function liveryTexture(THREE: Three, l: Livery) {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // แกน x ของ canvas = u (หน้า → ท้าย) · แกน y: ล่างสุด = v 0 (ใต้ท้อง), กลาง = หลังคา, บนสุด = ใต้ท้องอีกรอบ
  g.fillStyle = l.colour;
  g.fillRect(0, 0, W, H);
  const dark = "#121316";
  // ใต้ท้องและครึ่งล่างของด้านข้างเป็นคาร์บอน
  g.fillStyle = dark;
  g.fillRect(0, H * 0.86, W, H * 0.14);
  g.fillRect(0, 0, W, H * 0.14);
  // แถบคาร์บอนเฉียงขึ้นที่ท้ายรถ
  const sweep = (yBottom: number, dir: 1 | -1) => {
    g.beginPath();
    g.moveTo(W * 0.42, yBottom);
    g.bezierCurveTo(W * 0.6, yBottom, W * 0.75, yBottom - dir * H * 0.2, W, yBottom - dir * H * 0.26);
    g.lineTo(W, yBottom + dir * H * 0.2);
    g.lineTo(W * 0.42, yBottom + dir * H * 0.2);
    g.closePath();
    g.fill();
  };
  sweep(H * 0.86, 1);
  sweep(H * 0.14, -1);
  // เส้นสปีด (สีตัด) ตามข้างตัวรถ — ลวดลายของเว็บเอง
  g.fillStyle = l.ink;
  for (const [y0, dir] of [[H * 0.7, 1], [H * 0.3, -1]] as const) {
    for (let i = 0; i < 3; i++) {
      const y = y0 + dir * i * 9;
      g.globalAlpha = 0.9 - i * 0.25;
      g.beginPath();
      g.moveTo(W * (0.08 + i * 0.05), y);
      g.lineTo(W * 0.58, y - dir * 2);
      g.lineTo(W * 0.56, y + dir * 5);
      g.lineTo(W * (0.1 + i * 0.05), y + dir * 4);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;
  // แถบสีตัดกลางหลังคา (กระดูกงู) ช่วงจมูก
  g.fillRect(0, H * 0.5 - 6, W * 0.38, 12);
  // เลขรถ (เลขสมมติ) ข้างฝาครอบเครื่อง: สองฝั่งหมุนต่างกัน 180° ให้อ่านตรงทั้งคู่
  g.font = "italic 900 110px Archivo, 'Arial Black', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const label = String(l.num);
  const drawNum = (x: number, y: number, rot: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.lineWidth = 8;
    g.strokeStyle = l.colour;
    g.strokeText(label, 0, 0);
    g.fillStyle = l.ink;
    g.fillText(label, 0, 0);
    g.restore();
  };
  drawNum(W * 0.66, H * 0.33, Math.PI);
  drawNum(W * 0.66, H * 0.67, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** ลายคาร์บอนเล็ก ๆ (สานไขว้) */
function carbonTexture(THREE: Three) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16171a";
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? "#1f2024" : "#121316";
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type CarModel = { obj: THREE_NS.Group; dispose(): void };

export function buildCar(THREE: Three, merge: (g: Geo[]) => Geo | null, l: Livery, opts: { ghost?: boolean } = {}): CarModel {
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (own.push(x), x);
  const ghost = !!opts.ghost;
  const fade = <T extends Mat>(m: T) => {
    if (ghost) {
      m.transparent = true;
      m.opacity = 0.3;
      m.depthWrite = false;
    }
    return keep(m);
  };

  const paintTex = ghost ? null : keep(liveryTexture(THREE, l));
  const paint = fade(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: paintTex,
      roughness: 0.32,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  const accent = fade(new THREE.MeshPhysicalMaterial({ color: ghost ? 0xffffff : l.colour, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const carbonTex = ghost ? null : keep(carbonTexture(THREE));
  const carbon = fade(new THREE.MeshStandardMaterial({ color: ghost ? 0xdddddd : 0x707070, map: carbonTex, roughness: 0.38, metalness: 0.25 }));
  const black = fade(new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.7 }));
  const metal = fade(new THREE.MeshStandardMaterial({ color: 0x9da3ab, roughness: 0.25, metalness: 0.9 }));
  const helmetMat = fade(new THREE.MeshPhysicalMaterial({ color: ghost ? 0xffffff : l.ink === "#ffffff" ? 0xf4f4f4 : l.colour, roughness: 0.2, clearcoat: 1 }));
  const visor = fade(new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 }));

  const obj = new THREE.Group();
  const add = (g: Geo, m: Mat | Mat[]) => {
    keep(g);
    const mesh = new THREE.Mesh(g, m);
    obj.add(mesh);
    return mesh;
  };
  const merged = (list: Geo[]) => {
    const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
    // ExtrudeGeometry มี uv/normal ครบ · ล้าง group ก่อนรวม
    flat.forEach((g) => g.clearGroups());
    const m = merge(flat);
    list.forEach((g) => g.dispose());
    flat.forEach((g) => g.dispose());
    if (!m) throw new Error("merge failed");
    return m;
  };

  // ลำตัว + sidepods (ปากรับลมสีดำ)
  add(loft(THREE, TUB, 72, 40, 2.6), [paint, black]);
  add(loft(THREE, POD, 36, 28, 3.4), [accent, black]);
  add(loft(THREE, POD, 36, 28, 3.4, true), [accent, black]);

  // ห้องนักขับ: ขอบดำเว้า + หมวกนักขับ
  const cockpit = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cockpit.scale(0.21, 0.06, 0.42);
  cockpit.translate(0, 0.66, 0.5);
  add(cockpit, black);
  const helmet = new THREE.SphereGeometry(0.15, 20, 14);
  helmet.scale(1, 1.05, 1.15);
  helmet.translate(0, 0.79, 0.38);
  add(helmet, helmetMat);
  const visorGeo = new THREE.SphereGeometry(0.152, 20, 6, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.38, Math.PI * 0.16);
  visorGeo.scale(1, 1.05, 1.15);
  visorGeo.translate(0, 0.79, 0.38);
  add(visorGeo, visor);

  // ช่องรับอากาศเหนือหัว (airbox) + ครีบหลัง
  const airbox = new THREE.CylinderGeometry(0.1, 0.12, 0.36, 18, 1);
  airbox.rotateX(Math.PI / 2);
  airbox.scale(1, 0.8, 1);
  airbox.translate(0, 0.86, -0.2);
  add(airbox, accent);
  const inlet = new THREE.CircleGeometry(0.085, 18);
  inlet.scale(1, 0.8, 1);
  inlet.translate(0, 0.86, -0.015);
  add(inlet, black);
  add(plate(THREE, [[-0.45, 0.84], [-1.5, 0.56], [-1.72, 0.6], [-1.3, 0.78], [-0.55, 0.92]], 0, 0.012), accent);

  const carbonParts: Geo[] = [];
  // พื้นรถ (มองจากด้านบน): แคบที่หน้า กว้างช่วงกลาง เรียวเข้าหาดิฟฟิวเซอร์
  {
    const pts: [number, number][] = [
      [0.18, 1.45], [0.36, 1.25], [0.66, 0.95], [0.78, 0.55], [0.8, -0.9], [0.66, -1.35], [0.5, -1.55], [0.5, -2.05],
    ];
    const outline = [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z] as [number, number])];
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const floor = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false });
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.045, 0);
    carbonParts.push(floor);
    // ขอบพื้นรถม้วนขึ้น
    for (const s of [1, -1]) carbonParts.push(plate(THREE, [[0.55, 0.08], [-0.9, 0.08], [-0.9, 0.13], [0.55, 0.1]], s * 0.79, 0.012));
    // ดิฟฟิวเซอร์เชิดขึ้นท้าย
    const diff = new THREE.BoxGeometry(0.98, 0.02, 0.55);
    diff.rotateX(-0.28);
    diff.translate(0, 0.14, -2.0);
    carbonParts.push(diff);
    for (const s of [-1, 0, 1]) carbonParts.push(plate(THREE, [[-1.75, 0.07], [-2.27, 0.07], [-2.27, 0.27]], s * 0.3, 0.012));
  }

  // ปีกหน้า 3 ชั้น (ปีกแคบลงตามกฎ 2026) + แผ่นปิดข้าง + เสายึดจมูก
  const FW = 1.84;
  const frontWing = [
    wing(THREE, FW, 0.34, 0.03, 3.02, 0.075, 0.04),
    wing(THREE, FW - 0.12, 0.2, 0.022, 2.78, 0.14, 0.32),
    wing(THREE, FW - 0.22, 0.14, 0.018, 2.63, 0.21, 0.6),
  ];
  for (const s of [1, -1]) {
    frontWing.push(plate(THREE, [[3.06, 0.04], [2.5, 0.04], [2.48, 0.3], [2.72, 0.32], [3.02, 0.16]], s * (FW / 2 + 0.008), 0.016));
    frontWing.push(rod(THREE, [s * 0.05, 0.2, 2.82], [s * 0.05, 0.09, 2.84], 0.012));
  }
  add(merged(frontWing), accent);

  // ปีกหลัง 2 ชั้น + แผ่นปิดข้าง + เสายึดแบบคอห่าน
  const RW = 1.0;
  const rearWing = [wing(THREE, RW, 0.3, 0.035, -2.18, 0.8, 0.12), wing(THREE, RW, 0.2, 0.025, -2.36, 0.93, 0.38)];
  add(merged(rearWing), accent);
  const plates: Geo[] = [];
  for (const s of [1, -1]) {
    plates.push(plate(THREE, [[-2.14, 0.5], [-2.6, 0.42], [-2.62, 1.0], [-2.12, 1.0], [-2.06, 0.78]], s * (RW / 2 + 0.008), 0.016));
  }
  add(merged(plates), accent);
  // ไฟท้าย (ไฟฝน) สีแดง
  const rain = new THREE.BoxGeometry(0.12, 0.05, 0.03);
  rain.translate(0, 0.38, -2.22);
  add(rain, fade(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a10, emissiveIntensity: 1.6 })));
  carbonParts.push(rod(THREE, [0, 0.38, -1.95], [0, 0.82, -2.26], 0.02));
  carbonParts.push(rod(THREE, [0, 0.82, -2.26], [0, 0.97, -2.4], 0.016));

  // halo: ห่วงเหนือหัว + เสากลางด้านหน้า
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
    carbonParts.push(new THREE.TubeGeometry(curve, 40, 0.028, 8, false));
    const pillar = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.62, 1.02), new THREE.Vector3(0, 0.78, 0.92), new THREE.Vector3(0, 0.9, 0.78)]);
    carbonParts.push(new THREE.TubeGeometry(pillar, 10, 0.026, 8, false));
  }

  // กระจกมองข้าง
  for (const s of [1, -1]) {
    carbonParts.push(rod(THREE, [s * 0.24, 0.62, 0.78], [s * 0.42, 0.72, 0.72], 0.01));
    const m = new THREE.BoxGeometry(0.15, 0.055, 0.04);
    m.translate(s * 0.45, 0.73, 0.72);
    carbonParts.push(m);
  }

  // ปีกนก (suspension) ไปถึงดุมล้อ — หน้า x 0.8 · หลัง x 0.76 · ดุม y 0.36
  for (const s of [1, -1]) {
    for (const [z, hub] of [[1.8, 0.64], [-1.8, 0.55]] as const) {
      const zf = z + 0.22;
      const zb = z - 0.22;
      const top = z > 0 ? 0.47 : 0.42;
      carbonParts.push(
        arm(THREE, [s * 0.16, top, zf], [s * hub, 0.48, z]),
        arm(THREE, [s * 0.16, top, zb], [s * hub, 0.48, z]),
        arm(THREE, [s * 0.14, 0.24, zf], [s * hub, 0.24, z]),
        arm(THREE, [s * 0.14, 0.24, zb], [s * hub, 0.24, z]),
        arm(THREE, [s * 0.15, 0.27, z + 0.06], [s * hub, 0.4, z + 0.08]),
      );
    }
  }

  add(merged(carbonParts), carbon);

  // ตัวยึดล้อ (upright) สีเงินเล็ก ๆ ที่ปลายปีกนก
  const uprights: Geo[] = [];
  for (const s of [1, -1]) {
    for (const [z, hub] of [[1.8, 0.64], [-1.8, 0.55]] as const) {
      const u = new THREE.BoxGeometry(0.04, 0.28, 0.08);
      u.translate(s * hub, 0.36, z);
      uprights.push(u);
    }
  }
  add(merged(uprights), metal);

  obj.traverse((o) => {
    o.castShadow = !ghost;
    if (ghost) (o as THREE_NS.Mesh).renderOrder = 2;
  });

  return {
    obj,
    dispose() {
      own.forEach((d) => d.dispose());
    },
  };
}
