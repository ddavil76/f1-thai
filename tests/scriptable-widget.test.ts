import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWidgetPayload } from "@/lib/widget";
import type { DriverStanding, Race, RaceWithResults } from "@/lib/f1";

/**
 * public/scriptable-widget.js ถูกส่งให้ผู้ใช้เอาไปวางในแอป Scriptable บน iOS
 * ที่นี่รันไม่ได้จริง จึงจำลอง API ของ Scriptable แล้วรันสคริปต์ทั้งไฟล์
 * ดูว่าประกอบ widget ออกมาถูกต้องไหม — อย่างน้อยพิมพ์ผิดจะไม่หลุดไปถึงเครื่องผู้ใช้
 */

// widget จัดรูปวันเวลาตามเขตเวลาของเครื่อง — ล็อกเป็นเวลาไทยให้ผลคงที่ไม่ว่ารันที่ไหน
process.env.TZ = "Asia/Bangkok";

const SRC = readFileSync(join(__dirname, "../public/scriptable-widget.js"), "utf8");
const LOADER = readFileSync(join(__dirname, "../public/widget.js"), "utf8");

type Family =
  | "small" | "medium" | "large"
  | "accessoryRectangular" | "accessoryCircular" | "accessoryInline";

type Captured = {
  texts: string[];
  dates: Date[];
  /** ฟอนต์และสีของตัวนับถอยหลังแต่ละตัว */
  timers: { font: unknown; color: unknown }[];
  /** url ของ widget ทั้งตัว (แตะตรงไหนก็ได้) */
  url?: string;
  /** url ของส่วนย่อยที่แตะแยกได้ */
  stackUrls: string[];
  /** จำนวนจุดของผังสนามแต่ละรูปที่วาด */
  tracks: number[];
  /** สีพื้นของ stack ทั้งหมด (hex) */
  fills: string[];
  background?: unknown;
  refreshAfter?: Date;
  /** แจ้งเตือนที่ค้างรออยู่ในเครื่องหลังรันจบ */
  alerts: Alert[];
  /** URL รูปการ์ดที่โหลด (ธีมการ์ด) */
  cardUrls: string[];
  /** รูปพื้นหลังของ widget (ธีมการ์ด) */
  backgroundImage?: unknown;
};

type Alert = { identifier: string; title?: string; body?: string; openURL?: string; at?: Date };

type Env = {
  /** สิ่งที่ /api/widget ตอบ — null = ต่อเน็ตไม่ได้ */
  payload: unknown;
  family: Family;
  /** "เวลาตอนนี้" ของเครื่อง — widget ใช้ตัดสินว่า session ไหนจบแล้ว */
  now?: string;
  /** สิ่งที่ /scriptable-widget.js ตอบ (ใช้ตอนรันผ่านตัวโหลด) — null = ต่อเน็ตไม่ได้ */
  code?: { status: number; body: string } | null;
  /** ไฟล์ในเครื่อง (FileManager.local) — ตัวโหลดเก็บโค้ดสำรองไว้ที่นี่ */
  files?: Map<string, string>;
  /** ช่อง Parameter ของ widget */
  param?: string;
  /** แจ้งเตือนที่ค้างอยู่ก่อนรัน (ของแอปอื่นหรือรอบก่อน) — ไม่ส่ง = ว่าง */
  alerts?: Alert[];
  /** จำลอง Scriptable รุ่นที่ไม่มี Notification / iOS ไม่ให้สิทธิ์ */
  notification?: "none" | "throws";
  /** มี Device + โหลดรูปได้ = ธีมการ์ด · fail = โหลดรูปการ์ดไม่ได้ · ไม่ส่ง = ไม่มี Device (หน้าตาเดิม) */
  card?: { dark?: boolean; fail?: boolean; screen?: [number, number] };
};

afterEach(() => {
  vi.useRealTimers();
});

/**
 * รันสคริปต์ด้วย Scriptable API ปลอม แล้วคืนสิ่งที่มันวาด
 * API ต้องอยู่บน globalThis จริง ๆ เพราะตัวโหลดรันโค้ด widget ซ้อนด้วย new Function
 * ซึ่งมองไม่เห็นตัวแปรนอก global
 */
async function run(src: string, env: Env): Promise<Captured> {
  const out: Captured = { texts: [], dates: [], timers: [], stackUrls: [], tracks: [], fills: [], alerts: [], cardUrls: [] };
  const images = new Map<string, unknown>();
  let pending: Alert[] = [...(env.alerts ?? [])];
  const files = env.files ?? new Map<string, string>();
  if (env.now) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(env.now));
  }

  const timerTexts: FakeText[] = [];
  class FakeText {
    font: unknown; textColor: unknown; lineLimit = 0; minimumScaleFactor = 1;
    applyTimerStyle() { timerTexts.push(this); }
    centerAlignText() {} leftAlignText() {} rightAlignText() {}
  }
  class FakeStack {
    cornerRadius = 0; spacing = 0; size: unknown;
    set backgroundColor(v: { hex: string }) { out.fills.push(v.hex); }
    addText(s: string) { out.texts.push(s); return new FakeText(); }
    addDate(d: Date) { out.dates.push(d); return new FakeText(); }
    addStack() { return new FakeStack(); }
    addImage(img: { points?: number }) {
      if (img.points) out.tracks.push(img.points);
      return { imageSize: null, tintColor: null };
    }
    addSpacer() {}
    layoutHorizontally() {} layoutVertically() {}
    centerAlignContent() {} topAlignContent() {} bottomAlignContent() {}
    setPadding() {}
    set url(v: string) { out.stackUrls.push(v); }
  }
  class FakeWidget extends FakeStack {
    set url(v: string) { out.url = v; }
    set backgroundGradient(v: unknown) { out.background = v; }
    set backgroundImage(v: unknown) { out.backgroundImage = v; }
    set refreshAfterDate(v: Date) { out.refreshAfter = v; }
    async presentSmall() {} async presentMedium() {} async presentLarge() {}
  }
  class FakePath {
    points = 0;
    addLines(pts: unknown[]) { this.points += pts.length; }
    closeSubpath() {}
  }
  class FakeDraw {
    size: unknown; opaque = true; respectScreenScale = false;
    private points = 0;
    addPath(p: FakePath) { this.points += p.points; }
    setStrokeColor() {} setLineWidth() {} strokePath() {}
    getImage() { return { points: this.points }; }
  }
  const font = (kind: string) => (size: number) => ({ kind, size });

  const globals: Record<string, unknown> = {
    Color: class FakeColor {
      constructor(public hex: string, public alpha?: number) {}
      static white() { return new FakeColor("#ffffff"); }
      static black() { return new FakeColor("#000000"); }
    },
    Font: {
      systemFont: font("regular"),
      boldSystemFont: font("bold"),
      heavySystemFont: font("heavy"),
      boldMonospacedSystemFont: font("bold-mono"),
    },
    ListWidget: FakeWidget,
    LinearGradient: class { colors: unknown[] = []; locations: number[] = []; startPoint: unknown; endPoint: unknown },
    DrawContext: FakeDraw,
    Path: FakePath,
    Point: class { constructor(public x: number, public y: number) {} },
    Size: class { constructor(public width: number, public height: number) {} },
    Request: class {
      timeoutInterval = 0;
      response: { statusCode: number } | undefined;
      constructor(public url: string) {}
      async loadJSON() {
        if (env.payload === null) throw new Error("offline");
        return env.payload;
      }
      async loadImage() {
        if (!env.card || env.card.fail) throw new Error("offline");
        out.cardUrls.push(this.url);
        this.response = { statusCode: 200 };
        return { card: this.url };
      }
      async loadString() {
        if (!env.code) throw new Error("offline");
        this.response = { statusCode: env.code.status };
        return env.code.body;
      }
    },
    args: { widgetParameter: env.param ?? null },
    Notification: env.notification === "none" ? undefined : class FakeNotification {
      identifier = ""; title?: string; body?: string; openURL?: string; threadIdentifier?: string;
      private at?: Date;
      static async allPending() {
        if (env.notification === "throws") throw new Error("not authorised");
        return pending.map((a) => Object.assign(new FakeNotification(), a));
      }
      static async removePending(ids: string[]) { pending = pending.filter((a) => !ids.includes(a.identifier)); }
      setTriggerDate(d: Date) { this.at = d; }
      async schedule() {
        const { identifier, title, body, openURL, at } = this;
        pending = [...pending.filter((a) => a.identifier !== identifier), { identifier, title, body, openURL, at }];
      }
    },
    FileManager: {
      local: () => ({
        documentsDirectory: () => "/docs",
        joinPath: (a: string, b: string) => `${a}/${b}`,
        fileExists: (f: string) => files.has(f),
        readString: (f: string) => files.get(f),
        writeString: (f: string, v: string) => void files.set(f, v),
        cacheDirectory: () => "/cache",
        createDirectory: () => {},
        readImage: (f: string) => images.get(f),
        writeImage: (f: string, v: unknown) => void images.set(f, v),
        listContents: (d: string) => [...images.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1)),
        modificationDate: () => new Date(0),
        remove: (f: string) => void images.delete(f),
      }),
    },
    ...(env.card
      ? {
          Device: {
            screenSize: () => ({ width: env.card!.screen?.[0] ?? 390, height: env.card!.screen?.[1] ?? 844 }),
            screenScale: () => 3,
            isUsingDarkAppearance: () => !!env.card!.dark,
          },
        }
      : {}),
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
  out.timers = timerTexts.map((t) => ({ font: t.font, color: t.textColor }));
  out.alerts = pending;
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
  Qualifying: { date: "2026-09-25", time: "12:00:00Z" },
  ...over,
});

const driver = (id: string, given: string, family: string, code: string, team: string, pts: string, pos: string): DriverStanding => ({
  position: pos, points: pts, wins: "0",
  Driver: { driverId: id, givenName: given, familyName: family, nationality: "x", code },
  Constructors: [{ constructorId: team, name: team }],
});
const STANDINGS = [
  driver("max_verstappen", "Max", "Verstappen", "VER", "red_bull", "310", "1"),
  driver("norris", "Lando", "Norris", "NOR", "mclaren", "280", "2"),
  driver("leclerc", "Charles", "Leclerc", "LEC", "ferrari", "251", "3"),
];

/** ผลสนามที่ 14 (สเปน, 2026-09-13) — Hamilton ชนะให้ Ferrari */
const LAST: RaceWithResults = {
  ...race({ round: "14", raceName: "Spanish Grand Prix", date: "2026-09-13", time: "13:00:00Z",
    Circuit: { circuitId: "catalunya", circuitName: "Catalunya", Location: { locality: "Barcelona", country: "Spain" } } }),
  Results: [
    ["hamilton", "Lewis", "Hamilton", "HAM", "ferrari"],
    ["leclerc", "Charles", "Leclerc", "LEC", "ferrari"],
    ["russell", "George", "Russell", "RUS", "mercedes"],
  ].map(([driverId, givenName, familyName, code, constructorId], i) => ({
    position: String(i + 1), points: "0", grid: "1", status: "Finished",
    Driver: { driverId, givenName, familyName, code },
    Constructor: { constructorId, name: constructorId },
  })),
};

const payloadAt = (now: string, races = [race()], standings = STANDINGS, lastResults: RaceWithResults | null = LAST) =>
  buildWidgetPayload({ season: 2026, races, standings, lastResults, now: new Date(now) });

/** ช่วงที่ไม่ใช่โพเดียม ไม่ใช่กำลังแข่ง — ซ้อม 1 อีก 4 วันกว่า (นับเป็นวัน/ชม.) */
const CALM = "2026-09-20T00:00:00Z";
/** 2.5 ชม. ก่อนซ้อม 1 — นับถอยหลังด้วย timer ของ iOS */
const NEAR = "2026-09-24T06:00:00Z";
const render = (family: Family, now = CALM, payload: unknown = payloadAt(now)) =>
  run(SRC, { payload, family, now });

describe("scriptable-widget.js — ทุกขนาด", () => {
  it.each(["small", "medium", "large", "accessoryRectangular", "accessoryCircular", "accessoryInline"] as const)(
    "%s: วาดได้ไม่ throw และมีรหัส session ถัดไป",
    async (family) => {
      const r = await render(family);
      expect(r.texts.join(" ")).toContain("FP1");
    },
  );

  it("หัว: ธง + ชื่อสนามสั้นตัวใหญ่ + รอบ", async () => {
    const r = await render("small");
    // small แถวบนแคบ ย่อเป็น R15 · medium/large เต็ม
    expect(r.texts).toContain("R15");
    expect((await render("medium")).texts).toContain("ROUND 15");
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
    // small ตัดชื่อเมือง/สนามออกให้ตัวเลขเด่น
    expect(r.texts.join(" ")).not.toContain("Baku City Circuit");
  });

  it("large แสดงชื่อสนามและเมืองด้วย", async () => {
    const r = await render("large");
    expect(r.texts).toContain("Baku City Circuit · Baku");
  });

  it("ตัวนับถอยหลังเป็นตัวเลขกว้างเท่ากันสีขาว ชี้ไปที่ session ถัดไป", async () => {
    const p = payloadAt(NEAR);
    const r = await render("medium", NEAR, p);
    expect(r.dates.map((d) => d.toISOString())).toEqual([p.session!.startsAt]);
    expect(r.timers[0]).toEqual({ font: { kind: "bold-mono", size: 30 }, color: expect.objectContaining({ hex: "#ffffff" }) });
  });

  it("Scriptable รุ่นเก่าไม่มีฟอนต์ mono → ใช้ตัวหนาธรรมดาแทน ไม่พัง", async () => {
    const src = SRC.replace('typeof Font.boldMonospacedSystemFont === "function"', "false");
    const r = await run(src, { payload: payloadAt(NEAR), family: "small", now: NEAR });
    expect(r.timers[0].font).toEqual({ kind: "bold", size: 26 });
  });

  it("เหลือเกิน 1 วัน → บอกเป็นวัน/ชม. แทน timer (timer ของ iOS นับชั่วโมงสะสม 100:30:00)", async () => {
    // CALM → ซ้อม 1 อีก 4 วัน 8 ชม. 30 นาที
    const r = await render("small");
    expect(r.dates).toHaveLength(0);
    expect(r.texts).toEqual(expect.arrayContaining(["4", "วัน", "08", "ชม."]));
  });

  it("เกินวัน: ขอรีเฟรชตอนเลขชั่วโมงเปลี่ยน \"4 วัน 08 ชม.\" จะได้ไม่ช้าไปเกือบชั่วโมง", async () => {
    // ซ้อม 1 2026-09-24T08:30Z · ตอน 00:10Z เหลือ 4 วัน 8 ชม. 20 นาที → เลขชั่วโมงเปลี่ยนตอน 00:30Z
    const now = "2026-09-20T00:10:00Z";
    const r = await render("small", now, payloadAt(now));
    expect(r.refreshAfter!.toISOString()).toBe("2026-09-20T00:30:01.000Z");
  });

  it("ขอรีเฟรชตอนเหลือ 1 วันพอดี ให้เปลี่ยนเป็น timer ทัน", async () => {
    const r = await render("small", "2026-09-23T08:20:00Z");
    expect(r.refreshAfter!.toISOString()).toBe("2026-09-23T08:30:00.000Z");
  });

  it("บอกวันและเวลาไทยของ session ถัดไป", async () => {
    // ซ้อม 1 = 2026-09-24T08:30Z → 15:30 เวลาไทย วันพฤหัสบดี
    for (const f of ["small", "medium", "large"] as const) {
      expect((await render(f)).texts).toContain("พฤ. 24 ก.ย. · 15:30");
    }
  });

  it("ข้ามวันตามเขตเวลา และเติมศูนย์หน้าชั่วโมง/นาที", async () => {
    // Race 2026-09-26T23:05Z → อา. 27 ก.ย. 06:05 เวลาไทย
    const p = payloadAt(CALM, [race({ FirstPractice: undefined, Qualifying: undefined, date: "2026-09-26", time: "23:05:00Z" })]);
    const r = await render("small", CALM, p);
    expect(r.texts).toContain("อา. 27 ก.ย. · 06:05");
  });

  it("พื้นหลังไล่เฉด", async () => {
    const r = await render("medium");
    expect(r.background).toMatchObject({ locations: [0, 1] });
  });

  it("medium: ผังสนามวาดเองจากจุด + top 3 ตารางคะแนนพร้อมแต้มที่ห่าง", async () => {
    const r = await render("medium");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]).toBeGreaterThan(10);
    for (const s of ["VER", "NOR", "LEC", "310", "-30", "-59"]) expect(r.texts).toContain(s);
  });

  it("สนามที่ไม่มีผังเวกเตอร์ → ไม่วาด ไม่พัง", async () => {
    const p = payloadAt(CALM, [race({ Circuit: { circuitId: "nowhere", circuitName: "X", Location: { locality: "Y", country: "Z" } } })]);
    const r = await render("medium", CALM, p);
    expect(r.tracks).toHaveLength(0);
    expect(r.texts).toContain("🏁 Z");
  });

  it("large: ตารางทั้งสุดสัปดาห์ — session ที่จบแล้วติ๊ก ✓", async () => {
    // ระหว่างซ้อม 1 จบกับควอลิฟาย
    const r = await render("large", "2026-09-24T12:00:00Z");
    const t = r.texts;
    expect(t).toContain("FP1");
    expect(t).toContain("Q");
    expect(t).toContain("RACE");
    expect(t.filter((x) => x === "✓")).toHaveLength(1);
  });

  it("แตะแต่ละส่วนแล้วเปิดหน้าที่ตรงกัน", async () => {
    const r = await render("large");
    expect(r.url).toBe("https://f1-thai.vercel.app/race/15");
    expect(r.stackUrls).toEqual(expect.arrayContaining([
      "https://f1-thai.vercel.app/race/15",
      "https://f1-thai.vercel.app/standings",
      "https://f1-thai.vercel.app/race/14",
    ]));
  });

  it("ตอนกำลังแข่งติดป้าย LIVE และขอรีเฟรชถี่ขึ้น", async () => {
    const live = await render("medium", "2026-09-24T09:00:00Z");
    expect(live.texts.join(" ")).toContain("LIVE");
    expect(live.texts).toContain("กำลังแข่ง");
    const calm = await render("medium");
    expect(calm.texts.join(" ")).not.toContain("LIVE");
    expect(live.refreshAfter!.getTime() - Date.parse("2026-09-24T09:00:00Z")).toBe(5 * 60 * 1000);
    expect(calm.refreshAfter!.getTime() - Date.parse(CALM)).toBe(30 * 60 * 1000);
  });

  it("ใกล้ session เริ่ม → ขอรีเฟรชตรงเวลาเริ่ม ให้ป้ายเปลี่ยนเป็น LIVE ทัน", async () => {
    const r = await render("small", "2026-09-24T08:20:00Z");
    expect(r.refreshAfter!.toISOString()).toBe("2026-09-24T08:30:05.000Z");
  });

  it("สุดสัปดาห์ที่มีสปรินต์ติดป้าย SPRINT", async () => {
    const p = payloadAt(CALM, [race({ Sprint: { date: "2026-09-25", time: "10:00:00Z" } })]);
    expect((await render("medium", CALM, p)).texts).toContain("SPRINT");
  });
});

describe("scriptable-widget.js — ไม่นับขึ้นหลังถึงเวลา (ข้อมูลในเครื่องเก่ากว่าเวลาจริง)", () => {
  // ข้อมูลดึงมาตั้งแต่ CALM (ซ้อม 1 ยังไม่เริ่ม) แต่ iOS มาวาดตอนเวลาผ่านไปแล้ว
  const stale = () => payloadAt(CALM);

  it("ถึงเวลาเริ่มแล้ว → LIVE ไม่ใช่ timer (timer ของ iOS จะนับขึ้นต่อจาก 0)", async () => {
    for (const f of ["small", "medium", "large"] as const) {
      const r = await render(f, "2026-09-24T08:40:00Z", stale());
      expect(r.dates).toHaveLength(0);
      expect(r.texts).toContain("● LIVE");
      expect(r.texts).toContain("กำลังแข่ง");
    }
  });

  it("ข้อมูลจาก API บอก live ก็ไม่มี timer เหมือนกัน", async () => {
    const r = await render("small", "2026-09-24T09:00:00Z");
    expect(r.dates).toHaveLength(0);
    expect(r.texts).toContain("● LIVE");
  });

  it("session จบแล้วแต่ข้อมูลยังชี้ตัวเดิม → เลื่อนไปนับถอยหลัง session ถัดไปเอง", async () => {
    // ซ้อม 1 จบราว 10:00Z → ถัดไปคือควอลิฟาย 2026-09-25T12:00Z (เหลือไม่ถึงวัน → timer)
    const r = await render("small", "2026-09-24T13:00:00Z", stale());
    expect(r.texts).toContain("Q");
    expect(r.dates.map((d) => d.toISOString())).toEqual(["2026-09-25T12:00:00.000Z"]);
  });

  it("จบทั้งสุดสัปดาห์แล้วแต่ยังไม่ได้ข้อมูลสนามถัดไป → 🏁 จบแล้ว ไม่นับขึ้น", async () => {
    const r = await render("medium", "2026-09-26T14:00:00Z", stale());
    expect(r.dates).toHaveLength(0);
    expect(r.texts).toContain("🏁 จบแล้ว");
  });

  it("ไม่มีสนามถัดไปในข้อมูล (เว็บรุ่นเก่า) → ถามเว็บถี่ขึ้นเพื่อรับสนามถัดไป", async () => {
    const r = await render("medium", "2026-09-26T14:00:00Z", stale());
    expect(r.refreshAfter!.toISOString()).toBe("2026-09-26T14:05:00.000Z");
  });

  it("หน้าจอล็อกก็เหมือนกัน", async () => {
    const circle = await render("accessoryCircular", "2026-09-24T08:40:00Z", stale());
    expect(circle.texts).toContain("LIVE");
    expect(circle.dates).toHaveLength(0);
    const rect = await render("accessoryRectangular", "2026-09-24T08:40:00Z", stale());
    expect(rect.texts).toContain("● กำลังแข่ง");
    expect(rect.dates).toHaveLength(0);
  });

  it("ระหว่างแข่งขอรีเฟรชตอนจบ session ให้ไปตัวถัดไปทัน", async () => {
    // ซ้อม 1 จบ 10:00Z · อีก 3 นาที → ขอรีเฟรชตอนจบ (ไม่ใช่ครบ 5 นาที)
    const r = await render("small", "2026-09-24T09:57:00Z", stale());
    expect(r.refreshAfter!.toISOString()).toBe("2026-09-24T10:00:05.000Z");
  });
});

/** สนามถัดจากบากู — ใช้ทดสอบการสลับสนามและแจ้งเตือนสองสุดสัปดาห์ */
const MALAYSIA = race({
  round: "16", raceName: "Malaysian Grand Prix", date: "2026-10-04", time: "07:00:00Z",
  Circuit: { circuitId: "sepang", circuitName: "Sepang", Location: { locality: "Kuala Lumpur", country: "Malaysia" } },
  FirstPractice: { date: "2026-10-02", time: "03:30:00Z" },
  Qualifying: { date: "2026-10-03", time: "07:00:00Z" },
});

describe("scriptable-widget.js — แข่งจบแล้วขึ้นสนามถัดไปเอง", () => {
  // ดึงมาตอนเรซบากูกำลังแข่ง (แคชเว็บ/iOS ยังไม่รีเฟรช) แต่วาดตอนเรซจบไปแล้ว
  const duringRace = () => payloadAt("2026-09-26T12:00:00Z", [race(), MALAYSIA]);
  const AFTER_RACE = "2026-09-27T03:00:00Z";

  it("ทุกขนาดขึ้นสนามถัดไป ไม่ค้างสนามเดิม", async () => {
    for (const f of ["small", "medium", "large"] as const) {
      const r = await render(f, AFTER_RACE, duringRace());
      expect(r.texts).toContain("🇲🇾 MALAYSIA");
      expect(r.texts).not.toContain("🇦🇿 AZERBAIJAN");
      expect(r.texts).not.toContain("🏁 จบแล้ว");
      expect(r.texts).toContain("FP1");
    }
  });

  it("หน้าจอล็อกและลิงก์ก็ชี้สนามถัดไป", async () => {
    const rect = await render("accessoryRectangular", AFTER_RACE, duringRace());
    expect(rect.texts).toContain("🇲🇾 MALAYSIA");
    const inline = await render("accessoryInline", AFTER_RACE, duringRace());
    expect(inline.texts.join(" ")).toContain("🇲🇾 FP1");
    const m = await render("medium", AFTER_RACE, duringRace());
    expect(m.url).toBe("https://f1-thai.vercel.app/race/16");
  });

  it("เลยเวลาเริ่มซ้อม 1 ของสนามถัดไปแล้ว → LIVE ของสนามนั้น", async () => {
    const r = await render("small", "2026-10-02T04:00:00Z", duringRace());
    expect(r.texts).toContain("🇲🇾 MALAYSIA");
    expect(r.texts).toContain("● LIVE");
    expect(r.dates).toHaveLength(0);
  });
});

describe("scriptable-widget.js — ตั้งค่าผ่าน Parameter", () => {
  it("race: นับถอยหลังเฉพาะเรซ ข้ามซ้อม/ควอลิฟาย", async () => {
    const r = await run(SRC, { payload: payloadAt(NEAR), family: "small", now: NEAR, param: "race" });
    expect(r.texts).toContain("RACE");
    expect(r.texts).not.toContain("FP1");
    // เรซอีกกว่า 2 วัน → นับเป็นวัน ไม่ใช่ timer ของซ้อม 1
    expect(r.dates).toHaveLength(0);
    expect(r.texts).toContain("วัน");
  });

  it("race: large ยังโชว์ตารางทั้งสุดสัปดาห์ครบ", async () => {
    const r = await run(SRC, { payload: payloadAt(NEAR), family: "large", now: NEAR, param: "race" });
    for (const c of ["FP1", "Q", "RACE"]) expect(r.texts).toContain(c);
  });

  it("race: ระหว่างซ้อมไม่ขึ้น LIVE (ไม่ใช่เรซ)", async () => {
    const r = await run(SRC, { payload: payloadAt(CALM), family: "small", now: "2026-09-24T09:00:00Z", param: "race" });
    expect(r.texts).not.toContain("● LIVE");
    expect(r.texts).toContain("RACE");
  });

  it("พิมพ์ตัวใหญ่หรือหลายคำก็ได้", async () => {
    const r = await run(SRC, { payload: payloadAt(CALM, [race(), MALAYSIA]), family: "small", now: CALM, param: " Race, NOALERT " });
    expect(r.texts).toContain("RACE");
    expect(r.alerts).toHaveLength(0);
  });
});

describe("scriptable-widget.js — แจ้งเตือนก่อนแข่ง", () => {
  const two = () => payloadAt(CALM, [race(), MALAYSIA]);
  const ids = (r: Captured) => r.alerts.map((a) => a.identifier).sort();

  it("ตั้งแจ้งเตือน 30 นาทีก่อน Q / สปรินต์ / เรซ ของสนามนี้และสนามถัดไป (ซ้อมไม่แจ้ง)", async () => {
    const r = await run(SRC, { payload: two(), family: "medium", now: CALM });
    expect(ids(r)).toEqual(["f1wr-15-Q", "f1wr-15-RACE", "f1wr-16-Q", "f1wr-16-RACE"]);
    const q = r.alerts.find((a) => a.identifier === "f1wr-15-Q")!;
    expect(q.at!.toISOString()).toBe("2026-09-25T11:30:00.000Z");
    expect(q.title).toBe("🇦🇿 AZERBAIJAN · Q");
    expect(q.body).toBe("เริ่มอีก 30 นาที (19:00)");
    expect(q.openURL).toBe("https://f1-thai.vercel.app/race/15");
  });

  it("ตั้งใหม่ทุกรอบ: ของเก่าที่เราตั้งถูกแทน ของแอปอื่นไม่แตะ", async () => {
    const alerts = [{ identifier: "f1wr-15-FP1" }, { identifier: "f1wr-15-RACE", title: "old" }, { identifier: "other-app" }];
    const r = await run(SRC, { payload: two(), family: "small", now: CALM, alerts });
    expect(ids(r)).toEqual(["f1wr-15-Q", "f1wr-15-RACE", "f1wr-16-Q", "f1wr-16-RACE", "other-app"]);
    expect(r.alerts.find((a) => a.identifier === "f1wr-15-RACE")!.title).toBe("🇦🇿 AZERBAIJAN · RACE");
  });

  it("เลยเวลาแจ้งไปแล้วไม่ตั้ง", async () => {
    // Q บากู 12:00Z → แจ้ง 11:30Z ผ่านไปแล้ว
    const r = await run(SRC, { payload: two(), family: "small", now: "2026-09-25T11:45:00Z" });
    expect(ids(r)).toEqual(["f1wr-15-RACE", "f1wr-16-Q", "f1wr-16-RACE"]);
  });

  it("noalert: ลบของเราทิ้ง ไม่ตั้งใหม่", async () => {
    const alerts = [{ identifier: "f1wr-15-RACE" }, { identifier: "other-app" }];
    const r = await run(SRC, { payload: two(), family: "small", now: CALM, param: "noalert", alerts });
    expect(ids(r)).toEqual(["other-app"]);
  });

  it("race: แจ้งเฉพาะเรซ", async () => {
    const r = await run(SRC, { payload: two(), family: "small", now: CALM, param: "race" });
    expect(ids(r)).toEqual(["f1wr-15-RACE", "f1wr-16-RACE"]);
  });

  it("ต่อเน็ตไม่ได้ → ไม่แตะแจ้งเตือนเดิม", async () => {
    const alerts = [{ identifier: "f1wr-15-RACE" }];
    const r = await run(SRC, { payload: null, family: "small", now: CALM, alerts });
    expect(ids(r)).toEqual(["f1wr-15-RACE"]);
  });

  it("ไม่มี Notification / iOS ไม่ให้สิทธิ์ → widget ยังวาดได้", async () => {
    for (const notification of ["none", "throws"] as const) {
      const r = await run(SRC, { payload: two(), family: "small", now: CALM, notification });
      expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
    }
  });
});

describe("scriptable-widget.js — เวลาอัปเดตล่าสุด", () => {
  it("ทุกขนาดบอกเวลาที่เว็บสร้างข้อมูล (เวลาเครื่อง)", async () => {
    // CALM = 00:00Z → 07:00 เวลาไทย
    for (const f of ["small", "medium", "large"] as const) {
      expect((await render(f)).texts).toContain("↻07:00");
    }
  });

  it("ข้อมูลรุ่นเก่าไม่มี generatedAt → ไม่ขึ้น ไม่พัง", async () => {
    const p = { ...payloadAt(CALM), generatedAt: undefined };
    const r = await render("small", CALM, p);
    expect(r.texts.some((t) => t.startsWith("↻"))).toBe(false);
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
  });
});

describe("scriptable-widget.js — โหมดโพเดียมหลังเรซ", () => {
  // สองวันหลังเรซสเปน (2026-09-13) — สนามถัดไปยังไม่เริ่ม
  const AFTER = "2026-09-15T00:00:00Z";

  it("ทุกขนาด: สนามถัดไปเป็นหลักเสมอ ชื่อสนามที่แข่งจบแล้วไม่ขึ้นตัวใหญ่", async () => {
    for (const f of ["small", "medium", "large"] as const) {
      const r = await render(f, AFTER);
      expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
      expect(r.texts.join(" ")).not.toContain("SPAIN");
      expect(r.url).toBe("https://f1-thai.vercel.app/race/15");
    }
  });

  it("small: นับถอยหลังสนามถัดไปตามปกติ + ผู้ชนะสนามที่แล้วบรรทัดเดียว (ที่แคบ ไม่ใส่โพเดียม)", async () => {
    const r = await render("small", AFTER);
    expect(r.texts).toContain("FP1");
    expect(r.texts).toContain("วัน");
    expect(r.texts).toContain("HAM ชนะ 🇪🇸");
    expect(r.texts).not.toContain("LEC");
    expect(r.stackUrls).toContain("https://f1-thai.vercel.app/race/14");
    // พ้นช่วงโพเดียมแล้วไม่ขึ้น
    expect((await render("small", CALM)).texts.join(" ")).not.toContain("ชนะ");
  });

  it("medium: โพเดียมสนามที่เพิ่งจบอยู่ขวาแทนตารางคะแนน แตะแล้วเปิดผลสนามนั้น", async () => {
    const r = await render("medium", AFTER);
    expect(r.texts).toContain("ผลล่าสุด 🇪🇸");
    for (const c of ["HAM", "LEC", "RUS"]) expect(r.texts).toContain(c);
    expect(r.texts).not.toContain("ตารางคะแนน");
    expect(r.stackUrls).toContain("https://f1-thai.vercel.app/race/14");
    // ผังสนามยังเป็นสนามถัดไป
    expect(r.tracks).toHaveLength(1);
  });

  it("medium: พ้นช่วงโพเดียมกลับเป็นตารางคะแนน", async () => {
    const r = await render("medium", CALM);
    expect(r.texts).toContain("ตารางคะแนน");
    expect(r.texts).not.toContain("ผลล่าสุด 🇪🇸");
  });

  it("แถบสีขอบซ้ายเป็นสีทีมผู้ชนะสนามล่าสุด (ไม่มีผลก็เป็นแดง F1)", async () => {
    // stack แรกที่ได้สีพื้นคือแถบขอบซ้าย
    expect((await render("small", AFTER)).fills[0]).toBe("#e8002d"); // Ferrari
    expect((await render("small", CALM, payloadAt(CALM, [race()], STANDINGS, null))).fills[0]).toBe("#e10600");
  });
});

describe("scriptable-widget.js — สถานะพิเศษ", () => {
  it("จบฤดูกาลแล้วบอกผู้ใช้ และโชว์โพเดียมสนามสุดท้าย", async () => {
    const r = await render("medium", "2026-12-31T00:00:00Z");
    expect(r.texts.join(" ")).toContain("จบฤดูกาลแล้ว");
    expect(r.texts).toContain("HAM");
    expect(r.dates).toHaveLength(0);
  });

  it("ปฏิทินยังไม่ประกาศก็บอกได้", async () => {
    const r = await render("medium", "2026-01-01T00:00:00Z", payloadAt("2026-01-01T00:00:00Z", []));
    expect(r.texts.join(" ")).toContain("ยังไม่ประกาศ");
  });

  it.each(["small", "medium", "large", "accessoryRectangular", "accessoryCircular", "accessoryInline"] as const)(
    "%s: ต่อเน็ตไม่ได้ → ขึ้นข้อความแทนที่จะ throw",
    async (family) => {
      const r = await render(family, CALM, null);
      expect(r.texts.length).toBeGreaterThan(0);
    },
  );

  it("ไม่มีตารางคะแนนและผลสนามก็ยังวาดได้", async () => {
    const r = await render("large", CALM, payloadAt(CALM, [race()], [], null));
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
    expect(r.texts).not.toContain("VER");
  });

  it("หน้าจอล็อกแบบวงกลม: เกิน 1 วันบอกวัน+เวลา ไม่ถึงวันนับถอยหลัง", async () => {
    const far = await render("accessoryCircular");
    expect(far.texts).toEqual(expect.arrayContaining(["FP1", "พฤ.", "15:30"]));
    expect(far.dates).toHaveLength(0);
    const near = await render("accessoryCircular", "2026-09-24T06:00:00Z");
    expect(near.dates).toHaveLength(1);
  });

  it("หน้าจอล็อกแบบบรรทัดเดียว", async () => {
    const r = await render("accessoryInline");
    expect(r.texts).toEqual(["🇦🇿 FP1 · พฤ. 15:30"]);
  });
});

describe("widget.js (ตัวโหลดที่ดึงโค้ดล่าสุดจากเว็บ)", () => {
  const payload = () => payloadAt(CALM);
  const CACHE = "/docs/f1-widget-cache.js";

  it("ดึงโค้ดจากเว็บมารัน แล้วเก็บสำรองไว้ในเครื่อง", async () => {
    const files = new Map<string, string>();
    const r = await run(LOADER, { payload: payload(), family: "medium", now: CALM, code: { status: 200, body: SRC }, files });
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
    expect(r.texts).toContain("พฤ. 24 ก.ย. · 15:30");
    expect(files.get(CACHE)).toBe(SRC);
  });

  it("ต่อเว็บไม่ได้ → ใช้โค้ดสำรองที่เคยโหลดไว้", async () => {
    const files = new Map([[CACHE, SRC]]);
    const r = await run(LOADER, { payload: payload(), family: "small", now: CALM, code: null, files });
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
  });

  it("เว็บตอบหน้า error → ไม่เอามารัน ไม่ทับโค้ดสำรอง", async () => {
    const files = new Map([[CACHE, SRC]]);
    const html = { status: 404, body: "<!DOCTYPE html><html>F1 Week Race 404</html>" };
    const r = await run(LOADER, { payload: payload(), family: "small", now: CALM, code: html, files });
    expect(r.texts).toContain("🇦🇿 AZERBAIJAN");
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

describe("scriptable-widget.js — ธีมการ์ด (รูปพื้นหลังจากเว็บ + กล่องนับถอยหลัง)", () => {
  const card = (family: Family, now = CALM, extra: Partial<Env> = {}) =>
    run(SRC, { payload: payloadAt(now), family, now, card: {}, ...extra });

  it("ขอรูปขนาดพอดี widget ของรุ่นเครื่อง + session ถัดไป + เขตเวลา แล้วใช้เป็นพื้นหลัง", async () => {
    const r = await card("medium");
    expect(r.cardUrls).toHaveLength(1);
    const q = new URL(r.cardUrls[0]).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      round: "15", size: "medium", w: "338", h: "158", s: "3", theme: "light", next: "FP1", tz: "420",
    });
    expect(r.backgroundImage).toEqual({ card: r.cardUrls[0] });
    // เนื้อหาเดิม (ชื่อสนาม/ตาราง) อยู่ในรูปแล้ว ไม่วาดซ้ำ
    expect(r.texts).not.toContain("ROUND 15");
  });

  it("เครื่องจอใหญ่ / large / โหมดมืด → ขนาดและธีมตาม", async () => {
    const big = await card("large", CALM, { card: { screen: [430, 932], dark: true } });
    const q = new URL(big.cardUrls[0]).searchParams;
    expect([q.get("w"), q.get("h"), q.get("theme")]).toEqual(["364", "382", "dark"]);
    // บังคับธีมผ่าน Parameter ได้
    const light = await card("small", CALM, { card: { dark: true }, param: "light" });
    expect(new URL(light.cardUrls[0]).searchParams.get("theme")).toBe("light");
  });

  it("เกินวัน: กล่องบอก วัน/ชม. ตัวแดง + ไฟสตาร์ทติดตามจำนวนวันที่เหลือ", async () => {
    // CALM = อีก 4 วันกว่าถึงซ้อม 1 → ติด 1 ดวงจาก 5
    const r = await card("small");
    expect(r.texts).toContain("FP1 เริ่มใน");
    expect(r.texts).toContain("วัน");
    expect(r.fills.filter((f) => f === "#ff2a1a")).toHaveLength(1);
    expect(r.fills.filter((f) => f === "#3a0d0b")).toHaveLength(4);
  });

  it("ไม่ถึงวัน: timer ของ iOS สีแดง ไฟติดครบ 5 ดวง · medium บอกชื่อ session ภาษาไทยและเวลา", async () => {
    const r = await card("medium", NEAR);
    expect(r.timers).toHaveLength(1);
    expect(r.timers[0].color).toMatchObject({ hex: "#ff3b2f" });
    expect(r.fills.filter((f) => f === "#ff2a1a")).toHaveLength(5);
    expect(r.texts.some((t) => t.startsWith("ซ้อม 1 · "))).toBe(true);
  });

  it("กำลังแข่ง: LIVE ไม่มี timer ไฟดับหมด และรูปทำเครื่องหมาย live", async () => {
    const r = await card("medium", "2026-09-24T09:00:00Z");
    expect(r.texts).toContain("● LIVE");
    expect(r.timers).toHaveLength(0);
    expect(r.fills.filter((f) => f === "#ff2a1a")).toHaveLength(0);
    expect(new URL(r.cardUrls[0]).searchParams.get("live")).toBe("1");
  });

  it("โหลดรูปไม่ได้ → หน้าตาแบบเดิม (ไม่ว่าง) · Parameter classic → ไม่โหลดรูปเลย", async () => {
    const fail = await card("medium", CALM, { card: { fail: true } });
    expect(fail.texts).toContain("ROUND 15");
    expect(fail.backgroundImage).toBeUndefined();
    const classic = await card("medium", CALM, { param: "classic" });
    expect(classic.cardUrls).toHaveLength(0);
    expect(classic.texts).toContain("ROUND 15");
  });

  it("หน้าจอล็อกไม่ใช้การ์ด", async () => {
    const r = await card("accessoryRectangular");
    expect(r.cardUrls).toHaveLength(0);
  });
});
