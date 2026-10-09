/**
 * สนามสำหรับโหมดนักขับ (หน่วยเมตร)
 * — เส้นกลางสนามละเอียดทุก DS เมตร, ความโค้ง, ความเร็วสูงสุดที่เข้าโค้งได้,
 *   ความเร็วอ้างอิง (ขับตามเส้นเป๊ะ) และโซนสีของเส้นช่วย: เขียว = คันเร่ง, เหลือง = ปล่อย, แดง = เบรก
 * คำนวณจากผังสนาม 2D (ไม่มีเนิน) — ทรงพอใกล้ของจริง ไม่ได้แม่นระดับเซนติเมตร
 */
import { circuitTrack } from "../../circuits";
import { parsePolyline, resampleLoop, type Pt } from "../board";

/** ระยะห่างของจุดบนเส้นกลาง (เมตร) */
export const DS = 4;
/** ความเร็วสูงสุด (ม./วิ) ≈ 330 กม./ชม. */
export const VMAX = 92;
/** แรงเหวี่ยงข้างที่ยางรับได้ (ม./วิ²) ≈ 3.9g */
export const ALAT = 38;
/** มองไปข้างหน้ากี่จุดเพื่อหาความเร็วต่ำสุดของโค้งต่อเนื่อง (จุดละ DS เมตร) */
const PLAN_WIN = 8;
/** ความกว้างครึ่งหนึ่งของถนน (เมตร) */
export const HALF_WIDTH = 6;

/** แรงเร่ง (ม./วิ²) — มากตอนช้า ลดลงใกล้ความเร็วสูงสุด */
export const accelAt = (v: number) => 14 * (1 - (v / VMAX) ** 2) + 0.4;
/** แรงเบรก (ม./วิ²) — ยิ่งเร็ว downforce ยิ่งช่วยให้เบรกแรง */
export const brakeAt = (v: number) => 24 + 26 * (v / VMAX) ** 2;
/** ปล่อยคันเร่ง (ประคอง) — เสียความเร็วนิดหน่อย ใช้ผ่านโค้งยาวโดยไม่ต้องเบรก */
export const coastAt = (v: number) => 0.6 + 2.4 * (v / VMAX) ** 2;

export type Zone = "throttle" | "lift" | "brake";

export type DriveTrack = {
  circuitId: string;
  /** ความยาวรอบ (เมตร) */
  length: number;
  /** จำนวนจุด (= length / DS) */
  n: number;
  /** ตำแหน่ง x, z (เมตร) ของจุดที่ i */
  x: Float64Array;
  z: Float64Array;
  /** ทิศวิ่ง (เรเดียน, atan2(dz, dx)) */
  heading: Float64Array;
  /** ความโค้ง (1/เมตร) — บวก = เลี้ยวขวาเมื่อมองตามทิศวิ่ง (แกน z ชี้ลงจอ) */
  curve: Float64Array;
  /** ความเร็วสูงสุดที่เข้าโค้งได้ (ม./วิ) */
  vlat: Float64Array;
  /** ความเร็วอ้างอิงเมื่อขับตามเส้นเป๊ะ */
  vref: Float64Array;
  /** โซนสีของเส้นช่วย */
  zone: Zone[];
  /** ระยะเยื้องจากเส้นกลางของ racing line (เมตร, บวก = ไปทางขวาของทิศวิ่ง) */
  lineOffset: Float64Array;
  /** เวลาต่อรอบเมื่อขับตามเส้นเป๊ะ (วินาที) */
  refLap: number;
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** เกลี่ยค่าวนรอบด้วยหน้าต่าง [¼, ½, ¼] หลายรอบ */
function smoothLoop(a: Float64Array, passes: number) {
  const n = a.length;
  let cur = a;
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) next[i] = 0.25 * cur[(i - 1 + n) % n] + 0.5 * cur[i] + 0.25 * cur[(i + 1) % n];
    cur = next;
  }
  return cur;
}

function perimeter(pts: Pt[]) {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export function buildDriveTrack(circuitId: string): DriveTrack | null {
  const path = circuitTrack(circuitId);
  if (!path) return null;
  const raw = parsePolyline(path.d);
  if (raw.length < 4) return null;
  const lengthM = path.length ?? 5000;
  const scale = lengthM / perimeter(raw);
  const n = Math.max(200, Math.round(lengthM / DS));
  const pts = resampleLoop(raw, n);

  // เกลี่ยมุมหักของผังให้เป็นโค้งเรียบ (ผังเดิมมีจุดห่าง ๆ)
  let x: Float64Array = new Float64Array(n);
  let z: Float64Array = new Float64Array(n);
  pts.forEach((p, i) => {
    x[i] = p.x * scale;
    z[i] = p.y * scale;
  });
  // จัดให้อยู่กลางจุด (0, 0)
  const cx = (Math.max(...x) + Math.min(...x)) / 2;
  const cz = (Math.max(...z) + Math.min(...z)) / 2;
  x = x.map((v) => v - cx);
  z = z.map((v) => v - cz);
  x = smoothLoop(x, 8);
  z = smoothLoop(z, 8);

  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(z[b] - z[a], x[b] - x[a]);
  }
  let curve: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    curve[i] = wrap(heading[(i + 1) % n] - heading[(i - 1 + n) % n]) / (2 * DS);
  }
  curve = smoothLoop(curve, 4);

  const vlat = new Float64Array(n);
  for (let i = 0; i < n; i++) vlat[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(Math.abs(curve[i]), 1e-6)));
  // ความเร็วอ้างอิงใช้ค่าต่ำสุดของช่วงข้างหน้า — โค้งต่อเนื่องจะได้เบรกครั้งเดียวแล้วประคองผ่าน ไม่เบรกถี่ ๆ
  const vplan = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = vlat[i];
    for (let k = 1; k <= PLAN_WIN; k++) m = Math.min(m, vlat[(i + k) % n]);
    vplan[i] = m;
  }

  // ความเร็วอ้างอิง: เบรกให้ทันโค้งถัดไป (ย้อนหลัง) แล้วเร่งได้เท่าที่รถไหว (เดินหน้า) — วนสองรอบให้ต่อกันที่เส้นชัย
  const vref = Float64Array.from(vplan);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 2 * n - 1; k >= 0; k--) {
      const i = k % n;
      const j = (i + 1) % n;
      vref[i] = Math.min(vref[i], Math.sqrt(vref[j] ** 2 + 2 * brakeAt(vref[j]) * DS));
    }
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n;
      const j = (i + 1) % n;
      vref[j] = Math.min(vref[j], Math.sqrt(vref[i] ** 2 + 2 * accelAt(vref[i]) * DS));
    }
  }

  // โซน: ต้องลดความเร็วแรงกว่าครึ่งของเบรกเต็มที่ = เบรก · เร่งขึ้นหรือสุดทาง = คันเร่ง · ทรงตัวในโค้ง = ปล่อย
  const zone: Zone[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dv2 = vref[j] ** 2 - vref[i] ** 2;
    if (dv2 < -brakeAt(vref[i]) * DS) zone[i] = "brake";
    else if (dv2 > 0.5 || vref[i] > VMAX * 0.97) zone[i] = "throttle";
    else zone[i] = "lift";
  }
  // โซนเบรกสั้นมากกลางทางเร่ง = สัญญาณรบกวน ตัดทิ้ง (กันเส้นแดงกะพริบ)
  for (let i = 0; i < n; i++) {
    if (zone[i] !== "brake") continue;
    let len = 0;
    while (len < 8 && zone[(i + len) % n] === "brake") len++;
    if (len < 5 && zone[(i - 1 + n) % n] === "throttle") for (let k = 0; k < len; k++) zone[(i + k) % n] = "lift";
  }

  // racing line: ชิดในโค้ง (ตามความโค้งแบบเกลี่ยกว้าง) ไม่เกินขอบถนน
  const wide = smoothLoop(curve, 40);
  const lineOffset = new Float64Array(n);
  for (let i = 0; i < n; i++) lineOffset[i] = Math.max(-(HALF_WIDTH - 1.6), Math.min(HALF_WIDTH - 1.6, wide[i] * 1500));

  let refLap = 0;
  for (let i = 0; i < n; i++) refLap += DS / Math.max(1, (vref[i] + vref[(i + 1) % n]) / 2);

  return { circuitId, length: n * DS, n, x, z, heading, curve, vlat, vref, zone, lineOffset, refLap };
}

/** ค่าที่ระยะ s (เมตร, นับข้ามรอบได้) แบบเชิงเส้นระหว่างจุด */
export function sample(t: DriveTrack, arr: Float64Array, s: number) {
  const u = (((s / DS) % t.n) + t.n) % t.n;
  const i = Math.floor(u);
  const f = u - i;
  return arr[i] * (1 - f) + arr[(i + 1) % t.n] * f;
}

export const zoneAt = (t: DriveTrack, s: number): Zone => t.zone[Math.floor((((s / DS) % t.n) + t.n) % t.n)];

/** ตำแหน่ง/ทิศบนสนามที่ระยะ s เยื้องขวา lateral เมตร */
export function poseAt(t: DriveTrack, s: number, lateral = 0) {
  const px = sample(t, t.x, s);
  const pz = sample(t, t.z, s);
  // ทิศวิ่งจากจุดก่อน/หลัง (ไม่ใช้ heading ตรง ๆ เพราะเชิงเส้นข้าม ±π ไม่ได้)
  const ax = sample(t, t.x, s - 2);
  const az = sample(t, t.z, s - 2);
  const bx = sample(t, t.x, s + 2);
  const bz = sample(t, t.z, s + 2);
  const h = Math.atan2(bz - az, bx - ax);
  // ขวาของทิศวิ่ง (แกน z ชี้ลงจอ) = (-sin h, cos h)
  return { x: px - Math.sin(h) * lateral, z: pz + Math.cos(h) * lateral, heading: h };
}
