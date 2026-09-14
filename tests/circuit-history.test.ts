import { describe, expect, it } from "vitest";
import type { RaceWithResults } from "@/lib/f1";
import { summarizeCircuit } from "@/lib/circuit-history";

const win = (season: string, driverId: string, team: string, round = "10"): RaceWithResults => ({
  season,
  round,
  raceName: "Test GP",
  date: `${season}-09-01`,
  Circuit: {
    circuitId: "test",
    circuitName: "Test",
    Location: { locality: "", country: "" },
  },
  Results: [
    {
      position: "1",
      points: "25",
      grid: "1",
      status: "Finished",
      Driver: { driverId, givenName: driverId, familyName: driverId.toUpperCase() },
      Constructor: { constructorId: team, name: team },
    },
  ],
});

describe("summarizeCircuit", () => {
  it("ไม่มีผู้ชนะเลย → null", () => {
    expect(summarizeCircuit([])).toBeNull();
  });

  it("นับครั้ง ผู้ชนะมากสุด (เสมอให้คนล่าสุด) และผู้ชนะล่าสุด", () => {
    const h = summarizeCircuit(
      [
        win("2019", "ham", "mercedes"),
        win("2020", "ham", "mercedes"),
        win("2021", "ver", "red_bull"),
        win("2022", "ver", "red_bull"),
        win("2023", "lec", "ferrari"),
      ],
      3,
    )!;
    expect(h.total).toBe(5);
    expect(h.firstSeason).toBe("2019");
    expect(h.topDriver).toMatchObject({ id: "ver", wins: 2, ties: 1 });
    expect(h.topTeam).toMatchObject({ id: "red_bull", wins: 2, ties: 1 });
    expect(h.recent.map((r) => r.season)).toEqual(["2023", "2022", "2021"]);
  });

  it("เรียงตามปีเองแม้ข้อมูลเข้ามาไม่เรียง และสนามใหม่มีครั้งเดียวก็สรุปได้", () => {
    const h = summarizeCircuit([win("2024", "nor", "mclaren"), win("2010", "vet", "red_bull")])!;
    expect(h.firstSeason).toBe("2010");
    expect(h.recent[0].season).toBe("2024");
    expect(summarizeCircuit([win("2026", "ant", "mercedes")])).toMatchObject({ total: 1 });
  });
});
