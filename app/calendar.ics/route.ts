import { getSchedule, getSessions } from "@/lib/f1";
import { buildIcs, type IcsEvent } from "@/lib/ics";

export const revalidate = 3600;

const SEASON = new Date().getFullYear();

// ระยะเวลาโดยประมาณของแต่ละ session (นาที)
function durationMin(label: string) {
  if (label.includes("Race")) return 120;
  if (label.includes("Sprint") && !label.includes("Quali")) return 60;
  if (label.includes("Qualifying") || label.includes("Quali")) return 60;
  return 60; // practice
}

export async function GET() {
  const races = await getSchedule(SEASON);

  const events: IcsEvent[] = [];
  for (const r of races) {
    const loc = `${r.Circuit.circuitName}, ${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`;
    getSessions(r).forEach((s, idx) => {
      const label = s.label.replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, "").trim();
      events.push({
        uid: `${r.season}-r${r.round}-s${idx}@f1-week-race`,
        title: `F1 ${r.raceName} — ${label}`,
        start: s.at,
        end: new Date(s.at.getTime() + durationMin(s.label) * 60_000),
        location: loc,
      });
    });
  }

  const body = buildIcs(events, `F1 ${SEASON} — เวลาไทย`);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="f1-${SEASON}.ics"`,
    },
  });
}
