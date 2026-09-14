import type { MetadataRoute } from "next";
import {
  getSchedule, getDriverStandings, getConstructorStandings, isPastRace, toDate,
} from "@/lib/f1";
import { SEASON } from "@/lib/season";
import { SITE_URL } from "@/lib/site";

// เพดานบนเท่านั้น — Next ใช้ค่าที่น้อยกว่าระหว่างตรงนี้กับ revalidate ของ fetch
// ข้างใน (ตารางคะแนน 120 วิ) หน้านี้จึงสร้างใหม่ตามรอบของตารางคะแนนไปโดยปริยาย
export const revalidate = 86400;

const at = (path: string) => `${SITE_URL}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: at("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: at("/results"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: at("/standings"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: at("/calendar"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: at("/power-units"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: at("/compare"), lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: at("/pitstops"), lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: at("/reaction"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // ทุกตัวกลืน error อยู่แล้วและคืน [] ถ้าดึงไม่ได้ → sitemap เหลือแค่หน้าคงที่ ไม่พัง
  const [races, drivers, constructors] = await Promise.all([
    getSchedule(SEASON),
    getDriverStandings(SEASON),
    getConstructorStandings(SEASON),
  ]);

  const racePages: MetadataRoute.Sitemap = races.map((r) => {
    const past = isPastRace(r);
    return {
      url: at(`/race/${r.round}`),
      // สนามที่แข่งจบแล้วนิ่งแล้ว ใช้วันแข่งเป็น lastModified ได้เลย
      lastModified: (past && toDate({ date: r.date, time: r.time })) || now,
      changeFrequency: past ? ("yearly" as const) : ("weekly" as const),
      priority: past ? 0.5 : 0.7,
    };
  });

  const driverPages: MetadataRoute.Sitemap = drivers.map((d) => ({
    url: at(`/driver/${d.Driver.driverId}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const teamPages: MetadataRoute.Sitemap = constructors.map((c) => ({
    url: at(`/constructor/${c.Constructor.constructorId}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // หน้ารีเพลย์ไม่ใส่ — ข้อมูลดึงฝั่ง client ทั้งหมด crawler จึงเห็นแต่โครงเปล่า
  return [...fixed, ...racePages, ...driverPages, ...teamPages];
}
