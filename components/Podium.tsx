import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RaceWithResults } from "@/lib/f1";
import { teamColor, teamName } from "@/lib/teams";
import PodiumGraphic from "./PodiumGraphic";
import PosterHeading from "./poster/PosterHeading";
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
      <PosterHeading kicker="RESULT" title="ผลการแข่งล่าสุด">
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-display text-[13px] font-semibold text-white/55">
          <span className="round-tag">R{race.round}</span>
          <span className="min-w-0 truncate">{race.raceName}</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
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
      </PosterHeading>

      <PodiumGraphic top3={top3} />

      <Link
        href={`/race/${race.round}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-(--color-f1-text) transition hover:gap-1.5"
      >
        ดูผลเต็ม <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </TiltCard>
  );
}
