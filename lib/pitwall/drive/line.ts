/**
 * สนามสำหรับโหมดนักขับ (หน่วยเมตร)
 * — เส้นกลางสนามละเอียดทุก DS เมตร, ความโค้ง, ความเร็วสูงสุดที่เข้าโค้งได้,
 *   ความเร็วอ้างอิง (ขับตามเส้นเป๊ะ) และโซนสีของเส้นช่วย: เขียว = คันเร่ง, เหลือง = ปล่อย, แดง = เบรก
 * คำนวณจากผังสนาม 2D + ความสูงโดยประมาณ (elevation.ts) — ทรงพอใกล้ของจริง ไม่ได้แม่นระดับเซนติเมตร
 */
import { circuitTrack } from "../../circuits";
import { parsePolyline, resampleLoop, type Pt } from "../board";
import { elevationAt } from "./elevation";
import type { RawTrack } from "./tracks";
import { cornersOf } from "./corners";

/** ระยะห่างของจุดบนเส้นกลาง (เมตร) */
export const DS = 4;
/** ความเร็วสูงสุด (ม./วิ) ≈ 330 กม./ชม. */
export const VMAX = 92;
/**
 * แรงเหวี่ยงข้างที่รถรับได้ (ม./วิ²) = ALAT + DOWNFORCE·(v/VMAX)²
 * ช้า ≈ 2.7g (ยางล้วน) · เร็วสุด ≈ 6g (แรงกดอากาศ) — โค้งเร็วอย่าง Eau Rouge/130R/Copse จึงกดเต็มได้
 */
export const ALAT = 26;
export const DOWNFORCE = 34;
/** มองไปข้างหน้ากี่จุดเพื่อหาความเร็วต่ำสุดของโค้งต่อเนื่อง (จุดละ DS เมตร) */
const PLAN_WIN = 8;
/** แรงโน้มถ่วง (ม./วิ²) — ขึ้นเนินเร่งช้าลง เบรกได้ไวขึ้น */
export const G = 9.81;
/** ความชันสูงสุดของถนน */
const MAX_GRADE = 0.18;
/** ความกว้างครึ่งหนึ่งของถนน (เมตร) เมื่อไม่มีข้อมูลจริง */
export const HALF_WIDTH = 6;
/** สนามที่ไม่มีข้อมูลความกว้างจริง: ครึ่งความกว้าง + ระยะถึงกำแพง (โมนาโกแคบ กำแพงชิดขอบ) */
const FALLBACK: Record<string, { half: number; runoff: number }> = { monaco: { half: 4.3, runoff: 0.8 } };
/** ระยะจากขอบถนนถึงกำแพง (เมตร) */
const RUNOFF = 11;

/** แรงเร่ง (ม./วิ²) — มากตอนช้า ลดลงใกล้ความเร็วสูงสุด */
export const accelAt = (v: number) => 14 * (1 - (v / VMAX) ** 2) + 0.4;
/** แรงเบรก (ม./วิ²) — ยิ่งเร็ว downforce ยิ่งช่วยให้เบรกแรง */
export const brakeAt = (v: number) => 24 + 26 * (v / VMAX) ** 2;
/** ปล่อยคันเร่ง (ประคอง) — เสียความเร็วนิดหน่อย ใช้ผ่านโค้งยาวโดยไม่ต้องเบรก */
export const coastAt = (v: number) => 0.6 + 2.4 * (v / VMAX) ** 2;

/**
 * Straight Mode (ปีกพับราบบนทางตรง แบบกฎรถปี 2026): แรงต้านอากาศน้อยลง → ความเร็วสูงสุดสูงขึ้น ~6% และเร่งช่วงความเร็วสูงได้ดีขึ้น
 * เปิดได้เฉพาะในโซนทางตรงที่กำหนด (smZone) · ปิดเองเมื่อเบรกหรือพ้นโซน
 */
export const VSM = VMAX * 1.06;
export const accelSM = (v: number) => 14 * (1 - (v / VSM) ** 2) + 0.4;
export const coastSM = (v: number) => 0.6 + 1.6 * (v / VMAX) ** 2;
/** ความเร็วที่ลดลงเองเมื่อพับปีกกลับขณะเร็วกว่าความเร็วสูงสุดปกติ (ม./วิ²) */
export const SM_BLEED = 3;
/** ทางตรงที่ยาวพอจะเป็นโซน Straight Mode (เมตร) และความโค้งสูงสุดที่ยังนับว่าตรง */
const SM_MIN_LEN = 320;
const SM_MAX_CURVE = 0.0022;

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
  /** ความกว้างถนนจากเส้นกลางไปทางซ้าย/ขวาของทิศวิ่ง (เมตร) */
  wl: Float64Array;
  wr: Float64Array;
  /** ระยะจากขอบถนนถึงกำแพง (เมตร) */
  runoff: number;
  /** ระยะเยื้องจากเส้นกลางของ racing line (เมตร, บวก = ไปทางขวาของทิศวิ่ง) */
  lineOffset: Float64Array;
  /** ระยะจริงบน racing line ต่อ 1 ม. ของเส้นกลาง (ในโค้งด้านในสั้นกว่า ด้านนอกยาวกว่า) */
  stretch: Float64Array;
  /** ความสูงของถนน (เมตร) */
  y: Float64Array;
  /** ความชันของถนน (ขึ้น/ระยะ) — บวก = ขึ้นเนิน */
  grade: Float64Array;
  /** ถนนเอียงข้าง (เรเดียน): ความสูงที่ระยะเยื้อง lat = y + lat·tan(bank) */
  bank: Float64Array;
  /** 1 = เปิด Straight Mode ได้ที่จุดนี้ */
  smZone: Uint8Array;
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

/** ระยะห่างของ racing line จากขอบถนน (เมตร) — ครึ่งความกว้างรถ + เผื่อ */
const LINE_MARGIN = 1.5;

/** ความโค้งแบบมีเครื่องหมายของวงกลมผ่าน 3 จุด */
function curv3(ax: number, az: number, bx: number, bz: number, cx: number, cz: number) {
  // sqrt แทน hypot (เร็วกว่ามาก — เรียกหลายล้านครั้งตอนหาเส้น)
  const ab2 = (bx - ax) ** 2 + (bz - az) ** 2;
  const bc2 = (cx - bx) ** 2 + (cz - bz) ** 2;
  const ca2 = (ax - cx) ** 2 + (az - cz) ** 2;
  const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  return (2 * cross) / Math.max(1e-9, Math.sqrt(ab2 * bc2 * ca2));
}

/**
 * racing line แบบเกลี่ยความโค้ง (แนวเดียวกับ AI เกมแข่งรถ): ขยับแต่ละจุดในแนวขวาง
 * ให้ความโค้งตรงนั้นเท่ากับค่าเฉลี่ยของความโค้งจุดก่อน/หลัง ซ้ำจนนิ่ง ห้ามออกนอกขอบถนน
 * — ได้โค้งที่เปลี่ยนความโค้งอย่างต่อเนื่อง: เข้าจากด้านนอก แตะ apex ด้านใน แล้วออกกว้าง ไม่หักเลี้ยวกะทันหัน
 * เริ่มจากระยะห่างกว้าง (ภาพรวม) ไปแคบ (รายละเอียด) ให้ลู่เข้าเร็ว
 */
function racingLine(x: Float64Array, z: Float64Array, heading: Float64Array, wl: Float64Array, wr: Float64Array) {
  const n = x.length;
  let off: Float64Array = new Float64Array(n);
  const nx = Float64Array.from(heading, (h) => -Math.sin(h));
  const nz = Float64Array.from(heading, (h) => Math.cos(h));
  // ตำแหน่งปัจจุบันของเส้น (อัปเดตทีละจุดเมื่อขยับ)
  const lx = Float64Array.from(x);
  const lz = Float64Array.from(z);
  const at = (i: number) => ((i % n) + n) % n;
  for (const [k, iters] of [[16, 25], [8, 35], [4, 50], [2, 70], [1, 100]] as const) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a2 = at(i - 2 * k);
        const a = at(i - k);
        const b = at(i + k);
        const b2 = at(i + 2 * k);
        const target = (curv3(lx[a2], lz[a2], lx[a], lz[a], lx[i], lz[i]) + curv3(lx[i], lz[i], lx[b], lz[b], lx[b2], lz[b2])) / 2;
        const now = curv3(lx[a], lz[a], lx[i], lz[i], lx[b], lz[b]);
        // อนุพันธ์ของความโค้งต่อการขยับจุดนี้ (คำนวณเชิงตัวเลข)
        const eps = 0.05;
        const moved = curv3(lx[a], lz[a], lx[i] + nx[i] * eps, lz[i] + nz[i] * eps, lx[b], lz[b]);
        const d = (moved - now) / eps;
        if (Math.abs(d) < 1e-9) continue;
        const next = off[i] + ((target - now) / d) * 0.6;
        off[i] = Math.max(LINE_MARGIN - wl[i], Math.min(wr[i] - LINE_MARGIN, next));
        lx[i] = x[i] + nx[i] * off[i];
        lz[i] = z[i] + nz[i] * off[i];
      }
    }
  }
  off = smoothLoop(off, 4);
  return off;
}

/** จุดเรียงตามทิศวิ่ง (เมตร, y = เหนือ) → จุดห่างเท่ากันทุก DS เมตร */
function resampleRaw(raw: RawTrack) {
  const m = raw.x.length;
  const cum = [0];
  for (let i = 1; i <= m; i++) cum.push(cum[i - 1] + Math.hypot(raw.x[i % m] - raw.x[i - 1], raw.y[i % m] - raw.y[i - 1]));
  const total = cum[m];
  const n = Math.round(total / DS);
  const out = { x: new Float64Array(n), z: new Float64Array(n), wl: new Float64Array(n), wr: new Float64Array(n) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i * total) / n;
    while (cum[j + 1] < d) j++;
    const f = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = j;
    const b = (j + 1) % m;
    out.x[i] = raw.x[a] + (raw.x[b] - raw.x[a]) * f;
    // แกน z ของฉากชี้ใต้ (มองจากบนแล้วเหนืออยู่บน)
    out.z[i] = -(raw.y[a] + (raw.y[b] - raw.y[a]) * f);
    out.wr[i] = raw.wr[a] + (raw.wr[b] - raw.wr[a]) * f;
    out.wl[i] = raw.wl[a] + (raw.wl[b] - raw.wl[a]) * f;
  }
  return out;
}

/** ผังจาก lib/circuits (ไม่มีความกว้างจริง) */
function fromOutline(circuitId: string) {
  const path = circuitTrack(circuitId);
  if (!path) return null;
  const raw = parsePolyline(path.d);
  if (raw.length < 4) return null;
  const lengthM = path.length ?? 5000;
  const scale = lengthM / perimeter(raw);
  const n = Math.max(200, Math.round(lengthM / DS));
  const pts = resampleLoop(raw, n);
  const half = FALLBACK[circuitId]?.half ?? HALF_WIDTH;
  const out: Record<"x" | "z" | "wl" | "wr", Float64Array> = { x: new Float64Array(n), z: new Float64Array(n), wl: new Float64Array(n).fill(half), wr: new Float64Array(n).fill(half) };
  pts.forEach((p, i) => {
    out.x[i] = p.x * scale;
    out.z[i] = p.y * scale;
  });
  // เกลี่ยมุมหักของผังให้เป็นโค้งเรียบ (ผังเดิมมีจุดห่าง ๆ)
  out.x = smoothLoop(out.x, 8);
  out.z = smoothLoop(out.z, 8);
  return out;
}

/**
 * สร้างสนามสำหรับขับ · raw = ข้อมูลจริงจาก tracks.ts (ถ้ามี) — ไม่มีก็ใช้ผังจาก lib/circuits
 */
export function buildDriveTrack(circuitId: string, raw?: RawTrack | null): DriveTrack | null {
  const base = raw ? resampleRaw(raw) : fromOutline(circuitId);
  if (!base) return null;
  const n = base.x.length;
  let x: Float64Array = base.x;
  let z: Float64Array = base.z;
  // จัดให้อยู่กลางจุด (0, 0)
  const cx = (Math.max(...x) + Math.min(...x)) / 2;
  const cz = (Math.max(...z) + Math.min(...z)) / 2;
  x = x.map((v) => v - cx);
  z = z.map((v) => v - cz);
  if (raw) {
    x = smoothLoop(x, 2);
    z = smoothLoop(z, 2);
  }
  const wl = raw ? smoothLoop(base.wl, 6) : base.wl;
  const wr = raw ? smoothLoop(base.wr, 6) : base.wr;
  const runoff = FALLBACK[circuitId]?.runoff ?? RUNOFF;

  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(z[b] - z[a], x[b] - x[a]);
  }
  // racing line: เส้นโค้งน้อยที่สุดภายในขอบถนน (นอก → ใน → นอก) แล้วใช้ความโค้งของเส้นนี้คำนวณความเร็ว
  const lineOffset = racingLine(x, z, heading, wl, wr);
  const lx = new Float64Array(n);
  const lz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lx[i] = x[i] - Math.sin(heading[i]) * lineOffset[i];
    lz[i] = z[i] + Math.cos(heading[i]) * lineOffset[i];
  }
  let curve: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 3 + n) % n;
    const b = (i + 3) % n;
    const ha = Math.atan2(lz[i] - lz[a], lx[i] - lx[a]);
    const hb = Math.atan2(lz[b] - lz[i], lx[b] - lx[i]);
    const len = Math.hypot(lx[b] - lx[a], lz[b] - lz[a]) / 2 || DS * 3;
    curve[i] = wrap(hb - ha) / len;
  }
  curve = smoothLoop(curve, 4);
  // ระยะบน racing line ต่อช่วง (จุด i → i+1)
  let stretch: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    stretch[i] = Math.hypot(lx[j] - lx[i], lz[j] - lz[i]) / DS;
  }
  stretch = smoothLoop(stretch, 2);

  // ความสูง: จุดควบคุมรายสนาม (ประมาณ) → เกลี่ย · ความชันคิดตามระยะบน racing line
  const seed = Math.abs([...circuitId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  let y: Float64Array = Float64Array.from({ length: n }, (_, i) => elevationAt(circuitId, i * DS, n * DS, seed));
  y = smoothLoop(y, 20);
  // ความชันตามระยะบนเส้นกลาง (ทางลาดของถนนจริง) จำกัดไม่เกิน 18% (Raidillon ชันราว ๆ นี้)
  const grade = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    grade[i] = Math.max(-MAX_GRADE, Math.min(MAX_GRADE, (y[b] - y[a]) / (2 * DS)));
  }
  // ความโค้งแนวดิ่ง: บวก = แอ่ง (รถถูกกดลง เกาะถนนขึ้น เช่นก้น Eau Rouge) · ลบ = ยอดเนิน (ตัวเบา เกาะน้อยลง)
  let vcurve: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) vcurve[i] = (grade[(i + 1) % n] - grade[(i - 1 + n) % n]) / (2 * DS);
  // จำกัดผล: ยอดเนินเบาตัวได้ไม่เกิน ~0.8g ที่ความเร็วสูง · แอ่งกดได้มากกว่า
  vcurve = smoothLoop(vcurve, 6).map((v) => Math.max(-0.0012, Math.min(0.004, v)));

  // โค้งเอียง (banking) จาก corners.ts — เอียงลงด้านในโค้ง ค่อย ๆ เพิ่ม/ลดที่ปลายโค้ง
  const bank = new Float64Array(n);
  for (const c of cornersOf(circuitId)) {
    if (!c.bank) continue;
    const i0 = Math.floor(c.from / DS);
    const i1 = Math.ceil(c.to / DS);
    let turn = 0;
    for (let i = i0; i <= i1; i++) turn += curve[i % n];
    const ramp = Math.round(40 / DS);
    for (let i = i0 - ramp; i <= i1 + ramp; i++) {
      const w = Math.min(1, (i - (i0 - ramp)) / ramp, (i1 + ramp - i) / ramp);
      // เลี้ยวขวา (turn > 0) = ด้านในอยู่ขวา (lat บวก) ต้องต่ำลง → tan(bank) ติดลบ
      bank[((i % n) + n) % n] = -Math.sign(turn) * w * ((c.bank * Math.PI) / 180);
    }
  }

  // ความเร็วสูงสุดในโค้ง: v²·|k| = ALAT + DOWNFORCE·v²/VMAX² + ALAT·v²·kv/G + G·sin(bank)
  //   → v² = (ALAT + G·sin(bank)) / (|k| − DOWNFORCE/VMAX² − ALAT·kv/G) · ตัวหารไม่บวก = กดเต็มได้
  const vlat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const den = Math.abs(curve[i]) - DOWNFORCE / VMAX ** 2 - (ALAT * vcurve[i]) / G;
    const cap = ALAT + G * Math.sin(Math.abs(bank[i]));
    // เพดานเป็นความเร็วสูงสุดของ Straight Mode — ความเร็วสูงสุดจริงของแต่ละจุดคุมด้วยแรงเร่ง/แรงต้าน
    vlat[i] = den <= 1e-6 ? VSM : Math.min(VSM, Math.sqrt(cap / den));
  }
  // โซน Straight Mode: ทางตรงยาว (ความโค้งของ racing line น้อย) เริ่มหลังออกจากโค้ง 40 ม. จบก่อนถึงโค้ง 80 ม.
  const smZone = new Uint8Array(n);
  {
    const straight = (i: number) => Math.abs(curve[i]) < SM_MAX_CURVE;
    let s0 = 0;
    while (s0 < n && straight(s0)) s0++;
    if (s0 < n) {
      for (let c = 0; c < n; ) {
        const i = (s0 + c) % n;
        if (!straight(i)) {
          c++;
          continue;
        }
        let len = 0;
        while (len < n && straight((i + len) % n)) len++;
        if (len * DS >= SM_MIN_LEN) {
          const a = Math.round(40 / DS);
          const b = len - Math.round(80 / DS);
          for (let k = a; k < b; k++) smZone[(i + k) % n] = 1;
        }
        c += len;
      }
    }
  }

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
      vref[i] = Math.min(vref[i], Math.sqrt(vref[j] ** 2 + 2 * Math.max(4, brakeAt(vref[j]) + G * grade[i]) * DS * stretch[i]));
    }
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n;
      const j = (i + 1) % n;
      // ในโซนใช้ Straight Mode (แรงต้านน้อย) · พ้นโซนแล้วถ้ายังเร็วกว่าปกติ ความเร็วค่อย ๆ ลดลงเอง
      const sm = smZone[i] === 1;
      const acc = sm ? accelSM(vref[i]) : accelAt(vref[i]);
      let v = Math.sqrt(Math.max(0, vref[i] ** 2 + 2 * Math.max(0.3, acc - G * grade[i]) * DS * stretch[i]));
      const cap = sm ? VSM : VMAX;
      if (v > cap) v = Math.max(cap, Math.sqrt(Math.max(0, vref[i] ** 2 - 2 * SM_BLEED * DS * stretch[i])));
      vref[j] = Math.min(vref[j], v);
    }
  }

  // โซน: ต้องลดความเร็วแรงกว่าครึ่งของเบรกเต็มที่ = เบรก · เร่งขึ้นหรือสุดทาง = คันเร่ง · ทรงตัวในโค้ง = ปล่อย
  const zone: Zone[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dv2 = vref[j] ** 2 - vref[i] ** 2;
    if (dv2 < -(brakeAt(vref[i]) + G * grade[i]) * DS * stretch[i]) zone[i] = "brake";
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

  let refLap = 0;
  for (let i = 0; i < n; i++) refLap += (DS * stretch[i]) / Math.max(1, (vref[i] + vref[(i + 1) % n]) / 2);

  return { circuitId, length: n * DS, n, x, z, heading, curve, vlat, vref, zone, wl, wr, runoff, lineOffset, stretch, y, grade, bank, smZone, refLap };
}

/** ค่าที่ระยะ s (เมตร, นับข้ามรอบได้) แบบเชิงเส้นระหว่างจุด */
export function sample(t: DriveTrack, arr: Float64Array, s: number) {
  const u = (((s / DS) % t.n) + t.n) % t.n;
  const i = Math.floor(u);
  const f = u - i;
  return arr[i] * (1 - f) + arr[(i + 1) % t.n] * f;
}

export const zoneAt = (t: DriveTrack, s: number): Zone => t.zone[Math.floor((((s / DS) % t.n) + t.n) % t.n)];

/** ค่าที่ระยะ s แบบโค้งเรียบ (Catmull-Rom) — ใช้กับตำแหน่ง จะได้ไม่เป็นเส้นหักทุก DS เมตร */
export function sampleSmooth(t: DriveTrack, arr: Float64Array, s: number) {
  const u = (((s / DS) % t.n) + t.n) % t.n;
  const i = Math.floor(u);
  const f = u - i;
  const a = arr[(i - 1 + t.n) % t.n];
  const b = arr[i];
  const c = arr[(i + 1) % t.n];
  const d = arr[(i + 2) % t.n];
  return 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
}

/** ความสูงของถนน (กลางถนน) ที่ระยะ s */
export const heightAt = (t: DriveTrack, s: number) => sampleSmooth(t, t.y, s);

/** ความสูงของพื้นที่ระยะ s เยื้อง lat — รวมถนนเอียง (นอกขอบถนนไม่เอียงต่อ) */
export function surfaceAt(t: DriveTrack, s: number, lat: number) {
  const b = sample(t, t.bank, s);
  if (b === 0) return heightAt(t, s);
  const edge = Math.max(-sample(t, t.wl, s), Math.min(sample(t, t.wr, s), lat));
  return heightAt(t, s) + edge * Math.tan(b);
}

/** ตำแหน่ง/ทิศบนสนามที่ระยะ s เยื้องขวา lateral เมตร */
export function poseAt(t: DriveTrack, s: number, lateral = 0) {
  const px = sampleSmooth(t, t.x, s);
  const pz = sampleSmooth(t, t.z, s);
  // ทิศวิ่งจากจุดก่อน/หลัง (ไม่ใช้ heading ตรง ๆ เพราะเชิงเส้นข้าม ±π ไม่ได้)
  const ax = sampleSmooth(t, t.x, s - 2);
  const az = sampleSmooth(t, t.z, s - 2);
  const bx = sampleSmooth(t, t.x, s + 2);
  const bz = sampleSmooth(t, t.z, s + 2);
  const h = Math.atan2(bz - az, bx - ax);
  // ขวาของทิศวิ่ง (แกน z ชี้ลงจอ) = (-sin h, cos h)
  return { x: px - Math.sin(h) * lateral, z: pz + Math.cos(h) * lateral, heading: h };
}
