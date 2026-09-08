import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RaceWithResults } from "@/lib/f1";
import PodiumGraphic from "./PodiumGraphic";

export default function Podium({ race }: { race: RaceWithResults }) {
  const top3 = race.Results.slice(0, 3);
  if (top3.length < 3) return null;

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-lg font-bold">ผลการแข่งล่าสุด</h2>
        <span className="truncate text-sm text-white/50">
          {race.raceName} · R{race.round}
        </span>
      </div>

      <PodiumGraphic top3={top3} />

      <Link
        href={`/race/${race.round}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-(--color-f1) transition hover:gap-1.5"
      >
        ดูผลเต็ม <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
