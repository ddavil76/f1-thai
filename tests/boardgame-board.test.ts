import { describe, expect, it } from "vitest";
import { CELLS_PER_LAP, buildBoard, parsePolyline, resampleLoop } from "@/lib/boardgame/board";
import { CIRCUIT_TRACKS } from "@/lib/circuits";

describe("resampleLoop", () => {
  it("สี่เหลี่ยมจัตุรัส 4 ช่อง = วางที่มุมทั้งสี่", () => {
    const sq = parsePolyline("M0,0 L10,0 L10,10 L0,10 L0,0 Z");
    const cells = resampleLoop(sq, 4);
    expect(cells.map((c) => [Math.round(c.x), Math.round(c.y)])).toEqual([
      [0, 0], [10, 0], [10, 10], [0, 10],
    ]);
  });

  it("path ที่ไม่ปิดก็ลากปิดให้ และช่องแรกคือจุดเริ่ม", () => {
    const cells = resampleLoop(parsePolyline("M0,0 L10,0 L10,10"), 6);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("buildBoard", () => {
  it("ทุกสนามในข้อมูลสร้างกระดานได้ ช่องอยู่ในกรอบ", () => {
    for (const id of Object.keys(CIRCUIT_TRACKS)) {
      const b = buildBoard(id, id)!;
      expect(b.cells).toHaveLength(CELLS_PER_LAP);
      for (const c of b.cells) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
        expect(c.x).toBeGreaterThanOrEqual(-0.01);
        expect(c.x).toBeLessThanOrEqual(b.w + 0.01);
        expect(c.y).toBeGreaterThanOrEqual(-0.01);
        expect(c.y).toBeLessThanOrEqual(b.h + 0.01);
      }
    }
  });

  it("สนามที่ไม่มีข้อมูล = null", () => {
    expect(buildBoard("nowhere", "x")).toBeNull();
  });
});
