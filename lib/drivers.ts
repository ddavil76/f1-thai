/* ---------- รูปนักแข่ง ---------- */
// แหล่งหลัก: headshot ทางการของ F1 ผ่าน openf1.org (join ด้วยรหัส 3 ตัว)
// fallback: รูป infobox จาก Wikipedia (เหมือนที่ใช้กับผังสนาม)

const DAY = 60 * 60 * 24;

type Openf1Driver = { name_acronym?: string; headshot_url?: string | null };

// รูป silhouette ที่ F1 เสิร์ฟแทนเมื่อยังไม่มี headshot จริง (~2–3KB ที่ 3col)
const FALLBACK_MIN_BYTES = 6000;

/** headshot ทางการมีอยู่จริงไหม (ไม่ใช่รูป silhouette) — เช็คจากขนาดไฟล์ */
async function isRealHeadshot(u: string): Promise<boolean> {
  try {
    const res = await fetch(u, { next: { revalidate: DAY * 7 } });
    if (!res.ok) return false;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len) return len >= FALLBACK_MIN_BYTES;
    return (await res.arrayBuffer()).byteLength >= FALLBACK_MIN_BYTES;
  } catch {
    return false;
  }
}

/** map: รหัสนักแข่ง (VER, LEC, …) → URL headshot */
async function officialHeadshots(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const res = await fetch(
      "https://api.openf1.org/v1/drivers?meeting_key=latest",
      { next: { revalidate: DAY * 3 } },
    );
    if (!res.ok) return m;
    const rows = (await res.json()) as Openf1Driver[];
    for (const r of rows) {
      if (!r.name_acronym || !r.headshot_url || m.has(r.name_acronym)) continue;
      // ขอรูปใหญ่ขึ้นจาก transform เริ่มต้น (1col ≈ 120px)
      m.set(r.name_acronym, r.headshot_url.replace(/\.transform\/\w+\//, ".transform/3col/"));
    }
    // ตัดคนที่ยังเป็นรูป silhouette ออก → ให้ตกไป Wikipedia แทน
    const codes = [...m.keys()];
    const real = await Promise.all(codes.map((c) => isRealHeadshot(m.get(c)!)));
    codes.forEach((c, i) => {
      if (!real[i]) m.delete(c);
    });
  } catch {
    /* ปล่อยว่าง → ไป fallback */
  }
  return m;
}

const cleanWiki = (u: string) =>
  (u.startsWith("//") ? `https:${u}` : u).split("?")[0].replace(/\/\d+px-/, "/500px-");

/** รูป portrait จากหน้า Wikipedia ของนักแข่ง */
async function wikiPortrait(url?: string): Promise<string | null> {
  const title = decodeURIComponent(url?.split("/wiki/")[1] ?? "");
  if (!title) return null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { next: { revalidate: DAY * 7 } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    const raw = d.thumbnail?.source ?? d.originalimage?.source;
    return raw ? cleanWiki(raw) : null;
  } catch {
    return null;
  }
}

export type DriverLike = { code?: string; url?: string };

/** URL รูปนักแข่งคนเดียว (official → wiki) */
export async function getDriverImage(driver: DriverLike): Promise<string | null> {
  if (driver.code) {
    const h = (await officialHeadshots()).get(driver.code);
    if (h) return h;
  }
  return wikiPortrait(driver.url);
}

/** URL รูปนักแข่งหลายคนพร้อมกัน → map: driverId → URL */
export async function getDriverImages(
  drivers: { driverId: string; code?: string; url?: string }[],
): Promise<Record<string, string>> {
  const official = await officialHeadshots();
  const out: Record<string, string> = {};
  const needWiki: typeof drivers = [];

  for (const d of drivers) {
    const h = d.code ? official.get(d.code) : undefined;
    if (h) out[d.driverId] = h;
    else needWiki.push(d);
  }

  const wiki = await Promise.all(needWiki.map((d) => wikiPortrait(d.url)));
  needWiki.forEach((d, i) => {
    const w = wiki[i];
    if (w) out[d.driverId] = w;
  });

  return out;
}
