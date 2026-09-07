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

const BASE = "https://api.jolpi.ca/ergast/f1";

async function jolpica<T>(path: string, revalidate = 3600): Promise<T> {
  const res = await fetch(`${BASE}/${path}?format=json`, {
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Jolpica ${res.status} on ${path}`);
  return res.json();
}

export async function getSchedule(season: string | number): Promise<Race[]> {
  const d = await jolpica<any>(`${season}/races/`);
  return d.MRData.RaceTable.Races ?? [];
}

export async function getDriverStandings(season: string | number): Promise<DriverStanding[]> {
  // standings เปลี่ยนบ่อยช่วงแข่ง → cache สั้นกว่า
  const d = await jolpica<any>(`${season}/driverstandings/`, 600);
  return d.MRData.StandingsTable.StandingsLists?.[0]?.DriverStandings ?? [];
}

export async function getConstructorStandings(season: string | number): Promise<ConstructorStanding[]> {
  const d = await jolpica<any>(`${season}/constructorstandings/`, 600);
  return d.MRData.StandingsTable.StandingsLists?.[0]?.ConstructorStandings ?? [];
}

/* ---------- เวลา ---------- */

/** รวม date + time (UTC) เป็น Date object; ถ้าไม่มี time ให้ถือเป็น 00:00Z */
export function toDate(s?: SessionTime | null): Date | null {
  if (!s?.date) return null;
  return new Date(`${s.date}T${s.time ?? "00:00:00Z"}`);
}

const TZ = "Asia/Bangkok";

/** "อา. 8 มี.ค. 2026 เวลา 12:00" — ใช้ ca-gregory เพื่อไม่ให้เป็น พ.ศ. */
export function thaiFull(d: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function thaiTimeOnly(d: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function thaiDateOnly(d: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
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
    ["🏁 Race", { date: race.date, time: race.time }],
  ];

  return raw
    .map(([label, s]) => ({ label, at: toDate(s) }))
    .filter((s): s is { label: string; at: Date } => s.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** หา race ถัดไป (นับ race ที่ยังไม่จบ ~2 ชม.หลังสตาร์ท) */
export function findNextRace(races: Race[], now = new Date()) {
  return races.find((r) => {
    const d = toDate({ date: r.date, time: r.time });
    return d ? d.getTime() + 2 * 60 * 60 * 1000 > now.getTime() : false;
  });
}