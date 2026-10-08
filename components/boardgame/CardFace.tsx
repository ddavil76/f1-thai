import type { CSSProperties, ReactNode } from "react";
import { CardBack, Scene } from "@/components/boardgame/art";
import { IconAlert, IconBolt, IconHeadset, IconWear, IconWrench } from "@/components/boardgame/icons";

/** หมวดไพ่ = ป้ายมุมซ้ายบน (เหมือนภาพไพ่ที่วาด) */
export type CardCat = "drive" | "pit" | "pitwall" | "action" | "status";

const CAT_ICON: Record<CardCat, (p: { className?: string }) => ReactNode> = {
  drive: IconBolt,
  pit: IconWrench,
  pitwall: IconHeadset,
  action: IconAlert,
  status: IconWear,
};

/** ขนาดไพ่: ทุกอย่างข้างในเป็นหน่วย em ปรับขนาดทั้งใบด้วย font-size */
export const CARD_SIZE = {
  hand: { fontSize: 8, w: 88, h: 132 },
  play: { fontSize: 9.5, w: 104, h: 156 },
} as const;
export type CardSize = keyof typeof CARD_SIZE;

const CHECKER: CSSProperties = {
  backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.55) 0 25%, transparent 0 50%)",
  backgroundSize: "0.9em 0.9em",
};

/**
 * หน้าไพ่ทรงเดียวกับภาพไพ่ที่วาด: กรอบดำเส้นแดง · แถบหัวไพ่ (ป้ายหมวด + ชื่อ + ลายตาหมากรุก)
 * · ภาพฉากขอบบนเฉียง · กล่องข้อความสีอ่อน
 */
export function CardFace({
  title, cat, art, icon, accent = "#E10600", corner, children,
}: {
  title: string;
  cat: CardCat;
  /** ชื่อภาพ (public/boardgame/art) — ไม่มีก็โชว์ไอคอนแทน */
  art?: string;
  icon?: ReactNode;
  /** สีป้ายหมวด */
  accent?: string;
  /** ของที่ลอยมุมขวาบนของภาพ (เช่น ป้ายไพ่ FLAT OUT) */
  corner?: ReactNode;
  /** เนื้อหาในกล่องข้อความล่าง */
  children: ReactNode;
}) {
  const Cat = CAT_ICON[cat];
  return (
    <span className="flex h-full w-full flex-col overflow-hidden rounded-[1.4em] bg-[#08080A] p-[0.3em] text-left shadow-[0_0.3em_0.8em_rgba(0,0,0,0.5)]">
      <span className="relative flex h-full flex-col overflow-hidden rounded-[1.1em] border-[0.12em] border-[#E10600] bg-[#08080A]">
        {/* หัวไพ่ */}
        <span className="relative flex h-[3em] flex-none items-center">
          <span
            className="flex h-full w-[2.2em] flex-none items-center justify-center pr-[0.45em] text-white"
            style={{ background: accent, clipPath: "polygon(0 0, 100% 0, 72% 100%, 0 100%)" }}
          >
            <Cat className="h-[1.15em] w-[1.15em]" />
          </span>
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-[45%] opacity-60"
            style={{ ...CHECKER, maskImage: "linear-gradient(90deg, transparent, #000)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000)" }}
          />
          <span className="poster relative min-w-0 flex-1 overflow-hidden pr-[0.3em] text-[1.35em] leading-none tracking-tight whitespace-nowrap text-white">{title}</span>
        </span>
        {/* ภาพฉาก */}
        <span className="relative min-h-0 flex-1" style={{ clipPath: "polygon(0 0.9em, 100% 0, 100% 100%, 0 100%)" }}>
          {art ? (
            <Scene name={art} zoom={112} y={30} className="absolute inset-0" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-[#1F1F24] text-white/85 [&_svg]:h-[4.2em] [&_svg]:w-[4.2em]">{icon}</span>
          )}
          {corner && <span className="absolute top-[1.1em] right-[0.4em] flex">{corner}</span>}
        </span>
        {/* กล่องข้อความ */}
        <span className="relative flex-none border-t-[0.2em] border-[#E10600] bg-[#ECECEA] px-[0.6em] pt-[0.4em] pb-[0.5em] text-[#08080A]">
          {children}
          <span className="pointer-events-none absolute right-0 bottom-0 h-[1.2em] w-[1.6em] opacity-70" style={{ ...CHECKER, filter: "invert(1)" }} />
        </span>
      </span>
    </span>
  );
}

/**
 * ไพ่คว่ำแล้วพลิก: เริ่มเห็นหลังไพ่ แล้วหมุนมาหน้าไพ่ (เล่นใหม่ทุกครั้งที่ไพ่ถูกวาดขึ้นมาใหม่)
 * ปิดแอนิเมชันไว้ (prefers-reduced-motion) จะเห็นหน้าไพ่ทันที
 */
export function FlipCard({
  back, delay = 0, size, label, children,
}: {
  back: string;
  delay?: number;
  size: CardSize;
  label?: string;
  children: ReactNode;
}) {
  const s = CARD_SIZE[size];
  return (
    <span className="bg-stage block flex-none" style={{ width: s.w, height: s.h, fontSize: s.fontSize }}>
      <span
        className="bg-card3d bg-flip block h-full w-full"
        style={{ animationDelay: `${delay}s` }}
        role={label ? "img" : undefined}
        aria-label={label}
      >
        <span className="bg-face block overflow-hidden rounded-[1.4em]">
          <CardBack name={back} />
        </span>
        <span className="bg-face bg-front block rounded-[1.4em]">{children}</span>
      </span>
    </span>
  );
}
