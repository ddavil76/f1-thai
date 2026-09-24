import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * เคยเป็นบั๊ก: of1() ใช้ cache "force-cache" กับทุกคำขอ เบราว์เซอร์เลยใช้รายชื่อ session
 * ที่ดึงไว้ต้นฤดูกาลตลอดไป สนามที่แข่งทีหลังหารีเพลย์ไม่เจอ
 * กติกา: ข้อมูลที่ยังเปลี่ยนได้ (รีเพลย์ฤดูกาลปัจจุบัน) ห้าม force-cache
 */
const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("openf1 cache", () => {
  it("ค่าเริ่มต้นของ of1 ไม่ใช่ force-cache", () => {
    expect(src("lib/openf1.ts")).toMatch(/cache: RequestCache = "no-cache"/);
  });
  it("รีเพลย์ไม่ส่ง force-cache ให้ of1", () => {
    expect(src("lib/replay.ts")).not.toMatch(/force-cache/);
  });
});
