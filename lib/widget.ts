/* ---------- ข้อมูลย่อสำหรับ widget บนมือถือ ---------- */
// ตัดให้เล็กที่สุดเท่าที่ widget ต้องใช้ — วิ่งผ่านเน็ตมือถือและถูกดึงบ่อย
// เวลาเป็น ISO ทั้งหมด ให้ฝั่ง widget ฟอร์แมตตามเครื่องผู้ใช้เอง
// ฟิลด์เดิม (race/session/leader) คงไว้ — widget รุ่นเก่าที่แคชอยู่ในเครื่องยังอ่านได้

import {
  findNextRace, getNextSession, getSessionWindows, isSprintWeekend, toDate,
  type DriverStanding, type Race, type RaceWithResults,
} from "./f1";
import { circuitTrack } from "./circuits";
import { countryFlag } from "./flags";

/**
 * · upcoming    = มีสนามถัดไป ยังไม่ถึงเวลา
 * · live        = session ของสุดสัปดาห์นั้นกำลังดำเนินอยู่
 * · season-over = มีปฏิทินแต่แข่งจบหมดแล้ว
 * · no-calendar = ยังไม่มีปฏิทินของฤดูกาลนี้
 */
export type WidgetState = "upcoming" | "live" | "season-over" | "no-calendar";

/** ผังสนามแบบย่อ — จุด x,y สลับกันในกล่อง w×h (ด้านยาว = 100) ให้ widget วาดเอง */
export type WidgetTrack = { w: number; h: number; pts: number[] };

export type WidgetRace = {
  round: string;
  name: string;
  /** ชื่อสั้นแบบแอป F1 — "Azerbaijan", "Las Vegas" (widget ทำเป็นตัวใหญ่เอง) · ดู raceShort */
  short: string;
  /** ธงประเทศของสนาม */
  flag: string;
  circuit: string;
  circuitId: string;
  locality: string;
  country: string;
  /** เวลาออกสตาร์ทของเรซ (ISO, UTC) */
  startsAt: string;
  isSprint: boolean;
  track: WidgetTrack | null;
};

export type WidgetSession = {
  /** รหัสแบบ F1 — FP1 · FP2 · FP3 · SQ · SPRINT · Q · RACE */
  code: string;
  /** "ซ้อม 1" · "Qualifying" · "Race" ฯลฯ */
  label: string;
  startsAt: string;
  /** เวลาที่ถือว่า session จบ (ช่วงเดียวกับที่เว็บใช้ตัดสินว่ากำลังแข่งอยู่) */
  endsAt: string;
};

export type WidgetDriver = {
  /** รหัส 3 ตัวอักษร เช่น VER */
  code: string;
  name: string;
  constructorId: string;
};

export type WidgetLeader = {
  name: string;
  points: number;
  /** ใช้เลือกสีทีมฝั่ง widget */
  constructorId: string;
};

export type WidgetStanding = WidgetDriver & { points: number };

export type WidgetLastRace = {
  round: string;
  short: string;
  flag: string;
  startsAt: string;
  podium: WidgetDriver[];
};

export type WidgetPayload = {
  season: number;
  state: WidgetState;
  /** เวลาที่สร้างข้อมูลชุดนี้ — widget เอาไว้บอกว่าข้อมูลเก่าแค่ไหน */
  generatedAt: string;
  race: WidgetRace | null;
  /** session ถัดไปของสุดสัปดาห์นั้น (เรซเองก็นับ) */
  session: WidgetSession | null;
  /** ทุก session ของสุดสัปดาห์ถัดไป เรียงตามเวลา */
  sessions: WidgetSession[];
  leader: WidgetLeader | null;
  top3: WidgetStanding[];
  /** สนามล่าสุดที่มีผลแล้ว — โพเดียม + สีทีมผู้ชนะ */
  lastRace: WidgetLastRace | null;
  /** เพิ่งแข่งจบไม่นาน → widget โชว์โพเดียมเป็นหลัก แทนนับถอยหลังอย่างเดียว */
  showPodium: boolean;
};

/** เรซจบแล้วโชว์โพเดียมกี่วัน (เรซวันอาทิตย์ → ถึงราวพุธ) */
export const PODIUM_DAYS = 3.5;

/** ผังสนามส่งไม่เกินกี่จุด — widget เล็กนิดเดียว เกินนี้มองไม่ออกแต่เปลืองเน็ต */
export const TRACK_MAX_POINTS = 64;

const SESSION_CODE: Record<string, string> = {
  "ซ้อม 1": "FP1",
  "ซ้อม 2": "FP2",
  "ซ้อม 3": "FP3",
  "Sprint Quali": "SQ",
  Sprint: "SPRINT",
  Qualifying: "Q",
  Race: "RACE",
};

type NamedDriver = { code?: string; givenName: string; familyName: string };

const shortName = (d: NamedDriver) => `${d.givenName.charAt(0)}. ${d.familyName}`;

const driverCode = (d: NamedDriver) => d.code ?? d.familyName.slice(0, 3).toUpperCase();

/** ชื่อประเทศแบบที่แอป F1 ใช้ (ที่ต่างจาก Ergast) */
const COUNTRY_NAME: Record<string, string> = {
  UK: "Great Britain",
  USA: "United States",
  UAE: "Abu Dhabi",
};

/**
 * ชื่อสั้นแบบแอป F1 — ใช้ชื่อประเทศ (SPAIN ไม่ใช่ SPANISH) แต่ถ้าฤดูกาลนั้นมีหลายสนาม
 * ในประเทศเดียวกัน (สหรัฐฯ 3 สนาม, สเปน 2 สนาม) ใช้ชื่อเมืองแทน จะได้แยกออก
 */
export function raceShort(race: Race, season: Race[]): string {
  const country = race.Circuit.Location.country;
  const shared = season.filter((r) => r.Circuit.Location.country === country).length > 1;
  return shared ? race.Circuit.Location.locality : (COUNTRY_NAME[country] ?? country);
}

/** ย่อ path ของสนามเหลือจุดไม่เกิน TRACK_MAX_POINTS (ปัดเป็นทศนิยม 1 ตำแหน่ง) */
export function widgetTrack(circuitId: string): WidgetTrack | null {
  const t = circuitTrack(circuitId);
  if (!t) return null;
  const all = [...t.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as const,
  );
  if (all.length < 3) return null;
  const step = Math.max(1, Math.ceil(all.length / TRACK_MAX_POINTS));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const pts = all.filter((_, i) => i % step === 0).flatMap(([x, y]) => [round1(x), round1(y)]);
  return { w: t.w, h: t.h, pts };
}

function sessionsOf(race: Race): WidgetSession[] {
  return getSessionWindows(race).map((w) => ({
    code: SESSION_CODE[w.label] ?? w.label.slice(0, 3).toUpperCase(),
    label: w.label,
    startsAt: new Date(w.start).toISOString(),
    endsAt: new Date(w.end).toISOString(),
  }));
}

function lastRaceOf(
  last: RaceWithResults | null | undefined,
  season: Race[],
): WidgetLastRace | null {
  const start = last ? toDate({ date: last.date, time: last.time }) : null;
  if (!last || !start || last.Results.length < 3) return null;
  return {
    round: last.round,
    short: raceShort(last, season),
    flag: countryFlag(last.Circuit.Location.country),
    startsAt: start.toISOString(),
    podium: last.Results.slice(0, 3).map((r) => ({
      code: driverCode(r.Driver),
      name: shortName(r.Driver),
      constructorId: r.Constructor.constructorId,
    })),
  };
}

/** สร้าง payload — แยกจาก route handler เพื่อให้เทสต์ได้โดยไม่ต้องยิงเน็ต */
export function buildWidgetPayload({
  season,
  races,
  standings,
  lastResults,
  now = new Date(),
}: {
  season: number;
  races: Race[];
  standings: DriverStanding[];
  /** ผลสนามล่าสุด (ถ้ามี) — ใช้ทำโพเดียมและแถบสีผู้ชนะ */
  lastResults?: RaceWithResults | null;
  now?: Date;
}): WidgetPayload {
  const top = standings[0];
  const leader: WidgetLeader | null = top
    ? {
        name: shortName(top.Driver),
        points: Number(top.points),
        constructorId: top.Constructors.at(-1)?.constructorId ?? "",
      }
    : null;
  const top3: WidgetStanding[] = standings.slice(0, 3).map((s) => ({
    code: driverCode(s.Driver),
    name: shortName(s.Driver),
    points: Number(s.points),
    constructorId: s.Constructors.at(-1)?.constructorId ?? "",
  }));
  const lastRace = lastRaceOf(lastResults, races);

  const base = {
    season,
    generatedAt: now.toISOString(),
    leader,
    top3,
    lastRace,
    sessions: [] as WidgetSession[],
    showPodium: false,
  };

  if (races.length === 0) {
    return { ...base, state: "no-calendar", race: null, session: null };
  }

  const next = findNextRace(races, now);
  // จบฤดูกาลแล้ว — โชว์โพเดียมสนามสุดท้ายได้เลย
  if (!next) {
    return { ...base, showPodium: lastRace !== null, state: "season-over", race: null, session: null };
  }

  const start = toDate({ date: next.date, time: next.time });
  // findNextRace คัดด้วยวันเวลาอยู่แล้ว ถึงตรงนี้ย่อมมีเวลาเสมอ
  if (!start) return { ...base, state: "season-over", race: null, session: null };

  const current = getNextSession(next, now);
  const sessions = sessionsOf(next);
  const session = current
    ? (sessions.find((s) => s.startsAt === current.at.toISOString()) ?? null)
    : null;
  const state: WidgetState =
    current && current.at.getTime() <= now.getTime() ? "live" : "upcoming";

  const sinceLast = lastRace ? now.getTime() - Date.parse(lastRace.startsAt) : Infinity;
  const showPodium =
    state === "upcoming" && sinceLast >= 0 && sinceLast < PODIUM_DAYS * 24 * 60 * 60 * 1000;

  return {
    ...base,
    state,
    showPodium,
    sessions,
    race: {
      round: next.round,
      name: next.raceName,
      short: raceShort(next, races),
      flag: countryFlag(next.Circuit.Location.country),
      circuit: next.Circuit.circuitName,
      circuitId: next.Circuit.circuitId,
      locality: next.Circuit.Location.locality,
      country: next.Circuit.Location.country,
      startsAt: start.toISOString(),
      isSprint: isSprintWeekend(next),
      track: widgetTrack(next.Circuit.circuitId),
    },
    session,
  };
}
