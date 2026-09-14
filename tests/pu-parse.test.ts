import { describe, expect, it } from "vitest";
import { PU_KEYS, parseUsageTable, zeroUsed } from "@/lib/pu-parse";

type Item = { s: string; x: number; y: number };

// พิกัดเลียนแบบ PDF จริงของ FIA: หัวตาราง y สูงสุด แถวไล่ลงล่าง
const NUM_X = 40, DRIVER_X = 70, CAR_X = 200;
const COL_X = [330, 370, 410, 450, 490, 530, 570]; // ICE TC EXH MGU-K ES PU-CE PU-ANC

const header = (y: number): Item[] => [
  { s: "No.", x: NUM_X, y },
  { s: "Driver", x: DRIVER_X, y },
  { s: "Car", x: CAR_X, y },
  ...PU_KEYS.map((k, i) => ({ s: k, x: COL_X[i], y })),
];

/**
 * แถวหนึ่งของตาราง — ชื่อนักขับส่งเป็น item เดียว
 * (parser จับคอลัมน์ด้วย x โดยยอมเหลื่อมได้ 8pt ไม่ได้ไล่ตามคำ)
 */
const row = (y: number, num: string, name: string, team: string, counts: number[]): Item[] => [
  { s: num, x: NUM_X, y },
  { s: name, x: DRIVER_X, y },
  { s: team, x: CAR_X, y },
  ...counts.map((n, i) => ({ s: String(n), x: COL_X[i], y })),
];

/** แถวที่ชื่อถูกตัดขึ้นบรรทัดใหม่ในคอลัมน์เดิม — เจอบ่อยในไฟล์จริง */
const wrappedRow = (y: number, num: string, parts: string[], team: string, counts: number[]): Item[] => [
  { s: num, x: NUM_X, y },
  ...parts.map((w, i) => ({ s: w, x: DRIVER_X, y: y - i * 3 })),
  { s: team, x: CAR_X, y },
  ...counts.map((n, i) => ({ s: String(n), x: COL_X[i], y })),
];

describe("zeroUsed", () => {
  it("เริ่มที่ 0 ครบทุกชิ้น", () => {
    const z = zeroUsed();
    expect(Object.keys(z).sort()).toEqual([...PU_KEYS].sort());
    expect(Object.values(z).every((v) => v === 0)).toBe(true);
  });
});

describe("parseUsageTable", () => {
  const page = [
    ...header(700),
    ...row(680, "1", "Max Verstappen", "RedBull", [3, 3, 3, 2, 2, 2, 4]),
    ...row(660, "81", "Oscar Piastri", "McLaren", [4, 4, 4, 3, 3, 3, 5]),
  ];

  it("อ่านเลขรถ ชื่อ ทีม และยอดใช้ครบทุกคอลัมน์", () => {
    const out = parseUsageTable([page]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ number: "1", driver: "Max Verstappen", team: "RedBull" });
    expect(out[0].used).toEqual({ ICE: 3, TC: 3, EXH: 3, "MGU-K": 2, ES: 2, "PU-CE": 2, "PU-ANC": 4 });
    expect(out[1].used.ICE).toBe(4);
  });

  it("ต่อชื่อที่ถูกตัดขึ้นบรรทัดใหม่ในคอลัมน์เดิมกลับเป็นชื่อเดียว", () => {
    const out = parseUsageTable([[
      ...header(700),
      ...wrappedRow(680, "27", ["Nico", "Hulkenberg"], "Sauber", [5, 5, 5, 4, 4, 4, 6]),
    ]]);
    expect(out).toHaveLength(1);
    expect(out[0].driver).toBe("Nico Hulkenberg");
  });

  it("ทนแถวที่ตัวเลขเยื้องขึ้นลงเล็กน้อย (±2pt)", () => {
    const wobbly = page.map((i) => (i.x > DRIVER_X + 40 ? { ...i, y: i.y - 2 } : i));
    expect(parseUsageTable([wobbly])).toHaveLength(2);
  });

  it("ข้ามแถวที่ตัวเลขไม่ครบทุกคอลัมน์", () => {
    const short = [...header(700), ...row(680, "1", "Max Verstappen", "RedBull", [3, 3, 3])];
    expect(parseUsageTable([short])).toEqual([]);
  });

  it("ข้ามหน้าที่ไม่มีหัวตาราง แล้วไปเจอหน้าที่มี", () => {
    const junk: Item[] = [{ s: "หน้าปก", x: 100, y: 500 }];
    expect(parseUsageTable([junk, page])).toHaveLength(2);
  });

  it("ไม่มีหัวตารางเลย = คืนลิสต์ว่าง ไม่ throw", () => {
    expect(parseUsageTable([[{ s: "อะไรก็ไม่รู้", x: 10, y: 10 }]])).toEqual([]);
    expect(parseUsageTable([])).toEqual([]);
  });
});
