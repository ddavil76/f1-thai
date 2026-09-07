const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");

export function googleCalendarUrl(opts: {
  title: string;
  start: Date;
  durationMin?: number;
  location?: string;
  details?: string;
}) {
  const end = new Date(opts.start.getTime() + (opts.durationMin ?? 120) * 60000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${fmt(opts.start)}/${fmt(end)}`,
    location: opts.location ?? "",
    details: opts.details ?? "",
    ctz: "Asia/Bangkok",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}