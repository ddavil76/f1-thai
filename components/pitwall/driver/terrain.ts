/**
 * พื้นดินรอบสนาม + ตำแหน่งอัฒจันทร์ (คำนวณล้วน ไม่แตะ three/DOM — ทดสอบได้)
 * — พื้นใกล้ถนนอิงระดับถนน (ต่ำกว่านิด) · ไกลออกไปมีเนินเขา
 * — ของรอบสนามต้องไม่บังถนนที่กำลังจะขับไปจากมุมกล้อง
 */
import { DS, heightAt, poseAt, sample, surfaceAt, type DriveTrack } from "@/lib/pitwall/drive/line";

/** อัฒจันทร์หนึ่งชุด: กึ่งกลางด้านหน้า (ติดถนน) · ทิศถนน · ฝั่ง · ความยาว */
export type Stand = { x: number; z: number; y: number; heading: number; side: number; len: number };
/** ขนาดอัฒจันทร์: ชั้น · สูงต่อชั้น · ลึกต่อชั้น · หลังคาสูงเหนือชั้นบนสุด */
export const STAND_TIERS = 6;
export const STAND_RISE = 1.2;
export const STAND_DEPTH = 2.2;
export const STAND_ROOF = 4;

export type Terrain = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** ระยะขอบถนน + พื้นที่หนีภัยที่กว้างสุด */
  maxEdge: number;
  /** ขอบพื้น (เมตรเลยขอบสนาม) · ขนาดช่องตาข่ายพื้น */
  margin: number;
  seg: number;
  nearTrack: (x: number, z: number, d: number) => boolean;
  /** ความสูงพื้นที่ (x, z) ตามสูตร (ที่จุดยอดตาข่าย) */
  heightAt: (x: number, z: number) => number;
  /** ความสูงพื้นจริงที่ (x, z) ตามที่วาด (ตาข่ายสามเหลี่ยม) */
  meshAt: (x: number, z: number) => number;
  /** ความสูงต่ำสุดของเส้นสายตาที่ผ่านแถว (x, z) — ของที่สูงเกินนี้จะบังถนน (Infinity = ไม่มีเส้นผ่าน) */
  sightFloor: (x: number, z: number) => number;
  stands: Stand[];
};

/** ระยะที่ต้องมองเห็นถนนข้างหน้า (เมตร) */
export const SIGHT_MIN = 15;
export const SIGHT_MAX = 200;
/** พื้นต้องต่ำกว่าเส้นสายตาอย่างน้อยเท่านี้ (เมตร) */
const CAP_GAP = 0.8;

/**
 * เส้นสายตาจากกล้องไปยังถนนข้างหน้า (กล้องตามหลัง + กล้องเหนือหัวนักขับ) ทุก step เมตรของสนาม
 * — fn(ตำแหน่งกล้อง, จุดบนถนน) · คืน true = หยุดไล่
 */
export function forEachSight(
  t: DriveTrack,
  fn: (c: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, s: number) => boolean | void,
  opts: { step?: number; from?: number; to?: number } = {},
) {
  const step = opts.step ?? 10;
  const from = opts.from ?? 0;
  const to = opts.to ?? t.length;
  for (let s = from; s < to; s += step) {
    const lat = sample(t, t.lineOffset, s);
    const tv = poseAt(t, s, lat);
    const chase = poseAt(t, s - 9, sample(t, t.lineOffset, s - 9));
    const cams = [
      { x: chase.x, z: chase.z, y: Math.max(heightAt(t, s - 9), heightAt(t, s)) + 2.7 },
      { x: tv.x, z: tv.z, y: surfaceAt(t, s, lat) + 1.32 },
    ];
    for (let d = SIGHT_MIN; d <= SIGHT_MAX; d += 5) {
      const ss = s + d;
      const ql = sample(t, t.lineOffset, ss);
      const q = poseAt(t, ss, ql);
      const qq = { x: q.x, z: q.z, y: surfaceAt(t, ss, ql) + 0.6 };
      for (const c of cams) if (fn(c, qq, s)) return;
    }
  }
}

/** เดินตามเส้นสายตาทีละ ~2 ม. (ไม่นับช่วงติดกล้อง/ติดเป้า) · hit(x, y, z) = true → บัง */
export function sightHits(c: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, hit: (x: number, y: number, z: number) => boolean) {
  const L = Math.hypot(q.x - c.x, q.z - c.z);
  for (let m = 3; m < L - 3; m += 2) {
    const f = m / L;
    if (hit(c.x + (q.x - c.x) * f, c.y + (q.y - c.y) * f, c.z + (q.z - c.z) * f)) return true;
  }
  return false;
}

/** จุด (x, y, z) อยู่ในกล่องอัฒจันทร์ไหม (รวมหลังคา) */
export function inStand(st: Stand, x: number, y: number, z: number) {
  const dx = x - st.x;
  const dz = z - st.z;
  const a = dx * Math.cos(st.heading) + dz * Math.sin(st.heading);
  const b = (-dx * Math.sin(st.heading) + dz * Math.cos(st.heading)) * st.side;
  return Math.abs(a) <= st.len / 2 && b >= -0.5 && b <= STAND_TIERS * STAND_DEPTH + 1 && y >= st.y - 1 && y <= st.y + STAND_TIERS * STAND_RISE + STAND_ROOF;
}

export function buildTerrain(t: DriveTrack, opts: { high: boolean; hillSeed: number }): Terrain {
  const { high, hillSeed } = opts;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) {
    minX = Math.min(minX, t.x[i]);
    maxX = Math.max(maxX, t.x[i]);
    minZ = Math.min(minZ, t.z[i]);
    maxZ = Math.max(maxZ, t.z[i]);
  }
  let maxEdge = 0;
  for (let i = 0; i < t.n; i++) maxEdge = Math.max(maxEdge, t.wl[i], t.wr[i]);
  maxEdge += t.runoff;

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

  /* ---------- พื้นดิน: ตามความสูงของสนาม + เนินไกล ๆ ---------- */
  // ตารางหยาบ: ช่องที่มีถนน = ความสูงถนน (ต่ำกว่านิด) · ช่องอื่นเกลี่ยจากรอบ ๆ ให้เป็นเนินต่อเนื่อง
  const MARGIN = 1500;
  const FC = 50;
  const fx0 = minX - MARGIN;
  const fz0 = minZ - MARGIN;
  const fw = Math.ceil((maxX - minX + 2 * MARGIN) / FC) + 1;
  const fh = Math.ceil((maxZ - minZ + 2 * MARGIN) / FC) + 1;
  const field = new Float32Array(fw * fh);
  const fixed = new Uint8Array(fw * fh);
  const dist = new Float32Array(fw * fh).fill(1e9);
  {
    const sum = new Float32Array(fw * fh);
    const cnt = new Uint16Array(fw * fh);
    let mean = 0;
    for (let i = 0; i < t.n; i++) {
      const k = Math.round((t.z[i] - fz0) / FC) * fw + Math.round((t.x[i] - fx0) / FC);
      // ทางที่ซ้อนกัน (สะพาน) ใช้ระดับล่าง
      sum[k] = cnt[k] ? Math.min(sum[k] / cnt[k], t.y[i]) * (cnt[k] + 1) : t.y[i];
      cnt[k]++;
      mean += t.y[i] / t.n;
    }
    for (let k = 0; k < fw * fh; k++) {
      if (cnt[k]) {
        field[k] = sum[k] / cnt[k] - 0.4;
        fixed[k] = 1;
        dist[k] = 0;
      } else field[k] = mean;
    }
    // ระยะห่างจากถนน (หน่วยช่อง) แบบไล่สองทิศ
    for (let pass = 0; pass < 2; pass++)
      for (let zz = 0; zz < fh; zz++)
        for (let xx = 0; xx < fw; xx++) {
          const X = pass ? fw - 1 - xx : xx;
          const Z = pass ? fh - 1 - zz : zz;
          const k = Z * fw + X;
          const d = pass ? 1 : -1;
          const nx = X - d;
          const nz = Z - d;
          if (nx >= 0 && nx < fw) dist[k] = Math.min(dist[k], dist[Z * fw + nx] + 1);
          if (nz >= 0 && nz < fh) dist[k] = Math.min(dist[k], dist[nz * fw + X] + 1);
        }
    const tmpF = new Float32Array(fw * fh);
    for (let it = 0; it < 160; it++) {
      for (let zz = 0; zz < fh; zz++)
        for (let xx = 0; xx < fw; xx++) {
          const k = zz * fw + xx;
          if (fixed[k]) {
            tmpF[k] = field[k];
            continue;
          }
          const l = field[zz * fw + Math.max(0, xx - 1)];
          const rr = field[zz * fw + Math.min(fw - 1, xx + 1)];
          const u = field[Math.max(0, zz - 1) * fw + xx];
          const dd = field[Math.min(fh - 1, zz + 1) * fw + xx];
          tmpF[k] = (l + rr + u + dd) / 4;
        }
      field.set(tmpF);
    }
  }
  const fieldAt = (arr: Float32Array, x: number, z: number) => {
    const gx = Math.max(0, Math.min(fw - 1.001, (x - fx0) / FC));
    const gz = Math.max(0, Math.min(fh - 1.001, (z - fz0) / FC));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const ax = gx - ix;
    const az = gz - iz;
    const k = iz * fw + ix;
    return (arr[k] * (1 - ax) + arr[k + 1] * ax) * (1 - az) + (arr[k + fw] * (1 - ax) + arr[k + fw + 1] * ax) * az;
  };
  /** รัศมีที่พื้นต้องอิงระดับถนน (เมตร) · ความชันคันดินข้างสนามสูงสุด */
  const NEAR = 120;
  const SINK = 1.1;
  const BANK = 0.3;
  const SEG = high ? 24 : 40;
  const FLAT = Math.max(maxEdge + 6, SEG * 1.5);
  /* ---------- ห้ามพื้นบังถนนข้างหน้า: เพดานพื้นตามเส้นสายตาจากกล้อง ---------- */
  // เส้นสายตาที่ถนนเองบังอยู่แล้ว (ยอดเนินบนถนน) ไม่นับ — ไม่งั้นพื้นข้างถนนถูกกดเป็นหลุม
  type P = { x: number; y: number; z: number };
  const rays: [P, P][] = [];
  forEachSight(t, (c, q) => void rays.push([c, q]));
  const CC = 8;
  const cx0 = minX - SIGHT_MAX;
  const cz0 = minZ - SIGHT_MAX;
  const cw = Math.ceil((maxX - minX + 2 * SIGHT_MAX) / CC) + 1;
  const ch = Math.ceil((maxZ - minZ + 2 * SIGHT_MAX) / CC) + 1;
  const cap = new Float32Array(cw * ch).fill(Infinity);
  // ความสูงถนนที่ใกล้สุดในแต่ละช่อง (เฉพาะในแนวถนน) · NaN = ไม่ใช่ถนน
  const road = new Float32Array(cw * ch).fill(NaN);
  {
    const near = new Float32Array(cw * ch).fill(Infinity);
    const rad = Math.ceil(maxEdge / CC);
    for (let i = 0; i < t.n; i++) {
      const ix = Math.round((t.x[i] - cx0) / CC);
      const iz = Math.round((t.z[i] - cz0) / CC);
      for (let a = -rad; a <= rad; a++)
        for (let b = -rad; b <= rad; b++) {
          const X = ix + a;
          const Z = iz + b;
          if (X < 0 || Z < 0 || X >= cw || Z >= ch) continue;
          const d = Math.hypot(cx0 + X * CC - t.x[i], cz0 + Z * CC - t.z[i]);
          const k = Z * cw + X;
          if (d < maxEdge && d < near[k]) {
            near[k] = d;
            road[k] = t.y[i];
          }
        }
    }
  }
  for (const [c, q] of rays) {
    const L = Math.hypot(q.x - c.x, q.z - c.z);
    const pts: number[] = [];
    let blocked = false;
    for (let m = 3; m < L - 3; m += CC / 2) {
      const f = m / L;
      const x = c.x + (q.x - c.x) * f;
      const z = c.z + (q.z - c.z) * f;
      const y = c.y + (q.y - c.y) * f;
      const k = Math.round((z - cz0) / CC) * cw + Math.round((x - cx0) / CC);
      if (road[k] > y) {
        blocked = true;
        break;
      }
      pts.push(k, y - CAP_GAP);
    }
    if (blocked) continue;
    for (let k = 0; k < pts.length; k += 2) cap[pts[k]] = Math.min(cap[pts[k]], pts[k + 1]);
  }
  // ขยายเพดานออกไปเท่าช่องตาข่ายพื้น (สามเหลี่ยมที่คร่อมเส้นสายตาก็ต้องต่ำด้วย)
  {
    const rad = Math.ceil(SEG / CC) + 1;
    const tmp = new Float32Array(cw * ch);
    for (let zz = 0; zz < ch; zz++)
      for (let xx = 0; xx < cw; xx++) {
        let m = Infinity;
        for (let d = -rad; d <= rad; d++) m = Math.min(m, cap[zz * cw + Math.max(0, Math.min(cw - 1, xx + d))]);
        tmp[zz * cw + xx] = m;
      }
    for (let zz = 0; zz < ch; zz++)
      for (let xx = 0; xx < cw; xx++) {
        let m = Infinity;
        for (let d = -rad; d <= rad; d++) m = Math.min(m, tmp[Math.max(0, Math.min(ch - 1, zz + d)) * cw + xx]);
        cap[zz * cw + xx] = m;
      }
  }
  const capAt = (x: number, z: number) => {
    const ix = Math.round((x - cx0) / CC);
    const iz = Math.round((z - cz0) / CC);
    return ix < 0 || iz < 0 || ix >= cw || iz >= ch ? Infinity : cap[iz * cw + ix];
  };

  /** ความสูงพื้นดินที่ (x, z): ใกล้ถนน = ต่ำกว่าถนนเล็กน้อย · ไกลออกไปมีเนินเขาเพิ่มขึ้นเรื่อย ๆ */
  function terrainAt(x: number, z: number) {
    let h = fieldAt(field, x, z);
    const far = Math.min(1, Math.max(0, (fieldAt(dist, x, z) * FC - 120) / 600));
    h +=
      far *
      (16 * Math.sin(x / 210 + hillSeed) * Math.sin(z / 260 - hillSeed * 0.7) +
        7 * Math.sin(x / 90 - z / 120 + hillSeed * 1.3) +
        24 * far * Math.max(0, Math.sin(x / 520 + z / 610 + hillSeed)));
    // ใกล้ถนน: พื้นต้องตามระดับถนน (ต่ำกว่านิด) แล้วค่อยลาดขึ้น/ลงได้ไม่เกินความชันคันดิน — กันพื้นโผล่ทับถนนตรงเนินชัน
    // ถนนทุกเส้นที่อยู่ใกล้: พื้นต้องต่ำกว่าทุกเส้น (สนามที่ถนนสองช่วงสูงต่างกันอยู่ใกล้กัน) ·
    // และไม่ต่ำกว่าเส้นที่ใกล้สุดเกินความชันคันดิน (ไม่เป็นหน้าผา)
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = NEAR;
    let lower = -Infinity;
    let upper = Infinity;
    for (let a = -3; a <= 3; a++)
      for (let b = -3; b <= 3; b++)
        for (const i of grid.get(`${cx + a},${cz + b}`) ?? []) {
          const d = Math.hypot(t.x[i] - x, t.z[i] - z);
          if (d >= NEAR) continue;
          // ถนนเอียง: ขอบด้านในต่ำกว่ากลางถนน
          const low = t.y[i] - SINK - Math.abs(Math.tan(t.bank[i])) * Math.max(t.wl[i], t.wr[i]);
          const room = Math.max(0, d - FLAT) * BANK;
          upper = Math.min(upper, low + room);
          if (d < best) {
            best = d;
            lower = low - room;
          }
        }
    if (upper !== Infinity) h = Math.min(upper, Math.max(lower, h));
    return Math.min(h, capAt(x, z));
  }

  // ตาข่ายพื้น (แบบเดียวกับ PlaneGeometry ที่หมุนนอนแล้ว): แถว iz ไล่ z จากน้อยไปมาก · แบ่งช่องเป็นสามเหลี่ยม (a,b,d) (b,c,d)
  const gw = maxX - minX + 2 * MARGIN;
  const gh = maxZ - minZ + 2 * MARGIN;
  const nx = Math.round(gw / SEG);
  const nz = Math.round(gh / SEG);
  const gx0 = minX - MARGIN;
  const gz0 = minZ - MARGIN;
  const sx = gw / nx;
  const sz = gh / nz;
  const vert = new Map<number, number>();
  const vAt = (ix: number, iz: number) => {
    const key = iz * (nx + 1) + ix;
    let h = vert.get(key);
    if (h === undefined) {
      h = terrainAt(gx0 + ix * sx, gz0 + iz * sz);
      vert.set(key, h);
    }
    return h;
  };
  const meshAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(nx - 1e-6, (x - gx0) / sx));
    const fz = Math.max(0, Math.min(nz - 1e-6, (z - gz0) / sz));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const a = vAt(ix, iz);
    const b = vAt(ix, iz + 1);
    const c = vAt(ix + 1, iz + 1);
    const d = vAt(ix + 1, iz);
    return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  };

  /* ---------- อัฒจันทร์: เส้นสตาร์ท + ทางตรงยาว ๆ (ด้านนอก) ---------- */
  const runs: { i: number; len: number }[] = [];
  for (let i = 0; i < t.n; i++) {
    if (t.zone[i] !== "throttle" || t.zone[(i - 1 + t.n) % t.n] === "throttle") continue;
    let len = 0;
    while (len < t.n && t.zone[(i + len) % t.n] === "throttle") len++;
    runs.push({ i, len });
  }
  runs.sort((a, b) => b.len - a.len);
  const stands: Stand[] = [];

  const depth = STAND_TIERS * STAND_DEPTH + 1;
  for (const run of [{ i: t.n - Math.round(150 / DS), len: Math.round(300 / DS) }, ...runs]) {
    if (stands.length >= (high ? 5 : 3)) break;
    // ด้านนอก = ฝั่งตรงข้ามกับโค้งถัดไป
    const side = sample(t, t.curve, run.i * DS + run.len * DS + 40) > 0 ? -1 : 1;
    const mid = run.i * DS + (run.len * DS) / 2;
    const k = Math.round(mid / DS) % t.n;
    const off = side > 0 ? t.wr[k] + t.runoff + 6 : -(t.wl[k] + t.runoff + 6);
    const p = poseAt(t, mid, off);
    const y = heightAt(t, mid);
    // ทางตรงไม่ตรงจริง/ถนนช่วงอื่นอยู่ใกล้: หดความยาวจนตัวอัฒจันทร์ (หน้า–หลัง) ไม่ทับถนนเส้นไหน
    let len = Math.min(run.len * DS * 0.7, 260);
    const fits = (L: number) => {
      // ทิศถนน (cos h, sin h) · ขวาของทิศวิ่ง (-sin h, cos h) → ออกจากถนนฝั่ง side
      const ux = Math.cos(p.heading);
      const uz = Math.sin(p.heading);
      const ox = -uz * side;
      const oz = ux * side;
      for (let a = -L / 2; a <= L / 2; a += 8)
        for (const b of [0, depth / 2, depth]) {
          const x = p.x + ux * a + ox * b;
          const z = p.z + uz * a + oz * b;
          // ระยะจากเส้นกลางถนนทุกเส้นต้องไม่น้อยกว่าระยะของด้านหน้าอัฒจันทร์จากถนนตัวเอง (หักเผื่อนิด)
          if (nearTrack(x, z, Math.abs(off) - 2)) return false;
          // พื้นตรงนั้นสูงจนกลบอัฒจันทร์ หรือต่ำจนลอย
          if (Math.abs(terrainAt(x, z) - y) > 6) return false;
        }
      return true;
    };
    // ต้องไม่บังถนนข้างหน้าจากมุมกล้อง (เช่น อยู่ด้านในของโค้งช่วงอื่นที่วนมาใกล้)
    const clearView = (st: Stand) => {
      const r = st.len / 2 + depth + 2;
      for (const [c, q] of rays) {
        // ตัดทิ้งเร็ว: เส้นสายตาไม่ผ่านใกล้วงรอบอัฒจันทร์
        const vx = q.x - c.x;
        const vz = q.z - c.z;
        const f = Math.max(0, Math.min(1, ((st.x - c.x) * vx + (st.z - c.z) * vz) / (vx * vx + vz * vz)));
        if (Math.hypot(c.x + vx * f - st.x, c.z + vz * f - st.z) > r) continue;
        if (sightHits(c, q, (x, yy, z) => inStand(st, x, yy, z))) return false;
      }
      return true;
    };
    while (len >= 60 && !(fits(len) && clearView({ x: p.x, z: p.z, y, heading: p.heading, side, len }))) len -= 20;
    if (len < 60) continue;
    stands.push({ x: p.x, z: p.z, y, heading: p.heading, side, len });
  }

  return { minX, maxX, minZ, maxZ, maxEdge, margin: MARGIN, seg: SEG, nearTrack, heightAt: terrainAt, meshAt, sightFloor: (x, z) => capAt(x, z) + CAP_GAP, stands };
}
