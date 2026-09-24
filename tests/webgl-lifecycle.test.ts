import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { whenVisible } from "@/lib/visible";

const ROOT = join(__dirname, "..");
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}
/** ทุก component ที่สร้างฉาก WebGL */
const webgl = [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))]
  .filter((f) => readFileSync(f, "utf8").includes("new THREE.WebGLRenderer"));

describe("ฉาก 3D ทุกตัว", () => {
  it("มีอยู่จริง (กันเทสต์นี้ว่างเปล่าเงียบ ๆ)", () => {
    expect(webgl.length).toBeGreaterThanOrEqual(4);
  });

  it.each(webgl.map((f) => relative(ROOT, f)))("%s: รอให้มองเห็นก่อนสร้าง และคืน WebGL context ทันทีตอนเลิกใช้", (f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    // แท็บที่ซ่อนอยู่ต้องไม่โหลด three / ไม่สร้าง context / ไม่ยิง openf1
    expect(src).toMatch(/await visible\.ready;[\s\S]*await import\("three"\)/);
    expect(src).toContain("visible.cancel()");
    // Safari บน iPhone จำกัดจำนวน context — dispose อย่างเดียวรอ GC นานเกิน
    expect(src).toContain("renderer.forceContextLoss()");
  });
});

/* ---------- whenVisible กับ IntersectionObserver ปลอม ---------- */

type Entry = { isIntersecting: boolean; boundingClientRect: { width: number; height: number } };
let observers: { cb: (e: Entry[]) => void; disconnected: boolean }[] = [];
class FakeIO {
  rec: { cb: (e: Entry[]) => void; disconnected: boolean };
  constructor(cb: (e: Entry[]) => void) {
    this.rec = { cb, disconnected: false };
    observers.push(this.rec);
  }
  observe() {}
  disconnect() { this.rec.disconnected = true; }
}
const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.IntersectionObserver;
  observers = [];
});
const fire = (isIntersecting: boolean, width = 300, height = 150) =>
  observers.at(-1)!.cb([{ isIntersecting, boundingClientRect: { width, height } }]);
const settled = async (p: Promise<void>) => {
  let done = false;
  p.then(() => (done = true));
  await new Promise((r) => setTimeout(r, 0));
  return done;
};

describe("whenVisible", () => {
  it("ยังไม่ขึ้นจอ / ถูกซ่อน (ขนาด 0) → ยังไม่ resolve · ขึ้นจอจริง → resolve แล้วเลิกสังเกต", async () => {
    g.IntersectionObserver = FakeIO;
    const v = whenVisible({} as Element);
    fire(false);
    expect(await settled(v.ready)).toBe(false);
    fire(true, 0, 0); // display:none ในแท็บที่ยังไม่เปิด
    expect(await settled(v.ready)).toBe(false);
    fire(true);
    expect(await settled(v.ready)).toBe(true);
    expect(observers.at(-1)!.disconnected).toBe(true);
  });

  it("cancel ตอน unmount → เลิกสังเกต และไม่ resolve", async () => {
    g.IntersectionObserver = FakeIO;
    const v = whenVisible({} as Element);
    v.cancel();
    expect(observers.at(-1)!.disconnected).toBe(true);
    expect(await settled(v.ready)).toBe(false);
  });
});
