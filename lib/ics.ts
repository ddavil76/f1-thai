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

/** ห่อบรรทัดยาวตาม RFC 5545 (75 octets) — พอประมาณด้วยความยาวอักขระ */
function fold(line: string) {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 73) {
    chunks.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) chunks.push(" " + rest);
  return chunks.join("\r\n");
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
      fold(`SUMMARY:${esc(e.title)}`),
    );
    if (e.location) lines.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${esc(e.description)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
