import Link from "next/link";
import type { SeasonLeader } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

function Tile({
  label, leader, unit,
}: {
  label: string;
  leader: SeasonLeader | null;
  unit: string;
}) {
  if (!leader || leader.count === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-white/30">—</p>
        <p className="mt-1 text-xs text-white/40">{label}</p>
      </div>
    );
  }
  return (
    <Link
      href={`/driver/${leader.driverId}`}
      className="block p-4 text-center transition hover:bg-white/[0.03]"
    >
      <p className="display text-lg font-bold leading-tight">
        <span style={{ color: teamColor(leader.constructorId) }}>
          {leader.count}
        </span>{" "}
        <span className="text-sm font-medium text-white/40">{unit}</span>
      </p>
      <p className="truncate text-xs text-white/70">{leader.name}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/35">
        {label}
      </p>
    </Link>
  );
}

export default function SeasonStats({
  wins, poles, fastestLaps,
}: {
  wins: SeasonLeader | null;
  poles: SeasonLeader | null;
  fastestLaps: SeasonLeader | null;
}) {
  if (!wins && !poles && !fastestLaps) return null;
  return (
    <section className="card grid grid-cols-3 divide-x divide-white/5 p-0">
      <Tile label="ชนะมากสุด" leader={wins} unit="ครั้ง" />
      <Tile label="pole มากสุด" leader={poles} unit="ครั้ง" />
      <Tile label="fastest lap" leader={fastestLaps} unit="ครั้ง" />
    </section>
  );
}
