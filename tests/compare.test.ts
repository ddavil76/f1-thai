import { describe, expect, it } from "vitest";
import {
  isClassifiedFinish, type DriverRaceResult, type RaceResult,
} from "@/lib/f1";
import {
  qualiHeadToHead, raceHeadToHead, roundByRound, summarizeDriver,
} from "@/lib/compare";

const res = (
  round: string,
  position: string,
  status = "Finished",
  grid = position,
): DriverRaceResult => ({
  round,
  raceName: `R${round} GP`,
  Circuit: { circuitId: "x", circuitName: "X", Location: { locality: "", country: "" } },
  result: {
    position,
    points: "0",
    grid,
    status,
    Driver: { driverId: "d", givenName: "D", familyName: "D" },
    Constructor: { constructorId: "t", name: "T" },
  } satisfies RaceResult,
});

describe("isClassifiedFinish", () => {
  it("นับรถที่โดนน็อครอบเป็นจบการแข่ง ทั้งแบบ 2026 และแบบเก่า", () => {
    expect(isClassifiedFinish("Finished")).toBe(true);
    expect(isClassifiedFinish("Lapped")).toBe(true);
    expect(isClassifiedFinish("+1 Lap")).toBe(true);
  });
  it("ออกกลางคัน / ไม่ได้สตาร์ท = ไม่จบ", () => {
    expect(isClassifiedFinish("Retired")).toBe(false);
    expect(isClassifiedFinish("Did not start")).toBe(false);
    expect(isClassifiedFinish("Disqualified")).toBe(false);
  });
});

describe("summarizeDriver", () => {
  it("นับชนะ/โพเดียม/ไม่จบ และไม่นับสนามที่ไม่ได้สตาร์ท", () => {
    const s = summarizeDriver([
      res("1", "1"),
      res("2", "3", "Lapped", "5"),
      res("3", "18", "Retired", "0"),
      res("4", "20", "Did not start", "20"),
    ]);
    expect(s).toMatchObject({ starts: 3, wins: 1, podiums: 2, dnfs: 1, bestFinish: 1 });
    expect(s.avgFinish).toBe(2);
    // grid 0 (ออกจากพิทเลน) ไม่นับในค่าเฉลี่ย
    expect(s.avgGrid).toBe(3);
  });
  it("ไม่มีผลเลย → ค่าเฉลี่ยเป็น null", () => {
    expect(summarizeDriver([])).toMatchObject({ starts: 0, bestFinish: null, avgFinish: null, avgGrid: null });
  });
});

describe("raceHeadToHead", () => {
  it("นับเฉพาะสนามที่ลงทั้งคู่ และรถโดนน็อครอบชนะรถที่ออกกลางคัน", () => {
    const a = [res("1", "2"), res("2", "15", "Lapped", "10"), res("3", "19", "Retired", "0"), res("9", "1")];
    const b = [res("1", "4", "Finished", "1"), res("2", "17", "Retired", "3"), res("3", "20", "Retired", "4")];
    const h = raceHeadToHead(a, b);
    // grid: R1 b นำ, R2 b นำ, R3 a ออกพิทเลน (0) ไม่นับ
    expect(h.grid).toEqual([0, 2]);
    // race: R1 a, R2 a (Lapped ชนะ Retired), R3 ไม่จบทั้งคู่ไม่นับ
    expect(h.race).toEqual([2, 0]);
  });
});

describe("qualiHeadToHead", () => {
  it("เทียบเฉพาะสนามที่มีทั้งคู่", () => {
    expect(
      qualiHeadToHead(
        [{ round: "1", position: 3 }, { round: "2", position: 1 }, { round: "3", position: 9 }],
        [{ round: "1", position: 2 }, { round: "2", position: 5 }],
      ),
    ).toEqual([1, 1]);
  });
});

describe("roundByRound", () => {
  it("เรียงใหม่ → เก่า รวมสนามที่ลงคนเดียว และบอกว่าใครจบก่อน", () => {
    const rows = roundByRound([res("1", "2"), res("2", "5")], [res("2", "3"), res("3", "1")]);
    expect(rows.map((r) => [r.round, r.winner])).toEqual([
      ["3", "b"],
      ["2", "b"],
      ["1", "a"],
    ]);
    expect(rows[0].a).toBeNull();
  });
});
