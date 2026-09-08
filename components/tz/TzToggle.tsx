"use client";

import { useTz } from "./TzProvider";

const OPTS = [
  { id: "th", label: "ไทย" },
  { id: "circuit", label: "สนาม" },
] as const;

export default function TzToggle() {
  const { pref, setPref } = useTz();

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs font-medium">
      {OPTS.map((o) => (
        <button
          key={o.id}
          onClick={() => setPref(o.id)}
          aria-pressed={pref === o.id}
          className={`rounded-full px-2.5 py-1 transition ${
            pref === o.id ? "bg-(--color-f1) text-white" : "text-white/50 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
