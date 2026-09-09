import { circuitTrack } from "@/lib/circuits";

/**
 * ผังสนามแบบเวกเตอร์ + จุดแสง "วิ่ง" รอบเส้นแทร็ก (CSS offset-path ล้วน)
 * คืน null ถ้าไม่มี path ของสนามนั้น — ให้ผู้เรียก fallback ไปใช้รูปแทน
 *
 * หมายเหตุ: ห้ามใช้ vector-effect:non-scaling-stroke บนเส้นที่ทำ dash draw-in —
 * มันทำให้ stroke-dasharray กลายเป็นหน่วย screen แต่ pathLength ยังเป็น user unit
 * เส้นเลยวาดไม่ครบ (Chrome). ใช้ strokeWidth เป็น user unit แทน
 */
export default function RacingLine({
  circuitId,
  name,
  compact = false,
}: {
  circuitId: string;
  name: string;
  compact?: boolean;
}) {
  const track = circuitTrack(circuitId);
  if (!track) return null;

  const pad = 7;
  const { d, w, h } = track;
  const viewBox = `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`;

  return (
    <figure
      className={`relative mt-5 w-full overflow-hidden rounded-xl border border-white/10 bg-black/25 ${
        compact ? "aspect-[21/8]" : "aspect-[16/9]"
      }`}
    >
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full p-4"
        aria-label={`ผังสนาม ${name}`}
      >
        {/* เส้นแทร็กจาง ๆ เป็นฐาน */}
        <path
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* เส้น racing line สีทีม — วาดเข้าตอนโหลด */}
        <path
          className="track-draw"
          d={d}
          fill="none"
          stroke="var(--color-f1)"
          strokeWidth={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
        />
        {/* จุดแสงวิ่งวนตามเส้น */}
        <circle
          className="racing-dot"
          r={1.8}
          fill="#fff"
          style={{ offsetPath: `path('${d}')` }}
        />
      </svg>
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 py-2 text-xs font-medium text-white/85">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-f1)" />
        {name}
      </figcaption>
    </figure>
  );
}
