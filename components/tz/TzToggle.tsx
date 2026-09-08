"use client";

import { Clock } from "lucide-react";
import { useTz } from "./TzProvider";
import { useSlidingPill } from "../useSlidingPill";

const OPTS = [
  { id: "th", label: "ไทย", title: "แสดงเวลาแบบเวลาประเทศไทย" },
  { id: "circuit", label: "สนาม", title: "แสดงเวลาตามเขตเวลาของสนามแข่ง" },
] as const;

export default function TzToggle() {
  const { pref, setPref } = useTz();
  const { ref, style } = useSlidingPill<HTMLDivElement>(pref);

  return (
    <div className="flex items-center gap-1.5" aria-label="เลือกเขตเวลาที่ใช้แสดงผล">
      <Clock className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden="true" />
      <span className="text-xs text-white/40">เวลา</span>
      <div
        ref={ref}
        className="relative flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs font-medium"
      >
        {style && (
          <span
            className="absolute inset-y-0.5 rounded-full bg-(--color-f1) transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
            style={{ left: style.left, width: style.width }}
          />
        )}
        {OPTS.map((o) => (
          <button
            key={o.id}
            data-pill={o.id}
            onClick={() => setPref(o.id)}
            aria-pressed={pref === o.id}
            title={o.title}
            className={`relative z-10 rounded-full px-2.5 py-1 transition-colors ${
              pref === o.id ? "text-white" : "text-white/50 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
