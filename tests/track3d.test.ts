import { describe, expect, it } from "vitest";
import { CIRCUIT_TRACKS } from "@/lib/circuits";
import { trackGroundPoints } from "@/lib/track3d";

describe("trackGroundPoints", () => {
  it.each(Object.keys(CIRCUIT_TRACKS))("%s: อยู่กลางพื้น ด้านยาวเท่ากับ size และไม่มีจุดซ้ำ", (id) => {
    const pts = trackGroundPoints(CIRCUIT_TRACKS[id], 10);
    expect(pts.length).toBeGreaterThan(20);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...zs) - Math.min(...zs);
    // ด้านยาวราว 10 หน่วย (ตัดจุดทิ้งบ้าง จึงเผื่อไว้นิดหน่อย)
    expect(Math.max(w, h)).toBeGreaterThan(9.5);
    expect(Math.max(w, h)).toBeLessThanOrEqual(10.01);
    // จัดกลางแล้ว — ขอบซ้าย/ขวาห่างศูนย์กลางพอ ๆ กัน
    expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(0.6);
    expect(Math.abs(Math.max(...zs) + Math.min(...zs))).toBeLessThan(0.6);
    // จุดติดกันต้องไม่ซ้อนกัน (CatmullRom จะหักงอ) และไม่ปิดวงซ้ำจุดแรก
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeGreaterThan(0);
    }
    const [a, b] = [pts[0], pts.at(-1)!];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.05);
  });
});
