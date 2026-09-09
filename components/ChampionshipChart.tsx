"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChampionshipSeries } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

const W = 680;
const H = 340;
const PAD = { t: 16, r: 92, b: 28, l: 40 };

export default function ChampionshipChart({
  rounds,
  series,
}: {
  rounds: string[];
  series: ChampionshipSeries[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (rounds.length < 2 || series.length === 0) return null;

  const maxPts = Math.max(...series.flatMap((s) => s.points), 1);
  const x = (i: number) =>
    PAD.l + (i / (rounds.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxPts) * (H - PAD.t - PAD.b);
  const band = (W - PAD.l - PAD.r) / (rounds.length - 1);
  const xStep = Math.max(1, Math.ceil(rounds.length / 8));

  // นักแข่งคนที่ 2 ของทีมเดียวกัน → เส้นประ (แยกจากเพื่อนร่วมทีมสีเดียวกัน)
  const seen = new Map<string, number>();
  const dashed = series.map((s) => {
    const n = seen.get(s.constructorId) ?? 0;
    seen.set(s.constructorId, n + 1);
    return n > 0;
  });

  const last = (s: ChampionshipSeries) => s.name.split(" ").at(-1) ?? s.name;

  // ป้ายชื่อท้ายเส้น — ดันแยกกันแนวตั้งไม่ให้ทับ
  const LABEL_GAP = 11;
  const endLabels = series
    .map((s, i) => ({ s, i, y: y(s.points.at(-1) ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < endLabels.length; k++) {
    const d = endLabels[k].y - endLabels[k - 1].y;
    if (d < LABEL_GAP) endLabels[k].y = endLabels[k - 1].y + LABEL_GAP;
  }
  const overflow = endLabels.at(-1) ? endLabels.at(-1)!.y - (H - PAD.b) : 0;
  if (overflow > 0) for (const l of endLabels) l.y -= overflow;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">แชมป์เปี้ยนชิพ</h2>
      <p className="mb-3 text-xs text-white/40">แต้มสะสม · Top {series.length}</p>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <Link
            key={s.driverId}
            href={`/driver/${s.driverId}`}
            className="flex items-center gap-1.5 text-xs text-white/70 transition hover:text-white"
          >
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{
                background: teamColor(s.constructorId),
                opacity: dashed[i] ? 0.55 : 1,
              }}
            />
            {s.name}
          </Link>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px]"
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(maxPts * f)}
                y2={y(maxPts * f)}
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x={PAD.l - 6}
                y={y(maxPts * f) + 3}
                textAnchor="end"
                fontSize="9"
                fill="rgba(255,255,255,0.3)"
              >
                {Math.round(maxPts * f)}
              </text>
            </g>
          ))}

          {rounds.map((r, i) =>
            i % xStep === 0 || i === rounds.length - 1 ? (
              <text
                key={r}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(255,255,255,0.3)"
              >
                R{r}
              </text>
            ) : null,
          )}

          <g className="champ-reveal">
            {series.map((s, si) => (
              <polyline
                key={s.driverId}
                fill="none"
                stroke={teamColor(s.constructorId)}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeDasharray={dashed[si] ? "5 4" : undefined}
                points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              />
            ))}

            {endLabels.map(({ s, y: ly }) => (
              <text
                key={s.driverId}
                x={x(rounds.length - 1) + 6}
                y={ly + 3}
                fontSize="9"
                fontWeight="700"
                fill={teamColor(s.constructorId)}
              >
                {last(s)}
              </text>
            ))}
          </g>

          {rounds.map((r, i) => (
            <rect
              key={r}
              x={x(i) - band / 2}
              y={PAD.t}
              width={band}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="rgba(255,255,255,0.25)"
              />
              {series.map((s) => (
                <circle
                  key={s.driverId}
                  cx={x(hover)}
                  cy={y(s.points[hover])}
                  r="3"
                  fill={teamColor(s.constructorId)}
                />
              ))}
            </>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs backdrop-blur"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform:
                x(hover) > W / 2 ? "translateX(-105%)" : "translateX(5%)",
            }}
          >
            <p className="mb-1 font-bold">รอบ {rounds[hover]}</p>
            {[...series]
              .sort((a, b) => b.points[hover] - a.points[hover])
              .map((s) => (
                <p key={s.driverId} className="flex items-center gap-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: teamColor(s.constructorId) }}
                  />
                  {last(s)}
                  <span className="ml-auto tabular-nums text-white/60">
                    {s.points[hover]}
                  </span>
                </p>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
