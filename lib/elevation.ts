/* ---------- เนินสนามจริง (openf1 /location มีพิกัด x, y, z ของรถ) ---------- */
// ผังสนามที่มีในเว็บเป็น 2D แบน — ความสูงต่ำจริงต้องเอาจากรถที่วิ่งจริงหนึ่งรอบ
// ฝั่ง client เท่านั้น (openf1 บล็อก serverless) · แคชใน localStorage เพราะสนามไม่เปลี่ยน

import { of1 } from "./openf1";

/** จุด 3D ของสนาม [x, ความสูง, z] — พื้นอยู่ที่ความสูง 0 */
export type TrackPoint3 = [number, number, number];

/** ความสูงจริงน้อยมากเทียบกับความยาวสนาม (Spa ~100 ม. ใน 7 กม.) — ขยายให้มองเห็น */
export const ELEVATION_EXAGGERATION = 5;

/** จำนวนจุดสูงสุดที่เก็บ — พอให้เส้นโค้งเนียนโดยไม่เปลืองที่ localStorage */
export const ELEVATION_MAX_POINTS = 320;

type Of1Location = { x: number; y: number; z: number; date: string };
type Of1Session = {
  session_key: number;
  country_name: string;
  location: string;
  circuit_short_name?: string;
  date_start: string;
};
type Of1Lap = {
  driver_number: number;
  lap_duration: number | null;
  date_start: string | null;
  is_pit_out_lap?: boolean;
};

/** ชื่อประเทศของ Ergast → ของ openf1 (ที่ต่างกัน) */
const OF1_COUNTRY: Record<string, string> = {
  USA: "United States",
  UK: "United Kingdom",
  UAE: "United Arab Emirates",
};

/**
 * แปลงพิกัดรถหนึ่งรอบ → จุด 3D ในกล่องเดียวกับผัง 2D (ด้านยาว = size, อยู่กลาง 0,0)
 * · เฉลี่ยเคลื่อนที่ลดสัญญาณกระตุกของ GPS · ความสูงเริ่มที่ 0 แล้วขยาย ×exaggerate
 * · แกน y ของ openf1 ชี้ขึ้น ส่วนพื้นของเรา z ชี้ลงแบบ SVG จึงกลับด้าน
 */
export function locationToTrack(
  samples: { x: number; y: number; z: number }[],
  size = 10,
  exaggerate = ELEVATION_EXAGGERATION,
): TrackPoint3[] | null {
  const pts = samples.filter(
    (p, i) => i === 0 || p.x !== samples[i - 1].x || p.y !== samples[i - 1].y,
  );
  if (pts.length < 30) return null;

  const win = 2; // ±2 จุด
  const smooth = pts.map((_, i) => {
    let x = 0, y = 0, z = 0, n = 0;
    for (let j = i - win; j <= i + win; j++) {
      const q = pts[(j + pts.length) % pts.length]; // รอบปิด — ต่อหัวต่อท้ายได้
      x += q.x; y += q.y; z += q.z; n++;
    }
    return { x: x / n, y: y / n, z: z / n };
  });

  const xs = smooth.map((p) => p.x);
  const ys = smooth.map((p) => p.y);
  const zs = smooth.map((p) => p.z);
  const [minX, maxX, minY, maxY, minZ] = [
    Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs),
  ];
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return null;
  const k = size / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const step = Math.max(1, Math.ceil(smooth.length / ELEVATION_MAX_POINTS));
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return smooth
    .filter((_, i) => i % step === 0)
    .map((p) => [r3((p.x - cx) * k), r3((p.z - minZ) * k * exaggerate), r3(-(p.y - cy) * k)]);
}

/** เลือก session ของสนามนี้จากรายการ — หลายสนามในประเทศเดียวกันใช้ชื่อเมืองแยก */
export function pickSession(
  list: Of1Session[],
  country: string,
  locality: string,
): Of1Session | null {
  const c = OF1_COUNTRY[country] ?? country;
  const inCountry = list.filter((s) => s.country_name === c);
  // เทียบทั้ง location และ circuit_short_name ของ openf1 (Monaco: "Monaco" / "Monte Carlo")
  const loc = locality.toLowerCase();
  const byLoc = inCountry.find(
    (s) => s.location?.toLowerCase() === loc || s.circuit_short_name?.toLowerCase() === loc,
  );
  if (byLoc) return byLoc;
  // ประเทศนี้มีสนามเดียว → ไม่ต้องเทียบชื่อเมือง
  return new Set(inCountry.map((s) => s.location)).size === 1 ? inCountry.at(-1)! : null;
}

async function fetchElevation(
  season: number,
  country: string,
  locality: string,
): Promise<TrackPoint3[] | null> {
  // ใช้การแข่งของปีก่อน ๆ (openf1 มีตั้งแต่ 2023) — สนามใหม่ที่ไม่เคยจัดก็ไม่มีข้อมูล
  for (const year of [season - 1, season - 2, season - 3].filter((y) => y >= 2023)) {
    const sessions = await of1<Of1Session[]>(`sessions?year=${year}&session_name=Race`);
    const s = pickSession(sessions, country, locality);
    if (!s) continue;

    // รอบกลางการแข่ง ยางเข้าที่แล้ว — เลือกคันที่เร็วสุดในรอบนั้น (ไม่ใช่รอบออกพิท)
    const laps = await of1<Of1Lap[]>(`laps?session_key=${s.session_key}&lap_number=15`);
    const best = laps
      .filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap)
      .sort((a, b) => a.lap_duration! - b.lap_duration!)[0];
    if (!best) continue;

    const from = new Date(best.date_start!);
    const to = new Date(from.getTime() + best.lap_duration! * 1000);
    const iso = (d: Date) => d.toISOString().replace("Z", "");
    const loc = await of1<Of1Location[]>(
      `location?session_key=${s.session_key}&driver_number=${best.driver_number}` +
        `&date>${iso(from)}&date<${iso(to)}`,
    );
    const track = locationToTrack(loc);
    if (track) return track;
  }
  return null;
}

const CACHE_VERSION = 1;
/** ดึงไม่ได้ (สนามใหม่/openf1 ล่ม) → อย่าเพิ่งลองซ้ำจนกว่าจะผ่านไปวันหนึ่ง */
const FAIL_RETRY_MS = 24 * 60 * 60 * 1000;

const pending = new Map<string, Promise<TrackPoint3[] | null>>();

/** เนินสนามจริงของ circuit นี้ (null = ไม่มีข้อมูล) — แคชใน localStorage */
export function getTrackElevation(
  circuitId: string,
  season: number,
  country: string,
  locality: string,
): Promise<TrackPoint3[] | null> {
  const key = `f1-elev:v${CACHE_VERSION}:${circuitId}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? "null") as
      | { at: number; pts: TrackPoint3[] | null }
      | null;
    if (hit && (hit.pts || Date.now() - hit.at < FAIL_RETRY_MS)) return Promise.resolve(hit.pts);
  } catch {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว) — ดึงสดทุกครั้งแทน
  }
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const p = fetchElevation(season, country, locality)
    .catch(() => null)
    .then((pts) => {
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), pts }));
      } catch {}
      return pts;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
