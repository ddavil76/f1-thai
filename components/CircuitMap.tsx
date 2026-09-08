import Image from "next/image";

/** ผังสนามข้างตัวนับถอยหลัง — มี placeholder เมื่อไม่มีรูป */
export default function CircuitMap({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  return (
    <figure className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]">
      {src ? (
        <Image
          src={src}
          alt={`ผังสนาม ${name}`}
          fill
          priority
          sizes="(min-width: 768px) 42rem, 100vw"
          className="object-contain p-4 brightness-110 contrast-110"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.04] to-transparent text-white/40">
          <span className="text-3xl">🏁</span>
          <span className="text-xs">ไม่มีผังสนาม</span>
        </div>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-xs font-medium text-white/85">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-f1)" />
        {name}
      </figcaption>
    </figure>
  );
}
