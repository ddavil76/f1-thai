import { Gauge, Landmark, Mountain, Ruler } from "lucide-react";
import { circuitTrack } from "@/lib/circuits";

const Tile = ({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) => (
  <div className="flex flex-col items-center gap-1 p-3 text-center">
    <span className="text-white/35">{icon}</span>
    <span className="display text-base font-bold tabular-nums leading-none">
      {value}
    </span>
    <span className="text-[11px] text-white/40">{label}</span>
  </div>
);

/** การ์ดข้อมูลสนาม — ความยาว / ปีที่เปิด / GP แรก / ความสูง */
export default function CircuitInfo({ circuitId }: { circuitId: string }) {
  const t = circuitTrack(circuitId);
  if (!t) return null;

  const tiles = [
    t.length != null && {
      icon: <Ruler className="h-4 w-4" />,
      value: `${(t.length / 1000).toFixed(3)}`,
      label: "ความยาว (กม.)",
    },
    t.firstGp != null && {
      icon: <Gauge className="h-4 w-4" />,
      value: String(t.firstGp),
      label: "จัด F1 ครั้งแรก",
    },
    t.opened != null && {
      icon: <Landmark className="h-4 w-4" />,
      value: String(t.opened),
      label: "เปิดสนาม",
    },
    t.altitude != null && {
      icon: <Mountain className="h-4 w-4" />,
      value: `${t.altitude}`,
      label: "สูงจากทะเล (ม.)",
    },
  ].filter(Boolean) as { icon: React.ReactNode; value: string; label: string }[];

  if (tiles.length === 0) return null;

  return (
    <section className="card grid grid-cols-2 divide-x divide-y divide-white/5 p-0 sm:grid-cols-4 sm:divide-y-0">
      {tiles.map((t2) => (
        <Tile key={t2.label} {...t2} />
      ))}
    </section>
  );
}
