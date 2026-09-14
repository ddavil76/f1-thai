import {
  getSchedule, getSessions, SESSION_MINUTES, DEFAULT_SESSION_MINUTES,
} from "@/lib/f1";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { SEASON } from "@/lib/season";

export const revalidate = 3600;


export async function GET() {
  const races = await getSchedule(SEASON);

  const events: IcsEvent[] = [];
  for (const r of races) {
    const loc = `${r.Circuit.circuitName}, ${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`;
    getSessions(r).forEach((s, idx) => {
      const mins = SESSION_MINUTES[s.label] ?? DEFAULT_SESSION_MINUTES;
      events.push({
        uid: `${r.season}-r${r.round}-s${idx}@f1-week-race`,
        title: `F1 ${r.raceName} — ${s.label}`,
        start: s.at,
        end: new Date(s.at.getTime() + mins * 60_000),
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
