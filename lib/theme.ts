import { teamColor } from "./teams";

const DEFAULT = { accent: "#e10600", accentDark: "#a30400" };

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const toHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");

/** relative luminance (sRGB) */
function luminance(r: number, g: number, b: number) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * สีแอคเซนต์ของเว็บจาก constructorId ของผู้ชนะสนามล่าสุด
 * — ทำให้เข้มพอที่ตัวอักษรขาวบนปุ่มยังอ่านออก
 */
export function teamAccent(constructorId?: string): {
  accent: string;
  accentDark: string;
} {
  if (!constructorId) return DEFAULT;
  const base = teamColor(constructorId);
  if (!/^#[0-9a-f]{6}$/i.test(base)) return DEFAULT;

  let [r, g, b] = parseHex(base);
  // สีทีมบางทีมสว่างมาก (เมอร์เซเดส/ฮาส) → หรี่ลงจนพื้นหลังปุ่มรับตัวอักษรขาวได้
  let guard = 0;
  while (luminance(r, g, b) > 0.22 && guard++ < 12) {
    r *= 0.82;
    g *= 0.82;
    b *= 0.82;
  }

  return {
    accent: toHex(r, g, b),
    accentDark: toHex(r * 0.5, g * 0.5, b * 0.5),
  };
}
