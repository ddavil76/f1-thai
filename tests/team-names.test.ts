import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { teamName } from "@/lib/teams";

/**
 * ชื่อทีมจาก Jolpica บางทีมยาว/เก่า ("Haas F1 Team", "RB F1 Team") — ทุกที่ที่แสดงชื่อทีม
 * ต้องผ่าน teamName() ไม่งั้นหน้าหนึ่งเขียน "Haas" อีกหน้าเขียน "Haas F1 Team"
 * (เคยหลุดอยู่ 7 จุด ทั้งตารางผล ควอลิฟาย ตารางคะแนน หน้านักแข่ง)
 */
const ROOT = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("ชื่อทีม", () => {
  it("teamName ย่อชื่อยาวของ Jolpica และคงชื่อที่สั้นอยู่แล้ว", () => {
    expect(teamName("haas", "Haas F1 Team")).toBe("Haas");
    expect(teamName("rb", "RB F1 Team")).toBe("Racing Bulls");
    expect(teamName("cadillac", "Cadillac F1 Team")).toBe("Cadillac");
    expect(teamName("alpine", "Alpine F1 Team")).toBe("Alpine");
    expect(teamName("mclaren", "McLaren")).toBe("McLaren");
  });

  it("ไม่มีไฟล์ไหนแสดง Constructor.name ตรง ๆ โดยไม่ผ่าน teamName()", () => {
    // {r.Constructor.name} · {s.Constructors.at(-1)?.name} — ยัดชื่อดิบลง JSX
    const raw = /\{\s*[\w.?]*Constructors?(?:\.at\(-?\d+\))?\??\.name\s*\}/;
    const offenders = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))]
      .filter((f) => raw.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
