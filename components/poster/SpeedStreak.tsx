/**
 * เส้นความเร็วแดงเฉียงสามเส้น (ยาว → สั้น จาง) แบบเดียวกับการ์ด widget
 * พุ่งเข้ามาครั้งเดียวตอนเปิดหน้า — ปิดเองเมื่อเครื่องตั้งลดการเคลื่อนไหว (globals.css)
 */
export default function SpeedStreak({ small = false, className = "" }: { small?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`speed-streak ${small ? "speed-streak-sm" : ""} ${className}`}>
      <i />
      <i />
      <i />
    </div>
  );
}
