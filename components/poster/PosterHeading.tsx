import SpeedStreak from "./SpeedStreak";

/** หัวการ์ดธีมโปสเตอร์: คำอังกฤษเล็กสีแดง + หัวข้อไทย + เส้นความเร็ว (ไทยใช้ฟอนต์เดิม — Archivo ไม่มีตัวไทย) */
export default function PosterHeading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  /** ข้อมูลเสริมใต้หัว (เช่น สนามของผลล่าสุด) */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2.5">
        <span className="poster text-[13px] text-(--color-f1-text)">{kicker}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <SpeedStreak small className="mt-1.5" />
      {children}
    </div>
  );
}
