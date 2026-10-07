/**
 * รถสูตรหนึ่งมุมบน (ทรงของเราเอง ไม่ใช่รถหรือลายสีทีมจริง) หัวรถชี้ไปทางขวา
 * แก้มยางเป็นสีตามชนิดยาง — รถ AI ส่งสีกลาง ๆ มาแทน
 * ghost = รถโปร่งเส้นประ ใช้บอกตำแหน่งที่จะไปถึง และรถที่อยู่ในพิท
 */
export default function Car({
  color, ink, num, tyre = "#3a3a40", ghost = false, width = 30, className = "", label,
}: {
  color: string;
  ink: string;
  num: number;
  tyre?: string;
  ghost?: boolean;
  width?: number;
  className?: string;
  label?: string;
}) {
  const body = ghost ? "#ffffff" : color;
  const fill = ghost ? 0 : 1;
  const dash = ghost ? "2 1.6" : undefined;
  return (
    <svg
      viewBox="0 0 60 26"
      width={width}
      height={Math.round((width * 26) / 60)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block overflow-visible ${className}`}
    >
      <rect x="0.8" y="3" width="5.4" height="20" rx="1.4" fill="#0b0b0e" stroke={body} strokeWidth="1.1" strokeDasharray={dash} />
      <rect x="1.6" y="10.5" width="3.8" height="5" rx="1" fill={body} fillOpacity={fill} />
      {[
        [8, 0.4, 11, 6],
        [8, 19.6, 11, 6],
        [37.5, 1.4, 9, 5],
        [37.5, 19.6, 9, 5],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#121214" stroke={tyre} strokeWidth="1.2" />
      ))}
      <path
        d="M6 10.2 L19 9.2 L19 6.6 Q19 5.6 20.4 5.6 L30.5 5.6 Q33 5.6 34.4 8.4 L36 10.6 L52 11.8 L57.6 12.6 Q59 13 57.6 13.4 L52 14.2 L36 15.4 L34.4 17.6 Q33 20.4 30.5 20.4 L20.4 20.4 Q19 20.4 19 19.4 L19 16.8 L6 15.8 Z"
        fill={body}
        fillOpacity={fill}
        stroke={ghost ? "#ffffff" : "rgba(0,0,0,.35)"}
        strokeWidth="0.8"
        strokeDasharray={dash}
      />
      <rect x="51.4" y="3.2" width="5.6" height="19.6" rx="1.4" fill="#0b0b0e" stroke={body} strokeWidth="1.1" strokeDasharray={dash} />
      <ellipse cx="31.2" cy="13" rx="4.4" ry="2.6" fill="#0b0b0e" />
      <path d="M27 10.6 Q31.6 9.4 34.6 13 Q31.6 16.6 27 15.4" fill="none" stroke="#0b0b0e" strokeWidth="1.1" />
      <text x="13.2" y="13.3" textAnchor="middle" dominantBaseline="central" fontSize="6.6" fontWeight="800" fill={ghost ? "#ffffff" : ink}>
        {num}
      </text>
    </svg>
  );
}
