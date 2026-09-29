/* ---------- วิเคราะห์ผังสนาม (ไม่ใช้ three) — หาโค้ง / พื้นที่ว่างข้างสนาม ---------- */
// ใช้กับฉาก 3D แบบสมจริง: ขอบทาง (kerb) ที่โค้ง, บ่อกรวดด้านนอกโค้ง, แบริเออร์, อัฒจันทร์, ต้นไม้
// รับจุดบนพื้น [x, z] ที่ห่างเท่า ๆ กันตามแนววิ่ง (วงปิด — จุดสุดท้ายไม่ซ้ำจุดแรก)

export type XZ = [number, number];

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** ทิศทางวิ่ง (ยาว 1) ของแต่ละจุด */
export function tangents(pts: XZ[]): XZ[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[wrap(i - 1, n)];
    const b = pts[wrap(i + 1, n)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
}

/**
 * ด้านข้าง (ยาว 1) — ด้าน +1 ของสนามคือ p + normal · ตรงกับ buildTrack ใน three-track
 */
export const normalOf = ([tx, tz]: XZ): XZ => [-tz, tx];

/** ความยาวเฉลี่ยระหว่างจุด */
export function spacing(pts: XZ[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s / pts.length || 1;
}

/**
 * ความโค้งแบบมีเครื่องหมาย (1/หน่วย) — บวก = โค้งเข้าหาด้าน +1 (ด้าน +1 คือด้านใน)
 * วัดการหมุนของทิศวิ่งระหว่าง span จุดก่อน/หลัง ลดผลของจุดที่กระตุก
 */
export function curvature(pts: XZ[], span = 3): number[] {
  const n = pts.length;
  const t = tangents(pts);
  const ds = spacing(pts);
  return pts.map((_, i) => {
    const a = t[wrap(i - span, n)];
    const b = t[wrap(i + span, n)];
    // มุมที่หมุน (มีเครื่องหมาย) ÷ ระยะทาง
    const turn = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    // cross(a, b) > 0 ↔ หมุนเข้าหา normal(a) = (-a.z, a.x)
    return turn / (2 * span * ds);
  });
}

/**
 * ช่วงโค้ง 0..1 ต่อจุด (0 = ทางตรง, 1 = โค้งแคบ) พร้อมด้านในของโค้ง (+1/-1)
 * ขยายออกก่อน/หลังโค้งเล็กน้อย ให้ kerb เริ่มก่อนเข้าโค้งและยาวไปถึงทางออก
 */
export function cornerMask(
  pts: XZ[],
  { k0 = 0.7, k1 = 2.4, grow = 5 }: { k0?: number; k1?: number; grow?: number } = {},
): { mask: number[]; inside: number[] } {
  const n = pts.length;
  const k = curvature(pts);
  const raw = k.map((v) => Math.max(0, Math.min(1, (Math.abs(v) - k0) / (k1 - k0))));
  const mask = raw.map((_, i) => {
    let m = 0;
    for (let j = -grow; j <= grow; j++) m = Math.max(m, raw[wrap(i + j, n)] * (1 - Math.abs(j) / (grow + 1)));
    return m;
  });
  // ด้านในตามโค้งที่แรงสุดในละแวก (จุดที่ขยายออกมาให้ใช้ด้านเดียวกับยอดโค้ง)
  const inside = pts.map((_, i) => {
    let best = 0;
    let side = 1;
    for (let j = -grow; j <= grow; j++) {
      const v = k[wrap(i + j, n)];
      if (Math.abs(v) > best) {
        best = Math.abs(v);
        side = v >= 0 ? 1 : -1;
      }
    }
    return side;
  });
  return { mask, inside };
}

/**
 * ตัวค้นหาพื้นที่ว่างรอบสนาม (grid แบ่งช่อง เร็วพอสำหรับหลายพันครั้ง)
 * · nearest(x, z): ระยะถึงเส้นกลางสนามที่ใกล้สุด
 * · free(i, side, max, half, pad): ถอยจากเส้นกลางที่จุด i ไปด้าน side ได้ไกลสุดเท่าไร
 *   โดยไม่เข้าใกล้ส่วนอื่นของสนาม (ห่างกว่า half + pad) — กันบ่อกรวด/แบริเออร์ล้ำไปทับอีกช่วง
 */
export function clearance(pts: XZ[], cell = 0.5) {
  const n = pts.length;
  const ds = spacing(pts);
  const nrm = tangents(pts).map(normalOf);
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  pts.forEach(([x, z], i) => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  const around = function* (x: number, z: number, r: number) {
    const c0 = Math.floor((x - r) / cell);
    const c1 = Math.floor((x + r) / cell);
    const d0 = Math.floor((z - r) / cell);
    const d1 = Math.floor((z + r) / cell);
    for (let cx = c0; cx <= c1; cx++)
      for (let cz = d0; cz <= d1; cz++) {
        const list = grid.get(key(cx, cz));
        if (list) yield* list;
      }
  };

  const nearest = (x: number, z: number, within = 3) => {
    let best = within;
    for (const j of around(x, z, within)) best = Math.min(best, Math.hypot(pts[j][0] - x, pts[j][1] - z));
    return best;
  };

  const free = (i: number, side: number, max: number, half: number, pad = 0.06, step = 0.03) => {
    const [px, pz] = pts[i];
    const [nx, nz] = nrm[i];
    const r = half + pad;
    let ok = half;
    for (let o = half + step; o <= max + 1e-9; o += step) {
      const qx = px + nx * side * o;
      const qz = pz + nz * side * o;
      let hit = false;
      for (const j of around(qx, qz, r)) {
        // จุดของช่วงเดียวกัน (ใกล้ตามแนววิ่ง) ไม่นับ — มันคือสนามตรงนี้เอง
        const along = Math.min(Math.abs(i - j), n - Math.abs(i - j)) * ds;
        if (along <= o + r) continue;
        if (Math.hypot(pts[j][0] - qx, pts[j][1] - qz) < r) {
          hit = true;
          break;
        }
      }
      if (hit) break;
      ok = o;
    }
    return ok;
  };

  return { nearest, free, normals: nrm, spacing: ds };
}

/** ตัวสุ่มที่ให้ผลเดิมทุกครั้ง (ต้นไม้อยู่ที่เดิมทุกครั้งที่เปิด) */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
