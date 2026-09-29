/** เครดิตข้อมูลแผนที่ — เงื่อนไขของ OpenStreetMap (ODbL) ต้องแสดงทุกที่ที่ใช้ข้อมูล */
export default function OsmCredit({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener noreferrer"
      className={`absolute rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur hover:text-white ${className}`}
    >
      © OpenStreetMap contributors
    </a>
  );
}
