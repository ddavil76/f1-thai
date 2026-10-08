import type { CSSProperties, ReactNode } from "react";
import type { ActionKind, IncidentFace, PitwallKind } from "@/lib/boardgame/engine";

/**
 * ภาพไพ่ที่วาดไว้ (public/boardgame/art) — ภาพไพ่เต็มใบมีหัวไพ่และกล่องกติกาในตัว
 * ในเกมตัดมาแค่ช่วงภาพฉากกลางใบ แล้วใส่ตัวเลข/ข้อความจริงทับเอง
 */
export const artUrl = (name: string) => `/boardgame/art/${name}.webp`;

export const PITWALL_ART: Partial<Record<PitwallKind, string>> = {
  charge: "charge",
  tires: "tyre-care",
  teamSpeed: "teamwork",
  quickBox: "quick-box",
  push: "push",
};

export const ACTION_ART: Partial<Record<ActionKind, string>> = {
  tires: "tyre-damage",
  ersFail: "ers-failure",
  brakes: "hot-brakes",
  trackLimits: "track-limits",
  incident: "incident",
};

export const DIE_ART: Record<IncidentFace, string> = {
  escape: "die-close-call",
  back: "die-lost-time",
  off: "die-off-track",
  damage: "die-damage",
  crash: "die-crash",
  warn: "die-warning",
  penalty: "die-penalty",
};

/** ช่วงภาพฉากของไพ่ (ตัดหัวไพ่และกล่องกติกาออก) */
export function Scene({ name, className = "", zoom = 118, y = 40, children }: { name: string; className?: string; zoom?: number; y?: number; children?: ReactNode }) {
  const style: CSSProperties = {
    backgroundImage: `url(${artUrl(name)})`,
    backgroundSize: `${zoom}% auto`,
    backgroundPosition: `50% ${y}%`,
    backgroundRepeat: "no-repeat",
  };
  return (
    <span className={`block overflow-hidden bg-[#1F1F24] ${/\babsolute\b/.test(className) ? "" : "relative"} ${className}`} style={style} aria-hidden>
      {children}
    </span>
  );
}

/** หลังไพ่ทั้งใบ */
export function CardBack({ name }: { name: string }) {
  return (
    <span
      className="block h-full w-full bg-[#08080A]"
      style={{ backgroundImage: `url(${artUrl(name)})`, backgroundSize: "cover", backgroundPosition: "center" }}
      aria-hidden
    />
  );
}
