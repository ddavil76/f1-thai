/**
 * URL จริงของเว็บ — ใช้ร่วมกันทั้ง metadataBase, sitemap และ robots
 *
 * ไล่หาตามลำดับ:
 *  1. NEXT_PUBLIC_SITE_URL — ตั้งเองเมื่ออยากทับ (มีโดเมนของตัวเอง หรือ host เจ้าอื่น)
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel ใส่ให้ทุก deploy เป็นโดเมน production
 *     ของโปรเจกต์ (ไม่มี protocol นำหน้า) จึงไม่ต้องตั้งค่าอะไรเลยถ้า deploy บน Vercel
 *  3. localhost — ตอน dev
 *
 * ไฟล์นี้ถูก import จากฝั่งเซิร์ฟเวอร์เท่านั้น (layout, sitemap, robots) ตัวที่ 2
 * จึงไม่ต้องมี prefix NEXT_PUBLIC_
 */

const LOCAL = "http://localhost:3000";

/** เติม https:// ถ้าไม่มี protocol (VERCEL_* ให้มาเป็นโดเมนเปล่า) และตัด / ท้ายทิ้ง */
const normalize = (url: string) =>
  (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/\/+$/, "");

export type SiteEnv = {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

/** แยกเป็นฟังก์ชันเพื่อเทสต์ได้โดยไม่ต้องยุ่งกับ process.env จริง */
export function resolveSiteUrl(env: SiteEnv): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return normalize(explicit);

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return normalize(vercel);

  return LOCAL;
}

// เขียน process.env.X ตรง ๆ ไม่ผ่านตัวแปรกลาง เพื่อให้ Next แทนค่าตอน build ได้
export const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});
