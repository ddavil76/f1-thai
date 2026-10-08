import type { ReactNode } from "react";
import type { ActionKind, Compound, PitwallKind } from "@/lib/boardgame/engine";
import { COMPOUND_COLOR } from "@/components/boardgame/look";

/**
 * รูปบนไพ่ — วาดเองทั้งหมด (SVG 48×48 สีตาม currentColor) ให้เห็นแล้วเดาได้ว่าไพ่ทำอะไร
 * ไม่ใช้โลโก้หรือรูปของจริง
 */
function Svg({ children, className = "h-9 w-9" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** ตัวรถเล็ก ๆ มุมบน หัวชี้ขวา */
const MiniCar = ({ x = 10, y = 18, fill = "currentColor" }: { x?: number; y?: number; fill?: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="0" y="1" width="3" height="10" rx="1" fill={fill} stroke="none" />
    <rect x="5" y="-1" width="5" height="3" rx="1" fill={fill} stroke="none" />
    <rect x="5" y="10" width="5" height="3" rx="1" fill={fill} stroke="none" />
    <rect x="17" y="0" width="4" height="2.6" rx="1" fill={fill} stroke="none" />
    <rect x="17" y="9.4" width="4" height="2.6" rx="1" fill={fill} stroke="none" />
    <path d="M3 4.5 L12 4 L14 2.5 L20 4.5 L26 5.5 L26 6.5 L20 7.5 L14 9.5 L12 8 L3 7.5 Z" fill={fill} stroke="none" />
  </g>
);

/** ป้ายยาง: วงยางสีตามชนิด มีตัว S / M ตรงกลาง */
export function TyreBadge({ compound, className = "h-6 w-6", wet = false }: { compound: Compound; className?: string; wet?: boolean }) {
  const color = wet ? "#60a5fa" : COMPOUND_COLOR[compound];
  const letter = wet ? "W" : compound === "red" ? "S" : "M";
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={wet ? "ยางฝน" : compound === "red" ? "ยาง Soft" : "ยาง Medium"}>
      <circle cx="12" cy="12" r="11" fill="#121214" />
      <circle cx="12" cy="12" r="8.4" fill="none" stroke={color} strokeWidth="2.6" />
      <circle cx="12" cy="12" r="10.6" fill="none" stroke="#2c2c32" strokeWidth="0.8" />
      <text x="12" y="12.6" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="900" fill="#fff">
        {letter}
      </text>
    </svg>
  );
}

/* ---------- ไพ่เดิน ---------- */

/** BASE: รถวิ่งชิล ๆ เส้นนิ่ง */
export const IconBase = () => (
  <Svg>
    <MiniCar x={12} y={14} />
    <path d="M6 36 H42" strokeOpacity={0.5} />
    <path d="M6 30 H14" strokeOpacity={0.35} />
  </Svg>
);

/** MOVE: รถพุ่งพร้อมเส้นความเร็ว */
export const IconMove = () => (
  <Svg>
    <path d="M2 15 H12 M4 21 H14 M2 27 H11" strokeWidth={2.6} />
    <MiniCar x={17} y={15} />
    <path d="M8 36 L40 36 M34 31 L40 36 L34 41" strokeWidth={2.6} />
  </Svg>
);

export const IconDrs = () => (
  <Svg>
    <path d="M8 30 H40" />
    <path d="M10 30 V38 M38 30 V38" />
    <path d="M10 22 L38 14" />
    <path d="M30 8 L38 14 L31 19" strokeWidth={2.4} />
  </Svg>
);

export const IconSlip = () => (
  <Svg>
    <MiniCar x={22} y={12} />
    <MiniCar x={-2} y={12} />
    <path d="M6 34 C14 30 22 38 30 34 S42 32 44 34" strokeWidth={2.2} strokeOpacity={0.7} />
  </Svg>
);

export const IconPitLane = () => (
  <Svg>
    <rect x="8" y="8" width="32" height="32" rx="6" />
    <path d="M18 34 V14 H26 A6 6 0 0 1 26 26 H18" />
  </Svg>
);

export const IconRejoin = () => (
  <Svg>
    <path d="M36 38 V20 A10 10 0 0 0 16 20 V30" />
    <path d="M9 23 L16 31 L23 23" />
  </Svg>
);

/** ยางพัง / รถเสียหาย: ยางมีรอยแตก */
export const IconWorn = () => (
  <Svg>
    <circle cx="24" cy="24" r="16" />
    <circle cx="24" cy="24" r="7" />
    <path d="M24 8 L21 15 L27 19 L23 24" strokeWidth={2.4} />
  </Svg>
);

export const IconPush = () => (
  <Svg>
    <path d="M24 6 C30 14 34 18 34 26 A10 10 0 0 1 14 26 C14 20 18 18 20 12 C22 18 24 20 24 6 Z" />
    <path d="M24 40 V44" />
  </Svg>
);

export const IconPace = () => (
  <Svg>
    <path d="M6 30 H42" strokeOpacity={0.4} />
    <path d="M6 22 H42" />
    <path d="M14 16 V28 M24 16 V28 M34 16 V28" strokeWidth={2} strokeOpacity={0.6} />
  </Svg>
);

export const IconDefend = () => (
  <Svg>
    <path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z" />
    <path d="M17 24 L22 29 L31 19" />
  </Svg>
);

/* ---------- ป้ายบนไพ่ MOVE ---------- */

export const IconBolt = ({ className = "h-3 w-3" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M27 4 L12 27 H23 L20 44 L36 19 H25 Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconWear = ({ className = "h-3 w-3" }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="24" cy="24" r="17" strokeWidth={5} />
    <path d="M24 4 L20 16 L28 22 L22 30" strokeWidth={4} />
  </Svg>
);

export const IconAlert = ({ className = "h-3 w-3" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M24 5 L45 42 H3 Z" strokeWidth={5} />
    <path d="M24 18 V29 M24 35 V36" strokeWidth={5} />
  </Svg>
);

export const IconWrench = ({ className = "h-3 w-3" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M30 6 A10 10 0 0 0 20 20 L6 34 L14 42 L28 28 A10 10 0 0 0 42 18 L35 21 L27 13 Z" strokeWidth={4} />
  </Svg>
);

export const IconHeadset = ({ className = "h-3 w-3" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M9 30 V24 A15 15 0 0 1 39 24 V30" strokeWidth={4.5} />
    <rect x="5" y="27" width="9" height="13" rx="3" fill="currentColor" stroke="none" />
    <rect x="34" y="27" width="9" height="13" rx="3" fill="currentColor" stroke="none" />
  </Svg>
);

/* ---------- ไพ่ PITWALL ---------- */

const PITWALL_ICON: Record<PitwallKind, () => ReactNode> = {
  attack: () => (
    <Svg>
      <path d="M8 24 H30 M24 16 L32 24 L24 32" />
      <path d="M36 12 V36" strokeOpacity={0.6} />
    </Svg>
  ),
  block: () => <IconDefend />,
  slip: () => <IconSlip />,
  charge: () => (
    <Svg>
      <rect x="8" y="14" width="28" height="20" rx="3" />
      <path d="M36 21 H40 V27 H36" />
      <path d="M22 17 L16 25 H22 L20 31 L28 22 H22 Z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  tires: () => (
    <Svg>
      <circle cx="21" cy="26" r="14" />
      <circle cx="21" cy="26" r="6" />
      <path d="M38 6 V16 M33 11 H43" />
    </Svg>
  ),
  radar: () => (
    <Svg>
      <path d="M12 30 A10 10 0 0 1 14 12 A12 12 0 0 1 36 14 A8 8 0 0 1 36 30 Z" />
      <path d="M16 36 L14 42 M24 36 L22 42 M32 36 L30 42" strokeWidth={2.4} />
    </Svg>
  ),
  report: () => (
    <Svg>
      <path d="M12 42 V8" />
      <path d="M12 8 H34 L30 15 L34 22 H12" />
    </Svg>
  ),
  teamSpeed: () => (
    <Svg>
      <MiniCar x={14} y={6} />
      <MiniCar x={6} y={26} />
      <path d="M38 34 H44" strokeWidth={2.4} />
    </Svg>
  ),
  quickBox: () => (
    <Svg>
      <circle cx="24" cy="27" r="15" />
      <path d="M24 27 L31 20" />
      <path d="M20 6 H28 M24 6 V12" />
    </Svg>
  ),
  push: () => <IconPush />,
  pace: () => <IconPace />,
};

export const PitwallIcon = ({ kind }: { kind: PitwallKind }) => <>{PITWALL_ICON[kind]()}</>;

/* ---------- ไพ่ ACTION ---------- */

const ACTION_ICON: Record<ActionKind, () => ReactNode> = {
  mistake: () => (
    <Svg>
      <path d="M8 38 C20 34 14 20 26 18 S40 10 40 10" />
      <path d="M33 8 L41 10 L38 18" />
    </Svg>
  ),
  weather: () => PITWALL_ICON.radar(),
  storm: () => (
    <Svg>
      <path d="M12 28 A10 10 0 0 1 14 10 A12 12 0 0 1 36 12 A8 8 0 0 1 36 28 Z" />
      <path d="M24 30 L19 38 H26 L22 45" strokeWidth={2.6} />
    </Svg>
  ),
  tires: () => <IconWorn />,
  ersFail: () => (
    <Svg>
      <rect x="8" y="14" width="28" height="20" rx="3" />
      <path d="M36 21 H40 V27 H36" />
      <path d="M16 18 L28 30 M28 18 L16 30" />
    </Svg>
  ),
  focusAttack: () => FOCUS(),
  focusBlock: () => FOCUS(),
  focusSlip: () => FOCUS(),
  focusAll: () => FOCUS(),
  trackLimits: () => (
    <Svg>
      <path d="M6 12 L42 12" strokeDasharray="5 4" />
      <MiniCar x={10} y={20} />
      <path d="M40 38 H14 M20 32 L14 38 L20 44" strokeWidth={2.6} />
    </Svg>
  ),
  brakes: () => (
    <Svg>
      <circle cx="24" cy="26" r="13" />
      <circle cx="24" cy="26" r="4" />
      <path d="M14 8 C16 4 12 2 14 0 M24 8 C26 4 22 2 24 0 M34 8 C36 4 32 2 34 0" strokeWidth={2.2} transform="translate(0 4)" />
    </Svg>
  ),
  incident: () => (
    <Svg>
      <path d="M24 4 L28 16 L40 12 L32 22 L44 28 L31 30 L34 43 L24 34 L14 43 L17 30 L4 28 L16 22 L8 12 L20 16 Z" />
    </Svg>
  ),
};

function FOCUS() {
  return (
    <Svg>
      <path d="M4 24 C12 12 36 12 44 24 C36 36 12 36 4 24 Z" />
      <path d="M10 38 L38 10" />
    </Svg>
  );
}

export const ActionIcon = ({ kind }: { kind: ActionKind }) => <>{ACTION_ICON[kind]()}</>;
