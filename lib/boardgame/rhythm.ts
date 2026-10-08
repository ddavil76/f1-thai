/**
 * ควอลิฟายแบบจับจังหวะ (กติกาของเรา) — ฟังก์ชันล้วน ความสุ่มผ่าน `rng`
 *
 * แปลงผังสนามเป็นโน้ต 1 จังหวะต่อ 1 ช่อง:
 * - เบรก: แตะก่อนเข้าโค้ง 1 ช่อง · โค้งความเร็วต่ำแตะถี่ 2 ครั้ง (ก่อนโค้ง + ช่องแรกของโค้ง)
 * - คันเร่ง: ทางตรงยาวตั้งแต่ 3 ช่องเป็นโน้ตกดค้าง สั้นกว่านั้นเป็นแตะ
 * - DRS: แตะตอนเข้าโซน DRS (ไม่บังคับ กดทันได้เวลาลดเพิ่ม)
 * กดตรงจังหวะได้ PERFECT / GOOD / EARLY / LATE / MISS แล้วแปลงเป็นเวลาต่อรอบ
 */

import type { AiLevel, Compound, Rng, Track } from "./engine";

export type Lane = "brake" | "throttle" | "drs";
export type Note = {
  id: number;
  lane: Lane;
  /** จังหวะที่ต้องกด (นับจากเริ่มรอบ) */
  beat: number;
  /** โน้ตกดค้าง: ค้างไว้กี่จังหวะ (0 = แตะ) */
  hold: number;
  /** เบรกก่อนโค้งความเร็วต่ำ — พลาดแล้วออกนอกโค้ง */
  slow: boolean;
  sector: 0 | 1 | 2;
};
export type Grade = "perfect" | "good" | "early" | "late" | "miss";

/** เวลาต่อรอบพื้นฐาน (วินาที) */
export const BASE_LAP = 105;
/** กดเป๊ะทุกโน้ตได้เวลาลดเท่านี้ (ไม่รวมคอมโบ DRS ยาง) */
export const FULL_GAIN = 2.6;
export const POINTS: Record<Grade, number> = { perfect: 1, good: 0.6, early: 0.2, late: 0.2, miss: 0 };
/** โทษเพิ่มเวลา (วินาที) */
export const PENALTY = { early: 0.05, late: 0.05, miss: 0.15, offTrack: 0.5, lift: 0.15, wrong: 0.04 };
export const DRS_GAIN: Partial<Record<Grade, number>> = { perfect: 0.25, good: 0.12 };
/** ทุกคอมโบครบ 10 ลดเวลาเท่านี้ */
export const COMBO_STEP = 10;
export const COMBO_GAIN = 0.06;
/** ยาง Soft: เวลาลดลงแต่โน้ตมาเร็วขึ้น */
export const SOFT_GAIN = 0.35;
export const SOFT_SPEED = 0.88;
/** ระยะเวลาต่อจังหวะ (ms) และช่วงตัดสิน (ms) ตามระดับความยาก */
export const LEVEL: Record<AiLevel, { beatMs: number; win: number; aiMean: number }> = {
  easy: { beatMs: 560, win: 1.25, aiMean: -0.4 },
  normal: { beatMs: 460, win: 1, aiMean: -1.2 },
  hard: { beatMs: 380, win: 0.8, aiMean: -1.9 },
};
export const WINDOW = { perfect: 70, good: 140, late: 220 };
/** นับถอยหลังก่อนโน้ตแรกกี่จังหวะ */
export const LEAD_BEATS = 4;

const inZone = (c: number, start: number, end: number, n: number) => {
  const x = ((c % n) + n) % n;
  return start <= end ? x >= start && x <= end : x >= start || x <= end;
};

/** สร้างโน้ตของหนึ่งรอบจากผังสนาม */
export function buildChart(t: Track): Note[] {
  const n = t.lapCells;
  const sector = (c: number) => Math.min(2, Math.floor((c * 3) / n)) as 0 | 1 | 2;
  const brake = new Map<number, boolean>();
  for (const z of t.corners) {
    brake.set((z.start - 1 + n) % n, !!z.slow);
    if (z.slow) brake.set(z.start % n, true);
  }
  const corner = (c: number) => t.corners.some((z) => inZone(c, z.start, z.end, n));
  const notes: Omit<Note, "id">[] = [];
  for (const [c, slow] of brake) notes.push({ lane: "brake", beat: c, hold: 0, slow, sector: sector(c) });
  // ทางตรง = ช่องที่ไม่ใช่โค้งและไม่มีโน้ตเบรก ต่อกันเป็นช่วง
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 3) notes.push({ lane: "throttle", beat: run[0], hold: run.length - 1, slow: false, sector: sector(run[0]) });
    else for (const c of run) notes.push({ lane: "throttle", beat: c, hold: 0, slow: false, sector: sector(c) });
    run = [];
  };
  for (let c = 0; c < n; c++) {
    if (corner(c) || brake.has(c)) flush();
    else run.push(c);
  }
  flush();
  for (const z of t.drs) notes.push({ lane: "drs", beat: z.start % n, hold: 0, slow: false, sector: sector(z.start % n) });
  return notes
    .sort((a, b) => a.beat - b.beat || a.lane.localeCompare(b.lane))
    .map((x, id) => ({ ...x, id, beat: x.beat + LEAD_BEATS }));
}

/** ตัดสินการกดจากระยะห่างเวลา (ms, ลบ = กดก่อน) — เกินช่วงคืน null (ไม่นับว่ากดโน้ตนี้) */
export function judge(dt: number, win = 1): Grade | null {
  const a = Math.abs(dt);
  if (a <= WINDOW.perfect * win) return "perfect";
  if (a <= WINDOW.good * win) return "good";
  if (a <= WINDOW.late * win) return dt < 0 ? "early" : "late";
  return null;
}

/** เวลาที่ได้/เสียจากโน้ตหนึ่งตัว (ลบ = เร็วขึ้น) */
export function noteDelta(note: Note, g: Grade, notesCount: number): number {
  if (note.lane === "drs") return -(DRS_GAIN[g] ?? 0);
  const gain = (FULL_GAIN * POINTS[g]) / Math.max(1, notesCount);
  const pen = g === "early" || g === "late" || g === "miss" ? PENALTY[g] : 0;
  const off = g === "miss" && note.slow ? PENALTY.offTrack : 0;
  return -gain + pen + off;
}

export const tyreDelta = (c: Compound) => (c === "red" ? -SOFT_GAIN : 0);
export const beatMsFor = (level: AiLevel, c: Compound) => LEVEL[level].beatMs * (c === "red" ? SOFT_SPEED : 1);

export type LapResult = { lap: number; sectors: [number, number, number] };

/** เวลารถ AI: สุ่มรอบตามระดับความยาก แล้วแบ่ง 3 เซกเตอร์ */
export function aiLap(level: AiLevel, rng: Rng): LapResult {
  // ผลรวมของสุ่ม 3 ตัว ≈ การกระจายแบบระฆัง
  const gauss = (rng() + rng() + rng() - 1.5) / 0.5;
  const lap = BASE_LAP + LEVEL[level].aiMean + gauss * 0.45;
  const w = [1 + (rng() - 0.5) * 0.02, 1 + (rng() - 0.5) * 0.02, 1];
  const sum = w[0] + w[1] + w[2];
  const s0 = round3((lap * w[0]) / sum);
  const s1 = round3((lap * w[1]) / sum);
  return { lap: round3(lap), sectors: [s0, s1, round3(lap - s0 - s1)] };
}

export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** 1:44.382 */
export function fmtLap(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}

/** สีเซกเตอร์: ม่วง = เร็วสุดของเซสชัน · เขียว = เร็วกว่าค่ากลางของรถ AI · เหลือง = ช้ากว่า */
export function sectorColor(t: number, all: number[], median: number): "purple" | "green" | "yellow" {
  if (all.every((x) => t <= x)) return "purple";
  return t < median ? "green" : "yellow";
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
