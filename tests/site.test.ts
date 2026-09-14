import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/site";

describe("resolveSiteUrl", () => {
  it("ไม่ตั้งอะไรเลย → localhost (ตอน dev)", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });

  it("NEXT_PUBLIC_SITE_URL ชนะทุกอย่าง", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://f1.example.com",
        VERCEL_PROJECT_PRODUCTION_URL: "f1-thai.vercel.app",
      }),
    ).toBe("https://f1.example.com");
  });

  // Vercel ใส่ตัวนี้ให้เองทุก deploy เป็นโดเมนเปล่า ไม่มี protocol
  it("ไม่ตั้งเอง → ใช้โดเมน production ของ Vercel แล้วเติม https:// ให้", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "f1-thai.vercel.app" })).toBe(
      "https://f1-thai.vercel.app",
    );
  });

  it("ตัด / ท้ายทิ้ง ไม่ให้ต่อ path แล้วกลายเป็น //", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://a.test/" })).toBe("https://a.test");
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://a.test///" })).toBe("https://a.test");
  });

  // ลืมใส่ protocol แล้ว new URL() ใน metadataBase จะ throw ทั้ง build
  it("ลืมใส่ protocol → เติม https:// ให้", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "f1.example.com" })).toBe("https://f1.example.com");
  });

  it("คงไว้ถ้าเป็น http:// อยู่แล้ว", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://a.test" })).toBe("http://a.test");
  });

  it.each(["", "   "])("ค่าว่าง (%j) ถือว่าไม่ได้ตั้ง", (v) => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: v, VERCEL_PROJECT_PRODUCTION_URL: "x.test" })).toBe(
      "https://x.test",
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: v })).toBe("http://localhost:3000");
  });

  it("ผลลัพธ์ทุกกรณีเอาไปเข้า new URL() ได้ไม่ throw", () => {
    for (const env of [
      {},
      { NEXT_PUBLIC_SITE_URL: "f1.example.com/" },
      { VERCEL_PROJECT_PRODUCTION_URL: "f1-thai.vercel.app" },
    ]) {
      expect(() => new URL(resolveSiteUrl(env))).not.toThrow();
    }
  });
});
