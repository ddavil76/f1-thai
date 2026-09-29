import { describe, expect, it } from "vitest";
import { alignTo, clearance, cornerMask, curvature, roadWidth, seeded, type XZ } from "@/lib/circuit-layout";

/** วงกลมรัศมี r ทวนเข็ม (มุมเพิ่ม) n จุด */
function circle(r: number, n = 200): XZ[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

/** สนามทรงสนามกีฬา: ทางตรงยาว 8 สองเส้น ห่างกัน 2r ต่อด้วยครึ่งวงกลม — จุดห่างเท่า ๆ กัน */
function stadium(r: number, straight = 8, ds = 0.05): XZ[] {
  const out: XZ[] = [];
  const half = straight / 2;
  for (let x = -half; x < half; x += ds) out.push([x, -r]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += ds / r) out.push([half + r * Math.cos(a), r * Math.sin(a)]);
  for (let x = half; x > -half; x -= ds) out.push([x, r]);
  for (let a = Math.PI / 2; a < (Math.PI * 3) / 2; a += ds / r) out.push([-half + r * Math.cos(a), r * Math.sin(a)]);
  return out;
}

describe("ความโค้ง", () => {
  it("วงกลมรัศมี r → 1/r · ทวนเข็มโค้งเข้าหาด้าน +1", () => {
    for (const r of [0.5, 2]) {
      const k = curvature(circle(r, 400));
      for (const v of k) expect(v).toBeCloseTo(1 / r, 1);
    }
    // วิ่งกลับทาง → เครื่องหมายกลับ
    const k = curvature(circle(1, 300).reverse());
    expect(k.every((v) => v < 0)).toBe(true);
  });

  it("ทางตรง = 0 · โค้งแคบ = 1 และบอกด้านในถูก", () => {
    const pts = stadium(0.4);
    const { mask, inside } = cornerMask(pts);
    const mid = Math.floor(80 / 2); // กลางทางตรงแรก (8 / 0.05 = 160 จุด)
    expect(mask[mid]).toBe(0);
    // กลางโค้งขวา: จุดที่ 160 + ครึ่งหนึ่งของครึ่งวงกลม
    const apex = 160 + Math.floor((Math.PI * 0.4) / 0.05 / 2);
    expect(mask[apex]).toBe(1);
    // ด้านในของโค้งคือจุดศูนย์กลาง: p + normal*side ต้องเข้าใกล้ (4, 0)
    const [px, pz] = pts[apex];
    const [ax, az] = pts[apex - 1];
    const [bx, bz] = pts[apex + 1];
    const t = [bx - ax, bz - az];
    const l = Math.hypot(t[0], t[1]);
    const nx = -t[1] / l;
    const nz = t[0] / l;
    const s = inside[apex];
    const q = [px + nx * s * 0.2, pz + nz * s * 0.2];
    expect(Math.hypot(q[0] - 4, q[1])).toBeLessThan(Math.hypot(px - 4, pz));
  });
});

describe("พื้นที่ว่างข้างสนาม", () => {
  // ทางตรงสองเส้นห่างกัน 1.2 (2r) — ด้านในถอยได้ไม่ถึงครึ่งทาง ด้านนอกถอยได้เต็มที่
  const pts = stadium(0.6);
  const c = clearance(pts);
  const i = 80; // กลางทางตรงล่าง (z = -0.6) วิ่งไป +x · normal = (0, 1) ชี้เข้าหาทางตรงบน
  const half = 0.2;

  it("ด้านที่มีอีกช่วงของสนามอยู่ใกล้ → ถูกจำกัด", () => {
    const inner = c.free(i, 1, 2, half, 0.05);
    // ระยะระหว่างเส้นกลาง 1.2 → ห่างขอบอีกเส้นอย่างน้อย half + pad = 0.25 → ถอยได้ ≤ 0.95
    expect(inner).toBeLessThanOrEqual(0.95 + 1e-6);
    expect(inner).toBeGreaterThan(0.85);
  });

  it("ด้านนอกที่โล่ง → ถอยได้ถึงค่าสูงสุด", () => {
    expect(c.free(i, -1, 1.5, half)).toBeCloseTo(1.5, 1);
  });

  it("ระยะถึงสนามที่ใกล้สุด", () => {
    expect(c.nearest(0, 0)).toBeCloseTo(0.6, 1);
    expect(c.nearest(0, -2)).toBeCloseTo(1.4, 1);
  });

  it("ตัวสุ่มให้ลำดับเดิมทุกครั้ง อยู่ในช่วง 0..1", () => {
    const a = seeded(42);
    const b = seeded(42);
    const xs = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("ความกว้างถนน", () => {
  it("สนามโล่ง → กว้างเท่าปกติทั้งรอบ", () => {
    const w = roadWidth(stadium(1.2), { base: 0.15 });
    expect(Math.min(...w)).toBeCloseTo(0.15, 5);
  });

  it("ถนนสองเส้นผ่านใกล้กัน → แคบลงจนไม่ทับกัน แต่ไม่แคบกว่าขั้นต่ำ", () => {
    // ทางตรงห่างกัน 0.3 — ถ้ากว้างเต็ม 0.15 สองข้างจะชนกันพอดี
    const pts = stadium(0.15);
    const w = roadWidth(pts, { base: 0.15, min: 0.05 });
    const mid = 80; // กลางทางตรง
    expect(w[mid] * 2).toBeLessThan(0.3);
    expect(w[mid]).toBeGreaterThanOrEqual(0.05);
    // ในโค้งหักศอกเอง (สองขาเชื่อมกันด้วยโค้ง) ไม่นับเป็นถนนอีกเส้น → ไม่บีบเกินจำเป็น
    expect(Math.max(...w)).toBeLessThanOrEqual(0.15);
  });
});

describe("วางเส้นสนามให้ตรงผัง", () => {
  it("หมุน/ย่อ/เลื่อน/กลับด้าน → กลับมาทับผังเดิม", () => {
    // รูปไม่สมมาตร (สนามกีฬา + ปมหนึ่งจุด) เพื่อให้มีมุมที่ถูกเพียงมุมเดียว
    const ref = stadium(0.8).map(([x, z]): XZ => [x + (x > 2 && z > 0 ? 0.6 : 0), z]);
    for (const flip of [1, -1]) {
      const a = 0.65;
      const moved = ref.map(([x, z]): XZ => {
        const xx = x * flip;
        return [(xx * Math.cos(a) - z * Math.sin(a)) * 37 + 500, (xx * Math.sin(a) + z * Math.cos(a)) * 37 - 80];
      });
      // ลำดับจุดเริ่มต่างกัน (เหมือนรอบของรถที่เริ่มคนละที่กับผัง)
      const shifted = [...moved.slice(100), ...moved.slice(0, 100)];
      const fit = alignTo(ref, shifted);
      const err = shifted.map((p, i) => {
        const q = fit(p);
        const r = ref[(i + 100) % ref.length];
        return Math.hypot(q[0] - r[0], q[1] - r[1]);
      });
      expect(Math.max(...err)).toBeLessThan(0.08);
    }
  });
});
