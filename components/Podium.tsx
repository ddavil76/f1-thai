import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RaceWithResults } from "@/lib/f1";
import { teamColor, teamName } from "@/lib/teams";
import PodiumGraphic from "./PodiumGraphic";
import TiltCard from "./TiltCard";

export default function Podium({ race }: { race: RaceWithResults }) {
  const top3 = race.Results.slice(0, 3);
  if (top3.length < 3) return null;

  const team = top3[0].Constructor;
  const winner = teamColor(team.constructorId);

  return (
    <TiltCard
      className="card winner-glow p-5"
      style={{ "--winner": winner } as React.CSSProperties}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-lg font-bold">ผลการแข่งล่าสุด</h2>
        <span className="truncate text-sm text-white/50">
          {race.raceName} · R{race.round}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            // ผสมขาวให้อ่านออกบนพื้นมืด แม้สีทีมจะเข้ม (Williams, Red Bull)
            color: `color-mix(in srgb, ${winner} 70%, white)`,
            background: `color-mix(in srgb, ${winner} 14%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${winner} 40%, transparent)`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: winner }} />
          ผู้ชนะ · {teamName(team.constructorId, team.name)}
        </span>
      </div>

      <PodiumGraphic top3={top3} />

      <Link
        href={`/race/${race.round}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-(--color-f1) transition hover:gap-1.5"
      >
        ดูผลเต็ม <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </TiltCard>
  );
}
