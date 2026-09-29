import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSchedule } from "@/lib/f1";
import TelemetryCompare from "@/components/telemetry/TelemetryCompare";
import SiteFooter from "@/components/SiteFooter";
import { SEASON } from "@/lib/season";
import { telemetrySessions } from "@/lib/telemetry-sessions";

export const revalidate = 3600;

type Params = { params: Promise<{ round: string }> };

export const dynamicParams = true;

// render ตอนเข้าครั้งแรก แล้ว cache — ข้อมูลเทเลเมทรีโหลดฝั่ง client ทั้งหมด
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { round } = await params;
  const race = (await getSchedule(SEASON).catch(() => [])).find((r) => r.round === round);
  if (!race) return {};
  return {
    title: `เทเลเมทรี · ${race.raceName}`,
    description: `เทียบความเร็ว คันเร่ง เบรก เกียร์ รอบต่อรอบของนักแข่งใน ${race.raceName}`,
  };
}

export default async function TelemetryPage({ params }: Params) {
  const { round } = await params;
  const races = await getSchedule(SEASON);
  const race = races.find((r) => r.round === round);
  if (!race) notFound();

  const sessions = telemetrySessions(race);

  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link
          href={`/race/${round}`}
          className="inline-flex items-center gap-1 text-sm text-white/40 transition hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {race.raceName}
        </Link>
        <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">เทียบเทเลเมทรี</h1>
        <p className="text-sm text-white/50">
          Round {race.round} · {race.Circuit.circuitName} · ความเร็ว คันเร่ง เบรก เกียร์ ของสองคนในรอบเดียวกัน
        </p>
      </div>

      {SEASON < 2023 ? (
        <p className="card p-6 text-sm text-white/60">เทเลเมทรีมีตั้งแต่ฤดูกาล 2023</p>
      ) : sessions.length > 0 ? (
        <TelemetryCompare season={SEASON} sessions={sessions} />
      ) : (
        <p className="card p-6 text-sm text-white/60">ยังไม่มีควอลิฟายหรือเรซของสนามนี้ — กลับมาดูหลังแข่ง</p>
      )}

      <p className="text-xs text-white/35">
        ข้อมูลรถ ~3–4 ครั้งต่อวินาที เบรกมีแค่เหยียบ/ไม่เหยียบ · ระยะทางคำนวณจากความเร็ว จึงอาจคลาดจากความยาวสนามจริงเล็กน้อย
      </p>

      <SiteFooter source="openf1" />
    </main>
  );
}
