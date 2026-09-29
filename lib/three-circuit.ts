/* ---------- สนามแบบ "สมจริง": แอสฟัลต์ เส้นขาว kerb บ่อกรวด แบริเออร์ อัฒจันทร์ ต้นไม้ ---------- */
// รับ three + mergeGeometries เป็นพารามิเตอร์ (ผู้เรียกโหลดแบบ dynamic เหมือน three-track)
// ใช้เส้นโค้งแบบเดียวกับ buildTrack → ตำแหน่งบนสนาม (u) ของรถตรงกันทั้งสองแบบ
// ไม่มีโลโก้/ป้ายโฆษณาจริง — เป็นสนามทั่วไปที่แต่งตามผังจริง

import type * as THREE_NS from "three";
import { clearance, cornerMask, roadWidth, seeded, type XZ } from "./circuit-layout";
import type { TrackMeshes, Vec3 } from "./three-track";
import type { OsmScene } from "./osm-scene";

type Three = typeof THREE_NS;
type Geo = THREE_NS.BufferGeometry;
type Merge = (geos: Geo[], useGroups?: boolean) => Geo | null;

export type CircuitMeshes = TrackMeshes & {
  /** ช่วงโค้ง 0..1 ที่ตำแหน่ง u (0..1) — ให้รถสาธิตชะลอเข้าโค้ง */
  cornerAt(u: number): number;
  /** ด้านข้างบนพื้นราบ (ยาว 1) ที่ตำแหน่ง u — ใช้วางรถเยื้องเลน */
  sideAt(u: number): THREE_NS.Vector3;
  /** ความกว้างครึ่งหนึ่งของผิวแทร็กปกติ */
  half: number;
  /** ความกว้างครึ่งหนึ่ง ณ ตำแหน่ง u — ช่วงที่ถนนสองเส้นผ่านใกล้กันจะแคบกว่า half */
  halfAt(u: number): number;
};

/** สีหลัก — กลางวัน/กลางคืนใช้ชุดเดียวกัน แสงเป็นตัวต่าง */
const C = {
  asphalt: "#3a3c41",
  grass: "#4d7a37",
  grassDark: "#3f6a2e",
  gravel: "#cdb892",
  armco: 0xb8bcc4,
  tyreRed: 0xd8261c,
  tyreWhite: 0xf1f1f1,
  tyreBlue: 0x2156b8,
  steel: 0x9aa0a8,
  pit: 0xe9e9ec,
};

function canvasTex(THREE: Three, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** จุดสีสุ่มทับพื้น — ให้ผิวไม่เรียบเป็นสีเดียว */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, base: string, dots: string[], n: number, rnd: () => number) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dots[Math.floor(rnd() * dots.length)];
    g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2));
  }
}

export function buildCircuit(
  THREE: Three,
  merge: Merge,
  pts: Vec3[],
  {
    night = false,
    samples = 800,
    half = 0.15,
    seed = 7,
    osm = null,
  }: {
    night?: boolean;
    samples?: number;
    half?: number;
    seed?: number;
    /** ฉากรอบสนามจริงจาก OpenStreetMap (พื้น ตึก ต้นไม้) — null = ฉากทั่วไป */
    osm?: OsmScene | null;
  } = {},
): CircuitMeshes {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const rnd = seeded(seed);

  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    "centripetal",
  );
  const radius = Math.max(...pts.map(([x, , z]) => Math.hypot(x, z)));
  const height = Math.max(0, ...pts.map((p) => p[1]));

  /* ---- จุดตัวอย่างตามแนววิ่ง (ห่างเท่ากัน) + ข้อมูลโค้ง/พื้นที่ว่าง ---- */
  const S = samples;
  const P: THREE_NS.Vector3[] = [];
  const N: XZ[] = [];
  for (let i = 0; i < S; i++) {
    const u = i / S;
    P.push(curve.getPointAt(u));
    const t = curve.getTangentAt(u);
    const l = Math.hypot(t.x, t.z) || 1;
    N.push([-t.z / l, t.x / l]);
  }
  const xz: XZ[] = P.map((p) => [p.x, p.z]);
  const { mask, inside } = cornerMask(xz);
  const room = clearance(xz);
  const ds = room.spacing;
  const at = (i: number) => ((i % S) + S) % S;
  // ความกว้างถนนต่อจุด: สนามถนนที่สองช่วงวิ่งผ่านใกล้กัน (บากู โมนาโก เจดดาห์) แคบลงไม่ให้ทับกัน
  const hw = roadWidth(xz, { base: half });
  const H = (i: number) => hw[at(i)];

  // ระยะถึงแบริเออร์แต่ละด้าน: เผื่อที่บ่อกรวดด้านนอกโค้ง แต่ไม่ล้ำไปหาอีกช่วงของสนาม
  const GRAVEL = 0.38;
  const wantOff = (i: number, side: number) => H(i) + 0.09 + (inside[i] === side ? 0.03 : GRAVEL * mask[i]);
  const roomOf = [1, -1].map((side) => Array.from({ length: S }, (_, i) => room.free(i, side, H(i) + 0.09 + GRAVEL, H(i)) - 0.02));
  const rawWall = [1, -1].map((side, s) =>
    Array.from({ length: S }, (_, i) => Math.max(H(i) + 0.035, Math.min(wantOff(i, side), roomOf[s][i]))),
  );
  // สองช่วงของสนามชิดกันจนไม่มีที่ → ไม่มีแบริเออร์ตรงนั้น (ไม่งั้นกำแพงพาดทับอีกช่วง)
  const cramped = roomOf.map((arr) => arr.map((v, i) => {
    for (let j = -3; j <= 3; j++) if (arr[at(i + j)] < H(i + j) + 0.035) return true;
    return false;
  }));
  // ทำให้เรียบ (แบริเออร์ไม่หยักตามจุด)
  const wall = rawWall.map((arr) =>
    arr.map((_, i) => {
      let m = Infinity;
      for (let j = -4; j <= 4; j++) m = Math.min(m, arr[at(i + j)]);
      return m;
    }),
  );
  const wallOf = (i: number, side: number) => wall[side > 0 ? 0 : 1][at(i)];

  /**
   * แถบยาวตามสนาม (ไม่ใช้ index — สีต่อช่วงได้คม) ระหว่างระยะ a ถึง b จากเส้นกลาง (มีเครื่องหมาย = ด้าน)
   * v ของ texture วิ่งตามระยะทาง ÷ vLen
   */
  const strip = (
    a: (i: number) => number,
    b: (i: number) => number,
    ya: (i: number) => number,
    yb: (i: number) => number,
    { vLen = 1, colour, skip }: { vLen?: number; colour?: (i: number) => number; skip?: (i: number) => boolean } = {},
  ) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const tmp = new THREE.Color();
    const vert = (i: number, off: number, y: number, u: number, v: number) => {
      const k = at(i);
      pos.push(P[k].x + N[k][0] * off, y, P[k].z + N[k][1] * off);
      uv.push(u, v);
    };
    for (let i = 0; i < S; i++) {
      const j = i + 1;
      if (skip?.(i)) continue;
      const A0 = a(i), B0 = b(i), A1 = a(j), B1 = b(j);
      // กว้าง 0 (และไม่ใช่ผนังตั้ง) → ข้าม
      if (Math.abs(A0 - B0) < 1e-4 && Math.abs(A1 - B1) < 1e-4 && Math.abs(ya(i) - yb(i)) < 1e-6) continue;
      const v0 = (i * ds) / vLen;
      const v1 = (j * ds) / vLen;
      vert(i, A0, ya(i), 0, v0);
      vert(i, B0, yb(i), 1, v0);
      vert(j, A1, ya(j), 0, v1);
      vert(i, B0, yb(i), 1, v0);
      vert(j, B1, yb(j), 1, v1);
      vert(j, A1, ya(j), 0, v1);
      if (colour) {
        tmp.setHex(colour(i));
        for (let q = 0; q < 6; q++) col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (colour) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const y = (lift: number) => (i: number) => P[at(i)].y + lift;
  const add = (g: Geo, m: THREE_NS.Material) => {
    const mesh = new THREE.Mesh(g, m);
    group.add(mesh);
    return mesh;
  };

  /* ---- แสง ---- */
  const hemi = new THREE.HemisphereLight(night ? 0x5a6f9a : 0xcfe3ff, night ? 0x1a1e14 : 0x4a5a32, night ? 0.9 : 1.7);
  const sun = new THREE.DirectionalLight(night ? 0xc9d6ff : 0xfff1dc, night ? 1.1 : 2.4);
  sun.position.set(-6, 10, 4);
  group.add(hemi, sun);

  /* ---- พื้นหญ้ากว้างถึงขอบฟ้า (หมอกกลืนกับท้องฟ้า) ---- */
  const grassTex = keep(canvasTex(THREE, 128, 128, (g) => speckle(g, 128, 128, C.grass, [C.grassDark, "#5a8a40", "#466f33"], 2600, rnd)));
  grassTex.repeat.set(60, 60);
  const ground = keep(new THREE.CircleGeometry(60, 48));
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, osm ? -0.006 : -0.004, 0);
  const grassMat = keep(
    osm
      ? new THREE.MeshLambertMaterial({ color: new THREE.Color(osm.data.outside) })
      : new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  add(ground, grassMat);

  // พื้นจริงรอบสนาม (ภาพมองจากบนที่วาดจาก OSM) — ทับพื้นทั่วไปในกรอบของมัน
  if (osm) {
    const [bx0, bz0, bx1, bz1] = osm.data.bounds;
    const tex = keep(new THREE.Texture(osm.image));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    const plane = keep(new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0));
    plane.rotateX(-Math.PI / 2); // ขอบบนของภาพ (เหนือ) → z น้อย ตรงกับผังสนาม
    plane.translate((bx0 + bx1) / 2, -0.004, (bz0 + bz1) / 2);
    add(plane, keep(new THREE.MeshLambertMaterial({ map: tex })));
  }

  /* ---- ขอบสนามถึงแบริเออร์ (หญ้า / สนามในเมืองเป็นทางเท้าคอนกรีต) + ลาดดินลงพื้นเมื่อสนามลอยสูง ---- */
  const vergeTex = keep(grassTex.clone());
  vergeTex.repeat.set(1, 1);
  const vergeMat = keep(
    osm?.data.urban
      ? new THREE.MeshLambertMaterial({ color: 0xb4afa4, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ map: vergeTex, side: THREE.DoubleSide }),
  );
  for (const side of [1, -1]) {
    add(strip((i) => side * (H(i) - 0.01), (i) => side * (wallOf(i, side) + 0.02), y(0.001), y(0.001), { vLen: 0.6 }), vergeMat);
    if (height > 0.03) {
      add(
        strip(
          (i) => side * (wallOf(i, side) + 0.02),
          (i) => side * (wallOf(i, side) + 0.02 + P[at(i)].y * 1.6),
          y(0.001),
          () => -0.003,
          { vLen: 0.6 },
        ),
        vergeMat,
      );
    }
  }

  /* ---- บ่อกรวดด้านนอกโค้ง ---- */
  const gravelTex = keep(canvasTex(THREE, 64, 64, (g) => speckle(g, 64, 64, C.gravel, ["#b9a47c", "#ddcba6", "#a8936c"], 900, rnd)));
  const gravelMat = keep(new THREE.MeshLambertMaterial({ map: gravelTex, side: THREE.DoubleSide }));
  for (const side of [1, -1]) {
    const inner = (i: number) => side * (H(i) + 0.05);
    const outer = (i: number) => {
      const k = at(i);
      if (inside[k] === side || mask[k] < 0.15) return inner(i);
      return side * Math.max(H(k) + 0.05, wallOf(k, side) - 0.03);
    };
    add(strip(inner, outer, y(0.003), y(0.003), { vLen: 0.3 }), gravelMat);
  }

  /* ---- ผิวแทร็ก: แอสฟัลต์ + เส้นขาวขอบ ---- */
  const asphaltTex = keep(canvasTex(THREE, 64, 64, (g) => {
    speckle(g, 64, 64, C.asphalt, ["#34363b", "#44464c", "#303236", "#4a4c52"], 1400, rnd);
    g.fillStyle = "#f4f4f4";
    g.fillRect(1, 0, 2, 64);
    g.fillRect(61, 0, 2, 64);
  }));
  asphaltTex.wrapS = THREE.ClampToEdgeWrapping;
  const asphaltMat = keep(new THREE.MeshLambertMaterial({
    map: asphaltTex,
    side: THREE.DoubleSide,
    // กลางคืน: สนามสว่างกว่ารอบข้างเหมือนมีไฟส่อง
    emissive: new THREE.Color(night ? 0x2a2c33 : 0x000000),
  }));
  add(strip((i) => -H(i), (i) => H(i), y(0.006), y(0.006), { vLen: half * 2 }), asphaltMat);

  /* ---- kerb แดง-ขาว ช่วงโค้ง (ด้านในเต็ม ด้านนอกบางกว่า) ---- */
  const kerbTex = keep(canvasTex(THREE, 2, 8, (g) => {
    g.fillStyle = "#e0241b";
    g.fillRect(0, 0, 2, 4);
    g.fillStyle = "#f5f5f5";
    g.fillRect(0, 4, 2, 4);
  }));
  kerbTex.magFilter = THREE.NearestFilter;
  const kerbMat = keep(new THREE.MeshLambertMaterial({ map: kerbTex, side: THREE.DoubleSide, emissive: new THREE.Color(night ? 0x1a1a1a : 0) }));
  for (const side of [1, -1]) {
    const w = (i: number) => {
      const k = at(i);
      const m = Math.max(0, (mask[k] - 0.2) / 0.5);
      return Math.min(1, m) * (inside[k] === side ? 0.055 : 0.035);
    };
    add(strip((i) => side * (H(i) - 0.012), (i) => side * (H(i) - 0.012 + w(i)), y(0.009), y(0.009), { vLen: 0.09 }), kerbMat);
  }

  /* ---- แบริเออร์: ยางแดง/ขาว/น้ำเงินด้านนอกโค้ง · ราวเหล็กที่เหลือ ---- */
  const WALL_H = 0.045;
  const barrierMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  for (const side of [1, -1]) {
    const off = (i: number) => side * wallOf(i, side);
    const colour = (i: number) => {
      const k = at(i);
      if (mask[k] > 0.35 && inside[k] !== side) {
        const band = Math.floor((i * ds) / 0.05);
        return band % 3 === 0 ? C.tyreBlue : band % 2 ? C.tyreRed : C.tyreWhite;
      }
      return C.armco;
    };
    const tight = cramped[side > 0 ? 0 : 1];
    add(strip(off, off, y(-0.01), y(WALL_H), { colour, skip: (i) => tight[at(i)] }), barrierMat);
  }

  /* ---- เส้นสตาร์ท (ตาหมากรุก) + ช่องกริด + ซุ้มไฟสตาร์ท ---- */
  const checkerTex = keep(canvasTex(THREE, 12, 2, (g) => {
    for (let x = 0; x < 12; x++) for (let yy = 0; yy < 2; yy++) {
      g.fillStyle = (x + yy) % 2 ? "#111" : "#fff";
      g.fillRect(x, yy, 1, 1);
    }
  }));
  checkerTex.magFilter = THREE.NearestFilter;
  const white = keep(new THREE.MeshLambertMaterial({ color: 0xf4f4f4, emissive: new THREE.Color(night ? 0x333333 : 0) }));
  const place = (obj: THREE_NS.Object3D, i: number, off: number, lift: number) => {
    const k = at(i);
    obj.position.set(P[k].x + N[k][0] * off, P[k].y + lift, P[k].z + N[k][1] * off);
    obj.rotation.y = Math.atan2(-N[k][1], N[k][0]);
    group.add(obj);
    return obj;
  };
  const lineGeo = keep(new THREE.PlaneGeometry(H(0) * 2, 0.05));
  lineGeo.rotateX(-Math.PI / 2);
  place(new THREE.Mesh(lineGeo, keep(new THREE.MeshLambertMaterial({ map: checkerTex }))), 0, 0, 0.012);
  // ช่องกริด: เส้นขาวสั้นขวางครึ่งสนาม สลับซ้าย/ขวา ถอยหลังจากเส้นสตาร์ท
  const slots: Geo[] = [];
  for (let k = 0; k < 10; k++) {
    const i = at(-Math.round((0.12 + k * 0.17) / ds));
    const off = (k % 2 ? -1 : 1) * H(i) * 0.45;
    const g = new THREE.PlaneGeometry(H(i) * 0.75, 0.012);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(-N[i][1], N[i][0]));
    g.translate(P[i].x + N[i][0] * off, P[i].y + 0.011, P[i].z + N[i][1] * off);
    slots.push(g);
  }
  const slotGeo = merge(slots);
  slots.forEach((g) => g.dispose());
  if (slotGeo) add(keep(slotGeo), white);

  // ซุ้มไฟสตาร์ท: เสาสองข้าง + คาน + ไฟแดง 5 ดวง
  const steel = keep(new THREE.MeshLambertMaterial({ color: C.steel }));
  const gantry = new THREE.Group();
  const span = wallOf(0, 1) + wallOf(0, -1);
  const postGeo = keep(new THREE.BoxGeometry(0.025, 0.34, 0.025));
  const beamGeo = keep(new THREE.BoxGeometry(span, 0.05, 0.03));
  const mid = (wallOf(0, 1) - wallOf(0, -1)) / 2;
  for (const s of [wallOf(0, 1), -wallOf(0, -1)]) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(s, 0.17, 0);
    gantry.add(post);
  }
  const beam = new THREE.Mesh(beamGeo, keep(new THREE.MeshLambertMaterial({ color: 0x1b1c20 })));
  beam.position.set(mid, 0.32, 0);
  gantry.add(beam);
  const lampGeo = keep(new THREE.CircleGeometry(0.012, 10));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  for (let k = 0; k < 5; k++) {
    for (const face of [1, -1]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(mid + (k - 2) * 0.045, 0.32, face * 0.016);
      if (face < 0) lamp.rotation.y = Math.PI;
      gantry.add(lamp);
    }
  }
  place(gantry, Math.round(0.05 / ds), 0, 0);

  /* ---- วัตถุข้างสนาม: ตรวจว่าวางได้โดยไม่ทับสนาม ---- */
  const fits = (cx: number, cz: number, rot: number, w: number, d: number, gap: number) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let a = -1; a <= 1; a += 0.25)
      for (let b = -1; b <= 1; b += 0.5) {
        const lx = (a * w) / 2;
        const lz = (b * d) / 2;
        const x = cx + lx * c + lz * s;
        const z = cz - lx * s + lz * c;
        if (room.nearest(x, z) < gap) return false;
      }
    return true;
  };
  const taken: { x: number; z: number; r: number }[] = [];

  /* ---- ตึกจริงจาก OSM: ยกรูปฐานขึ้นตามความสูง รวมเป็น mesh เดียว ---- */
  if (osm?.data.buildings.length) {
    const pos: number[] = [];
    const col: number[] = [];
    const roofs = [0xd9d4c7, 0xc9c2b3, 0xb9b3a7, 0xe4dfd4, 0xaaa49b, 0xcfc9bd, 0xc27b5c];
    const cRoof = new THREE.Color();
    const cWall = new THREE.Color();
    const push = (x: number, yy: number, z: number, c: THREE_NS.Color) => {
      pos.push(x, yy, z);
      col.push(c.r, c.g, c.b);
    };
    let n = 0;
    for (const b of osm.data.buildings) {
      const h = b[0];
      const ring: XZ[] = [];
      for (let k = 1; k + 1 < b.length; k += 2) ring.push([b[k], b[k + 1]]);
      if (ring.length < 3) continue;
      // ตึกที่ล้ำเข้ามาในสนาม (ข้อมูลคลาดเล็กน้อย/อาคารคร่อมถนน) → ตัดทิ้ง ไม่ให้บังรถ
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
      const cz = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      if (room.nearest(cx, cz) < half + 0.08 || ring.some(([x, z]) => room.nearest(x, z) < half + 0.03)) continue;
      cRoof.setHex(roofs[(n * 7919 + 13) % roofs.length]);
      cWall.copy(cRoof).multiplyScalar(0.78);
      n++;
      for (let k = 0; k < ring.length; k++) {
        const [ax, az] = ring[k];
        const [bx, bz] = ring[(k + 1) % ring.length];
        push(ax, 0, az, cWall); push(bx, 0, bz, cWall); push(bx, h, bz, cWall);
        push(ax, 0, az, cWall); push(bx, h, bz, cWall); push(ax, h, az, cWall);
      }
      const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const t of tri) for (const k of t) push(ring[k][0], h, ring[k][1], cRoof);
      const r = Math.max(...ring.map(([x, z]) => Math.hypot(x - cx, z - cz)));
      taken.push({ x: cx, z: cz, r });
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    add(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  /* ---- อัฒจันทร์: ขั้นบันได + คนดู (จุดสี) + หลังคา ---- */
  const crowdTex = keep(canvasTex(THREE, 64, 16, (g) => {
    g.fillStyle = "#2b2f38";
    g.fillRect(0, 0, 64, 16);
    const cols = ["#e8e8e8", "#d4302a", "#f2c230", "#2f6fd6", "#1f9a55", "#ff7a1a", "#8a5cc4", "#f07ab5", "#111"];
    for (let x = 0; x < 64; x++) for (let yy = 0; yy < 16; yy += 2) {
      if (rnd() < 0.82) {
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.fillRect(x, yy, 1, 1);
      }
    }
  }));
  crowdTex.magFilter = THREE.NearestFilter;
  const crowdMat = keep(new THREE.MeshLambertMaterial({ map: crowdTex, emissive: new THREE.Color(night ? 0x222222 : 0) }));
  const standMat = keep(new THREE.MeshLambertMaterial({ color: 0xc9ccd2 }));
  const roofMat = keep(new THREE.MeshLambertMaterial({ color: 0x5d6d82, side: THREE.DoubleSide }));
  const TIERS = 4;
  const tierGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  tierGeo.translate(0, 0.5, 0);
  /** อัฒจันทร์ยาว len หันหน้าไปทาง -z ของตัวเอง (ชิ้นงานหมุนให้หน้าหันเข้าสนาม) */
  const grandstand = (len: number) => {
    const g = new THREE.Group();
    const depth = 0.075;
    for (let t = 0; t < TIERS; t++) {
      const h = 0.05 + t * 0.045;
      const box = new THREE.Mesh(tierGeo, [standMat, standMat, crowdMat, standMat, standMat, crowdMat]);
      box.scale.set(len, h, depth);
      box.position.set(0, 0, t * depth);
      g.add(box);
    }
    // หลังคาลาดเหนือแถวบนสุด + เสาค้ำ
    // หลังคาคลุมแค่แถวหลัง — มองจากมุมสูงยังเห็นคนดูแถวหน้า
    const roof = new THREE.Mesh(tierGeo, roofMat);
    roof.scale.set(len * 1.02, 0.012, depth * 2 + 0.04);
    roof.position.set(0, 0.05 + TIERS * 0.045 + 0.07, depth * (TIERS - 1.5));
    roof.rotation.x = -0.12;
    g.add(roof);
    for (const x of [-len / 2, 0, len / 2]) {
      const post = new THREE.Mesh(postGeo, steel);
      post.scale.y = 0.95;
      post.position.set(x * 0.97, 0.16, depth * (TIERS - 0.5));
      g.add(post);
    }
    return g;
  };

  /** วางชิ้นงานขนานสนามที่จุด i ด้าน side ห่างจากแบริเออร์ gap — หน้าชิ้นงาน (-z) หันเข้าสนาม */
  const tryBeside = (i: number, side: number, len: number, depth: number, make: () => THREE_NS.Object3D) => {
    const k = at(i);
    const off = wallOf(k, side) + 0.05 + depth / 2;
    const cx = P[k].x + N[k][0] * side * off;
    const cz = P[k].z + N[k][1] * side * off;
    // แกน z ของชิ้นงาน = ทิศออกจากสนาม
    const rot = Math.atan2(N[k][0] * side, N[k][1] * side);
    if (!fits(cx, cz, rot, len, depth, half + 0.12)) return false;
    if (taken.some((t) => Math.hypot(t.x - cx, t.z - cz) < t.r + len / 2)) return false;
    const obj = make();
    obj.position.set(cx, Math.max(0, P[k].y) - 0.004, cz);
    obj.rotation.y = rot;
    // ให้ขอบหน้าชิ้นงาน (z = -depth/2 ในแกนตัวเอง) อยู่ติดแนวแบริเออร์
    obj.translateZ(-depth / 2);
    group.add(obj);
    taken.push({ x: cx, z: cz, r: len / 2 });
    return true;
  };

  // อาคารพิท (ยาว เตี้ย ขาว มีช่องประตูมืด) ด้านหนึ่งของทางตรงหลัก อัฒจันทร์อีกด้าน
  const pitTex = keep(canvasTex(THREE, 64, 8, (g) => {
    g.fillStyle = "#e9e9ec";
    g.fillRect(0, 0, 64, 8);
    for (let x = 1; x < 64; x += 4) {
      g.fillStyle = "#23252b";
      g.fillRect(x, 3, 3, 5);
    }
    g.fillStyle = "#9fb6cf";
    g.fillRect(0, 0, 64, 2);
  }));
  const pitMat = keep(new THREE.MeshLambertMaterial({ color: C.pit }));
  const pitFront = keep(new THREE.MeshLambertMaterial({ map: pitTex, emissive: new THREE.Color(night ? 0x303030 : 0) }));
  const pitBuilding = (len: number) => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(tierGeo, [pitMat, pitMat, pitMat, pitMat, pitMat, pitFront]);
    box.scale.set(len, 0.1, 0.16);
    box.position.z = 0.08; // ด้าน -z (ผนังมีประตูพิท) หันเข้าสนาม
    g.add(box);
    return g;
  };
  const mainLen = Math.min(1.6, ds * S * 0.06);
  const mainAt = at(-Math.round(0.6 / ds)); // กลางทางตรงหลัก (ก่อนเส้นสตาร์ท)
  const pitSide = room.free(mainAt, 1, 1.2, half) >= room.free(mainAt, -1, 1.2, half) ? 1 : -1;
  tryBeside(mainAt, pitSide, mainLen, 0.16, () => pitBuilding(mainLen));
  tryBeside(mainAt, -pitSide, mainLen * 0.8, 0.3, () => grandstand(mainLen * 0.8));

  // อัฒจันทร์เพิ่มที่ด้านนอกของโค้งแคบ ๆ (สูงสุด 3 แห่ง ห่างกันพอสมควร)
  const apexes = Array.from({ length: S }, (_, i) => i)
    .filter((i) => mask[i] >= 0.95 && mask[at(i - 1)] < 0.95)
    .sort((a, b) => wallOf(b, -inside[b]) - wallOf(a, -inside[a]));
  let extra = 0;
  for (const i of apexes) {
    if (extra >= 3) break;
    const len = 0.7;
    if (tryBeside(i, -inside[i], len, 0.3, () => grandstand(len))) extra++;
  }

  /* ---- ต้นไม้ (instanced — ร้อยต้นก็ draw call เดียว) ---- */
  const treeGeo = keep(new THREE.ConeGeometry(0.09, 0.26, 7));
  treeGeo.translate(0, 0.17, 0);
  const trunkGeo = keep(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 5));
  trunkGeo.translate(0, 0.03, 0);
  const treeMat = keep(new THREE.MeshLambertMaterial({ color: 0x2f5a2a }));
  const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
  const spots: THREE_NS.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const R = radius * 1.35;
  // มีฉาก OSM → ต้นไม้อยู่ในป่า/สวนจริง · ไม่มี → สุ่มรอบสนาม
  const osmTrees = osm?.data.trees ?? null;
  const treeCount = osmTrees ? osmTrees.length / 2 : 1400;
  for (let tries = 0; tries < treeCount && spots.length < (osmTrees ? 450 : 220); tries++) {
    let x: number;
    let z: number;
    if (osmTrees) {
      x = osmTrees[tries * 2];
      z = osmTrees[tries * 2 + 1];
    } else {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * R;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (room.nearest(x, z) < half + 0.5) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 0.25)) continue;
    const k = 0.7 + rnd() * 0.7;
    sc.set(k, k * (0.8 + rnd() * 0.5), k);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    pos.set(x, -0.004, z);
    spots.push(m4.clone().compose(pos, q, sc));
  }
  if (spots.length) {
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, spots.length);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    spots.forEach((m, i) => {
      trees.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
    });
    group.add(trees, trunks);
  }

  /* ---- กลางคืน: เสาไฟรอบสนาม (จุดแสง) ---- */
  if (night) {
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 32;
    const g = glowCanvas.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,250,230,1)");
    grad.addColorStop(0.3, "rgba(255,235,190,0.5)");
    grad.addColorStop(1, "rgba(255,235,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const glowTex = keep(new THREE.CanvasTexture(glowCanvas));
    const glowMat = keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const every = Math.max(8, Math.round(0.9 / ds));
    for (let i = 0; i < S; i += every) {
      const side = (i / every) % 2 ? 1 : -1;
      const off = side * (wallOf(i, side) + 0.03);
      const post = new THREE.Mesh(postGeo, steel);
      post.scale.y = 1.3;
      place(post, i, off, 0.22);
      const s = new THREE.Sprite(glowMat);
      s.scale.setScalar(0.35);
      place(s, i, off, 0.45);
    }
  }

  const cornerAt = (u: number) => mask[at(Math.round(u * S))];
  const side = new THREE.Vector3();
  const sideAt = (u: number) => {
    const k = at(Math.round(u * S));
    return side.set(N[k][0], 0, N[k][1]);
  };

  return {
    group,
    curve,
    radius,
    height,
    half,
    halfAt: (u: number) => H(Math.round(u * S)),
    cornerAt,
    sideAt,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/**
 * วางรถบนสนามที่ตำแหน่ง u (0..1) เยื้องจากเส้นกลาง lateral หน่วย
 * หันหน้าตามทิศวิ่ง เอียงตามเนิน (lookAt ไปจุดข้างหน้า)
 */
export function placeCar(
  circuit: Pick<CircuitMeshes, "curve" | "sideAt" | "half" | "halfAt">,
  obj: THREE_NS.Object3D,
  u: number,
  lateral = 0,
  lift = 0.006,
) {
  const w = ((u % 1) + 1) % 1;
  const p = circuit.curve.getPointAt(w);
  const t = circuit.curve.getTangentAt(w);
  const n = circuit.sideAt(w);
  // เลนเยื้องตามสัดส่วนความกว้างถนนตรงนั้น — ช่วงแคบรถไม่ล้ำขอบ
  const off = (lateral * circuit.halfAt(w)) / circuit.half;
  obj.position.set(p.x + n.x * off, p.y + lift, p.z + n.z * off);
  obj.lookAt(obj.position.x + t.x, obj.position.y + t.y, obj.position.z + t.z);
}
