import { describe, expect, it } from "vitest";
import {
  PODIUM_DAYS, TRACK_MAX_POINTS, buildWidgetPayload, raceShort, widgetTrack,
} from "@/lib/widget";
import type { DriverStanding, Race, RaceWithResults } from "@/lib/f1";

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
    expect(p.session).toMatchObject({
      code: "FP1", label: "ซ้อม 1", startsAt: "2026-03-06T01:30:00.000Z",
    });
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

  it("payload ทั้งก้อน serialise เป็น JSON ได้และยังเล็ก (ผังสนามกินที่มากสุด)", () => {
    const json = JSON.stringify(build([race()], [standing()], "2026-03-01T00:00:00Z"));
    expect(JSON.parse(json).state).toBe("upcoming");
    // ~1.3 KB กับผังสนาม 64 จุด — ดึงวันละไม่กี่สิบครั้ง ยังไม่ถึง 100 KB ต่อวัน
    expect(json.length).toBeLessThan(2500);
  });
});

/* ---------- ข้อมูลสำหรับหน้าตา widget รุ่นใหม่ ---------- */

const lastResults = (over: Partial<RaceWithResults> = {}): RaceWithResults => ({
  ...race({ round: "14", raceName: "Spanish Grand Prix", date: "2026-02-22",
    Circuit: { circuitId: "catalunya", circuitName: "Catalunya",
      Location: { locality: "Barcelona", country: "Spain" } } }),
  Results: (["hamilton", "leclerc", "russell"] as const).map((id, i) => ({
    position: String(i + 1), points: "0", grid: "1", status: "Finished",
    Driver: { driverId: id, givenName: id.toUpperCase(), familyName: id[0].toUpperCase() + id.slice(1), code: id.slice(0, 3).toUpperCase() },
    Constructor: { constructorId: i === 2 ? "mercedes" : "ferrari", name: "x" },
  })),
  ...over,
});

describe("buildWidgetPayload — ฟีลด์ใหม่", () => {
  it("ชื่อสั้นแบบแอป F1 (ชื่อประเทศ ไม่ใช่ SPANISH) และธงประเทศของสนาม", () => {
    const p = build([race({ raceName: "Australian Grand Prix" })], [standing()], "2026-03-01T00:00:00Z");
    expect(p.race).toMatchObject({ short: "Australia", flag: "🇦🇺" });
    const at = (country: string, locality: string) =>
      race({ Circuit: { circuitId: locality, circuitName: locality, Location: { locality, country } } });
    const season = [at("USA", "Miami"), at("USA", "Las Vegas"), at("UK", "Silverstone"), at("UAE", "Abu Dhabi"), at("Spain", "Madrid")];
    // หลายสนามในประเทศเดียวกัน → ใช้ชื่อเมือง
    expect(raceShort(season[0], season)).toBe("Miami");
    expect(raceShort(season[1], season)).toBe("Las Vegas");
    // ประเทศเดียวสนามเดียว → ชื่อประเทศแบบแอป F1
    expect(raceShort(season[2], season)).toBe("Great Britain");
    expect(raceShort(season[3], season)).toBe("Abu Dhabi");
    expect(raceShort(season[4], season)).toBe("Spain");
  });

  it("ทุก session ของสุดสัปดาห์พร้อมรหัสแบบ F1 เรียงตามเวลา", () => {
    const sprint = race({
      SprintQualifying: { date: "2026-03-06", time: "05:30:00Z" },
      Sprint: { date: "2026-03-07", time: "01:00:00Z" },
    });
    const p = build([sprint], [standing()], "2026-03-01T00:00:00Z");
    expect(p.sessions.map((s) => s.code)).toEqual(["FP1", "SQ", "SPRINT", "Q", "RACE"]);
    for (const s of p.sessions) expect(Date.parse(s.endsAt)).toBeGreaterThan(Date.parse(s.startsAt));
  });

  it("ผังสนามย่อไม่เกินจำนวนจุดที่กำหนด และอยู่ในกล่อง w×h", () => {
    const t = widgetTrack("albert_park")!;
    expect(t.pts.length % 2).toBe(0);
    expect(t.pts.length / 2).toBeLessThanOrEqual(TRACK_MAX_POINTS);
    expect(t.pts.length / 2).toBeGreaterThan(10);
    for (let i = 0; i < t.pts.length; i += 2) {
      expect(t.pts[i]).toBeGreaterThanOrEqual(0);
      expect(t.pts[i]).toBeLessThanOrEqual(t.w + 0.1);
      expect(t.pts[i + 1]).toBeLessThanOrEqual(t.h + 0.1);
    }
    expect(widgetTrack("no_such_circuit")).toBeNull();
  });

  it("top 3 ตารางคะแนนพร้อมรหัสนักขับ", () => {
    const s2 = standing({ position: "2", points: "280", Driver: { ...standing().Driver, driverId: "norris", givenName: "Lando", familyName: "Norris", code: "NOR" }, Constructors: [{ constructorId: "mclaren", name: "McLaren" }] });
    const p = build([race()], [standing(), s2], "2026-03-01T00:00:00Z");
    expect(p.top3).toEqual([
      { code: "VER", name: "M. Verstappen", points: 310, constructorId: "red_bull" },
      { code: "NOR", name: "L. Norris", points: 280, constructorId: "mclaren" },
    ]);
  });

  it("สนามล่าสุด: โพเดียม ธง และชื่อสั้น", () => {
    const p = buildWidgetPayload({ season: 2026, races: [race()], standings: [], lastResults: lastResults(), now: at("2026-02-23T00:00:00Z") });
    expect(p.lastRace).toMatchObject({ round: "14", short: "Spain", flag: "🇪🇸" });
    expect(p.lastRace!.podium.map((d) => d.code)).toEqual(["HAM", "LEC", "RUS"]);
    expect(p.lastRace!.podium[0].constructorId).toBe("ferrari");
  });

  it(`โชว์โพเดียมเฉพาะ ${PODIUM_DAYS} วันหลังเรซ และไม่ใช่ตอนกำลังแข่ง`, () => {
    const payload = (now: string) =>
      buildWidgetPayload({ season: 2026, races: [race()], standings: [], lastResults: lastResults(), now: at(now) });
    // เรซ 14 สตาร์ท 2026-02-22T06:00Z
    expect(payload("2026-02-23T00:00:00Z").showPodium).toBe(true);
    expect(payload("2026-02-25T17:00:00Z").showPodium).toBe(true);
    expect(payload("2026-02-26T00:00:00Z").showPodium).toBe(false);
    // ซ้อม 1 ของสนามถัดไปกำลังแข่ง → นับถอยหลังสำคัญกว่า
    const live = buildWidgetPayload({ season: 2026, races: [race({ FirstPractice: { date: "2026-02-23", time: "00:00:00Z" } })], standings: [], lastResults: lastResults(), now: at("2026-02-23T00:30:00Z") });
    expect(live.state).toBe("live");
    expect(live.showPodium).toBe(false);
  });

  it("ผลไม่ครบ 3 คน → ไม่มีโพเดียม", () => {
    const short = lastResults();
    short.Results = short.Results.slice(0, 2);
    const p = buildWidgetPayload({ season: 2026, races: [race()], standings: [], lastResults: short, now: at("2026-02-23T00:00:00Z") });
    expect(p.lastRace).toBeNull();
    expect(p.showPodium).toBe(false);
  });

  it("จบฤดูกาลแล้วโชว์โพเดียมสนามสุดท้าย", () => {
    const p = buildWidgetPayload({ season: 2026, races: [race()], standings: [], lastResults: lastResults(), now: at("2026-12-31T00:00:00Z") });
    expect(p.state).toBe("season-over");
    expect(p.showPodium).toBe(true);
  });
});

