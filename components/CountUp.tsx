"use client";

import { useEffect, useState } from "react";

/** นับตัวเลขจาก 0 → value ตอน mount (ถ้า JS ไม่รัน แสดง value ตรง ๆ) */
export default function CountUp({
  value,
  prefix = "",
  duration = 800,
}: {
  value: number;
  prefix?: string;
  duration?: number;
}) {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setN(value);
      return;
    }

    setN(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settle = setTimeout(() => setN(value), duration + 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {n ?? value}
    </span>
  );
}
