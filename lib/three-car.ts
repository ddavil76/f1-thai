/* ---------- รถสูตรหนึ่งแบบ 3D (สร้างจากรูปทรงพื้นฐาน ไม่มีโลโก้/ลายทีมจริง) ---------- */
// รับ three + mergeGeometries เป็นพารามิเตอร์ (ผู้เรียกโหลดแบบ dynamic)
// รูปทรงสร้างครั้งเดียวใช้ร่วมทุกคัน — ต่างกันแค่วัสดุสีตัวถัง (20 คัน = 20 วัสดุ ไม่ใช่ 20 ชุด geometry)

import type * as THREE_NS from "three";

type Three = typeof THREE_NS;
type Geo = THREE_NS.BufferGeometry;
type Merge = (geos: Geo[], useGroups?: boolean) => Geo | null;

/** ความยาวรถจริง (ม.) — ใช้แปลงหน่วยเมตรในไฟล์นี้เป็นหน่วยของฉาก */
const CAR_M = 5.6;

export type CarFactory = {
  /** รถหนึ่งคัน หน้ารถชี้ +Z ล้ออยู่บนระนาบ y = 0 · ความยาวรถ = length หน่วย */
  make(colour: string): { obj: THREE_NS.Group; body: THREE_NS.MeshStandardMaterial; setOpacity(a: number): void };
  dispose(): void;
};

export function carFactory(THREE: Three, merge: Merge, length = 0.26): CarFactory {
  const s = length / CAR_M;

  /** กล่องที่ปลายหน้า (z+) เรียวลง: fx/fy = สัดส่วนกว้าง/สูงที่ปลายหน้า · ลอยจากพื้นตาม bottom */
  const box = (
    w: number, h: number, l: number, x: number, y: number, z: number,
    { fx = 1, fy = 1, bx = 1, by = 1, dropFront = 0 }: { fx?: number; fy?: number; bx?: number; by?: number; dropFront?: number } = {},
  ) => {
    const g = new THREE.BoxGeometry(w, h, l, 1, 1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // k: 0 = ท้าย, 1 = หน้า
      const k = p.getZ(i) / l + 0.5;
      const sx = bx + (fx - bx) * k;
      const sy = by + (fy - by) * k;
      // ย่อความสูงโดยยึดพื้นล่าง (ไม่ใช่กึ่งกลาง) ให้หน้าลาดลง
      const yy = (p.getY(i) + h / 2) * sy - h / 2 - dropFront * k;
      p.setXYZ(i, p.getX(i) * sx + x, yy + y, p.getZ(i) + z);
    }
    g.computeVertexNormals();
    return g.toNonIndexed();
  };
  const cyl = (r: number, w: number, x: number, y: number, z: number, seg = 18) => {
    const g = new THREE.CylinderGeometry(r, r, w, seg, 1);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return g.toNonIndexed();
  };

  // หน่วยเมตร · หน้ารถ +z · ล้อหน้าที่ z = +1.8 ล้อหลัง z = -1.8
  const WHEEL_R = 0.36;
  const body: Geo[] = [
    // จมูก: ยาว เรียว ลาดลงหาปีกหน้า
    box(0.42, 0.34, 1.7, 0, 0.36, 2.15, { fx: 0.45, fy: 0.55, dropFront: 0.12 }),
    // ห้องนักขับ/ตัวถังกลาง
    box(0.82, 0.5, 1.7, 0, 0.42, 0.65, { fx: 0.62, fy: 0.85 }),
    // sidepods สองข้าง — เรียวลงหาท้าย (ด้านหลังของกล่องคือ z-)
    box(0.5, 0.42, 1.9, 0.6, 0.33, -0.25, { bx: 0.55, by: 0.55, fx: 1, fy: 1 }),
    box(0.5, 0.42, 1.9, -0.6, 0.33, -0.25, { bx: 0.55, by: 0.55, fx: 1, fy: 1 }),
    // ฝาครอบเครื่อง + ช่องรับอากาศเหนือหัว — ต่ำลงหาท้าย
    box(0.56, 0.52, 2.1, 0, 0.62, -0.75, { bx: 0.4, by: 0.35 }),
    box(0.3, 0.28, 0.5, 0, 0.98, -0.05, { bx: 0.9, fx: 1 }),
    // ครีบหลังฝาครอบ
    box(0.03, 0.26, 1.2, 0, 0.85, -1.45, { by: 0.4 }),
    // แผ่นปีกหลัง (ตัวบน)
    box(1.0, 0.07, 0.36, 0, 0.93, -2.3),
    box(1.0, 0.05, 0.26, 0, 0.8, -2.2),
    // แผ่นปีกหน้า (สองชั้น)
    box(1.95, 0.04, 0.46, 0, 0.1, 2.85),
    box(1.7, 0.035, 0.2, 0, 0.17, 2.72),
  ];
  const carbon: Geo[] = [
    // พื้นรถ
    box(1.45, 0.05, 3.9, 0, 0.05, 0.05, { bx: 0.75 }),
    // แผ่นปิดข้างปีกหลัง + เสาค้ำ
    box(0.03, 0.5, 0.6, 0.5, 0.8, -2.25),
    box(0.03, 0.5, 0.6, -0.5, 0.8, -2.25),
    box(0.06, 0.45, 0.1, 0, 0.6, -2.15),
    // แผ่นปิดข้างปีกหน้า
    box(0.03, 0.2, 0.55, 0.96, 0.14, 2.82),
    box(0.03, 0.2, 0.55, -0.96, 0.14, 2.82),
    // ช่องนักขับ (ดำ)
    box(0.46, 0.06, 0.7, 0, 0.68, 0.45),
    // ปีกนก (suspension) ด้านหน้า/หลัง
    box(1.3, 0.03, 0.06, 0, 0.4, 1.8),
    box(1.3, 0.03, 0.06, 0, 0.4, -1.8),
    // halo: เสากลาง + ห่วงเหนือหัว
    box(0.06, 0.28, 0.06, 0, 0.83, 0.95),
    // กระจก/ท่อ: ตัวดิฟฟิวเซอร์ท้าย
    box(1.0, 0.2, 0.3, 0, 0.14, -2.1, { fy: 0.4 }),
  ];
  const halo = new THREE.TorusGeometry(0.34, 0.035, 6, 20, Math.PI * 1.25);
  halo.rotateX(Math.PI / 2);
  halo.rotateY(Math.PI / 2 - Math.PI * 0.125);
  halo.translate(0, 0.97, 0.45);
  carbon.push(halo.toNonIndexed());

  // ล้อ: ยางหน้าแคบกว่ายางหลัง
  const tyre: Geo[] = [
    cyl(WHEEL_R, 0.3, 0.8, WHEEL_R, 1.8),
    cyl(WHEEL_R, 0.3, -0.8, WHEEL_R, 1.8),
    cyl(WHEEL_R, 0.4, 0.76, WHEEL_R, -1.8),
    cyl(WHEEL_R, 0.4, -0.76, WHEEL_R, -1.8),
  ];
  // ขอบล้อด้านนอก (สีเงิน) ให้ยางดูเป็นล้อ ไม่ใช่ทรงกระบอกดำ
  const rim: Geo[] = [
    cyl(0.2, 0.31, 0.8, WHEEL_R, 1.8, 12),
    cyl(0.2, 0.31, -0.8, WHEEL_R, 1.8, 12),
    cyl(0.2, 0.41, 0.76, WHEEL_R, -1.8, 12),
    cyl(0.2, 0.41, -0.76, WHEEL_R, -1.8, 12),
  ];
  const helmetGeo = new THREE.SphereGeometry(0.17, 12, 10);
  helmetGeo.translate(0, 0.8, 0.35);

  const scaleAll = (g: Geo | null) => {
    if (!g) throw new Error("merge failed");
    g.scale(s, s, s);
    g.computeBoundingSphere();
    return g;
  };
  const geos = {
    body: scaleAll(merge(body)),
    carbon: scaleAll(merge(carbon)),
    tyre: scaleAll(merge(tyre)),
    rim: scaleAll(merge(rim)),
    helmet: scaleAll(helmetGeo.toNonIndexed()),
  };
  [...body, ...carbon, ...tyre, ...rim, halo, helmetGeo].forEach((g) => g.dispose());

  const shared = {
    carbon: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.55, metalness: 0.2 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.35, metalness: 0.7 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }),
  };
  const own: THREE_NS.Material[] = [];

  return {
    make(colour) {
      const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 0.32, metalness: 0.35 });
      own.push(bodyMat);
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(geos.body, bodyMat));
      obj.add(new THREE.Mesh(geos.carbon, shared.carbon));
      obj.add(new THREE.Mesh(geos.tyre, shared.tyre));
      obj.add(new THREE.Mesh(geos.rim, shared.rim));
      obj.add(new THREE.Mesh(geos.helmet, shared.helmet));
      // วัสดุที่ใช้ร่วมกันจางพร้อมกันไม่ได้ — คันที่ต้องจาง (ออกจากการแข่ง) ได้ชุดของตัวเอง
      let faded: THREE_NS.Material[] | null = null;
      const setOpacity = (a: number) => {
        if (a >= 1 && !faded) return;
        if (!faded) {
          faded = obj.children.map((m) => {
            const mat = ((m as THREE_NS.Mesh).material as THREE_NS.Material).clone();
            mat.transparent = true;
            own.push(mat);
            (m as THREE_NS.Mesh).material = mat;
            return mat;
          });
        }
        for (const m of faded) m.opacity = a;
      };
      return { obj, body: bodyMat, setOpacity };
    },
    dispose() {
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(shared).forEach((m) => m.dispose());
      own.forEach((m) => m.dispose());
    },
  };
}

/** เงาจาง ๆ ใต้รถ (แทนเงาจริงที่กินเครื่อง) — แผ่นระนาบ texture วงรีมืด */
export function carShadow(THREE: Three, length = 0.26) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 32, 2, 16, 32, 30);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(length * 0.5, length * 1.15);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return {
    mesh: () => new THREE.Mesh(geo, mat),
    dispose: () => [tex, geo, mat].forEach((d) => d.dispose()),
  };
}
