"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSlidingPill } from "./useSlidingPill";

export type TabItem = { key: string; label: string; content: ReactNode };

/**
 * แท็บย่อยในหน้า — เนื้อหาทุกแท็บอยู่ใน DOM (ดีต่อ SEO) แค่ซ่อน/แสดง
 *
 * ทำตามแพตเทิร์น tabs ของ WAI-ARIA: เลื่อนด้วยลูกศรซ้าย/ขวา วนรอบได้
 * Home/End กระโดดหัว-ท้าย และมีแค่แท็บที่เลือกอยู่เท่านั้นที่รับ Tab เข้ามา
 * (roving tabindex) เนื้อหาโหลดครบอยู่แล้วเลยให้เลือกตามโฟกัสไปเลย
 */
export default function SectionTabs({
  tabs,
  initial,
  label = "หัวข้อย่อย",
}: {
  tabs: TabItem[];
  initial?: string;
  /** ชื่อกลุ่มแท็บสำหรับโปรแกรมอ่านหน้าจอ */
  label?: string;
}) {
  const items = tabs.filter(Boolean);
  const [active, setActive] = useState(initial ?? items[0]?.key);
  const { ref, style } = useSlidingPill<HTMLDivElement>(active);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const uid = useId();

  const tabId = (key: string) => `${uid}-tab-${key}`;
  const panelId = (key: string) => `${uid}-panel-${key}`;

  if (items.length === 0) return null;
  if (items.length === 1) return <>{items[0].content}</>;

  const select = (key: string) => {
    setActive(key);
    tabRefs.current.get(key)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === active);
    const to =
      e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length
      : e.key === "ArrowRight" ? (i + 1) % items.length
      : e.key === "Home" ? 0
      : e.key === "End" ? items.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    select(items[to].key);
  };

  return (
    <div className="space-y-4">
      <div
        ref={ref}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
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
            ref={(el) => {
              if (el) tabRefs.current.set(t.key, el);
              else tabRefs.current.delete(t.key);
            }}
            type="button"
            role="tab"
            id={tabId(t.key)}
            data-pill={t.key}
            aria-selected={active === t.key}
            aria-controls={panelId(t.key)}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => setActive(t.key)}
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
          role="tabpanel"
          id={panelId(t.key)}
          aria-labelledby={tabId(t.key)}
          tabIndex={0}
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
