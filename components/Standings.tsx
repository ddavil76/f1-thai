"use client";
import { useState } from "react";
import type { DriverStanding, ConstructorStanding } from "@/lib/f1";

const TEAM_COLOR: Record<string, string> = {
  red_bull: "#3671C6", ferrari: "#E8002D", mercedes: "#27F4D2",
  mclaren: "#FF8000", aston_martin: "#229971", alpine: "#00A1E8",
  williams: "#1868DB", rb: "#6692FF", sauber: "#01C00E", haas: "#B6BABD",
  audi: "#BB0A30", cadillac: "#B3995D",
};

export default function Standings({
  drivers, constructors,
}: { drivers: DriverStanding[]; constructors: ConstructorStanding[] }) {
  const [tab, setTab] = useState<"d" | "c">("d");

  const TabBtn = ({ id, label }: { id: "d" | "c"; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        tab === id ? "bg-red-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/20"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl bg-neutral-900 p-5">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">ตารางคะแนน</h2>
        <TabBtn id="d" label="นักแข่ง" />
        <TabBtn id="c" label="ทีม" />
      </div>

      <ul className="divide-y divide-white/5">
        {tab === "d"
          ? drivers.map((s) => {
              const c = s.Constructors.at(-1);
              return (
                <li key={s.Driver.driverId} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ background: TEAM_COLOR[c?.constructorId ?? ""] ?? "#666" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.Driver.givenName} <span className="uppercase">{s.Driver.familyName}</span>
                    </p>
                    <p className="truncate text-xs text-white/50">{c?.name}</p>
                  </div>
                  {Number(s.wins) > 0 && (
                    <span className="text-xs text-white/40">🏆 {s.wins}</span>
                  )}
                  <span className="w-14 text-right font-bold tabular-nums">{s.points}</span>
                </li>
              );
            })
          : constructors.map((s) => (
              <li key={s.Constructor.constructorId} className="flex items-center gap-3 py-2.5">
                <span className="w-6 text-right text-sm text-white/40">{s.position}</span>
                <span
                  className="h-8 w-1 rounded-full"
                  style={{ background: TEAM_COLOR[s.Constructor.constructorId] ?? "#666" }}
                />
                <span className="flex-1 truncate font-medium">{s.Constructor.name}</span>
                <span className="w-14 text-right font-bold tabular-nums">{s.points}</span>
              </li>
            ))}
      </ul>
    </section>
  );
}