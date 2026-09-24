import { describe, expect, it } from "vitest";
import { dotsAt, type ReplayFrame, type ReplayRow } from "@/lib/replay";

const row = (num: number, pos: number, frac: number, out = false) =>
  ({ num, pos, frac, out }) as ReplayRow;
const frames: ReplayFrame[] = [
  { lap: 1, atMs: 100_000, flag: null, rows: [row(1, 1, 1), row(4, 2, 0.95)] },
  { lap: 2, atMs: 190_000, flag: null, rows: [row(1, 2, 1.98), row(4, 1, 2)] },
];

describe("dotsAt", () => {
  it("ก่อนผู้นำจบรอบแรก: ออกตัวจากเส้นตามสัดส่วนเวลา", () => {
    const d = dotsAt(frames, 50_000);
    expect(d.find((x) => x.num === 1)!.frac).toBeCloseTo(0.5);
    expect(d.find((x) => x.num === 4)!.frac).toBeCloseTo(0.475);
  });

  it("ระหว่าง frame: interpolate ระยะ และสลับอันดับที่ครึ่งทาง", () => {
    const mid = dotsAt(frames, 145_000);
    expect(mid.find((x) => x.num === 1)!.frac).toBeCloseTo(1.49);
    expect(dotsAt(frames, 120_000).find((x) => x.num === 4)!.pos).toBe(2);
    expect(dotsAt(frames, 170_000).find((x) => x.num === 4)!.pos).toBe(1);
  });

  it("จุดไม่ถอยหลังแม้ข้อมูล frame ถัดไปน้อยกว่า", () => {
    const back: ReplayFrame[] = [
      { lap: 1, atMs: 0, flag: null, rows: [row(9, 5, 3)] },
      { lap: 2, atMs: 1000, flag: null, rows: [row(9, 5, 2.5)] },
    ];
    expect(dotsAt(back, 500)[0].frac).toBe(3);
  });

  it("เลย frame สุดท้าย → ค้างที่ frame สุดท้าย · ไม่มี frame → ว่าง", () => {
    expect(dotsAt(frames, 999_999).find((x) => x.num === 4)!.frac).toBe(2);
    expect(dotsAt([], 0)).toEqual([]);
  });
});
