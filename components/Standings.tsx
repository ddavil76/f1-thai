"use client";
import { useState } from "react";
import Link from "next/link";
import type { DriverStanding, ConstructorStanding } from "@/lib/f1";
import { TEAM_COLOR } from "@/lib/teams";

function TabBtn({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-(--color-f1) text-white shadow-lg shadow-(--color-f1)/30"
          : "bg-white/10 text-white/70 hover:bg-white/20"
      }`}
    >
      {label}
    </button>
  );
}

/** แต้ม + ระยะห่างจากผู้นำ */
function PointsCell({ points, leader }: { points: string; leader: number }) {
  const gap = leader - Number(points);
  return (
    <div className="w-16 shrink-0 text-right">
      <p className="font-bold leading-none tabular-nums">{points}</p>
      {gap > 0 ? (
        <p className="mt-0.5 text-[11px] tabular-nums text-white/35">−{gap}</p>
      ) : (
        <p className="mt-0.5 text-[11px] font-semibold text-(--color-f1)">นำ</p>
      )}
    </div>
  );
}

export default function Standings({
  drivers, constructors,
}: { drivers: DriverStanding[]; constructors: ConstructorStanding[] }) {
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
        <TabBtn label="นักแข่ง" active={tab === "d"} onClick={() => setTab("d")} />
        <TabBtn label="ทีม" active={tab === "c"} onClick={() => setTab("c")} />
      </div>

      <ul className="divide-y divide-white/5">
        {tab === "d"
          ? drivers.map((s) => {
              const c = s.Constructors.at(-1);
              return (
                <li key={s.Driver.driverId}>
                  <Link
                    href={`/driver/${s.Driver.driverId}`}
                    className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                    <span
                      className="h-8 w-1 rounded-full"
                      style={{ background: TEAM_COLOR[c?.constructorId ?? ""] ?? "#666" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.Driver.givenName.charAt(0)}.{" "}
                        <span className="uppercase">{s.Driver.familyName}</span>
                      </p>
                      <p className="truncate text-xs text-white/50">{c?.name}</p>
                      <div className="h-1 w-full bg-white/10 mt-1 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 transition-all duration-1000"
                          style={{ width: `${Math.min((Number(s.points) / 500) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    {Number(s.wins) > 0 && (
                      <span className="shrink-0 text-xs text-white/40">🏆 {s.wins}</span>
                    )}
                    <PointsCell points={s.points} leader={driverLeader} />
                  </Link>
                </li>
              );
            })
          : constructors.map((s) => (
              <li key={s.Constructor.constructorId} className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.03]">
                <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                <span
                  className="h-8 w-1 rounded-full"
                  style={{ background: TEAM_COLOR[s.Constructor.constructorId] ?? "#666" }}
                />
                <span className="flex-1 truncate font-medium">{s.Constructor.name}</span>
                <PointsCell points={s.points} leader={constructorLeader} />
              </li>
            ))}
      </ul>
    </section>
  );
}