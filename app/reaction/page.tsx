import ReactionGame from "@/components/ReactionGame";

export const metadata = {
  title: "เกมออกตัว",
  description:
    "ทดสอบเวลาตอบสนองแบบนักแข่ง F1 — รอไฟแดง 5 ดวงดับ แล้วแตะให้เร็วที่สุด",
};

export default function ReactionPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          เกม<span className="text-(--color-f1)">ออกตัว</span>
        </h1>
        <p className="text-sm text-white/50">
          จำลองการออกตัวตอนสตาร์ท — วัดว่าคุณตอบสนองเร็วแค่ไหน
        </p>
      </header>

      <ReactionGame />

      <footer className="pb-8 text-center text-xs text-white/30">
        ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ
      </footer>
    </main>
  );
}
