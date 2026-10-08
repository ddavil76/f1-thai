/**
 * ควอลิฟายแบบจับจังหวะ (กติกาของเรา) — ฟังก์ชันล้วน ความสุ่มผ่าน `rng`
 *
 * แปลงผังสนามเป็นโน้ต 1 จังหวะต่อ 1 ช่อง — คันเร่งกับเบรกเป็นโน้ต "กดค้าง" เหมือนเหยียบจริง:
 * - เบรก: เริ่มก่อนเข้าโค้ง 1 ช่อง · โค้งความเร็วสูงค้าง 1 จังหวะ · โค้งความเร็วต่ำค้างจนออกโค้ง
 * - คันเร่ง: ค้างตลอดทางตรง ปล่อยตอนถึงจุดเบรก (ในโค้งความเร็วสูงปล่อยไหลได้)
 * - DRS: แตะตอนเข้าโซน DRS (ไม่บังคับ กดทันได้เวลาลดเพิ่ม)
 * ตัดสินทั้งตอนกดและตอนปล่อย: PERFECT / GOOD / EARLY / LATE / MISS แล้วแปลงเป็นเวลาต่อรอบ
 */

import type { AiLevel, Compound, Rng, Track } from "./engine";

export type Lane = "brake" | "throttle" | "drs";
export type Note = {
  id: number;
  lane: Lane;
  /** จังหวะที่ต้องกด (นับจากเริ่มรอบ) */
  beat: number;
  /** ค้างไว้กี่จังหวะ ปล่อยที่ beat + hold (0 = แตะ ใช้กับ DRS) */
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
export const PENALTY = { early: 0.05, late: 0.05, miss: 0.15, offTrack: 0.5, wrong: 0.04 };
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
  const sector = (c: number) => Math.min(2, Math.floor((((c % n) + n) % n) * 3 / n)) as 0 | 1 | 2;
  const notes: Omit<Note, "id">[] = [];
  const busy = new Set<number>();
  for (const z of t.corners) {
    const from = z.start - 1;
    const len = z.end >= z.start ? z.end - z.start + 1 : z.end + n - z.start + 1;
    const hold = z.slow ? len + 1 : 1;
    notes.push({ lane: "brake", beat: (from + n) % n, hold, slow: !!z.slow, sector: sector(from) });
    for (let k = 0; k <= len; k++) busy.add((from + k + n) % n);
  }
  const corner = (c: number) => t.corners.some((z) => inZone(c, z.start, z.end, n));
  // คันเร่ง = ช่องที่ไม่ได้เบรกและไม่อยู่ในโค้ง ต่อกันเป็นช่วง ค้างจนถึงช่องถัดไป
  let run: number[] = [];
  const flush = () => {
    if (run.length) notes.push({ lane: "throttle", beat: run[0], hold: run.length, slow: false, sector: sector(run[0]) });
    run = [];
  };
  for (let c = 0; c < n; c++) {
    if (corner(c) || busy.has(c)) flush();
    else run.push(c);
  }
  flush();
  for (const z of t.drs) notes.push({ lane: "drs", beat: z.start % n, hold: 0, slow: false, sector: sector(z.start) });
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

/** จำนวนครั้งที่ตัดสินทั้งรอบ (คันเร่ง/เบรกตัดสินตอนกด 1 + ตอนปล่อย 1) */
export const judgeCount = (chart: Note[]) => chart.filter((x) => x.lane !== "drs").length * 2;

/**
 * เวลาที่ได้/เสียจากการตัดสินหนึ่งครั้ง (ลบ = เร็วขึ้น)
 * part: กด (press) หรือ ปล่อย (release) · พลาดเบรกโค้งความเร็วต่ำตอนกด = ออกนอกโค้ง
 */
export function noteDelta(note: Note, g: Grade, judgments: number, part: "press" | "release" = "press"): number {
  if (note.lane === "drs") return -(DRS_GAIN[g] ?? 0);
  const gain = (FULL_GAIN * POINTS[g]) / Math.max(1, judgments);
  const pen = g === "early" || g === "late" || g === "miss" ? PENALTY[g] : 0;
  const off = g === "miss" && note.slow && part === "press" ? PENALTY.offTrack : 0;
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
