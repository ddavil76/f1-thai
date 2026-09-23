import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ค่าติดลบแบบ vw (เช่น inset: -50vw) ดันให้หน้ากว้างเกินจอ — บน iPhone เลื่อนข้างได้
 * และเมนูล่าง (fixed, จัดกลางตามความกว้างหน้า) เยื้องไปทางขวาจนโดนตัด
 * body มี overflow-x: clip ก็กันบนมือถือไม่อยู่ เคยหลุดมาแล้วกับแสงสีผู้ชนะหัวหน้าสนาม
 */
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

describe("globals.css", () => {
  it("ไม่มีค่าติดลบแบบ vw ที่ดันเนื้อหาเลยขอบจอ", () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/-\d+(\.\d+)?vw/);
  });
});
