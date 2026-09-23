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

const SRC = readFileSync(join(__dirname, "../public/scriptable-widget.js"), "utf8");

type Captured = { texts: string[]; dates: Date[]; url?: string; refreshAfter?: Date };

/** รันสคริปต์ด้วย Scriptable API ปลอม แล้วคืนสิ่งที่มันวาด */
async function render(payload: unknown, family: "small" | "medium"): Promise<Captured> {
  const out: Captured = { texts: [], dates: [] };

  class FakeText {
    font: unknown; textColor: unknown; lineLimit = 0;
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
  }

  const globals = {
    Color: class FakeColor {
      constructor(public hex: string, public alpha?: number) {}
      static white() { return new FakeColor("#ffffff"); }
      static black() { return new FakeColor("#000000"); }
    },
    Font: { boldSystemFont: (n: number) => n, systemFont: (n: number) => n },
    ListWidget: FakeStack,
    Request: class {
      timeoutInterval = 0;
      constructor(public url: string) {}
      async loadJSON() {
        if (payload === null) throw new Error("offline");
        return payload;
      }
    },
    config: { widgetFamily: family, runsInWidget: true },
    Script: { setWidget() {}, complete() {} },
  };

  const fn = new Function(
    ...Object.keys(globals),
    `return (async () => {\n${SRC}\n})()`,
  );
  await fn(...Object.values(globals));
  return out;
}

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

  it("แตะ widget แล้วเปิดเว็บ", async () => {
    const r = await render(payloadAt("2026-09-20T00:00:00Z"), "medium");
    expect(r.url).toMatch(/^https:\/\//);
  });
});
