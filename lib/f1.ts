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
    Location: { locality: string; country: string };
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

/** @deprecated ใช้ RaceWithResults แทน */
export type LastRace = RaceWithResults;

const BASE = "https://api.jolpi.ca/ergast/f1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เรียก Jolpica พร้อม retry — API ตัวนี้ rate-limit / ล่มบ่อย */
async function jolpica<T>(path: string, revalidate = 3600): Promise<T> {
  const url = `${BASE}/${path}?format=json`;
  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    try {
      const res = await fetch(url, { next: { revalidate } });
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

export async function getSchedule(season: string | number): Promise<Race[]> {
  const d = await jolpica<ErgastResponse>(`${season}/races/`);
  return d.MRData.RaceTable?.Races ?? [];
}

export async function getDriverStandings(season: string | number): Promise<DriverStanding[]> {
  // standings เปลี่ยนบ่อยช่วงแข่ง → cache สั้นกว่า
  const d = await jolpica<ErgastResponse>(`${season}/driverstandings/`, 600);
  return d.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
}

export async function getConstructorStandings(season: string | number): Promise<ConstructorStanding[]> {
  const d = await jolpica<ErgastResponse>(`${season}/constructorstandings/`, 600);
  return d.MRData.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
}

type ResultsResponse = { MRData: { RaceTable?: { Races?: RaceWithResults[] } } };

/** ผลการแข่งของ race ล่าสุดที่จบไปแล้ว (null ถ้ายังไม่มีผลในฤดูกาลนั้น) */
export async function getLastResults(
  season: string | number,
): Promise<RaceWithResults | null> {
  try {
    const d = await jolpica<ResultsResponse>(`${season}/last/results/`, 600);
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
    const d = await jolpica<ResultsResponse>(`${season}/results/1/`, 600);
    return (d.MRData.RaceTable?.Races ?? []).slice().reverse();
  } catch {
    return [];
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
    ["🏁 Race", { date: race.date, time: race.time }],
  ];

  return raw
    .map(([label, s]) => ({ label, at: toDate(s) }))
    .filter((s): s is { label: string; at: Date } => s.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

const RACE_TAIL_MS = 2 * 60 * 60 * 1000;

/** ระยะเวลาโดยประมาณของแต่ละ session (ms) — ใช้เช็คว่าจบหรือยัง */
const SESSION_DUR_MS: Record<string, number> = {
  "🏁 Race": RACE_TAIL_MS,
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