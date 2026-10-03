import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSchedule, isPastRace, toDate } from "@/lib/f1";
import { circuitTrack } from "@/lib/circuits";
import RaceAnalysis from "@/components/RaceAnalysis";
import SiteFooter from "@/components/SiteFooter";
import SpeedStreak from "@/components/poster/SpeedStreak";
import { SEASON } from "@/lib/season";
import { telemetrySessions } from "@/lib/telemetry-sessions";
import { trackGroundPoints } from "@/lib/track3d";
import { hasOsmScene } from "@/lib/osm-scene";
import { cardName } from "@/lib/widget-card";

export const revalidate = 3600;


type Params = { params: Promise<{ round: string }> };

export const dynamicParams = true;

// render ตอนเข้าครั้งแรก แล้ว cache (ข้อมูล openf1 หนัก)
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { round } = await params;
  const race = (await getSchedule(SEASON).catch(() => [])).find(
    (r) => r.round === round,
  );
  if (!race) return {};
  return {
    title: `รีเพลย์ · ${race.raceName}`,
    description: `รีเพลย์ไทม์มิ่งรอบต่อรอบ และเทียบความเร็ว คันเร่ง เบรก เกียร์ ของ ${race.raceName}`,
  };
}

export default async function ReplayPage({ params }: Params) {
  const { round } = await params;
  const races = await getSchedule(SEASON);
  const race = races.find((r) => r.round === round);
  if (!race) notFound();

  const past = isPastRace(race);
  const circuitId = race.Circuit.circuitId;
  const track = circuitTrack(circuitId);
  // เทเลเมทรีมีตั้งแต่ปี 2023 · เทียบได้ตั้งแต่ (สปรินต์)ควอลิฟายจบ แม้เรซยังไม่แข่ง
  const sessions = SEASON >= 2023 ? telemetrySessions(race) : [];
  // สนามที่มีฉากรอบสนามจริง (OSM) → ผังที่ผูกกับแผนที่ ไว้วางเส้นจากพิกัดรถให้ตรง
  const ground = track && hasOsmScene(circuitId) ? trackGroundPoints(track) : undefined;

  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link
          href={`/race/${round}`}
          className="inline-flex items-center gap-1 text-sm text-white/55 transition hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {race.raceName}
        </Link>
        <p className="poster mt-3 text-sm text-(--color-f1-text)">
          REPLAY · {cardName(circuitId, race.Circuit.circuitName)}
        </p>
        <h1 className="mt-1 text-2xl font-black md:text-3xl">
          รีเพลย์ &amp; เทเลเมทรี
        </h1>
        <SpeedStreak className="mt-2.5" />
        <p className="mt-2 flex items-center gap-2 font-display text-sm font-semibold text-white/55">
          <span className="round-tag">R{race.round}</span>
          {race.Circuit.circuitName}
        </p>
      </div>

      <RaceAnalysis
        replay={
          past
            ? {
                season: SEASON,
                raceStart: toDate({ date: race.date, time: race.time })?.toISOString() ?? null,
                track,
                circuitId,
              }
            : null
        }
        telemetry={sessions.length > 0 ? { season: SEASON, sessions, circuitId, ground } : null}
      />

      <SiteFooter source="openf1" />
    </main>
  );
}
