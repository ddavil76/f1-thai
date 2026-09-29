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

  /**
   * ระยะจากจุด i ถึง "ช่วงอื่น" ของสนามที่ใกล้สุด (ไม่เกิน cap) — ช่วงที่วิ่งผ่านมาใกล้ ๆ
   * แต่ห่างกันตามแนววิ่ง (เช่นถนนสองเส้นขนานในสนามถนน) · สองขาของโค้งหักศอกไม่นับ
   * เพราะเชื่อมกันด้วยโค้งอยู่แล้ว (ระยะตามแนววิ่งไม่ถึงสองเท่าของระยะตรง)
   */
  const gap = (i: number, cap = 1) => {
    const [px, pz] = pts[i];
    let best = cap;
    for (const j of around(px, pz, cap)) {
      const d = Math.hypot(pts[j][0] - px, pts[j][1] - pz);
      if (d >= best) continue;
      const along = Math.min(Math.abs(i - j), n - Math.abs(i - j)) * ds;
      if (along > d * 2 + 0.3) best = d;
    }
    return best;
  };

  return { nearest, free, gap, normals: nrm, spacing: ds };
}

/**
 * ความกว้างครึ่งหนึ่งของถนนแต่ละจุด — ปกติ = base แต่ช่วงที่มีถนนอีกเส้นผ่านมาใกล้
 * (สนามถนนอย่างบากู/โมนาโก) แคบลงจนไม่ทับกัน · ค่อย ๆ แคบ/กว้าง ไม่หักเป็นขั้น
 */
export function roadWidth(pts: XZ[], { base = 0.15, min = 0.05, share = 0.4 } = {}): number[] {
  const n = pts.length;
  const { gap } = clearance(pts);
  const raw = pts.map((_, i) => Math.max(min, Math.min(base, gap(i, base / share + 0.1) * share)));
  // ขยายช่วงแคบออกไปก่อน/หลัง แล้วเฉลี่ยให้เนียน
  const W = 18;
  const low = raw.map((_, i) => {
    let m = Infinity;
    for (let j = -W; j <= W; j++) m = Math.min(m, raw[wrap(i + j, n)]);
    return m;
  });
  const B = 10;
  return low.map((_, i) => {
    let s = 0;
    for (let j = -B; j <= B; j++) s += low[wrap(i + j, n)];
    return s / (2 * B + 1);
  });
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

/** จุดห่างเท่า ๆ กันตามแนววิ่ง n จุด (วงปิด) */
export function resample(pts: XZ[], n: number): XZ[] {
  const L = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = L[pts.length] || 1;
  const out: XZ[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * total;
    while (L[j] < t) j++;
    const a = pts[j - 1];
    const b = pts[j % pts.length];
    const f = (t - L[j - 1]) / (L[j] - L[j - 1] || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/**
 * หาการหมุน/ย่อขยาย/เลื่อน (และกลับด้านถ้าจำเป็น) ที่ทำให้เส้นสนาม pts ทับ ref ได้ดีที่สุด
 * ใช้วางเส้นสนามจากพิกัดรถ (openf1 — แกนของ F1 เอง ไม่ได้ชี้ทิศเหนือเสมอ) ให้ตรงกับผังสนาม
 * ที่ผูกกับแผนที่จริง · ไม่ต้องรู้ว่าจุดไหนคู่กับจุดไหน (ลองทุกมุม เทียบระยะใกล้สุด)
 */
export function alignTo(ref: XZ[], pts: XZ[]): (p: XZ) => XZ {
  const R = resample(ref, 240);
  const Q = resample(pts, 240);
  const mean = (a: XZ[]): XZ => [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length];
  const rms = (a: XZ[], c: XZ) => Math.sqrt(a.reduce((s, p) => s + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, 0) / a.length);
  const cr = mean(R);
  const cq = mean(Q);
  const scale = rms(R, cr) / (rms(Q, cq) || 1);
  const ref0 = R.map(([x, z]) => [x - cr[0], z - cr[1]] as XZ);
  const probe = Q.filter((_, i) => i % 4 === 0).map(([x, z]) => [(x - cq[0]) * scale, (z - cq[1]) * scale] as XZ);
  const cost = (ang: number, flip: number) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let sum = 0;
    for (const [x0, z0] of probe) {
      const x = x0 * flip;
      const px = x * c - z0 * s;
      const pz = x * s + z0 * c;
      let best = Infinity;
      for (const [rx, rz] of ref0) best = Math.min(best, (rx - px) ** 2 + (rz - pz) ** 2);
      sum += best;
    }
    return sum;
  };
  let bestAng = 0;
  let bestFlip = 1;
  let bestCost = Infinity;
  for (const flip of [1, -1])
    for (let d = 0; d < 360; d += 3) {
      const v = cost((d * Math.PI) / 180, flip);
      if (v < bestCost) [bestCost, bestAng, bestFlip] = [v, (d * Math.PI) / 180, flip];
    }
  // ละเอียดขึ้นรอบมุมที่ดีที่สุด
  for (let step = 1; step >= 0.125; step /= 2) {
    for (const d of [-step, step]) {
      const a = bestAng + (d * Math.PI) / 180;
      const v = cost(a, bestFlip);
      if (v < bestCost) [bestCost, bestAng] = [v, a];
    }
  }
  const c = Math.cos(bestAng);
  const s = Math.sin(bestAng);
  return ([x, z]) => {
    const px = (x - cq[0]) * scale * bestFlip;
    const pz = (z - cq[1]) * scale;
    return [px * c - pz * s + cr[0], px * s + pz * c + cr[1]];
  };
}
