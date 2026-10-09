/**
 * เส้นกลางสนาม + ความกว้างถนนจริง (TUMFTM/racetrack-database, LGPL-3.0 · เส้นกลางจาก © OpenStreetMap contributors)
 * โหลดแยกไฟล์ต่อสนามเมื่อจะใช้ (ไม่เข้า bundle หลัก) · สนามที่ไม่มีข้อมูลนี้ใช้ผังจาก lib/circuits แทน
 */

/** เมตร · x ไปทางตะวันออก y ไปทางเหนือ · wr/wl = ความกว้างถนนจากเส้นกลางไปทางขวา/ซ้ายของทิศวิ่ง */
export type RawTrack = { x: number[]; y: number[]; wr: number[]; wl: number[] };

export const TRACK_DATA_CREDIT = "ผังสนาม/ความกว้างถนน: TUMFTM racetrack-database (LGPL-3.0) · © OpenStreetMap contributors";

/** ถอดรหัสจากไฟล์ที่ scripts/tumftm-tracks.mjs สร้าง (ผลต่างสะสม หน่วย 0.1 ม.) */
export function decodeTrack(s: string): RawTrack {
  const v = s.split(",").map(Number);
  const t: RawTrack = { x: [], y: [], wr: [], wl: [] };
  const acc = [0, 0, 0, 0];
  for (let i = 0; i + 3 < v.length; i += 4) {
    for (let k = 0; k < 4; k++) acc[k] += v[i + k];
    t.x.push(acc[0] / 10);
    t.y.push(acc[1] / 10);
    t.wr.push(acc[2] / 10);
    t.wl.push(acc[3] / 10);
  }
  return t;
}

/** เขียนเป็น import ตรง ๆ รายไฟล์ ให้ bundler แยก chunk ต่อสนาม */
const LOADERS: Record<string, () => Promise<{ default: string }>> = {
  spa: () => import("./tracks/spa"),
  monza: () => import("./tracks/monza"),
  silverstone: () => import("./tracks/silverstone"),
  suzuka: () => import("./tracks/suzuka"),
  interlagos: () => import("./tracks/interlagos"),
  bahrain: () => import("./tracks/bahrain"),
  zandvoort: () => import("./tracks/zandvoort"),
  hungaroring: () => import("./tracks/hungaroring"),
  catalunya: () => import("./tracks/catalunya"),
  albert_park: () => import("./tracks/albert_park"),
  americas: () => import("./tracks/americas"),
};

export const hasRealTrack = (id: string) => id in LOADERS;

export async function loadRawTrack(id: string): Promise<RawTrack | null> {
  const load = LOADERS[id];
  if (!load) return null;
  return decodeTrack((await load()).default);
}
