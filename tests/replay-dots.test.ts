import { describe, expect, it } from "vitest";
import { compareAt, dotsAt, lapStartMs, matchRaceSession, type ReplayFrame, type ReplayRow } from "@/lib/replay";

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

describe("matchRaceSession", () => {
  const list = [
    { session_key: 1, date_start: "2026-03-08T04:00:00+00:00" }, // ออสเตรเลีย
    { session_key: 2, date_start: "2026-03-15T07:00:00+00:00" },
    // Las Vegas: สตาร์ทคืนวันเสาร์ท้องถิ่น = เช้าวันอาทิตย์ UTC
    { session_key: 3, date_start: "2026-11-22T04:00:00+00:00" },
    { session_key: 4, date_start: "not a date" },
  ];

  it("เลือก session ที่เวลาใกล้สตาร์ทตามปฏิทินที่สุด", () => {
    expect(matchRaceSession(list, Date.parse("2026-03-08T04:00:00Z"))).toBe(1);
    expect(matchRaceSession(list, Date.parse("2026-03-15T07:00:00Z"))).toBe(2);
  });

  it("วันที่ท้องถิ่นกับ UTC ต่างกัน (Las Vegas) ก็ยังจับคู่ได้", () => {
    // ปฏิทินเขียนเป็นวันเสาร์ แต่เวลาห่างไม่ถึงวัน
    expect(matchRaceSession(list, Date.parse("2026-11-21T20:00:00Z"))).toBe(3);
  });

  it("ห่างเกิน 36 ชม. ไม่นับ · รายการว่างหรือวันที่พัง → null", () => {
    expect(matchRaceSession(list, Date.parse("2026-04-05T05:00:00Z"))).toBeNull();
    expect(matchRaceSession([], Date.now())).toBeNull();
  });
});

describe("กระโดดระหว่างรีเพลย์กับเทียบรอบ", () => {
  it("เวลาเริ่มรอบของแต่ละคน (จากระยะสะสม)", () => {
    // รอบ 1 เริ่มที่ 0 · เบอร์ 1 จบรอบแรก (frac 1) ที่ 100 วิ → รอบ 2 เริ่ม 100 วิ
    expect(lapStartMs(frames, 1, 1)).toBe(0);
    expect(lapStartMs(frames, 1, 2)).toBeCloseTo(100_000);
    // เบอร์ 4 ถึง frac 1 ระหว่างเฟรม (0.95 → 2 ใน 90 วิ)
    expect(lapStartMs(frames, 4, 2)).toBeCloseTo(100_000 + (0.05 / 1.05) * 90_000);
    // ไม่มีข้อมูล / เกินรอบที่วิ่งได้
    expect(lapStartMs(frames, 77, 1)).toBeNull();
    expect(lapStartMs(frames, 1, 5)).toBeNull();
  });

  it("คู่เทียบ: คนที่เลือกกับคันข้างหน้า · ผู้นำเทียบกับคันข้างหลัง · รอบที่กำลังวิ่ง", () => {
    const three: ReplayFrame[] = [
      { lap: 1, atMs: 100_000, flag: null, rows: [row(1, 1, 1), row(4, 2, 0.95), row(16, 3, 0.9)] },
      { lap: 2, atMs: 200_000, flag: null, rows: [row(1, 1, 2), row(4, 2, 1.95), row(16, 3, 1.9)] },
    ];
    // ที่ 150 วิ: เบอร์ 16 (P3) วิ่งรอบ 2 · คันข้างหน้าคือเบอร์ 4
    expect(compareAt(three, 150_000, 16, 50)).toEqual({ a: { num: 16, lap: 2 }, b: { num: 4, lap: 2 } });
    // ไม่เลือกใคร → ผู้นำ กับ P2
    expect(compareAt(three, 150_000, null, 50)).toEqual({ a: { num: 1, lap: 2 }, b: { num: 4, lap: 2 } });
  });

  it("คันที่ออกจากการแข่งไม่ถูกเลือกเป็นคู่เทียบ", () => {
    const out: ReplayFrame[] = [
      { lap: 1, atMs: 100_000, flag: null, rows: [row(1, 1, 1), row(4, 2, 0.9, true), row(16, 3, 0.8)] },
    ];
    expect(compareAt(out, 100_000, 16, 50)?.b.num).toBe(1);
  });
});
