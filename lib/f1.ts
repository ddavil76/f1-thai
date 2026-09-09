import { SCHEDULE_FALLBACK } from "./schedule-fallback";

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

const BASE = "https://api.jolpi.ca/ergast/f1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * จำกัดจำนวน request พร้อมกันไป Jolpica — ตอน build มี ~60 หน้า render
 * พร้อมกัน ถ้าปล่อยยิงหมดจะโดน rate-limit ยับ
 */
let active = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 4;

async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

/** เรียก Jolpica พร้อม retry + จำกัด concurrency — API ตัวนี้ rate-limit บ่อย */
async function jolpica<T>(path: string, revalidate = 3600): Promise<T> {
  const url = `${BASE}/${path}?format=json`;
  let lastErr: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1)); // 0.5s, 1s, 2s
    try {
      const res = await gate(() => fetch(url, { next: { revalidate } }));
      if (res.ok) return (await res.json()) as T;
      // 429/5xx = ลองใหม่, 4xx อื่น ๆ = เลิก
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`Jolpica ${res.status} on ${path}`);
      }
      lastErr = new Error(`Jolpica ${res.status} on ${path}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Jolpica failed on ${path}`);
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

/** นับผู้นำจากรายการ race (helper) */
function tallyLeader(
  races: {
    Results?: { Driver: RaceResult["Driver"]; Constructor: RaceResult["Constructor"] }[];
    QualifyingResults?: QualifyingResult[];
  }[],
  key: "Results" | "QualifyingResults",
): SeasonLeader | null {
  const count = new Map<string, SeasonLeader>();
  for (const r of races) {
    const top = r[key]?.[0];
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
    const d = await jolpica<{
      MRData: { RaceTable?: { Races?: (Race & { Results: RaceResult[] })[] } };
    }>(`${season}/constructors/${constructorId}/results/`, 600);
    return (d.MRData.RaceTable?.Races ?? [])
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

/* ---------- รูปสนามแข่ง (จาก Wikipedia) ---------- */

const WIKI_TTL = { next: { revalidate: 60 * 60 * 24 * 7 } }; // cache 7 วัน

/** ชื่อไฟล์ที่ "น่าจะ" เป็นผังแทร็ก */
const TRACK_MAP_RE =
  /(track[ _-]?map|circuit[ _-]*(layout|map)|street[ _-]?circuit|grand[ _-]?prix[ _-]?layout|\(20\d\d\)\.svg|[ _-]layout\.svg|_map\.svg)/i;

/**
 * override เฉพาะสนามที่ heuristic เลือกรูปพลาด — key = Ergast circuitId,
 * value = URL รูปเต็ม (แนะนำ .svg.png จาก upload.wikimedia.org)
 */
const CIRCUIT_IMAGE_OVERRIDE: Record<string, string> = {};

const cleanWikiUrl = (u: string) =>
  (u.startsWith("//") ? `https:${u}` : u).split("?")[0].replace(/\/\d+px-/, "/1280px-");

/** URL รูปผังสนาม; ลอง media-list ก่อน (เจอผังแทร็กแม่นกว่า) แล้วค่อย fallback */
export async function getCircuitImage(circuit?: Race["Circuit"]): Promise<string | null> {
  if (!circuit) return null;

  const override = CIRCUIT_IMAGE_OVERRIDE[circuit.circuitId];
  if (override) return override;

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
  full: { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
  date: { weekday: "short", day: "numeric", month: "short" },
};

/** format วันเวลาเป็นภาษาไทย (ca-gregory กัน พ.ศ.) ในโซนเวลาที่ระบุ */
export function formatInTz(d: Date, kind: TimeKind, timeZone = TZ) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { timeZone, ...OPTS[kind] }).format(d);
}

export const thaiFull = (d: Date) => formatInTz(d, "full");
export const thaiTimeOnly = (d: Date) => formatInTz(d, "time");
export const thaiDateOnly = (d: Date) => formatInTz(d, "date");

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

const RACE_TAIL_MS = 2 * 60 * 60 * 1000;

/** ระยะเวลาโดยประมาณของแต่ละ session (ms) — ใช้เช็คว่าจบหรือยัง */
const SESSION_DUR_MS: Record<string, number> = {
  "Race": RACE_TAIL_MS,
  Sprint: 60 * 60 * 1000,
  "Sprint Quali": 45 * 60 * 1000,
  Qualifying: 60 * 60 * 1000,
};
const DEFAULT_SESSION_DUR_MS = 90 * 60 * 1000;

/** session ถัดไปของสุดสัปดาห์ที่ยังไม่จบ (null = จบหมดแล้ว) */
export function getNextSession(race: Race, now = new Date()) {
  return (
    getSessions(race).find(
      (s) =>
        s.at.getTime() + (SESSION_DUR_MS[s.label] ?? DEFAULT_SESSION_DUR_MS) >
        now.getTime(),
    ) ?? null
  );
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