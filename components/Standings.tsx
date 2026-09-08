"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";
import type { DriverStanding, ConstructorStanding } from "@/lib/f1";
import { TEAM_COLOR } from "@/lib/teams";
import { useSlidingPill } from "./useSlidingPill";

function Tabs({
  tab, setTab,
}: {
  tab: "d" | "c";
  setTab: (t: "d" | "c") => void;
}) {
  const { ref, style } = useSlidingPill<HTMLDivElement>(tab);
  return (
    <div
      ref={ref}
      className="relative flex gap-0.5 rounded-full bg-white/5 p-0.5"
    >
      {style && (
        <span
          className="absolute inset-y-0.5 rounded-full bg-(--color-f1) transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
          style={{ left: style.left, width: style.width }}
        />
      )}
      {(["d", "c"] as const).map((id) => (
        <button
          key={id}
          data-pill={id}
          onClick={() => setTab(id)}
          className={`relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === id ? "text-white" : "text-white/60 hover:text-white"
          }`}
        >
          {id === "d" ? "นักแข่ง" : "ทีม"}
        </button>
      ))}
    </div>
  );
}

/** แต้ม + ระยะห่างจากผู้นำ */
function PointsCell({ points, leader }: { points: string; leader: number }) {
  const gap = leader - Number(points);
  return (
    <div className="w-16 shrink-0 text-right">
      <p className="display text-[15px] font-bold leading-none tabular-nums">{points}</p>
      {gap > 0 ? (
        <p className="mt-0.5 text-[11px] tabular-nums text-white/35">−{gap}</p>
      ) : (
        <p className="mt-0.5 text-[11px] font-semibold text-(--color-f1)">นำ</p>
      )}
    </div>
  );
}

export default function Standings({
  drivers, constructors, driverImages = {},
}: {
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
  driverImages?: Record<string, string>;
}) {
  const [tab, setTab] = useState<"d" | "c">("d");

  const driverLeader = Number(drivers[0]?.points ?? 0);
  const constructorLeader = Number(constructors[0]?.points ?? 0);

  if (drivers.length === 0 && constructors.length === 0) {
    return (
      <section className="card p-6 text-center text-sm text-white/50">
        ยังไม่มีตารางคะแนนสำหรับฤดูกาลนี้
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">ตารางคะแนน</h2>
        <Tabs tab={tab} setTab={setTab} />
      </div>

      <ul key={tab} className="animate-crossfade divide-y divide-white/5">
        {tab === "d"
          ? drivers.map((s) => {
              const c = s.Constructors.at(-1);
              const teamCol = TEAM_COLOR[c?.constructorId ?? ""] ?? "#666666";
              const img = driverImages[s.Driver.driverId];
              return (
                <li key={s.Driver.driverId}>
                  <Link
                    href={`/driver/${s.Driver.driverId}`}
                    className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                    {img ? (
                      <span
                        className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
                        style={{
                          boxShadow: `0 0 0 1.5px ${teamCol}`,
                          background: `color-mix(in srgb, ${teamCol} 22%, transparent)`,
                        }}
                      >
                        <Image
                          src={img}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-cover object-top"
                        />
                      </span>
                    ) : (
                      <span
                        className="h-8 w-1 rounded-full"
                        style={{ background: teamCol }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.Driver.givenName.charAt(0)}.{" "}
                        <span className="uppercase">{s.Driver.familyName}</span>
                      </p>
                      <p className="truncate text-xs text-white/50">{c?.name}</p>
                      <div className="h-1 w-full bg-white/10 mt-1 rounded-full overflow-hidden">
                        <div
                          className="grow-x h-full bg-(--color-f1)"
                          style={{
                            width: `${Math.min((Number(s.points) / (driverLeader || 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    {Number(s.wins) > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-white/40">
                        <Trophy className="h-3 w-3" />
                        {s.wins}
                      </span>
                    )}
                    <PointsCell points={s.points} leader={driverLeader} />
                  </Link>
                </li>
              );
            })
          : constructors.map((s) => (
              <li key={s.Constructor.constructorId}>
                <Link
                  href={`/constructor/${s.Constructor.constructorId}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.04]"
                >
                  <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ background: TEAM_COLOR[s.Constructor.constructorId] ?? "#666666" }}
                  />
                  <span className="flex-1 truncate font-medium">{s.Constructor.name}</span>
                  <PointsCell points={s.points} leader={constructorLeader} />
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}