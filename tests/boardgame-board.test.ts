import { describe, expect, it } from "vitest";
import { CELLS_PER_LAP, PIT_ENTRY_CELLS, buildBoard, findCorners, parsePolyline, resampleLoop } from "@/lib/boardgame/board";
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

describe("findCorners", () => {
  it("ทุกสนามมีโค้ง 1–6 โค้ง ไม่ทับเส้นสตาร์ท และไม่กินเกินครึ่งรอบ", () => {
    for (const id of Object.keys(CIRCUIT_TRACKS)) {
      const { corners } = buildBoard(id, id)!;
      expect(corners.length, id).toBeGreaterThanOrEqual(1);
      expect(corners.length, id).toBeLessThanOrEqual(6);
      let cells = 0;
      for (const z of corners) {
        const len = z.start <= z.end ? z.end - z.start + 1 : CELLS_PER_LAP - z.start + z.end + 1;
        cells += len;
        const inZone = (c: number) => (z.start <= z.end ? c >= z.start && c <= z.end : c >= z.start || c <= z.end);
        expect(inZone(0), `${id} ทับเส้นสตาร์ท`).toBe(false);
      }
      expect(cells, id).toBeLessThanOrEqual(CELLS_PER_LAP / 2);
    }
  });

  it("สี่เหลี่ยม = 4 มุมตรงตำแหน่ง", () => {
    // เริ่มกลางด้านล่าง ระยะช่อง 2.5 → มุมตรงช่อง 2, 6, 10, 14 ของ 16 ช่อง
    const sq = resampleLoop(parsePolyline("M5,0 L10,0 L10,10 L0,10 L0,0 L5,0"), 16);
    expect(findCorners(sq)).toEqual([
      { start: 2, end: 2 },
      { start: 6, end: 6 },
      { start: 10, end: 10 },
      { start: 14, end: 14 },
    ]);
  });
});

describe("โซน DRS และโซนเข้าพิท", () => {
  it("ทุกสนามมีโซน DRS 1–2 ช่วง ยาวอย่างน้อย 3 ช่อง ไม่ทับโค้งหรือโซนเข้าพิท", () => {
    for (const id of Object.keys(CIRCUIT_TRACKS)) {
      const b = buildBoard(id, id)!;
      expect(b.drs.length, id).toBeGreaterThanOrEqual(1);
      expect(b.drs.length, id).toBeLessThanOrEqual(2);
      for (const z of b.drs) {
        expect(z.end - z.start + 1, id).toBeGreaterThanOrEqual(3);
        expect(z.end, id).toBeLessThan(CELLS_PER_LAP - PIT_ENTRY_CELLS);
      }
      expect(b.pitEntry).toEqual({ start: CELLS_PER_LAP - PIT_ENTRY_CELLS, end: CELLS_PER_LAP - 1 });
    }
  });
});
