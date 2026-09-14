import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * README ตั้งกติกาไว้ว่าทุกแอนิเมชันต้องมีคู่ใน @media (prefers-reduced-motion: reduce)
 * เทสต์นี้บังคับกติกานั้นแทนการพึ่งให้คนจำเอง — เคยหลุดมาแล้วกับยูทิลิตี้ของ Tailwind
 * (animate-ping / animate-spin / animate-pulse) ที่วนไม่รู้จบแต่ไม่มีใครปิด
 */

const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/** ไล่เก็บไฟล์ .tsx ทั้งหมดใน app/ กับ components/ */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const reduceBlock = (() => {
  const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(at, "ไม่เจอบล็อก prefers-reduced-motion ใน globals.css").toBeGreaterThan(-1);
  // ตัดถึงปีกกาปิดของ @media (บล็อกนี้อยู่ท้ายไฟล์)
  return css.slice(at);
})();

const used = [
  ...new Set(
    tsxFiles(join(ROOT, "app"))
      .concat(tsxFiles(join(ROOT, "components")))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\banimate-[a-z0-9-]+/g)].map((m) => m[0])),
  ),
].sort();

describe("prefers-reduced-motion", () => {
  it("มี class ที่ขึ้นต้นด้วย animate- ใช้งานอยู่จริง", () => {
    expect(used.length).toBeGreaterThan(0);
  });

  it.each(used)("%s ถูกปิดในบล็อก reduced-motion", (cls) => {
    expect(reduceBlock).toContain(`.${cls}`);
  });

  it("class เคลื่อนไหวที่เขียนเองก็ต้องถูกปิดด้วย", () => {
    // keyframes ที่ประกาศเองใน globals.css แล้วผูกกับ class ที่ไม่ได้ขึ้นต้นด้วย animate-
    for (const cls of ["champ-reveal", "stagger", "podium-rise", "grow-x", "track-draw", "racing-dot", "go-flash"]) {
      expect(reduceBlock, `.${cls} หายไปจากบล็อก reduced-motion`).toContain(`.${cls}`);
    }
  });
});
