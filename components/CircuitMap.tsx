import Image from "next/image";
import { Flag } from "lucide-react";

/** ผังสนามข้างตัวนับถอยหลัง — มี placeholder เมื่อไม่มีรูป */
export default function CircuitMap({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  // รูปที่มาจาก SVG (ผังแทร็ก) → ทำเป็นเส้นขาวบนพื้นมืดให้กลืนกับการ์ด
  const isTrackMap = src ? /\.svg(\.|$)/i.test(src) : false;

  return (
    <figure className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-black/25">
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
