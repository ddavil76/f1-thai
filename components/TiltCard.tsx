"use client";

import { useEffect, useRef } from "react";

/** เอียงได้สุดกี่องศา — มากกว่านี้อ่านตัวหนังสือบนการ์ดยาก */
const MAX_DEG = 7;

/**
 * การ์ดที่เอียงตามเมาส์/นิ้วแบบ 3 มิติ พร้อมแสงสะท้อนวิ่งตาม (CSS ล้วน ไม่ใช้ WebGL)
 *
 * · เมาส์: เอียงตามตอนชี้ · นิ้ว: เอียงตอนกดค้าง/ลาก พอเลื่อนหน้าเบราว์เซอร์ยกเลิกเอง (pointercancel)
 * · ตั้งค่าตัวแปร CSS ผ่าน ref ตรง ๆ ไม่ setState — ไม่ re-render ทุกครั้งที่ขยับ
 * · "ลดการเคลื่อนไหว" → ไม่ผูก event เลย (และ CSS ปิด transform ไว้อีกชั้น)
 */
export default function TiltCard({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const move = (e: PointerEvent) => {
      // ปุ่ม/ลิงก์ในการ์ดยังกดได้ปกติ — แค่ไม่เอียงตอนเมาส์ไม่ได้ชี้ (touch ต้องกดค้าง)
      if (e.pointerType !== "mouse" && e.buttons === 0) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width; // 0..1
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--tilt-x", `${((0.5 - y) * 2 * MAX_DEG).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${((x - 0.5) * 2 * MAX_DEG).toFixed(2)}deg`);
        el.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
        el.dataset.tilting = "";
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      delete el.dataset.tilting;
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("pointerleave", reset);
    el.addEventListener("pointerup", reset);
    el.addEventListener("pointercancel", reset);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", move);
      el.removeEventListener("pointerleave", reset);
      el.removeEventListener("pointerup", reset);
      el.removeEventListener("pointercancel", reset);
    };
  }, []);

  return (
    <section ref={ref} className={`tilt ${className}`} style={style}>
      {children}
    </section>
  );
}
