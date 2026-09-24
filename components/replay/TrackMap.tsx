"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackPath } from "@/lib/circuits";
import { dotsAt, type ReplayDot, type ReplayDriver, type ReplayFrame } from "@/lib/replay";

type Pt = { x: number; y: number };

/** จุดรถวิ่งบนผังสนาม — interpolate ตำแหน่งตามเวลาแข่ง */
export default function TrackMap({
  track,
  frames,
  drivers,
  timeRef,
}: {
  track: TrackPath;
  frames: ReplayFrame[];
  drivers: Record<number, ReplayDriver>;
  timeRef: React.RefObject<number>;
}) {
  const [pathEl, setPathEl] = useState<SVGPathElement | null>(null);
  const [samples, setSamples] = useState<Pt[]>([]);
  const [dots, setDots] = useState<ReplayDot[]>([]);
  const raf = useRef(0);

  // สุ่มจุดตามเส้นครั้งเดียว
  useEffect(() => {
    if (!pathEl) return;
    const L = pathEl.getTotalLength();
    const N = 600;
    const arr: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const p = pathEl.getPointAtLength((i / N) * L);
      arr.push({ x: p.x, y: p.y });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSamples(arr);
  }, [pathEl, track.d]);

  // rAF: interpolate จาก timeRef → dots
  useEffect(() => {
    const loop = () => {
      setDots(dotsAt(frames, timeRef.current ?? 0));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [frames, timeRef]);

  const pointAt = (frac: number): Pt => {
    if (samples.length < 2) return { x: 0, y: 0 };
    const f = ((frac % 1) + 1) % 1;
    const idx = f * (samples.length - 1);
    const i = Math.floor(idx);
    const tt = idx - i;
    const p1 = samples[i];
    const p2 = samples[Math.min(i + 1, samples.length - 1)];
    return { x: p1.x + (p2.x - p1.x) * tt, y: p1.y + (p2.y - p1.y) * tt };
  };

  const pad = 8;
  const { d, w, h } = track;
  const viewBox = `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`;
  const sf = samples[0];

  return (
    <figure className="card relative aspect-[2/1] w-full overflow-hidden p-3 sm:aspect-[5/2]">
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <path
          ref={setPathEl}
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {sf && (
          <circle cx={sf.x} cy={sf.y} r={1.6} fill="rgba(255,255,255,0.55)" />
        )}
        {samples.length > 1 &&
          [...dots]
            .sort((a, b) => b.pos - a.pos)
            .map((dot) => {
              const pt = pointAt(dot.frac);
              const c = drivers[dot.num]?.colour ?? "#888";
              return (
                <g
                  key={dot.num}
                  transform={`translate(${pt.x} ${pt.y})`}
                  opacity={dot.out ? 0.25 : 1}
                >
                  <circle r={2.6} fill={c} stroke="#0b0b0d" strokeWidth={0.5} />
                  <text
                    y={-3.6}
                    textAnchor="middle"
                    fontSize={3}
                    fontWeight={700}
                    fill="#fff"
                    stroke="#0b0b0d"
                    strokeWidth={0.6}
                    paintOrder="stroke"
                  >
                    {drivers[dot.num]?.code}
                  </text>
                </g>
              );
            })}
      </svg>
    </figure>
  );
}
