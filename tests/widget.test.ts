import { describe, expect, it } from "vitest";
import { buildWidgetPayload } from "@/lib/widget";
import type { DriverStanding, Race } from "@/lib/f1";

const race = (over: Partial<Race> = {}): Race => ({
  season: "2026", round: "1", raceName: "Test GP",
  date: "2026-03-08", time: "06:00:00Z",
  Circuit: {
    circuitId: "albert_park", circuitName: "Albert Park",
    Location: { locality: "Melbourne", country: "Australia" },
  },
  FirstPractice: { date: "2026-03-06", time: "01:30:00Z" },
  Qualifying: { date: "2026-03-07", time: "05:00:00Z" },
  ...over,
});

const standing = (over: Partial<DriverStanding> = {}): DriverStanding => ({
  position: "1", points: "310", wins: "8",
  Driver: {
    driverId: "max_verstappen", givenName: "Max", familyName: "Verstappen",
    nationality: "Dutch", permanentNumber: "33", code: "VER",
  },
  Constructors: [{ constructorId: "red_bull", name: "Red Bull" }],
  ...over,
});

const at = (iso: string) => new Date(iso);
const build = (races: Race[], standings: DriverStanding[], now: string) =>
  buildWidgetPayload({ season: 2026, races, standings, now: at(now) });

describe("buildWidgetPayload", () => {
  it("ปฏิทินว่าง → no-calendar", () => {
    const p = build([], [standing()], "2026-01-01T00:00:00Z");
    expect(p.state).toBe("no-calendar");
    expect(p.race).toBeNull();
    expect(p.session).toBeNull();
    // ตารางคะแนนยังส่งได้แม้ไม่มีปฏิทิน
    expect(p.leader?.name).toBe("M. Verstappen");
  });

  it("แข่งจบหมดแล้ว → season-over", () => {
    const p = build([race()], [standing()], "2026-12-31T00:00:00Z");
    expect(p.state).toBe("season-over");
    expect(p.race).toBeNull();
  });

  it("ยังไม่ถึงเวลา → upcoming พร้อมสนามและ session ถัดไป", () => {
    const p = build([race()], [standing()], "2026-03-01T00:00:00Z");
    expect(p.state).toBe("upcoming");
    expect(p.race).toMatchObject({
      round: "1", name: "Test GP", circuit: "Albert Park",
      circuitId: "albert_park", locality: "Melbourne", country: "Australia",
      startsAt: "2026-03-08T06:00:00.000Z", isSprint: false,
    });
    expect(p.session).toEqual({ label: "ซ้อม 1", startsAt: "2026-03-06T01:30:00.000Z" });
  });

  it("session เริ่มไปแล้วแต่ยังไม่จบ → live", () => {
    const p = build([race()], [standing()], "2026-03-06T02:00:00Z");
    expect(p.state).toBe("live");
    expect(p.session?.label).toBe("ซ้อม 1");
  });

  it("ซ้อมจบแล้วแต่ยังไม่ถึงควอลิฟาย → กลับไป upcoming", () => {
    const p = build([race()], [standing()], "2026-03-06T04:00:00Z");
    expect(p.state).toBe("upcoming");
    expect(p.session?.label).toBe("Qualifying");
  });

  it("ข้ามสนามที่แข่งจบแล้วไปสนามถัดไป", () => {
    const rs = [race({ round: "1" }), race({ round: "2", date: "2026-03-22" })];
    const p = build(rs, [standing()], "2026-03-15T00:00:00Z");
    expect(p.race?.round).toBe("2");
  });

  it("ติดธง sprint เมื่อสุดสัปดาห์นั้นมีสปรินต์", () => {
    const p = build([race({ Sprint: { date: "2026-03-07", time: "03:00:00Z" } })],
                    [standing()], "2026-03-01T00:00:00Z");
    expect(p.race?.isSprint).toBe(true);
  });

  it("ไม่มีตารางคะแนน → leader เป็น null ไม่ throw", () => {
    const p = build([race()], [], "2026-03-01T00:00:00Z");
    expect(p.leader).toBeNull();
    expect(p.state).toBe("upcoming");
  });

  it("ใช้ทีมล่าสุดของนักขับเมื่อย้ายทีมกลางฤดูกาล", () => {
    const s = standing({ Constructors: [
      { constructorId: "rb", name: "Racing Bulls" },
      { constructorId: "red_bull", name: "Red Bull" },
    ] });
    expect(build([race()], [s], "2026-03-01T00:00:00Z").leader?.constructorId).toBe("red_bull");
  });

  it("เวลาทุกช่องเป็น ISO ที่ parse กลับได้", () => {
    const p = build([race()], [standing()], "2026-03-01T00:00:00Z");
    for (const iso of [p.generatedAt, p.race!.startsAt, p.session!.startsAt]) {
      expect(Number.isNaN(Date.parse(iso))).toBe(false);
      expect(iso).toMatch(/Z$/);
    }
  });

  it("payload ทั้งก้อน serialise เป็น JSON ได้และเล็ก", () => {
    const json = JSON.stringify(build([race()], [standing()], "2026-03-01T00:00:00Z"));
    expect(JSON.parse(json).state).toBe("upcoming");
    expect(json.length).toBeLessThan(600);
  });
});
