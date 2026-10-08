import { buildBoard, CELLS_PER_LAP, type Board } from "./board";
import { circuitTrack } from "../circuits";
import type { Zone } from "./types";

export type CellKind = "straight" | "fast" | "slow";

/** สนามในมุมของการจำลอง: แบ่งรอบเป็นช่อง แต่ละช่องใช้เวลาไม่เท่ากันตามชนิด */
export type TrackModel = {
  id: string;
  lapCells: number;
  kinds: CellKind[];
  /** น้ำหนักเวลาของแต่ละช่อง รวมกัน = 1 รอบ */
  share: number[];
  corners: Zone[];
  drs: Zone[];
  pitEntry: Zone;
  /** เลนพิทยาวกี่ช่อง (เริ่มที่ pitEntry.start) */
  pitCells: number;
  /** เวลาต่อรอบพื้นฐาน (วินาที) ของรถเร็วสุดบนยาง Medium */
  baseLap: number;
  /** แรงกดที่เหมาะกับสนาม 0..1 */
  idealDownforce: number;
  /** ช่องที่เริ่มเซกเตอร์ 2 และ 3 */
  sectors: [number, number];
};

const WEIGHT: Record<CellKind, number> = { straight: 1, fast: 1.45, slow: 2.3 };
export const PIT_CELLS = 6;

export const inZone = (z: Zone, c: number, n: number) => {
  const x = ((c % n) + n) % n;
  return z.start <= z.end ? x >= z.start && x <= z.end : x >= z.start || x <= z.end;
};

export function trackFromBoard(board: Board, lengthM: number | null): TrackModel {
  const n = board.cells.length;
  const kinds: CellKind[] = Array.from({ length: n }, (_, c) => {
    const z = board.corners.find((k) => inZone(k, c, n));
    return z ? (z.slow ? "slow" : "fast") : "straight";
  });
  const w = kinds.map((k) => WEIGHT[k]);
  const sum = w.reduce((a, b) => a + b, 0);
  const share = w.map((x) => x / sum);
  const cornerShare = share.reduce((a, s, c) => a + (kinds[c] === "straight" ? 0 : s), 0);
  const baseLap = Math.min(120, Math.max(70, (lengthM ?? 5300) / 61));
  return {
    id: board.circuitId,
    lapCells: n,
    kinds,
    share,
    corners: board.corners,
    drs: board.drs,
    pitEntry: board.pitEntry,
    pitCells: PIT_CELLS,
    baseLap,
    idealDownforce: Math.min(0.9, Math.max(0.1, (cornerShare - 0.25) / 0.35)),
    sectors: [Math.round(n / 3), Math.round((2 * n) / 3)],
  };
}

export function buildTrack(circuitId: string): TrackModel | null {
  const board = buildBoard(circuitId, circuitId);
  if (!board) return null;
  return trackFromBoard(board, circuitTrack(circuitId)?.length ?? null);
}

export { CELLS_PER_LAP };
export const cellOf = (t: TrackModel, pos: number) => ((Math.floor(pos) % t.lapCells) + t.lapCells) % t.lapCells;
export const lapOf = (t: TrackModel, pos: number) => Math.floor(pos / t.lapCells);
export const inDrs = (t: TrackModel, pos: number) => t.drs.some((z) => inZone(z, Math.floor(pos), t.lapCells));
