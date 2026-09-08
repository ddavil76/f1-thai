"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * วัดตำแหน่ง/ความกว้างของ item ที่ active (มี data-pill ตรงกับ key)
 * เพื่อเลื่อน "pill" พื้นหลังไปตามนั้น
 */
export function useSlidingPill<T extends HTMLElement>(activeKey: string) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const a = el.querySelector<HTMLElement>(`[data-pill="${activeKey}"]`);
      setStyle(a ? { left: a.offsetLeft, width: a.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeKey]);

  return { ref, style };
}
