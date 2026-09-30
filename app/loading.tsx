import StartLights from "@/components/StartLights";

/** ระหว่างรอหน้าใหม่ (ดึงข้อมูลฝั่งเซิร์ฟเวอร์) — ไฟสตาร์ท 5 ดวง + โครงหน้าจาง ๆ กันเนื้อหากระโดด */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <StartLights label="กำลังโหลด…" className="py-6" />
      <div className="animate-pulse space-y-5">
        <div className="h-72 rounded-2xl border border-white/10 bg-white/5" />
        <div className="h-44 rounded-2xl border border-white/10 bg-white/5" />
      </div>
    </div>
  );
}
