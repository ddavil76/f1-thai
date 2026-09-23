/* ---------- ข้อมูลย่อสำหรับ widget บนมือถือ ---------- */
// ตัดให้เล็กที่สุดเท่าที่ widget ต้องใช้ — วิ่งผ่านเน็ตมือถือและถูกดึงบ่อย
// เวลาเป็น ISO ทั้งหมด ให้ฝั่ง widget ฟอร์แมตตามเครื่องผู้ใช้เอง

import {
  findNextRace, getNextSession, isSprintWeekend, toDate,
  type DriverStanding, type Race,
} from "./f1";

/**
 * · upcoming    = มีสนามถัดไป ยังไม่ถึงเวลา
 * · live        = session ของสุดสัปดาห์นั้นกำลังดำเนินอยู่
 * · season-over = มีปฏิทินแต่แข่งจบหมดแล้ว
 * · no-calendar = ยังไม่มีปฏิทินของฤดูกาลนี้
 */
export type WidgetState = "upcoming" | "live" | "season-over" | "no-calendar";

export type WidgetRace = {
  round: string;
  name: string;
  circuit: string;
  circuitId: string;
  locality: string;
  country: string;
  /** เวลาออกสตาร์ทของเรซ (ISO, UTC) */
  startsAt: string;
  isSprint: boolean;
};

export type WidgetSession = {
  /** "ซ้อม 1" · "Qualifying" · "Race" ฯลฯ */
  label: string;
  startsAt: string;
};

export type WidgetLeader = {
  name: string;
  points: number;
  /** ใช้เลือกสีทีมฝั่ง widget */
  constructorId: string;
};

export type WidgetPayload = {
  season: number;
  state: WidgetState;
  /** เวลาที่สร้างข้อมูลชุดนี้ — widget เอาไว้บอกว่าข้อมูลเก่าแค่ไหน */
  generatedAt: string;
  race: WidgetRace | null;
  /** session ถัดไปของสุดสัปดาห์นั้น (เรซเองก็นับ) */
  session: WidgetSession | null;
  leader: WidgetLeader | null;
};

const shortName = (d: DriverStanding["Driver"]) =>
  `${d.givenName.charAt(0)}. ${d.familyName}`;

/** สร้าง payload — แยกจาก route handler เพื่อให้เทสต์ได้โดยไม่ต้องยิงเน็ต */
export function buildWidgetPayload({
  season,
  races,
  standings,
  now = new Date(),
}: {
  season: number;
  races: Race[];
  standings: DriverStanding[];
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

  const base = { season, generatedAt: now.toISOString(), leader };

  if (races.length === 0) {
    return { ...base, state: "no-calendar", race: null, session: null };
  }

  const next = findNextRace(races, now);
  if (!next) return { ...base, state: "season-over", race: null, session: null };

  const start = toDate({ date: next.date, time: next.time });
  // findNextRace คัดด้วยวันเวลาอยู่แล้ว ถึงตรงนี้ย่อมมีเวลาเสมอ
  if (!start) return { ...base, state: "season-over", race: null, session: null };

  const session = getNextSession(next, now);

  return {
    ...base,
    // session ที่เริ่มไปแล้วแต่ยังไม่จบ = กำลังแข่งอยู่
    state: session && session.at.getTime() <= now.getTime() ? "live" : "upcoming",
    race: {
      round: next.round,
      name: next.raceName,
      circuit: next.Circuit.circuitName,
      circuitId: next.Circuit.circuitId,
      locality: next.Circuit.Location.locality,
      country: next.Circuit.Location.country,
      startsAt: start.toISOString(),
      isSprint: isSprintWeekend(next),
    },
    session: session
      ? { label: session.label, startsAt: session.at.toISOString() }
      : null,
  };
}
