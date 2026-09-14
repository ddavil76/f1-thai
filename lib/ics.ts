export type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → 20260913T200000Z (UTC) */
function stamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;

const MAX_OCTETS = 75;

/**
 * ห่อบรรทัดยาวตาม RFC 5545 §3.1 — บรรทัดหนึ่งยาวได้ไม่เกิน 75 octets (ไม่นับ CRLF)
 * บรรทัดต่อขึ้นต้นด้วยช่องว่าง 1 ตัว ซึ่งนับรวมในโควตา 75 ด้วย
 *
 * ต้องนับเป็น octets ไม่ใช่จำนวนตัวอักษร — อักษรไทยตัวละ 3 bytes ใน UTF-8
 * บรรทัด 74 ตัวอักษรจึงกลายเป็น 222 octets ได้สบาย ๆ และต้องไล่ทีละ code point
 * ไม่ให้ตัดผ่ากลางลำดับ UTF-8 หรือผ่า surrogate pair ของอิโมจิ
 */
function fold(line: string) {
  if (octets(line) <= MAX_OCTETS) return line;

  const out: string[] = [];
  let cur = "";
  let bytes = 0;

  // for..of ไล่ทีละ code point (surrogate pair นับเป็นตัวเดียว) ไม่ใช่ทีละ UTF-16 unit
  for (const ch of line) {
    const n = octets(ch);
    if (bytes + n > MAX_OCTETS) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);

  return out.join("\r\n");
}

export function buildIcs(events: IcsEvent[], calName = "F1 Week Race"): string {
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//F1 Week Race//TH//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:Asia/Bangkok",
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // ห่อตอนท้ายทีเดียว — บรรทัดไหนก็ยาวเกินได้ ไม่ใช่แค่ที่ผู้ใช้กรอกเอง
  return lines.map(fold).join("\r\n") + "\r\n";
}
