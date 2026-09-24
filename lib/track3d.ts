import type { TrackPath } from "./circuits";

/**
 * แปลง path ผังสนาม (SVG, ด้านยาว = 100, แกน y ชี้ลง) เป็นจุดบนพื้น 3D
 * — จัดให้อยู่กลางจุด (0,0) และย่อให้ด้านยาวเท่ากับ `size` หน่วย
 * คืน [x, z] ต่อจุด (y = ความสูง ปล่อยเป็น 0 เพราะข้อมูลไม่มีเนินสนาม)
 * ตัดจุดที่ซ้ำ/ติดกันเกินไปทิ้ง ไม่งั้น CatmullRom สร้างเส้นหักงอ
 */
export function trackGroundPoints(track: TrackPath, size = 10): [number, number][] {
  const raw = [...track.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
  const k = size / Math.max(track.w, track.h);
  const cx = track.w / 2;
  const cy = track.h / 2;

  // ปัด 3 ตำแหน่ง — ส่งข้ามไป client ใน props ไม่ต้องละเอียดกว่านี้
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const out: [number, number][] = [];
  for (const [x, y] of raw) {
    const p: [number, number] = [r3((x - cx) * k), r3((y - cy) * k)];
    const prev = out.at(-1);
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > size * 0.002) out.push(p);
  }
  // path ปิดวง (Z) — จุดสุดท้ายมักทับจุดแรก ตัดทิ้งให้ curve ปิดวงเองอย่างเนียน
  const first = out[0];
  const last = out.at(-1);
  if (out.length > 2 && first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < size * 0.01) {
    out.pop();
  }
  return out;
}
