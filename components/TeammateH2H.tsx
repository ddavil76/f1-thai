import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DriverRaceResult } from "@/lib/f1";
import { raceHeadToHead } from "@/lib/compare";
import H2HBar from "./H2HBar";

export default function TeammateH2H({
  selfId,
  teammateId,
  teammateName,
  self,
  mate,
  selfPoints,
  matePoints,
  color,
}: {
  selfId: string;
  teammateId: string;
  teammateName: string;
  self: DriverRaceResult[];
  mate: DriverRaceResult[];
  selfPoints: number;
  matePoints: number;
  /** สีทีม — แถบฝั่งนักขับคนนี้ */
  color: string;
}) {
  const { grid, race } = raceHeadToHead(self, mate);
  if (grid[0] + grid[1] + race[0] + race[1] === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-bold">ปะทะเพื่อนร่วมทีม</h2>
      <p className="mb-4 text-xs text-white/40">
        เทียบกับ{" "}
        <Link
          href={`/driver/${teammateId}`}
          className="text-white/70 underline-offset-2 hover:underline"
        >
          {teammateName}
        </Link>
      </p>
      <div className="space-y-3">
        <H2HBar label="ออกตัวนำ" a={grid[0]} b={grid[1]} aColor={color} />
        <H2HBar label="จบก่อน" a={race[0]} b={race[1]} aColor={color} />
        <H2HBar label="แต้มสะสม" a={selfPoints} b={matePoints} aColor={color} />
      </div>
      <Link
        href={`/compare?a=${selfId}&b=${teammateId}`}
        className="mt-4 inline-flex items-center gap-0.5 text-sm font-medium text-(--color-f1) transition hover:gap-1"
      >
        เทียบละเอียด หรือเลือกนักขับคนอื่น
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
