/** สุ่มแบบกำหนดเมล็ดได้ (mulberry32) — เก็บสถานะเป็นตัวเลขตัวเดียว ส่งข้ามเครื่องได้ */
export type Seed = { s: number };

export function rand(seed: Seed): number {
  seed.s = (seed.s + 0x6d2b79f5) | 0;
  let t = seed.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** สุ่มแบบระฆัง (ผลรวม 3 ตัว) ค่าเฉลี่ย 0 ส่วนเบี่ยงเบนราว 1 */
export const gauss = (seed: Seed) => (rand(seed) + rand(seed) + rand(seed) - 1.5) / 0.5;

export const pick = <T>(seed: Seed, xs: readonly T[]): T => xs[Math.floor(rand(seed) * xs.length)];
