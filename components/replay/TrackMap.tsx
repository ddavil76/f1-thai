"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TrackPath } from "@/lib/circuits";
import type { ReplayDriver, ReplayRow } from "@/lib/replay";

type Pt = { x: number; y: number };

/** จุดรถวิ่งบนผังสนาม — ตำแหน่งประมาณจากสัดส่วนเวลาในรอบ */
export default function TrackMap({
  track,
  rows,
  drivers,
  playing,
  stepMs,
}: {
  track: TrackPath;
  rows: ReplayRow[];
  drivers: Record<number, ReplayDriver>;
  playing: boolean;
  stepMs: number;
}) {
  const [pathEl, setPathEl] = useState<SVGPathElement | null>(null);
  const [samples, setSamples] = useState<Pt[]>([]);
  const [disp, setDisp] = useState<Record<number, number>>({});
  const target = useRef<Record<number, number>>({});
  const raf = useRef(0);

  // สุ่มจุดตามเส้นครั้งเดียว → lerp ตอน render (เร็วกว่าเรียก getPointAtLength ทุกเฟรม)
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

  // ตั้งเป้าหมายเมื่อเฟรมเปลี่ยน (r.frac = ระยะทางสะสม เพิ่มขึ้นเรื่อย ๆ)
  useEffect(() => {
    setDisp((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        target.current[r.num] = r.frac;
        const cur = prev[r.num];
        // ครั้งแรก / scrub / กระโดดไกล → snap ทันที
        if (cur == null || !playing || Math.abs(r.frac - cur) > 1.6) {
          next[r.num] = r.frac;
        }
      }
      return next;
    });
  }, [rows, playing]);

  // ease เข้าหาเป้าหมาย
  useEffect(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const rate = Math.min(1, (dt / (playing ? stepMs : 200)) * 2);
      setDisp((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const num in target.current) {
          const t = target.current[num];
          const cur = prev[num] ?? t;
          const d = t - cur;
          if (Math.abs(d) < 0.0004) {
            if (cur !== t) {
              next[num] = t;
              changed = true;
            }
            continue;
          }
          next[num] = cur + d * rate;
          changed = true;
        }
        return changed ? next : prev;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, stepMs]);

  const pointAt = useMemo(() => {
    return (frac: number): Pt => {
      if (samples.length < 2) return { x: 0, y: 0 };
      const f = ((frac % 1) + 1) % 1;
      const idx = f * (samples.length - 1);
      const i = Math.floor(idx);
      const t = idx - i;
      const a = samples[i];
      const b = samples[Math.min(i + 1, samples.length - 1)];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };
  }, [samples]);

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
          [...rows]
            .sort((a, b) => b.pos - a.pos)
            .map((r) => {
              const pt = pointAt(disp[r.num] ?? r.frac);
              const c = drivers[r.num]?.colour ?? "#888";
              return (
                <g
                  key={r.num}
                  transform={`translate(${pt.x} ${pt.y})`}
                  opacity={r.out ? 0.25 : 1}
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
                    {drivers[r.num]?.code}
                  </text>
                </g>
              );
            })}
      </svg>
    </figure>
  );
}
