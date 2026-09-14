import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_MINUTES, SESSION_MINUTES, findNextRace, firstRaceWithoutResults,
  formatInTz, getNextSession, getSessions, getUpcomingRaces, isPastRace,
  isSprintWeekend, resultsGap, toDate, type Race,
} from "@/lib/f1";
import { SCHEDULE_FALLBACK } from "@/lib/schedule-fallback";
import { CIRCUIT_TZ, TH_TZ } from "@/lib/tz";

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

const at = (iso: string) => new Date(iso);

describe("toDate", () => {
  it("ไม่มีเวลา ให้ถือเป็นเที่ยงคืน UTC", () => {
    expect(toDate({ date: "2026-03-08" })?.toISOString()).toBe("2026-03-08T00:00:00.000Z");
  });
  it("คืน null เมื่อไม่มีวันที่", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});

describe("getSessions", () => {
  it("เรียงตามเวลาและตัด session ที่ไม่มีออก", () => {
    const s = getSessions(race());
    expect(s.map((x) => x.label)).toEqual(["ซ้อม 1", "Qualifying", "Race"]);
    expect(s.map((x) => x.at.getTime())).toEqual([...s.map((x) => x.at.getTime())].sort((a, b) => a - b));
  });
});

describe("SESSION_MINUTES", () => {
  // เดิมหน้า .ics เดาความยาวจากการ match ชื่อ ทำให้ Sprint Quali ได้ 60 นาทีแทน 45
  it("Sprint Quali สั้นกว่า Qualifying", () => {
    expect(SESSION_MINUTES["Sprint Quali"]).toBe(45);
    expect(SESSION_MINUTES.Qualifying).toBe(60);
  });

  it("ครอบคลุมทุกป้ายที่ getSessions คืนจากปฏิทินจริง ไม่มีตัวไหนตกไป DEFAULT", () => {
    const labels = new Set(
      Object.values(SCHEDULE_FALLBACK).flatMap((rs) => rs.flatMap((r) => getSessions(r).map((s) => s.label))),
    );
    expect(labels.size).toBeGreaterThan(0);
    for (const l of labels) expect(SESSION_MINUTES[l], `ป้าย "${l}" ไม่มีในตาราง`).toBeDefined();
    expect(DEFAULT_SESSION_MINUTES).toBeGreaterThan(0);
  });
});

describe("getNextSession", () => {
  it("ข้าม session ที่จบแล้ว", () => {
    expect(getNextSession(race(), at("2026-03-06T04:00:00Z"))?.label).toBe("Qualifying");
  });
  it("ยังนับ session ที่กำลังแข่งว่าเป็นตัวถัดไป", () => {
    expect(getNextSession(race(), at("2026-03-06T02:00:00Z"))?.label).toBe("ซ้อม 1");
  });
  it("คืน null เมื่อจบสุดสัปดาห์แล้ว", () => {
    expect(getNextSession(race(), at("2026-03-09T00:00:00Z"))).toBeNull();
  });
});

describe("หน้าต่างรอบ ๆ การแข่ง", () => {
  it("ยังถือว่าไม่จบจนพ้น 2 ชม.หลังสตาร์ท", () => {
    expect(findNextRace([race()], at("2026-03-08T07:30:00Z"))?.round).toBe("1");
    expect(findNextRace([race()], at("2026-03-08T08:30:00Z"))).toBeUndefined();
  });

  it.each([
    ["ยังไม่เริ่ม", "2026-03-08T05:00:00Z", null],
    ["กำลังแข่ง", "2026-03-08T07:00:00Z", "live"],
    ["จบแล้วรอผล", "2026-03-08T09:00:00Z", "awaiting"],
    ["เลยช่วงรอ", "2026-03-12T00:00:00Z", null],
  ])("resultsGap: %s", (_n, now, want) => {
    expect(resultsGap(race(), at(now).getTime())).toBe(want);
  });

  it("isPastRace ยึดเวลาสตาร์ท", () => {
    expect(isPastRace(race(), at("2026-03-08T05:59:00Z"))).toBe(false);
    expect(isPastRace(race(), at("2026-03-08T06:01:00Z"))).toBe(true);
  });

  it("getUpcomingRaces คืนตามจำนวนที่ขอ เรียงจากใกล้สุด", () => {
    const rs = [race({ round: "1" }), race({ round: "2", date: "2026-03-22" }), race({ round: "3", date: "2026-04-05" })];
    expect(getUpcomingRaces(rs, 2, at("2026-03-01T00:00:00Z")).map((r) => r.round)).toEqual(["1", "2"]);
  });

  it("firstRaceWithoutResults ข้ามสนามที่มีผลแล้ว", () => {
    const rs = [race({ round: "1" }), race({ round: "2", date: "2026-03-09" })];
    const found = firstRaceWithoutResults(rs, (r) => r.round === "1", at("2026-03-09T12:00:00Z").getTime());
    expect(found?.round).toBe("2");
  });

  it("isSprintWeekend ดูจาก Sprint หรือ SprintQualifying", () => {
    expect(isSprintWeekend(race())).toBe(false);
    expect(isSprintWeekend(race({ Sprint: { date: "2026-03-07" } }))).toBe(true);
    expect(isSprintWeekend(race({ SprintQualifying: { date: "2026-03-06" } }))).toBe(true);
  });
});

describe("formatInTz", () => {
  const d = at("2026-09-13T13:00:00Z"); // วันอาทิตย์ 20:00 เวลาไทย

  it("ใช้ปี ค.ศ. ไม่ใช่ พ.ศ.", () => {
    expect(formatInTz(d, "full")).toContain("2026");
    expect(formatInTz(d, "full")).not.toContain("2569");
  });

  it("เคารพโซนเวลาที่ส่งเข้ามา", () => {
    expect(formatInTz(d, "time", TH_TZ)).toBe("20:00");
    expect(formatInTz(d, "time", CIRCUIT_TZ.monza)).toBe("15:00");
  });

  // บั๊กเดิม: weekday:"short" ของ Intl ให้ "อาทิตย์" บน Node แต่ "อา." บนเบราว์เซอร์
  // → hydration mismatch ทุกหน้าที่มีชื่อวัน ต้องล็อกไว้ว่าใช้ตัวย่อของเราเอง
  it("ใช้ชื่อวันย่อของเราเอง ไม่พึ่ง ICU", () => {
    expect(formatInTz(d, "date", TH_TZ)).toBe("อา. 13 ก.ย.");
    expect(formatInTz(d, "full", TH_TZ)).toBe("อา. 13 ก.ย. 2026 20:00");
  });

  it("ชื่อวันเปลี่ยนตามโซนเวลาเมื่อข้ามวัน", () => {
    const midnight = at("2026-09-13T20:00:00Z"); // ไทยคือ 14 (จันทร์), ลอสแอนเจลิสยังเป็น 13 (อาทิตย์)
    expect(formatInTz(midnight, "date", TH_TZ)).toBe("จ. 14 ก.ย.");
    expect(formatInTz(midnight, "date", CIRCUIT_TZ.vegas)).toBe("อา. 13 ก.ย.");
  });

  it("kind time ไม่มีชื่อวันนำหน้า", () => {
    expect(formatInTz(d, "time")).toMatch(/^\d{2}:\d{2}$/);
  });
});
