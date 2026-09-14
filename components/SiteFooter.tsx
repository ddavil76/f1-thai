import type { ReactNode } from "react";

/** เครดิตแหล่งข้อมูลต่อหน้า — หน้าไหนดึงจากไหนก็ให้เครดิตตรงนั้น */
const SOURCES = {
  jolpica: "ข้อมูลจาก Jolpica-F1 API",
  openf1: "ข้อมูลจาก openf1.org",
  fia: "ข้อมูลจากรายงาน Technical Delegate และคำตัดสินสจ๊วตของ FIA",
} as const;

const DISCLAIMER = "ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ";

/**
 * footer ท้ายหน้า — ข้อความปฏิเสธความเกี่ยวข้องต้องมีทุกหน้า จึงรวมไว้ที่เดียว
 * `source` เว้นไว้ได้ถ้าหน้านั้นไม่ได้ดึงข้อมูลจากใคร (เช่นหน้าเกม)
 */
export default function SiteFooter({
  source,
  className = "pb-8",
  children,
}: {
  source?: keyof typeof SOURCES;
  /** ทับระยะห่างเริ่มต้นได้ (หน้าแรกใช้ mt-8 เพราะ layout จัดระยะล่างให้แล้ว) */
  className?: string;
  /** เนื้อหาเสริมใต้บรรทัดเครดิต เช่นรายการเอกสารต้นทาง */
  children?: ReactNode;
}) {
  return (
    <footer className={`space-y-2 text-center text-xs text-white/30 ${className}`}>
      <p>{source ? `${SOURCES[source]} · ${DISCLAIMER}` : DISCLAIMER}</p>
      {children}
    </footer>
  );
}
