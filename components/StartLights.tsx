/**
 * ไฟสตาร์ท 5 ดวงระหว่างโหลด — ติดทีละดวงจากซ้าย ครบ 5 แล้วดับพร้อมกัน วนซ้ำ (CSS ล้วน ไม่มี JS)
 * ผู้ใช้ตั้งลดการเคลื่อนไหว → ไฟติดค้างทั้ง 5 ดวง ไม่กะพริบ
 */
export default function StartLights({
  label,
  sub,
  size = "md",
  className = "",
}: {
  /** ข้อความใต้ไฟ — ไม่ส่ง = แสดงแค่ไฟ (ยังอ่านออกเสียงว่า "กำลังโหลด") */
  label?: string;
  sub?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="status" aria-label={label ?? "กำลังโหลด"} className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={`start-lights start-lights-${size}`} aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="start-lights-col">
            <span style={{ animationName: `start-light-${n}` }} />
            <span style={{ animationName: `start-light-${n}` }} />
          </div>
        ))}
      </div>
      {label && (
        <p className="text-center text-sm text-white/60">
          {label}
          {sub && <span className="mt-0.5 block text-xs text-white/35">{sub}</span>}
        </p>
      )}
    </div>
  );
}
