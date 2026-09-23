/** ธงตาหมากรุก — สัญลักษณ์ว่าการแข่งจบแล้ว (lucide ไม่มีไอคอนนี้) */
export default function CheckeredFlag({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 4 4" className={className} aria-hidden shapeRendering="crispEdges">
      <rect width="4" height="4" fill="rgb(255 255 255 / 0.9)" rx="0.4" />
      {[0, 1, 2, 3].flatMap((y) =>
        [0, 1, 2, 3]
          .filter((x) => (x + y) % 2 === 1)
          .map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111" />),
      )}
    </svg>
  );
}
