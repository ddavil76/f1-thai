import { SCHEDULE_FALLBACK } from "./schedule-fallback";
import {
  RACE_TAIL_MS, RESULTS_WAIT_MS, pickSession, type SessionWindow,
} from "./race-window";
import { createGate, fetchRetry } from "./http";

export type SessionTime = { date: string; time?: string };

export type Race = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    url?: string;
    Location: { locality: string; country: string; lat?: string; long?: string };
  };
  FirstPractice?: SessionTime;
  SecondPractice?: SessionTime;
  ThirdPractice?: SessionTime;
  Qualifying?: SessionTime;
  Sprint?: SessionTime;
  SprintQualifying?: SessionTime;
};

export type DriverStanding = {
  position: string;
  points: string;
  wins: string;
  Driver: {
    driverId: string;
    permanentNumber?: string;
    code?: string;
    url?: string;
    givenName: string;
    familyName: string;
    nationality: string;
  };
  Constructors: { constructorId: string; name: string }[];
};

export type ConstructorStanding = {
  position: string;
  points: string;
  wins: string;
  Constructor: { constructorId: string; name: string; nationality: string };
};

export type RaceResult = {
  number?: string;
  position: string;
  points: string;
  grid: string;
  laps?: string;
  status: string;
  Driver: {
    driverId: string;
    code?: string;
    permanentNumber?: string;
    url?: string;
    givenName: string;
    familyName: string;
    nationality?: string;
  };
  Constructor: { constructorId: string; name: string };
  Time?: { time: string };
  FastestLap?: { rank: string; lap: string; Time?: { time: string } };
};

/** race + ผลการแข่ง (ใช้ทั้งการ์ดโพเดียมและหน้าผลเต็ม) */
export type RaceWithResults = Race & { Results: RaceResult[] };

/**
 * จบการแข่งและได้รับการจัดอันดับ — ปี 2026 Jolpica ใช้สถานะ "Lapped" กับรถที่โดนน็อครอบ
 * (ปีก่อน ๆ เป็น "+1 Lap") เช็คแค่ "Finished"/"+" จะนับรถพวกนี้เป็น DNF ผิด ๆ
 */
export const isClassifiedFinish = (status: string) =>
  status === "Finished" || status === "Lapped" || status.startsWith("+");

const BASE = "https://api.jolpi.ca/ergast/f1";

/**
 * ตอน build ยิง Jolpica รวดเดียวหลายสิบ request (limit ของเขา 4 req/วินาทีต่อ IP และ
 * IP ของเครื่อง build บน Vercel ใช้ร่วมกับคนอื่น) ถ้ายอมแพ้เร็ว หน้าที่ prerender จะติดค่าว่าง
 * ไปจนกว่าจะมีคนเข้ามากระตุ้นให้สร้างใหม่ — เคยเห็นหน้าผลการแข่งขึ้น "แข่งไปแล้ว 0 สนาม"
 */
const BUILDING = process.env.NEXT_PHASE === "phase-production-build";

/**
 * จำกัดจำนวน request พร้อมกันไป Jolpica — ช่วยลดการชนเพดานได้บ้าง แต่รับประกันไม่ได้
 * (แต่ละ route bundle อาจได้ gate ของตัวเอง) ตัวที่กันข้อมูลว่างจริงคือการ retry ด้านล่าง
 */
const gate = createGate(BUILDING ? 2 : 4);

/** เรียก Jolpica พร้อม retry + จำกัด concurrency — API ตัวนี้ rate-limit บ่อย */
async function jolpica<T>(path: string, revalidate = 3600, query = ""): Promise<T> {
  try {
    const res = await fetchRetry(`${BASE}/${path}?format=json${query}`, {
      source: "Jolpica",
      init: { next: { revalidate } } as RequestInit,
      // ตอน build ยอมรอนาน (~1, 2, 4, 8, 16, 32 วิ) และสุ่มระยะ กันคำขอที่โดน 429 พร้อมกัน
      // กลับมายิงพร้อมกันอีกรอบ · ตอนรันจริงคงนโยบายเดิม ไม่ให้หน้าเว็บค้างรอ
      attempts: BUILDING ? 7 : 4,
      backoffMs: BUILDING
        ? (n) => 1000 * 2 ** (n - 1) * (0.5 + Math.random())
        : (n) => 500 * 2 ** (n - 1), // 0.5s, 1s, 2s
      gate, // ห่อเฉพาะตอนยิง — ระหว่าง backoff ปล่อยสล็อตให้คนอื่นใช้
    });
    return (await res.json()) as T;
  } catch (err) {
    // ผู้เรียกทุกตัวกลืน error แล้วคืนค่าว่าง — ไม่ log ตรงนี้จะไม่มีร่องรอยเลยว่าข้อมูลหายเพราะอะไร
    console.warn(`[jolpica] gave up on ${path}${query}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

type RacesPage<K extends string, Item> = {
  MRData: { total: string; RaceTable?: { Races?: (Race & Partial<Record<K, Item[]>>)[] } };
};

/**
 * ดึงครบทุกหน้า — Jolpica ให้สูงสุด 100 แถวต่อ request และ race ที่แถวยาวคร่อมหน้า
 * จะโผล่ซ้ำในหน้าถัดไปพร้อมแถวที่เหลือ → รวมกลับเป็น race เดียวด้วย season+round
 */
async function jolpicaRaces<K extends string, Item>(
  path: string,
  revalidate: number,
  listKey: K,
): Promise<(Race & Record<K, Item[]>)[]> {
  const LIMIT = 100;
  const MAX_PAGES = 20;
  const merged = new Map<string, Race & Record<K, Item[]>>();
  let total = Infinity;
  for (let page = 0; page * LIMIT < total && page < MAX_PAGES; page++) {
    const d = await jolpica<RacesPage<K, Item>>(
      path,
      revalidate,
      `&limit=${LIMIT}&offset=${page * LIMIT}`,
    );
    total = Number(d.MRData.total) || 0;
    for (const race of d.MRData.RaceTable?.Races ?? []) {
      const key = `${race.season}-${race.round}`;
      const rows = (race as Partial<Record<K, Item[]>>)[listKey] ?? [];
      const prev = merged.get(key);
      if (prev) (prev as Record<K, Item[]>)[listKey].push(...rows);
      else merged.set(key, { ...race, [listKey]: [...rows] } as Race & Record<K, Item[]>);
    }
  }
  return [...merged.values()];
}

type ErgastResponse = {
  MRData: {
    RaceTable?: { Races?: Race[] };
    StandingsTable?: {
      StandingsLists?: {
        DriverStandings?: DriverStanding[];
        ConstructorStandings?: ConstructorStanding[];
      }[];
    };
  };
};

/**
 * ปฏิทินทั้งฤดูกาล — ไม่ throw เด็ดขาด
 * · ดึงได้แต่ว่าง = ฤดูกาลยังไม่ประกาศ → คืน [] ให้หน้าจัดการเอง
 * · ดึงไม่ได้ = Jolpica ล่ม → ใช้สแนปช็อตถ้ามี
 */
export async function getSchedule(season: string | number): Promise<Race[]> {
  try {
    const d = await jolpica<ErgastResponse>(`${season}/races/`, 60 * 60 * 6);
    return d.MRData.RaceTable?.Races ?? [];
  } catch {
    return SCHEDULE_FALLBACK[String(season)] ?? [];
  }
}

export async function getDriverStandings(season: string | number): Promise<DriverStanding[]> {
  try {
    const d = await jolpica<ErgastResponse>(`${season}/driverstandings/`, 120);
    return d.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
  } catch {
    return [];
  }
}

export async function getConstructorStandings(season: string | number): Promise<ConstructorStanding[]> {
  try {
    const d = await jolpica<ErgastResponse>(`${season}/constructorstandings/`, 120);
    return d.MRData.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
  } catch {
    return [];
  }
}

type ResultsResponse = { MRData: { RaceTable?: { Races?: RaceWithResults[] } } };

/** ผลการแข่งของ race ล่าสุดที่จบไปแล้ว (null ถ้ายังไม่มีผลในฤดูกาลนั้น) */
export async function getLastResults(
  season: string | number,
): Promise<RaceWithResults | null> {
  try {
    // ใช้ทั้งธีมสี accent (layout) และการ์ดโพเดียมหน้าแรก — ไม่ต้องสดมาก
    const d = await jolpica<ResultsResponse>(`${season}/last/results/`, 900);
    return d.MRData.RaceTable?.Races?.[0] ?? null;
  } catch {
    return null;
  }
}

/** ผลการแข่งเต็มของ round ที่ระบุ */
export async function getRaceResults(
  season: string | number,
  round: string | number,
): Promise<RaceWithResults | null> {
  try {
    const d = await jolpica<ResultsResponse>(`${season}/${round}/results/`, 600);
    return d.MRData.RaceTable?.Races?.[0] ?? null;
  } catch {
    return null;
  }
}

/** ทุก race ที่จบแล้ว พร้อมผู้ชนะ (Results มีแค่ P1) — เรียงใหม่→เก่า */
export async function getSeasonWinners(
  season: string | number,
): Promise<RaceWithResults[]> {
  try {
    const d = await jolpica<ResultsResponse>(`${season}/results/1/`, 120);
    return (d.MRData.RaceTable?.Races ?? []).slice().reverse();
  } catch {
    return [];
  }
}

export type SeasonLeader = {
  driverId: string;
  name: string;
  constructorId: string;
  count: number;
};

/**
 * นับผู้นำจากรายการ race
 * · QualifyingResults: endpoint `qualifying/1` ไม่ได้คืนแค่คนได้ pole — บางสนามพ่วงแถว
 *   อันดับ 2, 4, 7 มาด้วย จึงต้องหาแถว position "1" เอง ไม่ใช่หยิบแถวแรก
 * · Results: จาก `fastest/1/results` → แถวที่ FastestLap.rank เป็น "1"
 */
export function tallyLeader(
  races: {
    Results?: Pick<RaceResult, "Driver" | "Constructor" | "FastestLap">[];
    QualifyingResults?: QualifyingResult[];
  }[],
  key: "Results" | "QualifyingResults",
): SeasonLeader | null {
  const count = new Map<string, SeasonLeader>();
  for (const r of races) {
    const top =
      key === "QualifyingResults"
        ? r.QualifyingResults?.find((q) => q.position === "1")
        : (r.Results?.find((x) => x.FastestLap?.rank === "1") ?? r.Results?.[0]);
    if (!top) continue;
    const id = top.Driver.driverId;
    const cur = count.get(id);
    if (cur) cur.count++;
    else
      count.set(id, {
        driverId: id,
        name: `${top.Driver.givenName.charAt(0)}. ${top.Driver.familyName}`,
        constructorId: top.Constructor.constructorId,
        count: 1,
      });
  }
  const list = [...count.values()].sort((a, b) => b.count - a.count);
  return list[0] ?? null;
}

/** นักแข่งที่ได้ pole เยอะสุดในฤดูกาล */
export async function getPoleLeader(season: string | number): Promise<SeasonLeader | null> {
  try {
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: { QualifyingResults?: QualifyingResult[] }[] } };
    }>(`${season}/qualifying/1/`, 3600);
    return tallyLeader(d.MRData.RaceTable?.Races ?? [], "QualifyingResults");
  } catch {
    return null;
  }
}

/** นักแข่งที่ทำ fastest lap เยอะสุดในฤดูกาล */
export async function getFastestLapLeader(
  season: string | number,
): Promise<SeasonLeader | null> {
  try {
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: { Results?: RaceResult[] }[] } };
    }>(`${season}/fastest/1/results/`, 3600);
    return tallyLeader(d.MRData.RaceTable?.Races ?? [], "Results");
  } catch {
    return null;
  }
}

export type QualifyingResult = {
  position: string;
  Driver: RaceResult["Driver"];
  Constructor: RaceResult["Constructor"];
  Q1?: string;
  Q2?: string;
  Q3?: string;
};

/** ผลควอลิฟายของ round */
export async function getQualifying(
  season: string | number,
  round: string | number,
): Promise<QualifyingResult[]> {
  try {
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: { QualifyingResults?: QualifyingResult[] }[] } };
    }>(`${season}/${round}/qualifying/`, 600);
    return d.MRData.RaceTable?.Races?.[0]?.QualifyingResults ?? [];
  } catch {
    return [];
  }
}

/** ผลสปรินต์ของ round (โครงสร้างเดียวกับผลเรซ) */
export async function getSprintResults(
  season: string | number,
  round: string | number,
): Promise<RaceResult[]> {
  try {
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: { SprintResults?: RaceResult[] }[] } };
    }>(`${season}/${round}/sprint/`, 600);
    return d.MRData.RaceTable?.Races?.[0]?.SprintResults ?? [];
  } catch {
    return [];
  }
}

/** ตารางคะแนนนักแข่ง ณ สิ้นสุด round ที่ระบุ (แต้มสะสม; นิ่งแล้ว → cache ยาว) */
export async function getStandingsAfterRound(
  season: string | number,
  round: string | number,
): Promise<DriverStanding[]> {
  try {
    const d = await jolpica<ErgastResponse>(
      `${season}/${round}/driverstandings/`,
      60 * 60 * 24 * 7,
    );
    return d.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
  } catch {
    return [];
  }
}

export type ChampionshipSeries = {
  driverId: string;
  name: string;
  constructorId: string;
  points: number[];
};

const EMPTY_PROGRESSION = { rounds: [] as string[], series: [] as ChampionshipSeries[] };

/**
 * ข้อมูลกราฟแต้มสะสม — top N จาก `currentStandings` (ที่หน้าเรียกมาให้แล้ว)
 * แล้วดึงแต้มสะสมรายรอบ; round ไหนดึงไม่ได้ก็ใช้ค่าก่อนหน้า (กราฟไม่ดิ่ง)
 */
export async function getChampionshipProgression(
  season: string | number,
  currentStandings: DriverStanding[],
  topN = 6,
): Promise<{ rounds: string[]; series: ChampionshipSeries[] }> {
  try {
    if (currentStandings.length === 0) return EMPTY_PROGRESSION;

    const winners = await getSeasonWinners(season);
    const rounds = winners
      .map((w) => w.round)
      .sort((a, b) => Number(a) - Number(b));
    if (rounds.length < 2) return EMPTY_PROGRESSION;

    // ดึงทีละ round — เลี่ยง rate limit ของ Jolpica
    const perRound: DriverStanding[][] = [];
    for (const r of rounds) {
      perRound.push(await getStandingsAfterRound(season, r));
    }
    // ต้องได้ข้อมูลอย่างน้อยครึ่งหนึ่ง ไม่งั้นซ่อนกราฟ
    if (perRound.filter((p) => p.length > 0).length < rounds.length / 2) {
      return EMPTY_PROGRESSION;
    }

    const series: ChampionshipSeries[] = currentStandings.slice(0, topN).map((t) => {
      const points: number[] = [];
      let lastKnown = 0;
      for (const rs of perRound) {
        const row = rs.find((x) => x.Driver.driverId === t.Driver.driverId);
        if (row) lastKnown = Number(row.points);
        points.push(lastKnown);
      }
      return {
        driverId: t.Driver.driverId,
        name: `${t.Driver.givenName.charAt(0)}. ${t.Driver.familyName}`,
        constructorId: t.Constructors.at(-1)?.constructorId ?? "",
        points,
      };
    });

    return { rounds, series };
  } catch {
    return EMPTY_PROGRESSION;
  }
}

export type DriverRaceResult = {
  round: string;
  raceName: string;
  Circuit: Race["Circuit"];
  result: RaceResult;
};

/** ผลรายสนามของนักแข่งคนหนึ่งทั้งฤดูกาล */
export async function getDriverSeasonResults(
  season: string | number,
  driverId: string,
): Promise<DriverRaceResult[]> {
  try {
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: (Race & { Results: RaceResult[] })[] } };
    }>(`${season}/drivers/${driverId}/results/`, 600);
    return (d.MRData.RaceTable?.Races ?? [])
      .filter((r) => r.Results?.[0])
      .map((r) => ({
        round: r.round,
        raceName: r.raceName,
        Circuit: r.Circuit,
        result: r.Results[0],
      }));
  } catch {
    return [];
  }
}

export type ConstructorRaceResult = {
  round: string;
  raceName: string;
  results: RaceResult[];
};

/** ผลรายสนามของทีมหนึ่งทั้งฤดูกาล (นักแข่งทั้ง 2 คน) */
export async function getConstructorSeasonResults(
  season: string | number,
  constructorId: string,
): Promise<ConstructorRaceResult[]> {
  try {
    // ทีมมีรถ 2 คัน → 30 แถวต่อหน้าของ Jolpica หมดตั้งแต่สนามที่ 15 ต้องไล่เก็บทีละหน้า
    const races = await jolpicaRaces<"Results", RaceResult>(
      `${season}/constructors/${constructorId}/results/`,
      600,
      "Results",
    );
    return races
      .filter((r) => r.Results?.length)
      .map((r) => ({
        round: r.round,
        raceName: r.raceName,
        results: [...r.Results].sort(
          (a, b) => Number(a.position) - Number(b.position),
        ),
      }));
  } catch {
    return [];
  }
}

/* ---------- ประวัติสนาม / พิทสต็อป / เทียบนักขับ ---------- */

/** ผู้ชนะทุกครั้งที่สนามนี้เคยจัด F1 (เก่า → ใหม่) — ย้อนหลังนิ่งแล้ว แคช 1 วัน */
export async function getCircuitWinners(circuitId: string): Promise<RaceWithResults[]> {
  try {
    const races = await jolpicaRaces<"Results", RaceResult>(
      `circuits/${encodeURIComponent(circuitId)}/results/1/`,
      60 * 60 * 24,
      "Results",
    );
    return races.filter((r) => r.Results.length > 0);
  } catch {
    return [];
  }
}

export type PitStop = {
  driverId: string;
  lap: string;
  stop: string;
  time: string;
  duration: string;
};

/** พิทสต็อปทั้งหมดของ round — `duration` คือเวลาในพิทเลนตั้งแต่เข้าจนออก ไม่ใช่เวลาจอดเปลี่ยนยาง */
export async function getPitStops(
  season: string | number,
  round: string | number,
): Promise<PitStop[]> {
  try {
    const races = await jolpicaRaces<"PitStops", PitStop>(
      `${season}/${round}/pitstops/`,
      60 * 30,
      "PitStops",
    );
    return races[0]?.PitStops ?? [];
  } catch {
    return [];
  }
}

/** ผลการแข่งเต็มทุก round ของฤดูกาล — ยิงราว 4 request แทนการยิงทีละสนาม */
export async function getSeasonResults(season: string | number): Promise<RaceWithResults[]> {
  try {
    return await jolpicaRaces<"Results", RaceResult>(`${season}/results/`, 600, "Results");
  } catch {
    return [];
  }
}

export type DriverQualiResult = { round: string; position: number };

/** อันดับควอลิฟายรายสนามของนักแข่งคนหนึ่ง */
export async function getDriverSeasonQualifying(
  season: string | number,
  driverId: string,
): Promise<DriverQualiResult[]> {
  try {
    const races = await jolpicaRaces<"QualifyingResults", QualifyingResult>(
      `${season}/drivers/${encodeURIComponent(driverId)}/qualifying/`,
      600,
      "QualifyingResults",
    );
    return races.flatMap((r) => {
      const q = r.QualifyingResults[0];
      return q ? [{ round: r.round, position: Number(q.position) }] : [];
    });
  } catch {
    return [];
  }
}

/* ---------- รูปสนามแข่ง (จาก Wikipedia) ---------- */

const WIKI_TTL = { next: { revalidate: 60 * 60 * 24 * 7 } }; // cache 7 วัน

/** ชื่อไฟล์ที่ "น่าจะ" เป็นผังแทร็ก */
const TRACK_MAP_RE =
  /(track[ _-]?map|circuit[ _-]*(layout|map)|street[ _-]?circuit|grand[ _-]?prix[ _-]?layout|\(20\d\d\)\.svg|[ _-]layout\.svg|_map\.svg)/i;

const cleanWikiUrl = (u: string) =>
  (u.startsWith("//") ? `https:${u}` : u).split("?")[0].replace(/\/\d+px-/, "/1280px-");

/** URL รูปผังสนาม; ลอง media-list ก่อน (เจอผังแทร็กแม่นกว่า) แล้วค่อย fallback */
export async function getCircuitImage(circuit?: Race["Circuit"]): Promise<string | null> {
  if (!circuit) return null;

  const title = decodeURIComponent(circuit.url?.split("/wiki/")[1] ?? "");
  if (!title) return null;
  const enc = encodeURIComponent(title);

  // 1) media-list → เลือกไฟล์ที่ชื่อเข้าข่ายผังแทร็ก (เว้น logo)
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${enc}`,
      WIKI_TTL,
    );
    if (res.ok) {
      const d = (await res.json()) as {
        items?: {
          type?: string;
          title?: string;
          leadImage?: boolean;
          srcset?: { src: string }[];
        }[];
      };
      const imgs = (d.items ?? []).filter(
        (i) => i.type === "image" && i.title && i.srcset?.length && !/logo/i.test(i.title),
      );
      const pick =
        // รูป infobox ของหน้าสนาม = ผังแทร็กแทบทุกครั้ง
        imgs.find((i) => i.leadImage) ??
        // ไม่งั้นเดาจากชื่อไฟล์
        imgs.find((i) => TRACK_MAP_RE.test(i.title!) && /\.svg/i.test(i.title!)) ??
        imgs.find((i) => TRACK_MAP_RE.test(i.title!));
      const best = pick?.srcset?.at(-1)?.src;
      if (best) return cleanWikiUrl(best);
    }
  } catch {
    /* ลอง fallback ต่อ */
  }

  // 2) fallback: รูปเด่นของหน้า (อาจเป็นรูปถ่าย ไม่ใช่ผัง)
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`,
      WIKI_TTL,
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    const raw = d.originalimage?.source ?? d.thumbnail?.source;
    return raw ? cleanWikiUrl(raw) : null;
  } catch {
    return null;
  }
}

/* ---------- เวลา ---------- */

/** เวลาปัจจุบัน (ms) — แยกเป็นฟังก์ชันเพื่อเรียกใน server component ได้โดยไม่ผิด purity rule */
export const nowMs = () => Date.now();

/** รวม date + time (UTC) เป็น Date object; ถ้าไม่มี time ให้ถือเป็น 00:00Z */
export function toDate(s?: SessionTime | null): Date | null {
  if (!s?.date) return null;
  return new Date(`${s.date}T${s.time ?? "00:00:00Z"}`);
}

const TZ = "Asia/Bangkok";

export type TimeKind = "full" | "time" | "date";

const OPTS: Record<TimeKind, Intl.DateTimeFormatOptions> = {
  full: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
  date: { day: "numeric", month: "short" },
};

/** kind ไหนขึ้นต้นด้วยชื่อวัน */
const SHOWS_WEEKDAY: Record<TimeKind, boolean> = { full: true, time: false, date: true };

/**
 * ชื่อวันแบบย่อ — เขียนตารางเองแทนที่จะใช้ weekday:"short" ของ Intl
 *
 * ICU ของ Node กับของเบราว์เซอร์ให้ผลไม่ตรงกัน: Node (ICU 78) คืนชื่อเต็ม
 * "อาทิตย์" ส่วน Chromium คืน "อา." พอ SSR กับ client ได้คนละข้อความ React
 * ก็ throw hydration error #418 ทุกหน้าที่มีชื่อวัน
 */
const TH_WEEKDAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const EN_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** วันในสัปดาห์ตามโซนเวลาที่ระบุ (0 = อาทิตย์) — ตัวย่อ en-US นิ่งข้าม ICU ทุกเวอร์ชัน */
function weekdayIn(d: Date, timeZone: string) {
  const en = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return EN_WEEKDAY.indexOf(en);
}

/** format วันเวลาเป็นภาษาไทย (ca-gregory กัน พ.ศ.) ในโซนเวลาที่ระบุ */
export function formatInTz(d: Date, kind: TimeKind, timeZone = TZ) {
  const body = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone,
    ...OPTS[kind],
  }).format(d);
  if (!SHOWS_WEEKDAY[kind]) return body;
  const i = weekdayIn(d, timeZone);
  return i < 0 ? body : `${TH_WEEKDAY[i]} ${body}`;
}

/** ดึงทุก session ของสุดสัปดาห์ เรียงตามเวลา */
export function getSessions(race: Race) {
  const raw: [string, SessionTime | undefined][] = [
    ["ซ้อม 1", race.FirstPractice],
    ["ซ้อม 2", race.SecondPractice],
    ["ซ้อม 3", race.ThirdPractice],
    ["Sprint Quali", race.SprintQualifying],
    ["Sprint", race.Sprint],
    ["Qualifying", race.Qualifying],
    ["Race", { date: race.date, time: race.time }],
  ];

  return raw
    .map(([label, s]) => ({ label, at: toDate(s) }))
    .filter((s): s is { label: string; at: Date } => s.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * ความยาวตามกำหนดการของแต่ละ session (นาที) — คีย์ต้องตรงกับป้ายที่ getSessions() คืน
 * ใช้เป็นความยาวอีเวนต์ในไฟล์ปฏิทิน (app/calendar.ics)
 */
export const SESSION_MINUTES: Record<string, number> = {
  "ซ้อม 1": 60,
  "ซ้อม 2": 60,
  "ซ้อม 3": 60,
  "Sprint Quali": 45,
  Sprint: 60,
  Qualifying: 60,
  Race: 120,
};

/** session แปลกที่ไม่รู้จัก — เดาไว้ 60 นาทีเท่าซ้อม */
export const DEFAULT_SESSION_MINUTES = 60;

/**
 * ช่วงที่ยังถือว่า session ไม่จบ (ms) — จงใจกว้างกว่า SESSION_MINUTES ข้างบน
 * เพราะถ้าตัดตรงตามกำหนดเป๊ะ พอมีธงแดงหรือยืดเยื้อ หน้าเว็บจะเด้งไปนับถอยหลัง
 * session ถัดไปทั้งที่ยังแข่งกันอยู่ · Race ใช้ RACE_TAIL_MS ให้ตรงกับที่อื่นในเว็บ
 */
const SESSION_DUR_MS: Record<string, number> = {
  "Race": RACE_TAIL_MS,
  Sprint: 60 * 60 * 1000,
  "Sprint Quali": 45 * 60 * 1000,
  Qualifying: 60 * 60 * 1000,
};
const DEFAULT_SESSION_DUR_MS = 90 * 60 * 1000;

/** ทุก session ของสุดสัปดาห์พร้อมเวลาที่ถือว่าจบ — ให้ client เลือก session ถัดไปเองได้ */
export function getSessionWindows(race: Race): SessionWindow[] {
  return getSessions(race).map((s) => ({
    label: s.label,
    start: s.at.getTime(),
    end: s.at.getTime() + (SESSION_DUR_MS[s.label] ?? DEFAULT_SESSION_DUR_MS),
  }));
}

/** session ถัดไปของสุดสัปดาห์ที่ยังไม่จบ (null = จบหมดแล้ว) */
export function getNextSession(race: Race, now = new Date()) {
  const w = pickSession(getSessionWindows(race), now.getTime());
  return w ? { label: w.label, at: new Date(w.start) } : null;
}

/** หา race ถัดไป (นับ race ที่ยังไม่จบ ~2 ชม.หลังสตาร์ท) */
export function findNextRace(races: Race[], now = new Date()) {
  return races.find((r) => {
    const d = toDate({ date: r.date, time: r.time });
    return d ? d.getTime() + RACE_TAIL_MS > now.getTime() : false;
  });
}

/** race ที่ยังไม่จบ n รายการถัดไป (รวมสนามที่กำลังแข่ง) */
export function getUpcomingRaces(races: Race[], n: number, now = new Date()) {
  return races
    .filter((r) => {
      const d = toDate({ date: r.date, time: r.time });
      return d ? d.getTime() + RACE_TAIL_MS > now.getTime() : false;
    })
    .slice(0, n);
}

/** สุดสัปดาห์นี้มี Sprint ไหม */
export function isSprintWeekend(race: Race) {
  return Boolean(race.Sprint || race.SprintQualifying);
}

/** race นี้ผ่านไปแล้วหรือยัง (ยึดเวลาสตาร์ท) */
export function isPastRace(race: Race, now = new Date()) {
  const d = toDate({ date: race.date, time: race.time });
  return d ? d.getTime() < now.getTime() : false;
}

/**
 * race ที่เริ่มแล้วแต่ยังไม่มีผล (ผู้เรียกเช็คเองว่าไม่มีผล):
 * "live" = ยังอยู่ในช่วงแข่ง · "awaiting" = จบแล้วรอ Jolpica ลงผล · null = ยังไม่เริ่ม/เลยช่วงรอ
 */
export function resultsGap(race: Race, now = nowMs()): "live" | "awaiting" | null {
  const d = toDate({ date: race.date, time: race.time });
  if (!d) return null;
  const since = now - d.getTime();
  if (since < 0 || since > RESULTS_WAIT_MS) return null;
  return since < RACE_TAIL_MS ? "live" : "awaiting";
}

/** สนามแรกที่ยังไม่มีผลและยังอยู่ในช่วงที่ควรรอ (รวมสนามที่ยังไม่แข่ง) */
export function firstRaceWithoutResults(
  races: Race[],
  hasResults: (race: Race) => boolean,
  now = nowMs(),
) {
  return races.find((r) => {
    const d = toDate({ date: r.date, time: r.time });
    return d !== null && d.getTime() + RESULTS_WAIT_MS > now && !hasResults(r);
  });
}