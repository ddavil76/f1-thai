/**
 * พื้นผิวสมจริงแบบวาดเอง (ไม่โหลดรูป · ไม่มีลิขสิทธิ์คนอื่น): ยางมะตอย · หญ้า · กรวด · เมฆ
 * แต่ละแบบได้ภาพสี + แผนที่ความนูน (normal map — แสงตกกระทบเป็นเม็ด ๆ) + ความด้าน (roughness)
 * ใช้ noise หลายชั้น (fbm) ที่วนต่อกันได้ไร้รอยต่อ ปูซ้ำบนสนามได้ทั้งสนาม
 */
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;
export type SurfaceSet = { map: THREE_NS.Texture; normal: THREE_NS.Texture; rough: THREE_NS.Texture };

/** noise แบบค่าสุ่มที่จุดตาราง (วนต่อกันได้ที่ขนาด period) */
function valueNoise(seed: number, period: number) {
  const n = period * period;
  const v = new Float32Array(n);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    v[i] = ((s >>> 0) % 10000) / 10000;
  }
  const at = (x: number, y: number) => v[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** สนามความสูง size×size: fbm หลายชั้น (ชั้นแรก base เซลล์ต่อด้าน) — วนต่อกันได้ */
function fbm(size: number, seed: number, base: number, octaves: number, gain = 0.5) {
  const h = new Float32Array(size * size);
  const layers = Array.from({ length: octaves }, (_, o) => ({ f: base * 2 ** o, a: gain ** o, n: valueNoise(seed + o * 101, base * 2 ** o) }));
  let max = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const l of layers) v += l.a * l.n((x / size) * l.f, (y / size) * l.f);
      h[y * size + x] = v;
      max = Math.max(max, v);
    }
  for (let i = 0; i < h.length; i++) h[i] /= max || 1;
  return h;
}

/** ความสูง → normal map (ความชันรอบจุด · วนต่อกัน) */
function normalFrom(h: Float32Array, size: number, strength: number) {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      out[k] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[k + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[k + 3] = 255;
    }
  return out;
}

function toTexture(THREE: Three, data: Uint8ClampedArray, size: number, srgb: boolean, aniso: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  cv.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** สร้างชุดพื้นผิวจากฟังก์ชันสี/ความสูง/ความด้านต่อจุด */
function makeSet(THREE: Three, size: number, aniso: number, height: Float32Array, normalStrength: number, px: (i: number, h: number) => [number, number, number, number]) {
  const col = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b, ro] = px(i, height[i]);
    col.set([r, g, b, 255], i * 4);
    rough.set([ro, ro, ro, 255], i * 4);
  }
  return {
    map: toTexture(THREE, col, size, true, aniso),
    normal: toTexture(THREE, normalFrom(height, size, normalStrength), size, false, aniso),
    rough: toTexture(THREE, rough, size, false, aniso),
  };
}

/** สุ่มแบบกำหนดผลได้ */
function rand(seed: number) {
  let s = seed >>> 0 || 7;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** ยางมะตอย: เนื้อหยาบเม็ดหิน (เม็ดสว่าง/มืดปน) · คราบยางดำเป็นปื้นจาง ๆ · เม็ดหินมันกว่าเนื้อยาง */
export function asphaltSet(THREE: Three, size: number, aniso: number, seed: number): SurfaceSet {
  const big = fbm(size, seed, 4, 3);
  const grain = fbm(size, seed + 7, 64, 3, 0.6);
  const r = rand(seed + 3);
  const stones = new Float32Array(size * size);
  // เม็ดหินแยก 1–2 พิกเซล
  for (let k = 0; k < size * size * 0.06; k++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    const v = r() < 0.6 ? 1 : -0.6;
    stones[y * size + x] = v;
    if (r() < 0.4) stones[y * size + ((x + 1) % size)] = v * 0.7;
  }
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.6 + Math.max(0, stones[i]) * 0.3;
  return makeSet(THREE, size, aniso, h, 1.2, (i) => {
    const tone = 52 + (big[i] - 0.5) * 12 + (grain[i] - 0.5) * 14 + stones[i] * 12;
    const v = Math.max(30, Math.min(90, tone));
    // เม็ดหินสว่าง = มันขึ้นนิด · เนื้อยาง = ด้าน
    const ro = stones[i] > 0 ? 170 : 225 - (big[i] - 0.5) * 30;
    return [v, v, v + 3, ro];
  });
}

/** หญ้า: เขียวไม่สม่ำเสมอ (ปื้นอ่อน/เข้ม) + ใบหญ้าเส้นเล็ก ๆ · ลายตัดหญ้าใส่ทีหลังด้วยสีแถบ */
export function grassSet(THREE: Three, size: number, aniso: number, seed: number): SurfaceSet {
  const patch = fbm(size, seed, 3, 4);
  const blade = fbm(size, seed + 11, 96, 2, 0.7);
  const r = rand(seed + 5);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = blade[i] * 0.8 + patch[i] * 0.2;
  // ใบหญ้า: ขีดสั้น ๆ แนวตั้ง
  const tips = new Float32Array(size * size);
  for (let k = 0; k < size * size * 0.05; k++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    for (let d = 0; d < 3; d++) tips[((y + d) % size) * size + x] = r() < 0.5 ? 1 : -1;
  }
  return makeSet(THREE, size, aniso, h, 3, (i) => {
    const p = patch[i] - 0.5;
    const t = tips[i] * 12;
    const g = 128 + p * 50 + (blade[i] - 0.5) * 30 + t;
    return [Math.max(30, 70 + p * 30 + t * 0.5), Math.max(60, g), Math.max(20, 46 + p * 14), 240];
  });
}

/** กรวด: เม็ดกลม ๆ หลายขนาด ขอบเงา (สีเทาอมน้ำตาลอ่อน — คูณกับสีทรายของแถบ) */
export function gravelSet(THREE: Three, size: number, aniso: number, seed: number): SurfaceSet {
  const r = rand(seed + 9);
  const h = new Float32Array(size * size);
  const tint = new Float32Array(size * size);
  for (let k = 0; k < size * size * 0.012; k++) {
    const cx = r() * size;
    const cy = r() * size;
    const rad = 1.5 + r() * 3.5;
    const shade = 0.75 + r() * 0.4;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d > 1) continue;
        const i = ((y + size) % size) * size + ((x + size) % size);
        const z = Math.sqrt(1 - d * d);
        if (z > h[i]) {
          h[i] = z;
          tint[i] = shade;
        }
      }
  }
  return makeSet(THREE, size, aniso, h, 4, (i) => {
    const v = h[i] > 0 ? 150 + tint[i] * 80 * (0.6 + h[i] * 0.4) : 95;
    return [Math.min(255, v), Math.min(255, v * 0.97), Math.min(255, v * 0.9), 235];
  });
}

/** เมฆ: ก้อนนุ่ม ๆ โปร่งแสงตามความหนา (ปูบนแผ่นฟ้าสูง ๆ) */
export function cloudTexture(THREE: Three, size: number, seed: number) {
  const n = fbm(size, seed, 4, 6, 0.55);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // ตัดส่วนบาง = ท้องฟ้าโล่ง · ส่วนหนา = เมฆขาว ใต้ก้อนเทาลงนิด
    const d = Math.max(0, Math.min(1, (n[i] - 0.52) / 0.3));
    const c = 255 - d * 40;
    data.set([c, c, Math.min(255, c + 6), d * d * 235], i * 4);
  }
  const tex = toTexture(THREE, data, size, true, 4);
  return tex;
}
