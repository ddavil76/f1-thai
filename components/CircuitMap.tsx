import Image from "next/image";
import { Flag } from "lucide-react";
import { circuitTrack } from "@/lib/circuits";
import { trackGroundPoints } from "@/lib/track3d";
import RacingLine from "./RacingLine";
import Track3D from "./Track3D";

/** ผังสนามข้างตัวนับถอยหลัง — เวกเตอร์ + จุดแสงวิ่งถ้ามี, ไม่งั้น fallback เป็นรูป */
export default function CircuitMap({
  src,
  name,
  circuitId,
  compact = false,
}: {
  src: string | null;
  name: string;
  circuitId?: string;
  /** เตี้ยลง — ใช้ในหน้า race detail ที่ผลการแข่งสำคัญกว่า */
  compact?: boolean;
}) {
  // มี path เวกเตอร์ของสนามนี้ → racing line 2D แล้วค่อยยกเป็น 3D ฝั่ง client ถ้าเครื่องไหว
  const track = circuitId ? circuitTrack(circuitId) : null;
  if (circuitId && track) {
    return (
      <Track3D points={trackGroundPoints(track)} name={name}>
        <RacingLine circuitId={circuitId} name={name} compact={compact} />
      </Track3D>
    );
  }

  // รูปที่มาจาก SVG (ผังแทร็ก) → ทำเป็นเส้นขาวบนพื้นมืดให้กลืนกับการ์ด
  const isTrackMap = src ? /\.svg(\.|$)/i.test(src) : false;

  return (
    <figure
      className={`relative mt-5 w-full overflow-hidden rounded-xl border border-white/10 bg-black/25 ${
        compact ? "aspect-[21/8]" : "aspect-[16/9]"
      }`}
    >
      {src ? (
        <Image
          src={src}
          alt={`ผังสนาม ${name}`}
          fill
          priority
          sizes="(min-width: 768px) 42rem, 100vw"
          className={
            isTrackMap
              ? "object-contain p-5 opacity-90 [filter:brightness(0)_invert(1)]"
              : "object-cover opacity-80"
          }
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
          <Flag className="h-7 w-7" strokeWidth={1.5} />
          <span className="text-xs">ไม่มีผังสนาม</span>
        </div>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 py-2 text-xs font-medium text-white/85">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-f1)" />
        {name}
      </figcaption>
    </figure>
  );
}
