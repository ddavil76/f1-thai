import { describe, expect, it } from "vitest";
import type { PitStop, RaceResult } from "@/lib/f1";
import { parseDuration, seasonPitRanking, summarizeRacePits } from "@/lib/pitstops";

const driver = (driverId: string, team: string): RaceResult => ({
  position: "1",
  points: "0",
  grid: "1",
  status: "Finished",
  Driver: { driverId, givenName: driverId.toUpperCase(), familyName: driverId },
  Constructor: { constructorId: team, name: team },
});

const stop = (driverId: string, duration: string, lap = "10", n = "1"): PitStop => ({
  driverId,
  lap,
  stop: n,
  time: "15:00:00",
  duration,
});

describe("parseDuration", () => {
  it("อ่านได้ทั้งวินาทีและ นาที:วินาที", () => {
    expect(parseDuration("31.843")).toBeCloseTo(31.843);
    expect(parseDuration("1:02.596")).toBeCloseTo(62.596);
    expect(parseDuration("16:12.356")).toBeCloseTo(972.356);
  });
  it("รูปแบบแปลก ๆ คืน null", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});

describe("summarizeRacePits", () => {
  const results = [driver("a", "red"), driver("b", "red"), driver("c", "blue"), driver("d", "blue")];

  it("ตัดพิทช่วงธงแดงกับพิทช้าผิดปกติ แล้วเรียงทีมตามค่ากลาง", () => {
    const s = summarizeRacePits(
      [
        stop("a", "20.1"),
        stop("b", "20.5"),
        stop("c", "21.0"),
        stop("d", "22.0"),
        stop("a", "16:12.356", "30", "2"), // จอดรอธงแดง
        stop("c", "40.0", "31", "2"), // ช้ากว่าค่ากลาง (21) เกิน 1.5 เท่า
      ],
      results,
    )!;
    expect(s.excluded).toBe(2);
    expect(s.stops.map((x) => x.seconds)).toEqual([20.1, 20.5, 21, 22]);
    expect(s.teams.map((t) => t.constructorId)).toEqual(["red", "blue"]);
    expect(s.teams[1]).toMatchObject({ stops: 2, best: 21, median: 21.5 });
  });

  it("นักขับที่ไม่อยู่ในผลการแข่งไม่นับ และไม่มีพิทเลย → null", () => {
    expect(summarizeRacePits([stop("zzz", "20.0")], results)).toBeNull();
    expect(summarizeRacePits([], results)).toBeNull();
  });
});

describe("seasonPitRanking", () => {
  it("จัดอันดับด้วยอันดับเฉลี่ยต่อสนาม นับครั้งที่เร็วสุด และเก็บพิทเร็วสุดของทีม", () => {
    const results = [driver("a", "red"), driver("c", "blue")];
    const race = (round: string, ta: string, tc: string) => ({
      round,
      raceName: `R${round}`,
      summary: summarizeRacePits([stop("a", ta), stop("c", tc)], results)!,
    });
    const { teams, fastest } = seasonPitRanking([
      race("1", "20", "21"),
      race("2", "30", "25"),
      race("3", "19", "22"),
    ]);

    expect(teams.map((t) => t.constructorId)).toEqual(["red", "blue"]);
    expect(teams[0]).toMatchObject({ races: 3, raceWins: 2, stops: 3 });
    expect(teams[0].avgRank).toBeCloseTo(4 / 3);
    expect(teams[1].best).toMatchObject({ seconds: 21, round: "1" });
    expect(fastest.map((f) => f.stop.driverId)).toEqual(["a", "c", "a"]);
  });
});
