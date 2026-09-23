import { afterEach, describe, expect, it } from "vitest";
import {
  getConstructorSeasonResults, getConstructorSeasonResultsOrThrow, getConstructorStandings,
  getConstructorStandingsOrThrow, getDriverSeasonResults, getDriverSeasonResultsOrThrow,
  getDriverStandings, getDriverStandingsOrThrow,
} from "@/lib/f1";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** จำลอง Jolpica: ตัดหน้าตาม "แถวผล" ไม่ใช่ตามสนาม — ค่าตั้งต้น 30 แถว สูงสุด 100 */
function fakeJolpica(rounds: number, carsPerRace: number) {
  const rows = Array.from({ length: rounds }, (_, i) =>
    Array.from({ length: carsPerRace }, (_, c) => ({ round: String(i + 1), pos: carsPerRace - c })),
  ).flat();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    type FakeRace = { round: string; season: string; raceName: string; Results: object[] };
    const Races: FakeRace[] = [];
    for (const r of rows.slice(offset, offset + limit)) {
      let race = Races.at(-1);
      if (!race || race.round !== r.round) {
        race = { round: r.round, season: "2026", raceName: `GP ${r.round}`, Results: [] };
        Races.push(race);
      }
      race.Results.push({ position: String(r.pos), Driver: { driverId: `d${r.pos}` } });
    }
    const body = { MRData: { total: String(rows.length), RaceTable: { Races } } };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("getConstructorSeasonResults", () => {
  it("เก็บครบทุกสนามแม้ผลของทีมเกิน 30 แถว (รถ 2 คัน × 20 สนาม)", async () => {
    fakeJolpica(20, 2);
    const races = await getConstructorSeasonResults(2026, "mclaren");
    expect(races.map((r) => r.round)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(races.every((r) => r.results.length === 2)).toBe(true);
  });

  it("รวมผลของสนามที่ถูกตัดคร่อมหน้า แล้วเรียงตามอันดับ", async () => {
    fakeJolpica(60, 3); // 180 แถว → หน้าแรก 100 แถวจบกลางสนามที่ 34
    const races = await getConstructorSeasonResults(2026, "mclaren");
    expect(races).toHaveLength(60);
    expect(races[33].results.map((r) => r.position)).toEqual(["1", "2", "3"]);
  });
});

describe("…OrThrow — แยก 'ดึงไม่ได้' ออกจาก 'ไม่มีข้อมูล'", () => {
  // 400 ไม่ retry → เทสต์ไม่ต้องรอ backoff
  const jolpicaDown = () => {
    globalThis.fetch = (async () => new Response("bad", { status: 400 })) as typeof fetch;
  };

  it.each([
    ["driver standings", () => getDriverStandingsOrThrow(2026), () => getDriverStandings(2026)],
    ["team standings", () => getConstructorStandingsOrThrow(2026), () => getConstructorStandings(2026)],
    ["driver results", () => getDriverSeasonResultsOrThrow(2026, "norris"), () => getDriverSeasonResults(2026, "norris")],
    ["team results", () => getConstructorSeasonResultsOrThrow(2026, "mclaren"), () => getConstructorSeasonResults(2026, "mclaren")],
  ])("%s: ตัว OrThrow throw ส่วนตัวปกติคืน []", async (_, strict, lenient) => {
    jolpicaDown();
    await expect(strict()).rejects.toThrow(/Jolpica/);
    await expect(lenient()).resolves.toEqual([]);
  });
});
