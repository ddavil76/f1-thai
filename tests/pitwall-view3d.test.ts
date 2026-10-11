import { describe, expect, it } from "vitest";
import { buildDriveTrack, sample } from "@/lib/pitwall/drive/line";
import { hasRealTrack, loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { pitLane } from "@/lib/pitwall/drive/pit";
import { CIRCUITS, TEAMS } from "@/lib/pitwall/teams";
import { buildTrack } from "@/lib/pitwall/track";
import { cellMapper } from "@/lib/pitwall/view3d";

const setup = async (id: string) => {
  const track = buildTrack(id)!;
  const dt = buildDriveTrack(id, hasRealTrack(id) ? await loadRawTrack(id) : null)!;
  const pit = pitLane(dt, TEAMS.length);
  return { track, dt, pit, map: cellMapper(track, dt, pit) };
};

describe("ภาพ 3D ของโหมดผู้จัดการทีม: แปลงช่องเป็นระยะบนสนาม", () => {
  it.each(CIRCUITS.map((c) => c.id).filter((id) => buildTrack(id)))("%s: ระยะเพิ่มต่อเนื่อง ครบรอบพอดี ช่องเข้า/ออกพิทตรงกับพิทเลน", async (id) => {
    const { track, dt, pit, map } = await setup(id);
    const L = track.lapCells;
    expect(map.sOf(0)).toBeCloseTo(0, 3);
    expect(map.sOf(L)).toBeCloseTo(dt.length, 3);
    expect(map.sOf(2 * L + 0.5)).toBeCloseTo(dt.length + map.sOf(L + 0.5), 3);
    let prev = -Infinity;
    for (let p = -2; p <= L + 2; p += 0.05) {
      const s = map.sOf(p);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-6);
      // ไม่กระโดด: 0.05 ช่องไม่เกิน 60 ม.
      if (prev > -Infinity) expect(s - prev).toBeLessThan(60);
      prev = s;
    }
    if (pit.entry < 0 && pit.exit > 0) {
      expect(map.sOf(track.pitEntry.start)).toBeCloseTo(dt.length + pit.entry, 0);
      expect(map.sOf(L + track.pitCells - (L - track.pitEntry.start))).toBeCloseTo(dt.length + pit.exit, 0);
    }
  });

  it.each(CIRCUITS.map((c) => c.id).filter((id) => buildTrack(id)))("%s: รถในพิทเริ่ม/จบต่อจากบนสนาม ไม่กระโดด และจอดหน้าอู่ของทีม", async (id) => {
    const { track, dt, pit, map } = await setup(id);
    const L = track.lapCells;
    for (const start of [L + track.pitEntry.start, L + track.pitEntry.start + 0.05]) {
      for (const team of [0, TEAMS.length - 1]) {
        const a = map.pitPose(start, 0, team);
        expect(Math.abs(a.s - map.sOf(start))).toBeLessThan(1);
        expect(Math.abs(a.lat - sample(dt, dt.lineOffset, a.s))).toBeLessThan(6);
        const b = map.pitPose(start, 1, team);
        expect(Math.abs(b.s - map.sOf(start + track.pitCells))).toBeLessThan(1);
        expect(Math.abs(b.lat - sample(dt, dt.lineOffset, b.s))).toBeLessThan(6);
        const m = map.pitPose(start, 0.5, team);
        expect(m.s - 2 * dt.length).toBeCloseTo(pit.boxes[team], 3);
        expect(Math.abs(m.lat)).toBeGreaterThan(Math.abs(pit.offset));
        // ทางเดินในพิทต่อเนื่อง
        let ps = a.s;
        let pl = a.lat;
        for (let u = 0.01; u <= 1.0001; u += 0.01) {
          const q = map.pitPose(start, u, team);
          expect(q.s).toBeGreaterThanOrEqual(ps - 1e-6);
          expect(Math.abs(q.s - ps)).toBeLessThan(40);
          expect(Math.abs(q.lat - pl)).toBeLessThan(3);
          ps = q.s;
          pl = q.lat;
        }
      }
    }
  });

  it("ช่องโค้งช้าของกระดานไปตกที่ช่วงความเร็วต่ำของสนามจริง (เส้นสตาร์ทตรงกัน)", async () => {
    let slowV = 0;
    let n = 0;
    let avgV = 0;
    for (const id of CIRCUITS.map((c) => c.id).filter((x) => buildTrack(x))) {
      const { track, dt, map } = await setup(id);
      for (let c = 0; c < track.lapCells; c++) {
        const v = sample(dt, dt.vref, map.sOf(c + 0.5));
        avgV += v / track.lapCells;
        if (track.kinds[c] === "slow") {
          slowV += v;
          n++;
        }
      }
    }
    const cnt = CIRCUITS.filter((c) => buildTrack(c.id)).length;
    expect(slowV / n).toBeLessThan((avgV / cnt) * 0.9);
  });
});
