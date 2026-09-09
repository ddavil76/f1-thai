"use client";

import { useState, type ReactNode } from "react";
import { useSlidingPill } from "./useSlidingPill";

export type TabItem = { key: string; label: string; content: ReactNode };

/**
 * แท็บย่อยในหน้า — เนื้อหาทุกแท็บอยู่ใน DOM (ดีต่อ SEO) แค่ซ่อน/แสดง
 */
export default function SectionTabs({
  tabs,
  initial,
}: {
  tabs: TabItem[];
  initial?: string;
}) {
  const items = tabs.filter(Boolean);
  const [active, setActive] = useState(initial ?? items[0]?.key);
  const { ref, style } = useSlidingPill<HTMLDivElement>(active);

  if (items.length === 0) return null;
  if (items.length === 1) return <>{items[0].content}</>;

  return (
    <div className="space-y-4">
      <div
        ref={ref}
        className="relative flex gap-0.5 overflow-x-auto rounded-full bg-white/5 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {style && (
          <span
            className="absolute inset-y-0.5 rounded-full bg-(--color-f1) transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
            style={{ left: style.left, width: style.width }}
          />
        )}
        {items.map((t) => (
          <button
            key={t.key}
            type="button"
            data-pill={t.key}
            onClick={() => setActive(t.key)}
            aria-pressed={active === t.key}
            className={`relative z-10 shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active === t.key ? "text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.map((t) => (
        <div
          key={t.key}
          className={
            t.key === active ? "animate-crossfade space-y-6" : "hidden"
          }
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
