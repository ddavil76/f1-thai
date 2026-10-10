import { describe, expect, it } from "vitest";
import { buildDriveTrack, DS, poseAt, surfaceAt } from "@/lib/pitwall/drive/line";
import { hasRealTrack, loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { buildTerrain, forEachSight, inStand, sightHits } from "@/components/pitwall/driver/terrain";
import { CIRCUITS, TEAMS } from "@/lib/pitwall/teams";
import { GARAGE_D, PIT_W, pitLane, wallFrom, wallTo } from "@/lib/pitwall/drive/pit";

describe("ฉากรอบสนาม: เนินเขา/อัฒจันทร์ไม่บังถนน", { timeout: 30000 }, () => {
  for (const c of CIRCUITS)
    it(c.id, async () => {
      const t = buildDriveTrack(c.id, hasRealTrack(c.id) ? await loadRawTrack(c.id) : null);
      if (!t) return;
      const tr = buildTerrain(t, { high: true, hillSeed: 37.3 });
      // พื้น (ตาข่ายที่วาดจริง) ไม่โผล่ทับผิวถนน
      let poke = 0;
      for (let i = 0; i < t.n; i += 2)
        for (const lat of [-t.wl[i], 0, t.wr[i]]) {
          const p = poseAt(t, i * DS, lat);
          if (tr.meshAt(p.x, p.z) > surfaceAt(t, i * DS, lat) + 0.02) poke++;
        }
      expect(poke).toBe(0);
      // จากกล้องตามหลังและกล้องเหนือหัว: มองเห็นถนนข้างหน้า 15–200 ม. ไม่มีพื้นนอกถนนหรืออัฒจันทร์บัง
      let rays = 0;
      let blocked = 0;
      forEachSight(t, (cam, q) => {
        rays++;
        const hit = sightHits(cam, q, (x, y, z) => tr.stands.some((st) => inStand(st, x, y, z)) || (!tr.nearTrack(x, z, tr.maxEdge + 2) && tr.meshAt(x, z) > y));
        if (hit) blocked++;
      });
      expect(rays).toBeGreaterThan(1000);
      expect(blocked).toBe(0);
      // อัฒจันทร์ยังมีอยู่ (อย่างน้อยเส้นสตาร์ทหรือทางตรง)
      expect(tr.stands.length).toBeGreaterThan(0);
      // โหมดแข่ง: มีพิทเลน → อัฒจันทร์ไม่ทับพิทเลน/อู่ · พื้นที่พิทเรียบ (ไม่สูงกว่าถนน)
      const lane = pitLane(t, TEAMS.length);
      const tp = buildTerrain(t, { high: true, hillSeed: 37.3, pit: lane });
      const outer = Math.abs(lane.offset) + PIT_W / 2;
      for (let d = wallFrom(lane); d <= wallTo(lane); d += 8)
        for (const lat of [lane.offset, lane.side * (outer + GARAGE_D / 2)]) {
          const q = poseAt(t, d, lat);
          expect(tp.stands.some((st) => inStand(st, q.x, st.y + 2, q.z))).toBe(false);
          expect(tp.meshAt(q.x, q.z)).toBeLessThan(surfaceAt(t, d, 0) + 0.05);
        }
    });
});
