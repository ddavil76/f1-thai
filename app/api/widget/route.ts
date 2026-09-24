import { getDriverStandings, getLastResults, getSchedule } from "@/lib/f1";
import { buildWidgetPayload } from "@/lib/widget";
import { SEASON } from "@/lib/season";

// widget บน iOS รีเฟรชเองราว 15 นาทีขึ้นไป (ระบบคุม) แคช 5 นาทีก็เหลือเฟือ
export const revalidate = 300;

export async function GET() {
  // ทุกตัวกลืน error อยู่แล้ว ดึงไม่ได้ก็คืนค่าว่าง → payload บอก state เอง
  const [races, standings, lastResults] = await Promise.all([
    getSchedule(SEASON),
    getDriverStandings(SEASON),
    getLastResults(SEASON),
  ]);

  return Response.json(buildWidgetPayload({ season: SEASON, races, standings, lastResults }), {
    headers: {
      // อ่านอย่างเดียวและเป็นข้อมูลสาธารณะ — เปิดให้เครื่องมือทำ widget ตัวอื่นดึงได้ด้วย
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
