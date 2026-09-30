/* ---------- ข้อมูลของ "การ์ด" widget (รูปพื้นหลังที่เว็บวาดให้) ---------- */
// widget บนมือถือใช้ได้แค่ฟอนต์ของระบบ → ส่วนที่ไม่ต้องเปลี่ยนทุกนาที (ชื่อสนาม ผังสนาม สถิติ ตาราง)
// ให้เว็บวาดเป็นรูปด้วยฟอนต์ที่ออกแบบไว้ ส่วนนับถอยหลังให้ widget วาดทับเอง (เดินได้ตรงเวลา)
// ไฟล์นี้เป็นส่วนที่ไม่ต้องใช้ React — แยกออกมาให้เทสต์ได้

import type { Race } from "./f1";
import type { SessionWindow } from "./race-window";

export type CardSize = "small" | "medium" | "large";
export type CardTheme = "light" | "dark";

/**
 * ชื่อสนามแบบสั้นที่ใช้เป็นตัวใหญ่บนการ์ด — ชื่อเต็มยาวเกิน (Autódromo Hermanos Rodríguez)
 * ใช้ชื่อที่คนเรียกกันจริง ไม่ใช่ชื่อแบรนด์/สปอนเซอร์
 */
const CARD_NAME: Record<string, string> = {
  albert_park: "ALBERT PARK",
  shanghai: "SHANGHAI",
  suzuka: "SUZUKA",
  miami: "MIAMI",
  villeneuve: "MONTRÉAL",
  monaco: "MONACO",
  catalunya: "BARCELONA",
  red_bull_ring: "SPIELBERG",
  silverstone: "SILVERSTONE",
  spa: "SPA",
  hungaroring: "HUNGARORING",
  zandvoort: "ZANDVOORT",
  monza: "MONZA",
  madring: "MADRID",
  baku: "BAKU",
  sepang: "SEPANG",
  marina_bay: "MARINA BAY",
  americas: "AUSTIN",
  rodriguez: "MEXICO CITY",
  interlagos: "INTERLAGOS",
  vegas: "LAS VEGAS",
  losail: "LOSAIL",
  yas_marina: "YAS MARINA",
  bahrain: "SAKHIR",
  jeddah: "JEDDAH",
  imola: "IMOLA",
  ricard: "PAUL RICARD",
  nurburgring: "NÜRBURGRING",
  portimao: "PORTIMÃO",
  mugello: "MUGELLO",
  istanbul: "ISTANBUL",
  hockenheimring: "HOCKENHEIM",
  indianapolis: "INDIANAPOLIS",
  kyalami: "KYALAMI",
};

/** คำทั่วไปในชื่อสนามที่ตัดทิ้งได้ (สนามใหม่ที่ยังไม่มีในรายการ) */
const FILLER = /\b(international|circuit|street|grand prix|autodrome|autodromo|autódromo|nazionale|city|park|de|di|of|the)\b/gi;

export function cardName(circuitId: string, circuitName: string): string {
  const known = CARD_NAME[circuitId];
  if (known) return known;
  const short = circuitName.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  return (short || circuitName).toUpperCase();
}

/**
 * จำนวนรอบเรซ = ระยะแข่งขั้นต่ำ ÷ ความยาวสนาม ปัดขึ้น (กติกา F1: 305 กม. · โมนาโก 260 กม.)
 * ตรงกับจำนวนรอบจริงเกือบทุกสนาม
 */
export function raceLaps(circuitId: string, lengthM: number | null): number | null {
  if (!lengthM || lengthM <= 0) return null;
  const distance = circuitId === "monaco" ? 260_000 : 305_000;
  return Math.ceil(distance / lengthM);
}

/**
 * ไฟสตาร์ทในกล่องนับถอยหลัง ติดเพิ่มเมื่อใกล้เวลา: เหลือ ≥5 วัน = 0 ดวง … ไม่ถึงวัน = ครบ 5
 * เริ่มแล้ว (ไฟดับ = ออกตัว) = 0
 */
export function lightsLit(msLeft: number): number {
  if (!(msLeft > 0)) return 0;
  const days = msLeft / 86_400_000;
  return Math.max(0, Math.min(5, 5 - Math.floor(days)));
}

// วัน/เดือนแบบย่อภาษาไทย (เลือกคำที่ไม่มีวรรณยุกต์ซ้อนบนสระ ิ ี — ตัววาดรูปวางไม่ได้)
const TH_DAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** รหัสแบบ F1 ของ session (ตรงกับ lib/widget.ts) */
const SESSION_CODE: Record<string, string> = {
  "ซ้อม 1": "FP1",
  "ซ้อม 2": "FP2",
  "ซ้อม 3": "FP3",
  "Sprint Quali": "SQ",
  Sprint: "SPRINT",
  Qualifying: "Q",
  Race: "RACE",
};

/** รหัส session แบบ F1 จากชื่อใน lib/f1 ("ซ้อม 1" → FP1, "Qualifying" → Q) */
export const sessionCode = (label: string) => SESSION_CODE[label] ?? label.slice(0, 3).toUpperCase();

export type CardSession = {
  code: string;
  /** "ศ. 2 ต.ค." ตามเขตเวลาของเครื่องผู้ใช้ */
  day: string;
  time: string;
  /** done = จบแล้ว · next = ตัวถัดไป · live = กำลังแข่ง · todo = ยังไม่ถึง */
  state: "done" | "next" | "live" | "todo";
};

/** ตารางทั้งสุดสัปดาห์สำหรับการ์ด — tzMin = เขตเวลาของเครื่อง (นาทีจาก UTC เช่น ไทย = 420) */
export function cardSessions(
  windows: SessionWindow[],
  { next, live, tzMin }: { next: string | null; live: boolean; tzMin: number },
): CardSession[] {
  const list = windows.map((w) => ({ code: sessionCode(w.label), start: w.start }));
  const at = next ? list.findIndex((s) => s.code === next) : -1;
  return list.map((s, i) => {
    const local = new Date(s.start + tzMin * 60_000);
    const hh = String(local.getUTCHours()).padStart(2, "0");
    const mm = String(local.getUTCMinutes()).padStart(2, "0");
    return {
      code: s.code,
      day: `${TH_DAY[local.getUTCDay()]} ${local.getUTCDate()} ${TH_MON[local.getUTCMonth()]}`,
      time: `${hh}:${mm}`,
      // ไม่รู้ตัวถัดไป (จบสุดสัปดาห์แล้ว) → ทุกตัวจบ
      state: at < 0 ? "done" : i < at ? "done" : i === at ? (live ? "live" : "next") : "todo",
    };
  });
}

/** ผู้ชนะครั้งล่าสุดที่สนามนี้ ("VERSTAPPEN", 2017) */
export function lastWinner(
  races: { season: string; Results: { Driver: { familyName: string } }[] }[],
): { name: string; year: number } | null {
  const last = [...races].filter((r) => r.Results[0]).sort((a, b) => Number(b.season) - Number(a.season))[0];
  return last ? { name: last.Results[0].Driver.familyName.toUpperCase(), year: Number(last.season) } : null;
}

/** ขนาดตัวอักษรชื่อสนามให้พอดีความกว้าง (ตัวหนาเอียงแคบ กว้างราว 0.67 เท่าของขนาดต่อตัวอักษร) */
export function fitName(name: string, width: number, max: number, min = 14): number {
  const k = 0.67;
  return Math.max(min, Math.min(max, Math.floor(width / (Math.max(1, name.length) * k))));
}

/** ข้อมูลที่ route วาดการ์ดต้องใช้ — race จากปฏิทินของฤดูกาล */
export function raceCountry(race: Race): string {
  return race.Circuit.Location.country.toUpperCase();
}
