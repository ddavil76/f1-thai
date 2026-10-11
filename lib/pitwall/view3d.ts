/**
 * ภาพ 3D ของโหมดผู้จัดการทีม: แปลงตำแหน่งรถจากการจำลอง (ช่องบนกระดาน) เป็นระยะบนสนาม 3D (เมตร)
 * — ขอบช่องวางตามเวลาขับจริง (รถในช่องโค้งใช้เวลานาน → ช่องนั้นสั้นบนสนามจริง) แล้วในช่องเดินตามความเร็วอ้างอิง
 *   รถจึงเบรกเข้าโค้ง/เร่งออกเหมือนขับจริง แม้การจำลองจะเดินเท่า ๆ กันในช่อง
 * — ช่องเข้าพิท/ออกพิทตรึงกับทางเข้า/ทางออกพิทเลนของฉาก 3D ไม่ให้รถกระโดดตอนเลี้ยวเข้า/ออก
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์
 */
import { sample, type DriveTrack } from "./drive/line";
import { BOX_SHIFT, wallFrom, wallTo, type PitLane } from "./drive/pit";
import type { TrackModel } from "./track";

export type CarPose = { s: number; lat: number };

/** ระยะเยื้องจากเส้นแข่งเมื่อรถวิ่งคู่กัน · ห่างตามสนามไม่เกินนี้ถือว่าวิ่งคู่ (เมตร) */
export const SIDE_LAT = 1.6;
export const SIDE_NEAR = 24;

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

export function cellMapper(track: TrackModel, dt: DriveTrack, pit: PitLane) {
  const L = track.lapCells;
  const len = dt.length;
  // เวลาสะสมเมื่อขับตามความเร็วอ้างอิง ณ จุด i (T[n] = 1 รอบ)
  const T = new Float64Array(dt.n + 1);
  for (let i = 0; i < dt.n; i++) T[i + 1] = T[i] + (dt.length / dt.n) / Math.max(5, dt.vref[i]);
  const lap = T[dt.n];
  const timeAt = (s: number) => {
    const u = Math.max(0, Math.min(dt.n, (s / len) * dt.n));
    const i = Math.min(dt.n - 1, Math.floor(u));
    return T[i] + (T[i + 1] - T[i]) * (u - i);
  };
  const distAt = (tm: number) => {
    let lo = 0;
    let hi = dt.n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (T[m] <= tm) lo = m;
      else hi = m;
    }
    const f = T[hi] > T[lo] ? (tm - T[lo]) / (T[hi] - T[lo]) : 0;
    return ((lo + Math.max(0, Math.min(1, f))) / dt.n) * len;
  };

  // ขอบช่องเป็นเวลา: ตามสัดส่วนเวลาของการจำลอง แล้วตรึงช่องเข้า/ออกพิท + เส้นชัย
  const cum = new Float64Array(L + 1);
  for (let c = 0; c < L; c++) cum[c + 1] = cum[c] + track.share[c];
  const entryCell = track.pitEntry.start;
  const exitCell = track.pitCells - (L - entryCell);
  const anchors: [number, number][] = [[0, 0]];
  // ทางออกพิทหลังเส้นชัย / ทางเข้าก่อนเส้นชัย (ปกติทั้งคู่) — พิทเลนอยู่เลยไปฝั่งเดียวก็ตรึงเฉพาะฝั่งนั้น
  if (pit.exit > 0 && exitCell > 0 && exitCell < entryCell) anchors.push([exitCell, timeAt(pit.exit)]);
  if (pit.entry < 0 && entryCell > 0 && entryCell < L && len + pit.entry > Math.max(0, pit.exit)) anchors.push([entryCell, timeAt(len + pit.entry)]);
  anchors.push([L, lap]);
  const TB = new Float64Array(L + 1);
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [a, ta] = anchors[k];
    const [b, tb] = anchors[k + 1];
    for (let c = a; c <= b; c++) TB[c] = ta + ((tb - ta) * (cum[c] - cum[a])) / (cum[b] - cum[a] || 1);
  }

  /** ระยะสะสมบนสนาม 3D (เมตร) ของตำแหน่ง pos (ช่องสะสม) บนสนาม */
  const sOf = (pos: number) => {
    const n = Math.floor(pos / L);
    const c = pos - n * L;
    const i = Math.min(L - 1, Math.floor(c));
    return n * len + distAt(TB[i] + (TB[i + 1] - TB[i]) * (c - i));
  };

  /**
   * ตำแหน่งของรถในพิท: pitStart = ตำแหน่งตอนเริ่มเข้าพิท · along 0..1 (0.5 = จอดที่อู่)
   * team = ลำดับทีม (อู่) · คืน lat = ระยะเยื้องจากเส้นกลาง
   */
  const pitPose = (pitStart: number, along: number, team: number): CarPose => {
    // เส้นชัยที่พิทเลนคร่อม
    const base = Math.ceil(pitStart / L - 1e-9) * len;
    const r0 = sOf(pitStart) - base;
    const r1 = sOf(pitStart + track.pitCells) - base;
    const box = pit.boxes[team] ?? (pit.entry + pit.exit) / 2;
    const u = Math.max(0, Math.min(1, along));
    const rel = u <= 0.5 ? r0 + (box - r0) * (u / 0.5) : box + (r1 - box) * ((u - 0.5) / 0.5);
    // เลี้ยวจากเส้นแข่ง (ที่ตรงนั้น) เข้าพิทเลน แล้วกลับเข้าเส้นแข่งตอนออก
    const line = sample(dt, dt.lineOffset, base + rel);
    const w = rel < wallFrom(pit) ? smooth((rel - pit.entry) / pit.taper) : rel > wallTo(pit) ? 1 - smooth((rel - wallTo(pit)) / pit.taper) : 1;
    // เลี้ยวเข้าช่องจอดหน้าอู่ (ห่างอู่ไม่เกิน 30 ม.)
    const shift = smooth(1 - Math.abs(rel - box) / 30) * BOX_SHIFT * pit.side;
    return { s: base + rel, lat: line + (pit.offset - line) * w + shift };
  };

  return { sOf, pitPose, refLap: lap };
}

export type CellMapper = ReturnType<typeof cellMapper>;
