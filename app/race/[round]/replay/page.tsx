import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSchedule, isPastRace } from "@/lib/f1";
import { getRaceReplay } from "@/lib/replay";
import ReplayPlayer from "@/components/replay/ReplayPlayer";

export const revalidate = 3600;

const SEASON = new Date().getFullYear();

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
    description: `รีเพลย์ไทม์มิ่งรอบต่อรอบของ ${race.raceName}`,
  };
}

export default async function ReplayPage({ params }: Params) {
  const { round } = await params;
  const races = await getSchedule(SEASON);
  const race = races.find((r) => r.round === round);
  if (!race) notFound();

  const replay = isPastRace(race)
    ? await getRaceReplay(SEASON, race.date)
    : null;

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
        <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
          รีเพลย์ไทม์มิ่ง
        </h1>
        <p className="text-sm text-white/50">
          Round {race.round} · {race.Circuit.circuitName}
        </p>
      </div>

      {replay ? (
        <ReplayPlayer replay={replay} />
      ) : (
        <p className="card p-6 text-sm text-white/60">
          {isPastRace(race)
            ? "ยังไม่มีข้อมูลรีเพลย์สำหรับสนามนี้ (รองรับตั้งแต่ปี 2023 และหลังแข่งจบสักพัก)"
            : "สนามนี้ยังไม่ได้แข่ง"}
        </p>
      )}

      <footer className="pb-8 text-center text-xs text-white/30">
        ข้อมูลจาก openf1.org · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
