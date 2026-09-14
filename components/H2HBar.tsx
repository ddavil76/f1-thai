/** แถบเทียบสองฝั่ง — ตัวเลขซ้ายของ a ขวาของ b, แถบยาวตามสัดส่วน */
export default function H2HBar({
  label,
  a,
  b,
  aColor = "var(--color-f1)",
  bColor = "rgb(255 255 255 / 0.25)",
}: {
  label: string;
  a: number;
  b: number;
  aColor?: string;
  bColor?: string;
}) {
  const total = a + b || 1;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold tabular-nums text-white/80">{a}</span>
        <span className="text-white/40">{label}</span>
        <span className="font-semibold tabular-nums text-white/80">{b}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="grow-x" style={{ width: `${(a / total) * 100}%`, background: aColor }} />
        <div className="flex-1" style={{ background: bColor }} />
      </div>
    </div>
  );
}
