import { describe, expect, it } from "vitest";
import { tallyLeader, type QualifyingResult, type RaceResult } from "@/lib/f1";

const person = (driverId: string, team = "mercedes") => ({
  Driver: { driverId, givenName: driverId.toUpperCase(), familyName: driverId },
  Constructor: { constructorId: team, name: team },
});

const quali = (position: string, driverId: string): QualifyingResult => ({
  position,
  ...person(driverId),
});

const fastest = (driverId: string, rank: string): Pick<RaceResult, "Driver" | "Constructor" | "FastestLap"> => ({
  ...person(driverId),
  FastestLap: { rank, lap: "40" },
});

describe("tallyLeader", () => {
  it("pole: นับเฉพาะแถว position 1 แม้ Jolpica จะพ่วงอันดับอื่นมาและไม่ได้เรียงไว้", () => {
    const leader = tallyLeader(
      [
        { QualifyingResults: [quali("4", "leclerc"), quali("1", "antonelli")] },
        { QualifyingResults: [quali("1", "russell"), quali("2", "antonelli")] },
        { QualifyingResults: [quali("1", "antonelli"), quali("7", "hadjar")] },
      ],
      "QualifyingResults",
    );
    expect(leader).toMatchObject({ driverId: "antonelli", count: 2, name: "A. antonelli" });
  });

  it("fastest lap: ใช้แถวที่ FastestLap.rank เป็น 1", () => {
    const leader = tallyLeader(
      [
        { Results: [fastest("norris", "3"), fastest("leclerc", "1")] },
        { Results: [fastest("leclerc", "1")] },
        { Results: [fastest("russell", "1")] },
      ],
      "Results",
    );
    expect(leader).toMatchObject({ driverId: "leclerc", count: 2 });
  });

  it("ไม่มีข้อมูล → null", () => {
    expect(tallyLeader([], "QualifyingResults")).toBeNull();
    expect(tallyLeader([{ QualifyingResults: [quali("3", "x")] }], "QualifyingResults")).toBeNull();
  });
});
