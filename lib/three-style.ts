/* ---------- รูปแบบฉาก 3D: "สมจริง" (สนาม+รถ) / "เรียบ" (เส้นเรืองแสง) ---------- */
// ค่าที่เลือกใช้ร่วมกันทุกฉาก (ผังสนาม / รีเพลย์ / เทเลเมทรี) และจำไว้ในเครื่อง

import { useSyncExternalStore } from "react";

export type SceneStyle = "real" | "simple";

const KEY = "f1-3d-style";
const EVENT = "f1-3d-style";

function read(): SceneStyle {
  try {
    return localStorage.getItem(KEY) === "simple" ? "simple" : "real";
  } catch {
    return "real";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setSceneStyle(s: SceneStyle) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* โหมดส่วนตัว — ใช้ได้เฉพาะหน้านี้ */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** ค่าเริ่มต้น "สมจริง" · ฝั่งเซิร์ฟเวอร์คืน "real" เสมอ (ฉาก 3D สร้างฝั่ง client อยู่แล้ว) */
export function useSceneStyle(): SceneStyle {
  return useSyncExternalStore(subscribe, read, () => "real");
}

/** สนามที่แข่งกลางคืน — ฉากสมจริงใช้ท้องฟ้ากลางคืน */
const NIGHT = new Set(["marina_bay", "vegas", "bahrain", "jeddah", "losail", "yas_marina"]);
export const isNightCircuit = (circuitId?: string | null) => !!circuitId && NIGHT.has(circuitId);

/** พื้นหลังของกรอบ 3D แบบสมจริง (ท้องฟ้า) — canvas โปร่งใสวางทับ */
export function skyBackground(night: boolean): string {
  return night
    ? "linear-gradient(180deg, #03060f 0%, #0b1733 55%, #1b2a4a 100%)"
    : "linear-gradient(180deg, #4f86c6 0%, #9cc3e6 55%, #dce9f2 100%)";
}

/** สีหมอก (ต้องกลืนกับท้องฟ้าตรงขอบฟ้า) */
export const fogColor = (night: boolean) => (night ? 0x1b2a4a : 0xdce9f2);

/**
 * ขยายความสูงของเนินในแบบสมจริง — แบบเรียบใช้ ×5 ให้เห็นเนินชัด
 * แต่มีรถวิ่งอยู่ด้วย ×5 จะดูเหมือนไต่ภูเขา
 */
export const REAL_EXAGGERATION = 2;
