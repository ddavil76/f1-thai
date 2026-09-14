import type { NextConfig } from "next";

/**
 * Headers ความปลอดภัยที่ใส่ได้โดยไม่ต้องแก้โค้ดหน้าเว็บ
 *
 * ไม่ใส่ CSP เต็มรูปแบบ (script-src/style-src) เพราะหน้าเว็บใช้ inline style
 * เยอะมาก และ Next ต้องการ inline script สำหรับ hydration การจะรัดจริงต้องใช้
 * nonce ผ่าน middleware ซึ่งจะทำให้ทุกหน้ากลายเป็น dynamic เสีย static/ISR ไปหมด
 * เลยใส่เฉพาะ directive ที่ไม่แตะ script/style แต่ปิดช่องโจมตีได้จริง
 */
const CSP = [
  // จงใจไม่ใส่ default-src — มันเป็น fallback ให้ script-src/style-src ด้วย
  // ใส่เมื่อไหร่ inline script ของ Next จะโดนบล็อกและ hydration พังทันที
  "frame-ancestors 'none'", // ห้ามใครเอาไป iframe (clickjacking)
  "base-uri 'self'", // ห้ามแทรก <base> เปลี่ยนปลายทางลิงก์
  "form-action 'self'",
  "object-src 'none'",
  // รูปนักแข่ง/ผังสนามผ่าน next/image จะออกมาเป็น /_next/image (same-origin)
  // แต่เผื่อกรณีชี้ตรงไว้ด้วย
  "img-src 'self' data: blob: https://*.wikimedia.org https://media.formula1.com",
  // รีเพลย์ยิง openf1 จากเบราว์เซอร์ตรง ๆ (serverless โดนบล็อก)
  "connect-src 'self' https://api.openf1.org",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // สำรองให้เบราว์เซอร์เก่าที่ยังไม่รู้จัก frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // เบราว์เซอร์เมิน header นี้บน http อยู่แล้ว dev บน localhost จึงไม่กระทบ
  // ไม่ใส่ preload เพราะถอนคืนยาก
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.wikimedia.org", pathname: "/**" },
      { protocol: "https", hostname: "media.formula1.com", pathname: "/**" },
    ],
  },
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default nextConfig;
