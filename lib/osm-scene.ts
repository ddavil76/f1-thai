/* ---------- ฉากรอบสนามจาก OpenStreetMap (ไฟล์ที่ scripts/osm-scene.mjs เตรียมไว้) ---------- */
// ข้อมูล © OpenStreetMap contributors (ODbL) — ทุกฉากที่ใช้ต้องแสดงเครดิต (OsmCredit)

import { OSM_SCENES } from "./osm-scenes.gen";

export type OsmSceneData = {
  v: number;
  attribution: string;
  /** พื้นส่วนใหญ่เป็นเมือง (ขอบถนนเป็นคอนกรีต ไม่ใช่หญ้า) */
  urban: boolean;
  /** กรอบของภาพพื้นในหน่วยฉาก [x0, z0, x1, z1] */
  bounds: [number, number, number, number];
  /** สีพื้นนอกกรอบภาพ */
  outside: string;
  /** เมตรต่อหน่วยฉาก */
  mpu: number;
  /** ตึก: [ความสูง, x, z, x, z, ...] (หน่วยฉาก) */
  buildings: number[][];
  /** ต้นไม้: x, z, x, z, ... */
  trees: number[];
};

export type OsmScene = { data: OsmSceneData; image: HTMLImageElement };

export const hasOsmScene = (circuitId?: string | null): boolean => !!circuitId && OSM_SCENES.includes(circuitId);

const cache = new Map<string, Promise<OsmScene | null>>();

/** โหลดฉาก OSM ของสนาม (null = ไม่มี/โหลดไม่ได้ → ใช้ฉากทั่วไป) */
export function loadOsmScene(circuitId?: string | null): Promise<OsmScene | null> {
  if (!circuitId || !hasOsmScene(circuitId)) return Promise.resolve(null);
  const hit = cache.get(circuitId);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(`/osm/${circuitId}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as OsmSceneData;
    const image = new Image();
    image.src = `/osm/${circuitId}.png`;
    await image.decode();
    return { data, image };
  })().catch(() => {
    cache.delete(circuitId);
    return null;
  });
  cache.set(circuitId, p);
  return p;
}
