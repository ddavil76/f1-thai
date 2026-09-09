import Image from "next/image";
import Link from "next/link";
import type { RaceResult } from "@/lib/f1";
import { getDriverImages } from "@/lib/drivers";
import { teamColor } from "@/lib/teams";

const SLOTS = [
  { pos: 1, h: "h-20", order: "order-2", delay: 90 },
  { pos: 2, h: "h-14", order: "order-1", delay: 0 },
  { pos: 3, h: "h-11", order: "order-3", delay: 180 },
] as const;

export default async function PodiumGraphic({ top3 }: { top3: RaceResult[] }) {
  if (top3.length < 3) return null;

  const imgs = await getDriverImages(top3.slice(0, 3).map((r) => r.Driver));

  return (
    <div className="flex items-end justify-center gap-2 pt-1">
      {SLOTS.map(({ pos, h, order, delay }) => {
        const r = top3[pos - 1];
        const c = teamColor(r.Constructor.constructorId);
        const img = imgs[r.Driver.driverId];
        return (
          <Link
            key={pos}
            href={`/driver/${r.Driver.driverId}`}
            className={`${order} flex w-[30%] max-w-[7.5rem] flex-col items-center transition hover:-translate-y-0.5`}
          >
            <span
              className="relative mb-1.5 h-10 w-10 shrink-0 overflow-hidden rounded-full sm:h-11 sm:w-11"
              style={{
                boxShadow: `0 0 0 1.5px ${c}`,
                background: `color-mix(in srgb, ${c} 22%, transparent)`,
              }}
            >
              {img && (
                <Image
                  src={img}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover object-top"
                />
              )}
            </span>
            <p className="w-full truncate text-center text-xs font-semibold uppercase">
              {r.Driver.familyName}
            </p>
            <p className="mb-1 text-[10px] text-white/40">{r.points} pts</p>
            <div
              className={`podium-rise ${h} w-full rounded-t-md border-t-2`}
              style={{
                borderColor: c,
                background: `color-mix(in srgb, ${c} 16%, transparent)`,
                animationDelay: `${delay}ms`,
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
