import { ImageResponse } from "next/og";
import { getSchedule, findNextRace, toDate } from "@/lib/f1";

export const alt = "F1 Week Race — ตารางแข่ง F1 เวลาไทย";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const SEASON = new Date().getFullYear();

export default async function Image() {
  let next: Awaited<ReturnType<typeof getSchedule>>[number] | undefined;
  try {
    next = findNextRace(await getSchedule(SEASON));
  } catch {
    next = undefined;
  }

  const start = next ? toDate({ date: next.date, time: next.time }) : null;
  const when = start
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(start)
    : null;
  const daysLeft = start
    ? Math.max(0, Math.ceil((start.getTime() - Date.now()) / 86_400_000))
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(1100px 700px at 100% 0%, #7a0300 0%, #120b0b 55%, #08080a 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 14, height: 64, background: "#e10600", borderRadius: 6 }} />
          <div style={{ display: "flex", gap: 12, fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>
            <span>F1</span>
            <span style={{ color: "#ff3b30" }}>Week Race</span>
          </div>
        </div>

        {next ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#ff6b63", letterSpacing: 3 }}>
              {`NEXT RACE · ROUND ${next.round}`}
            </div>
            <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, lineHeight: 1.05 }}>
              {next.raceName}
            </div>
            <div style={{ fontSize: 32, color: "rgba(255,255,255,0.7)" }}>
              {`${next.Circuit.circuitName} · ${next.Circuit.Location.locality}, ${next.Circuit.Location.country}`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 900 }}>Season {SEASON} has finished</div>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.85)" }}>
            {when ? `${when} · GMT+7` : "Thailand time · GMT+7"}
          </div>
          {daysLeft !== null && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 20,
                padding: "14px 28px",
              }}
            >
              <span style={{ fontSize: 58, fontWeight: 900, color: "#e10600" }}>
                {daysLeft}
              </span>
              <span style={{ fontSize: 26, color: "rgba(255,255,255,0.75)" }}>days to go</span>
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
