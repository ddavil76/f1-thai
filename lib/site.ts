/**
 * URL จริงของเว็บ — ใช้ร่วมกันทั้ง metadataBase, sitemap และ robots
 *
 * ต้องตั้ง NEXT_PUBLIC_SITE_URL ตอน deploy ไม่งั้นลิงก์พรีวิว OG กับ sitemap
 * จะชี้ localhost ทั้งหมด · ตัด / ท้ายทิ้งเพื่อไม่ให้ต่อ path แล้วกลายเป็น //
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
