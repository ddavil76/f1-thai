import Link from "next/link";
import type { RaceResult } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

const SLOTS = [
  { pos: 1, h: "h-20", order: "order-2" },
  { pos: 2, h: "h-14", order: "order-1" },
  { pos: 3, h: "h-11", order: "order-3" },
] as const;

export default function PodiumGraphic({ top3 }: { top3: RaceResult[] }) {
  if (top3.length < 3) return null;

  return (
    <div className="flex items-end justify-center gap-2 pt-1">
      {SLOTS.map(({ pos, h, order }) => {
        const r = top3[pos - 1];
        const c = teamColor(r.Constructor.constructorId);
        return (
          <Link
            key={pos}
            href={`/driver/${r.Driver.driverId}`}
            className={`${order} flex w-[30%] max-w-[7.5rem] flex-col items-center transition hover:-translate-y-0.5`}
          >
            <p className="mb-0.5 w-full truncate text-center text-xs font-semibold uppercase">
              {r.Driver.familyName}
            </p>
            <p className="mb-1 text-[10px] text-white/40">{r.points} pts</p>
            <div
              className={`${h} w-full rounded-t-md border-t-2`}
              style={{
                borderColor: c,
                background: `color-mix(in srgb, ${c} 16%, transparent)`,
              }}
            >
              <p
                className="display pt-1 text-center text-2xl font-bold leading-none"
                style={{ color: c }}
              >
                {pos}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
