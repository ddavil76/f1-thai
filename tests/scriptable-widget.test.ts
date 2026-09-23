import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWidgetPayload } from "@/lib/widget";
import type { DriverStanding, Race } from "@/lib/f1";

/**
 * public/scriptable-widget.js ถูกส่งให้ผู้ใช้เอาไปวางในแอป Scriptable บน iOS
 * ที่นี่รันไม่ได้จริง จึงจำลอง API ของ Scriptable แล้วรันสคริปต์ทั้งไฟล์
 * ดูว่าประกอบ widget ออกมาถูกต้องไหม — อย่างน้อยพิมพ์ผิดจะไม่หลุดไปถึงเครื่องผู้ใช้
 */

// widget จัดรูปวันเวลาตามเขตเวลาของเครื่อง — ล็อกเป็นเวลาไทยให้ผลคงที่ไม่ว่ารันที่ไหน
process.env.TZ = "Asia/Bangkok";

const SRC = readFileSync(join(__dirname, "../public/scriptable-widget.js"), "utf8");
const LOADER = readFileSync(join(__dirname, "../public/widget.js"), "utf8");

type Captured = { texts: string[]; dates: Date[]; url?: string; refreshAfter?: Date };

type Env = {
  /** สิ่งที่ /api/widget ตอบ — null = ต่อเน็ตไม่ได้ */
  payload: unknown;
  family: "small" | "medium";
  /** สิ่งที่ /scriptable-widget.js ตอบ (ใช้ตอนรันผ่านตัวโหลด) — null = ต่อเน็ตไม่ได้ */
  code?: { status: number; body: string } | null;
  /** ไฟล์ในเครื่อง (FileManager.local) — ตัวโหลดเก็บโค้ดสำรองไว้ที่นี่ */
  files?: Map<string, string>;
};

/**
 * รันสคริปต์ด้วย Scriptable API ปลอม แล้วคืนสิ่งที่มันวาด
 * API ต้องอยู่บน globalThis จริง ๆ เพราะตัวโหลดรันโค้ด widget ซ้อนด้วย new Function
 * ซึ่งมองไม่เห็นตัวแปรนอก global
 */
async function run(src: string, env: Env): Promise<Captured> {
  const out: Captured = { texts: [], dates: [] };
  const files = env.files ?? new Map<string, string>();

  class FakeText {
    font: unknown; textColor: unknown; lineLimit = 0; minimumScaleFactor = 1;
    applyTimerStyle() {}
  }
  class FakeStack {
    addText(s: string) { out.texts.push(s); return new FakeText(); }
    addDate(d: Date) { out.dates.push(d); return new FakeText(); }
    addStack() { return new FakeStack(); }
    addSpacer() {}
    centerAlignContent() {}
    setPadding() {}
    backgroundColor: unknown;
    set url(v: string) { out.url = v; }
    set refreshAfterDate(v: Date) { out.refreshAfter = v; }
    async presentMedium() {}
    async presentSmall() {}
  }

  const globals: Record<string, unknown> = {
    Color: class FakeColor {
      constructor(public hex: string, public alpha?: number) {}
      static white() { return new FakeColor("#ffffff"); }
      static black() { return new FakeColor("#000000"); }
    },
    Font: { boldSystemFont: (n: number) => n, systemFont: (n: number) => n },
    ListWidget: FakeStack,
    Request: class {
      timeoutInterval = 0;
      response: { statusCode: number } | undefined;
      constructor(public url: string) {}
      async loadJSON() {
        if (env.payload === null) throw new Error("offline");
        return env.payload;
      }
      async loadString() {
        if (!env.code) throw new Error("offline");
        this.response = { statusCode: env.code.status };
        return env.code.body;
      }
    },
    FileManager: {
      local: () => ({
        documentsDirectory: () => "/docs",
        joinPath: (a: string, b: string) => `${a}/${b}`,
        fileExists: (f: string) => files.has(f),
        readString: (f: string) => files.get(f),
        writeString: (f: string, v: string) => void files.set(f, v),
      }),
    },
    config: { widgetFamily: env.family, runsInWidget: true },
    Script: { setWidget() {}, complete() {} },
  };

  const g = globalThis as Record<string, unknown>;
  Object.assign(g, globals);
  try {
    await new Function(`return (async () => {\n${src}\n})()`)();
  } finally {
    for (const k of Object.keys(globals)) delete g[k];
  }
  return out;
}

const render = (payload: unknown, family: "small" | "medium") => run(SRC, { payload, family });

const race = (over: Partial<Race> = {}): Race => ({
  season: "2026", round: "15", raceName: "Azerbaijan Grand Prix",
  date: "2026-09-26", time: "11:00:00Z",
  Circuit: {
    circuitId: "baku", circuitName: "Baku City Circuit",
    Location: { locality: "Baku", country: "Azerbaijan" },
  },
  FirstPractice: { date: "2026-09-24", time: "08:30:00Z" },
  ...over,
});

const standing = (): DriverStanding => ({
  position: "1", points: "310", wins: "8",
  Driver: { driverId: "max_verstappen", givenName: "Max", familyName: "Verstappen", nationality: "Dutch" },
  Constructors: [{ constructorId: "red_bull", name: "Red Bull" }],
});

const payloadAt = (now: string, races = [race()], standings = [standing()]) =>
  buildWidgetPayload({ season: 2026, races, standings, now: new Date(now) });

describe("scriptable-widget.js", () => {
  it("ขนาด medium: แสดงรอบ ชื่อสนาม สนาม และผู้นำตารางคะแนน", async () => {
    const r = await render(payloadAt("2026-09-20T00:00:00Z"), "medium");
    expect(r.texts).toContain("ROUND 15");
    expect(r.texts).toContain("Azerbaijan Grand Prix");
    expect(r.texts.join(" ")).toContain("Baku City Circuit");
    expect(r.texts).toContain("M. Verstappen");
    expect(r.texts).toContain("310 แต้ม");
  });

  it("ขนาด small: ตัดผู้นำตารางคะแนนออกเพราะที่ไม่พอ", async () => {
    const r = await render(payloadAt("2026-09-20T00:00:00Z"), "small");
    expect(r.texts).toContain("Azerbaijan Grand Prix");
    expect(r.texts).not.toContain("M. Verstappen");
  });

  it("นับถอยหลังชี้ไปที่ session ถัดไป ไม่ใช่เวลาออกสตาร์ท", async () => {
    const p = payloadAt("2026-09-20T00:00:00Z");
    const r = await render(p, "medium");
    expect(r.dates).toHaveLength(1);
    expect(r.dates[0].toISOString()).toBe(p.session!.startsAt);
    expect(p.session!.label).toBe("ซ้อม 1");
  });

  it("ตอนกำลังแข่งติดป้าย LIVE และขอรีเฟรชถี่ขึ้น", async () => {
    const live = await render(payloadAt("2026-09-24T09:00:00Z"), "medium");
    expect(live.texts.join(" ")).toContain("LIVE");
    expect(live.texts.join(" ")).toContain("กำลังแข่ง");
    const calm = await render(payloadAt("2026-09-20T00:00:00Z"), "medium");
    expect(calm.texts.join(" ")).not.toContain("LIVE");
    // live ต้องขอรีเฟรชเร็วกว่าตอนปกติ
    expect(live.refreshAfter!.getTime()).toBeLessThan(calm.refreshAfter!.getTime());
  });

  it("สุดสัปดาห์ที่มีสปรินต์ติดป้าย SPRINT", async () => {
    const p = payloadAt("2026-09-20T00:00:00Z", [race({ Sprint: { date: "2026-09-25", time: "10:00:00Z" } })]);
    const r = await render(p, "medium");
    expect(r.texts).toContain("SPRINT");
  });

  it("จบฤดูกาลแล้วบอกผู้ใช้ ไม่ค้างหรือพัง", async () => {
    const r = await render(payloadAt("2026-12-31T00:00:00Z"), "medium");
    expect(r.texts.join(" ")).toContain("จบฤดูกาลแล้ว");
    expect(r.dates).toHaveLength(0);
  });

  it("ปฏิทินยังไม่ประกาศก็บอกได้", async () => {
    const r = await render(payloadAt("2026-01-01T00:00:00Z", []), "medium");
    expect(r.texts.join(" ")).toContain("ยังไม่ประกาศ");
  });

  it("ต่อเน็ตไม่ได้ → ขึ้นข้อความแทนที่จะ throw", async () => {
    const r = await render(null, "medium");
    expect(r.texts.join(" ")).toContain("ต่อเน็ตไม่ได้");
  });

  it("ไม่มีตารางคะแนนก็ยังวาดได้", async () => {
    const r = await render(payloadAt("2026-09-20T00:00:00Z", [race()], []), "medium");
    expect(r.texts).toContain("Azerbaijan Grand Prix");
    expect(r.texts).not.toContain("310 แต้ม");
  });

  it.each(["small", "medium"] as const)("%s: บอกวันและเวลาของ session ถัดไปตามเวลาเครื่อง", async (size) => {
    // ซ้อม 1 = 2026-09-24T08:30Z → 15:30 เวลาไทย วันพฤหัสบดี
    const r = await render(payloadAt("2026-09-20T00:00:00Z"), size);
    expect(r.texts).toContain("พฤ. 24 ก.ย. · 15:30");
  });

  it("ข้ามวันตามเขตเวลา และเติมศูนย์หน้าชั่วโมง/นาที", async () => {
    // Race 2026-09-26T23:05Z → อา. 27 ก.ย. 06:05 เวลาไทย
    const p = payloadAt("2026-09-20T00:00:00Z", [
      race({ FirstPractice: undefined, date: "2026-09-26", time: "23:05:00Z" }),
    ]);
    const r = await render(p, "small");
    expect(r.texts).toContain("อา. 27 ก.ย. · 06:05");
  });

  it("แตะ widget แล้วเปิดเว็บ", async () => {
    const r = await render(payloadAt("2026-09-20T00:00:00Z"), "medium");
    expect(r.url).toMatch(/^https:\/\//);
  });
});

describe("widget.js (ตัวโหลดที่ดึงโค้ดล่าสุดจากเว็บ)", () => {
  const payload = () => payloadAt("2026-09-20T00:00:00Z");
  const CACHE = "/docs/f1-widget-cache.js";

  it("ดึงโค้ดจากเว็บมารัน แล้วเก็บสำรองไว้ในเครื่อง", async () => {
    const files = new Map<string, string>();
    const r = await run(LOADER, { payload: payload(), family: "medium", code: { status: 200, body: SRC }, files });
    expect(r.texts).toContain("Azerbaijan Grand Prix");
    expect(r.texts).toContain("พฤ. 24 ก.ย. · 15:30");
    expect(files.get(CACHE)).toBe(SRC);
  });

  it("ต่อเว็บไม่ได้ → ใช้โค้ดสำรองที่เคยโหลดไว้", async () => {
    const files = new Map([[CACHE, SRC]]);
    const r = await run(LOADER, { payload: payload(), family: "small", code: null, files });
    expect(r.texts).toContain("Azerbaijan Grand Prix");
  });

  it("เว็บตอบหน้า error → ไม่เอามารัน ไม่ทับโค้ดสำรอง", async () => {
    const files = new Map([[CACHE, SRC]]);
    const html = { status: 404, body: "<!DOCTYPE html><html>F1 Week Race 404</html>" };
    const r = await run(LOADER, { payload: payload(), family: "small", code: html, files });
    expect(r.texts).toContain("Azerbaijan Grand Prix");
    expect(files.get(CACHE)).toBe(SRC);
  });

  it("ครั้งแรกแล้วต่อเน็ตไม่ได้ (ยังไม่มีโค้ดสำรอง) → บอกผู้ใช้แทนที่จะพัง", async () => {
    const r = await run(LOADER, { payload: null, family: "small", code: null });
    expect(r.texts.join(" ")).toContain("ต่อเน็ตไม่ได้");
  });

  it("โค้ดบนเว็บมีสิ่งที่ตัวโหลดใช้เช็กว่าเป็นโค้ดจริง", () => {
    expect(SRC).toContain("Script.setWidget");
  });
});
