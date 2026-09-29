"use client";

import { setSceneStyle, type SceneStyle } from "@/lib/three-style";

/** ปุ่มสลับฉาก 3D "สมจริง / เรียบ" — ค่าที่เลือกใช้ทุกฉากและจำไว้ในเครื่อง */
export default function SceneStyleToggle({ value }: { value: SceneStyle }) {
  const opts: [SceneStyle, string][] = [
    ["real", "สมจริง"],
    ["simple", "เรียบ"],
  ];
  return (
    <span className="pointer-events-auto inline-flex rounded-full bg-black/55 p-0.5 text-[10px] font-semibold backdrop-blur" role="group" aria-label="รูปแบบฉาก 3D">
      {opts.map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => setSceneStyle(k)}
          className={`rounded-full px-2 py-0.5 transition ${value === k ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
