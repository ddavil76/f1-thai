"use client";

import { useEffect, useRef } from "react";

/**
 * ใส่ data-offscreen ให้กล่องตอนเลื่อนพ้นจอ — CSS ใช้หยุดแอนิเมชันที่วนไม่รู้จบ
 * (เช่น จุดแสงวิ่งรอบผังสนาม) ไม่ให้วาดทุกเฟรมทั้งที่มองไม่เห็น
 */
export default function OffscreenPause({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.removeAttribute("data-offscreen");
      else el.setAttribute("data-offscreen", "");
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
