#!/usr/bin/env node
/*
 * ฉากรอบสนามจาก OpenStreetMap → public/osm/{circuitId}.png + .json
 *
 * · พื้น (ภาพมองจากบน): เมือง/หญ้า/ป่า/น้ำ/ทะเล/ถนน วาดเป็นภาพ PNG ใช้เป็น texture พื้นในฉาก 3D
 * · ตึก: รูปฐาน + ความสูง (ค่าจาก OSM หรือเดาจากจำนวนชั้น/ประเภท) — เอาคร่าว ๆ ใกล้สนามก่อน
 * · ต้นไม้: จุดสุ่มในพื้นที่ป่า/สวน
 *
 * พิกัดตรงกับผังสนามในเว็บ: ผัง (lib/circuits.ts) ทำจาก bacinger/f1-circuits โดยฉาย
 * lon·cos(lat เฉลี่ย), lat แล้วย่อให้ด้านยาว = 100 → สคริปต์นี้ใช้การฉายเดียวกัน
 *
 * ข้อมูล © OpenStreetMap contributors (ODbL) — เว็บต้องแสดงเครดิตทุกที่ที่ใช้
 * ดึงครั้งเดียวต่อสนาม (ไม่ใช่ทุกครั้งที่มีคนเปิดเว็บ) ตามกติกาการใช้ Overpass API
 *
 * ใช้: node scripts/osm-scene.mjs baku monaco zandvoort
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = "f1-thai-osm-scene/1.0 (+https://github.com/ddavil76/f1-thai)";
const CIRCUITS_GEOJSON = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";

/** ขอบรอบสนามที่ดึงข้อมูล (หน่วยฉาก — ผังสนามด้านยาว = 10 หน่วย) */
const MARGIN = 3.5;
/** ภาพพื้นด้านยาว (px) */
const TEX = 2048;
/** ตึกสูงสุดต่อสนาม — เอาคร่าว ๆ พอรู้เรื่อง เรียงจากใกล้สนามก่อน */
const MAX_BUILDINGS = 1800;
const MAX_TREES = 450;
/** ตึกจริงเตี้ยมากเทียบกับถนนและรถในฉาก (ขยายไว้ให้เห็นชัด) → ขยายความสูง */
const HEIGHT_BOOST = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  // ทดสอบในเครื่อง: ใช้ไฟล์ข้อมูลจำลองแทนการยิง Overpass
  if (process.env.OSM_FIXTURE) return JSON.parse(readFileSync(process.env.OSM_FIXTURE, "utf8"));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
      body: "data=" + encodeURIComponent(query),
    });
    if (res.ok) return res.json();
    // 429/504 = เซิร์ฟเวอร์ยุ่ง → รอแล้วลองใหม่ตามที่ Overpass แนะนำ · อย่างอื่น (403 ฯลฯ) หยุดเลย
    if (res.status !== 429 && res.status !== 504) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.log(`  Overpass ${res.status} — รอ ${30 * (attempt + 1)} วิ แล้วลองใหม่`);
    await sleep(30000 * (attempt + 1));
  }
  throw new Error("Overpass ยังยุ่งอยู่ — ลองใหม่ภายหลัง");
}

/* ---------- การฉายพิกัด: lat/lon ↔ หน่วยฉาก ---------- */
function projection(coords) {
  const lat0 = coords.reduce((s, p) => s + p[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const E = coords.map((p) => p[0] * k);
  const N = coords.map((p) => p[1]);
  const [e0, e1, n0, n1] = [Math.min(...E), Math.max(...E), Math.min(...N), Math.max(...N)];
  const span = Math.max(e1 - e0, n1 - n0);
  const w = ((e1 - e0) / span) * 100;
  const h = ((n1 - n0) / span) * 100;
  // SVG (ด้านยาว 100, y ชี้ลง) → ฉาก 3D (trackGroundPoints: ย้ายกลางไป 0,0 แล้ว ×0.1)
  const toScene = (lon, lat) => [
    (((lon * k - e0) / span) * 100 - w / 2) * 0.1,
    (((n1 - lat) / span) * 100 - h / 2) * 0.1,
  ];
  const toLonLat = (x, z) => [((x / 0.1 + w / 2) / 100) * span / k + e0 / k, n1 - ((z / 0.1 + h / 2) / 100) * span];
  /** เมตรต่อ 1 หน่วยฉาก */
  const mpu = (span * 111320) / 10;
  return { toScene, toLonLat, mpu, w, h };
}

/* ---------- ภาพ raster ง่าย ๆ (RGB) ---------- */
function raster(W, H) {
  const px = new Uint8Array(W * H * 3);
  const cls = new Uint8Array(W * H); // ชนิดพื้นต่อ pixel — ใช้สุ่มต้นไม้/หาสีขอบ
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const set = (i, rgb, c) => {
    px[i * 3] = rgb[0];
    px[i * 3 + 1] = rgb[1];
    px[i * 3 + 2] = rgb[2];
    cls[i] = c;
  };
  /** เติมรูปหลายเหลี่ยม (หลายวง, even-odd → รูภายในเว้นว่าง) */
  const fill = (rings, color, c) => {
    const rgb = hex(color);
    let y0 = H, y1 = 0;
    for (const r of rings) for (const [, y] of r) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(H - 1, Math.ceil(y1));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (const r of rings)
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xa, ya] = r[i];
          const [xb, yb] = r[j];
          if ((ya > yc) !== (yb > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5));
        const b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = a; x <= b; x++) set(y * W + x, rgb, c);
      }
    }
  };
  /** เส้นหนา (ถนน) = สี่เหลี่ยมต่อช่วง + วงกลมที่รอยต่อ */
  const line = (pts, width, color, c) => {
    const r = width / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const l = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (-(y2 - y1) / l) * r;
      const ny = ((x2 - x1) / l) * r;
      fill([[[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]], color, c);
    }
    if (r >= 1.5) {
      for (const [x, y] of pts) {
        const circle = Array.from({ length: 10 }, (_, k) => [x + Math.cos((k / 10) * 2 * Math.PI) * r, y + Math.sin((k / 10) * 2 * Math.PI) * r]);
        fill([circle], color, c);
      }
    }
  };
  return { W, H, px, cls, hex, set, fill, line };
}

function png(W, H, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ต่อเส้นของ relation (outer/inner หลายเส้น) เป็นวงปิด */
function joinRings(ways) {
  const rings = [];
  const open = ways.map((w) => w.slice()).filter((w) => w.length > 1);
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  while (open.length) {
    let cur = open.shift();
    let grew = true;
    while (!same(cur[0], cur.at(-1)) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        if (same(cur.at(-1), w[0])) cur = cur.concat(w.slice(1));
        else if (same(cur.at(-1), w.at(-1))) cur = cur.concat(w.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    rings.push(cur);
  }
  return rings;
}

/* ---------- สีพื้น (มองจากบน) ---------- */
const COL = {
  grass: "#55813c",
  urban: "#bdb8ab",
  park: "#62983f",
  wood: "#3a6a2c",
  sand: "#d9c99b",
  water: "#3c7fae",
  parking: "#9c9ca0",
  road: "#5f6166",
  path: "#cfc6b4",
  rail: "#8a7f73",
  footprint: "#a39d92",
};
const CLS = { base: 0, urban: 1, park: 2, wood: 3, water: 4, road: 5, sand: 6, building: 7 };
const ROAD_M = { motorway: 18, trunk: 15, primary: 13, secondary: 11, tertiary: 9, residential: 7, unclassified: 7, living_street: 6, service: 4.5, pedestrian: 5 };

function buildingHeight(t) {
  const h = parseFloat(t.height ?? t["building:height"] ?? "");
  if (h > 0) return h;
  const lv = parseFloat(t["building:levels"] ?? "");
  if (lv > 0) return lv * 3.2 + 1;
  const kind = t.building;
  if (kind === "house" || kind === "detached" || kind === "garage" || kind === "shed" || kind === "hut") return 5;
  if (kind === "apartments" || kind === "residential") return 16;
  if (kind === "grandstand" || kind === "stadium") return 14;
  return 10;
}

async function scene(circuitId, feature) {
  const coords = feature.geometry.coordinates;
  const P = projection(coords);
  const track = coords.map(([lon, lat]) => P.toScene(lon, lat));


  const x0 = (-P.w / 2) * 0.1 - MARGIN;
  const x1 = (P.w / 2) * 0.1 + MARGIN;
  const z0 = (-P.h / 2) * 0.1 - MARGIN;
  const z1 = (P.h / 2) * 0.1 + MARGIN;
  const [w0, s0] = P.toLonLat(x0, z1);
  const [e0, n0] = P.toLonLat(x1, z0);
  const bbox = `${s0.toFixed(6)},${w0.toFixed(6)},${n0.toFixed(6)},${e0.toFixed(6)}`;
  console.log(`${circuitId}: bbox ${bbox} · ${P.mpu.toFixed(0)} ม./หน่วย`);

  const q = `[out:json][timeout:180];
(
  way["building"](${bbox});
  way["landuse"](${bbox});
  way["natural"~"^(water|wood|scrub|grassland|heath|beach|sand|bare_rock)$"](${bbox});
  way["leisure"~"^(park|garden|pitch|golf_course|stadium|marina|nature_reserve)$"](${bbox});
  way["amenity"="parking"](${bbox});
  way["waterway"="riverbank"](${bbox});
  way["natural"="coastline"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian)(_link)?$"](${bbox});
  way["railway"="rail"](${bbox});
  relation["natural"="water"](${bbox});
  relation["landuse"](${bbox});
  relation["natural"="wood"](${bbox});
  relation["leisure"="park"](${bbox});
  relation["building"](${bbox});
);
out geom;`;
  const data = await overpass(q);
  console.log(`  ได้ ${data.elements.length} รายการ`);

  const W = TEX;
  const H = Math.round((TEX * (z1 - z0)) / (x1 - x0));
  const ppu = W / (x1 - x0); // pixel ต่อหน่วยฉาก
  const pxOf = ([lon, lat]) => {
    const [x, z] = P.toScene(lon, lat);
    return [(x - x0) * ppu, (z - z0) * ppu];
  };
  const geomOf = (el) => (el.geometry ?? []).filter(Boolean).map((g) => [g.lon, g.lat]);
  const ringsOf = (el) => {
    if (el.type === "way") return [geomOf(el)];
    return joinRings((el.members ?? []).filter((mm) => mm.type === "way" && mm.geometry).map((mm) => mm.geometry.map((g) => [g.lon, g.lat])));
  };
  const els = data.elements;
  const tag = (el, k) => el.tags?.[k];

  // พื้นฐาน: เมืองถ้าตึกหนาแน่น ไม่งั้นหญ้า
  let bArea = 0;
  for (const el of els) {
    if (!tag(el, "building")) continue;
    const r = ringsOf(el)[0].map(pxOf);
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    bArea += Math.abs(a / 2);
  }
  const urban = bArea / (W * H) > 0.06;
  const R = raster(W, H);
  const base = R.hex(urban ? COL.urban : COL.grass);
  for (let i = 0; i < W * H; i++) R.set(i, base, urban ? CLS.urban : CLS.base);

  const layer = (pred, color, c) => {
    for (const el of els) if (pred(el)) R.fill(ringsOf(el).map((r) => r.map(pxOf)), color, c);
  };
  const lu = (el) => tag(el, "landuse");
  layer((e) => /^(residential|commercial|industrial|retail|railway|construction|garages|military|port|harbour)$/.test(lu(e) ?? ""), COL.urban, CLS.urban);
  layer((e) => /^(grass|meadow|recreation_ground|village_green|cemetery|farmland|allotments|orchard|vineyard|greenfield)$/.test(lu(e) ?? "") || /^(grassland|heath)$/.test(tag(e, "natural") ?? ""), COL.grass, CLS.base);
  layer((e) => /^(park|garden|pitch|golf_course|nature_reserve)$/.test(tag(e, "leisure") ?? ""), COL.park, CLS.park);
  layer((e) => lu(e) === "forest" || /^(wood|scrub)$/.test(tag(e, "natural") ?? ""), COL.wood, CLS.wood);
  layer((e) => /^(beach|sand|bare_rock)$/.test(tag(e, "natural") ?? ""), COL.sand, CLS.sand);
  layer((e) => tag(e, "amenity") === "parking", COL.parking, CLS.urban);

  // ทะเล: เส้นชายฝั่งของ OSM มีน้ำอยู่ทางขวาของทิศเส้น → วาดเส้นกั้น แล้วเทสีน้ำจากฝั่งขวา
  const coast = els.filter((e) => tag(e, "natural") === "coastline").map((e) => geomOf(e).map(pxOf));
  if (coast.length) {
    const wall = new Uint8Array(W * H);
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) wall[y * W + x] = 1; };
    for (const pts of coast)
      for (let i = 0; i + 1 < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[i + 1];
        const n = Math.ceil(Math.hypot(xb - xa, yb - ya) * 2) + 1;
        for (let k = 0; k <= n; k++) {
          const x = Math.round(xa + ((xb - xa) * k) / n);
          const y = Math.round(ya + ((yb - ya) * k) / n);
          mark(x, y); mark(x + 1, y); mark(x, y + 1);
        }
      }
    // แบ่งภาพเป็นพื้นที่ที่ถูกเส้นชายฝั่งกั้น แล้วให้แต่ละช่วงของชายฝั่ง "โหวต":
    // ฝั่งขวา = น้ำ ฝั่งซ้าย = บก → พื้นที่ไหนน้ำชนะคือทะเล (ทนต่อจุดผิดพลาดเล็ก ๆ ในข้อมูล)
    const comp = new Int32Array(W * H).fill(-1);
    let nComp = 0;
    const stack = [];
    for (let s0 = 0; s0 < W * H; s0++) {
      if (wall[s0] || comp[s0] >= 0) continue;
      stack.push(s0);
      comp[s0] = nComp;
      while (stack.length) {
        const i = stack.pop();
        const x = i % W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
          if (j < 0 || j >= W * H || wall[j] || comp[j] >= 0) continue;
          comp[j] = nComp;
          stack.push(j);
        }
      }
      nComp++;
    }
    const wetV = new Float64Array(nComp);
    const dryV = new Float64Array(nComp);
    for (const pts of coast)
      for (let i = 0; i + 1 < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[i + 1];
        const l = Math.hypot(xb - xa, yb - ya) || 1;
        // ขวามือของทิศเดิน (y ชี้ลงในภาพ) = (-dy, dx)
        const nx = -(yb - ya) / l;
        const ny = (xb - xa) / l;
        for (const side of [1, -1]) {
          const sx = Math.round((xa + xb) / 2 + nx * 3 * side);
          const sy = Math.round((ya + yb) / 2 + ny * 3 * side);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const c = comp[sy * W + sx];
          if (c >= 0) (side > 0 ? wetV : dryV)[c] += l;
        }
      }
    // น้ำต้องชนะขาด — ถ้าสูสี แปลว่าชายฝั่งไม่ปิดในกรอบ บกกับทะเลต่อกันเป็นพื้นที่เดียว → ไม่ระบาย
    const votes = Array.from({ length: nComp }, (_, c) => (wetV[c] > dryV[c] * 3 ? 1 : 0));
    const water = R.hex(COL.water);
    let filled = 0;
    for (let i = 0; i < W * H; i++) {
      const c = comp[i] >= 0 ? comp[i] : -1;
      // เส้นกั้นเองให้สีเดียวกับเพื่อนบ้านที่เป็นน้ำ
      const wet = c >= 0 ? votes[c] > 0 : (i % W > 0 && comp[i - 1] >= 0 && votes[comp[i - 1]] > 0);
      if (wet) {
        R.set(i, water, CLS.water);
        filled++;
      }
    }
    console.log(`  ทะเล ${((filled / (W * H)) * 100).toFixed(1)}% ของภาพ (${nComp} พื้นที่)`);
  }
  layer((e) => tag(e, "natural") === "water" || tag(e, "waterway") === "riverbank" || lu(e) === "basin" || lu(e) === "reservoir", COL.water, CLS.water);

  // ถนน/ทางรถไฟ: ความกว้างจริง (เมตร) → pixel · ขยาย ×2 ให้เห็นเป็นเส้นชัดจากมุมสูง
  const pxPerM = ppu / P.mpu;
  for (const el of els) {
    const hw = tag(el, "highway");
    const pts = geomOf(el).map(pxOf);
    if (hw) {
      const kind = hw.replace(/_link$/, "");
      const wm = ROAD_M[kind] ?? 6;
      R.line(pts, Math.max(1.2, wm * pxPerM * 2), kind === "pedestrian" ? COL.path : COL.road, CLS.road);
    } else if (tag(el, "railway") === "rail") {
      R.line(pts, Math.max(1, 4 * pxPerM * 2), COL.rail, CLS.road);
    }
  }
  // ฐานตึกทุกหลังบนพื้น (ตึกที่ไม่ได้ยกเป็น 3D ยังเห็นเป็นเงาบนพื้น)
  layer((e) => !!tag(e, "building"), COL.footprint, CLS.building);

  /* ---- ตึก 3D: ใกล้สนามก่อน ---- */
  const nearTrack = (x, z) => {
    let best = Infinity;
    for (const [tx, tz] of track) best = Math.min(best, (tx - x) ** 2 + (tz - z) ** 2);
    return Math.sqrt(best);
  };
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const buildings = [];
  for (const el of els) {
    if (!tag(el, "building") || tag(el, "building") === "roof") continue;
    const ring = ringsOf(el)[0];
    if (!ring || ring.length < 4) continue;
    let pts = ring.map(([lon, lat]) => P.toScene(lon, lat));
    if (Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6) pts = pts.slice(0, -1);
    // ตัดจุดที่ห่างกันไม่ถึง ~1.5 ม. (ประหยัดขนาดไฟล์)
    const min = 1.5 / P.mpu;
    const simp = [];
    for (const p of pts) if (!simp.length || Math.hypot(p[0] - simp.at(-1)[0], p[1] - simp.at(-1)[1]) > min) simp.push(p);
    if (simp.length < 3) continue;
    const cx = simp.reduce((s, p) => s + p[0], 0) / simp.length;
    const cz = simp.reduce((s, p) => s + p[1], 0) / simp.length;
    const hU = Math.min(0.7, (buildingHeight(el.tags) * HEIGHT_BOOST) / P.mpu);
    buildings.push({ d: nearTrack(cx, cz), h: hU, pts: simp });
  }
  buildings.sort((a, b) => a.d - b.d);
  const keepB = buildings.slice(0, MAX_BUILDINGS).map((b) => [r3(b.h), ...b.pts.flatMap(([x, z]) => [r3(x), r3(z)])]);

  /* ---- ต้นไม้: สุ่มใน pixel ที่เป็นป่า (หนาแน่น) หรือสวน (บาง) ---- */
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const trees = [];
  for (let tries = 0; tries < 200000 && trees.length < MAX_TREES; tries++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    const c = R.cls[y * W + x];
    if (c === CLS.wood || (c === CLS.park && rnd() < 0.25)) trees.push(r3(x / ppu + x0), r3(y / ppu + z0));
  }

  // สีพื้นนอกภาพ = สีพื้นดินที่พบบ่อยสุดตามขอบทั้งสี่ด้าน (ไม่นับน้ำ — ไม่งั้นทะเลด้านเดียว
  // ทำให้รอบนอกทั้งหมดกลายเป็นน้ำ เหมือนสนามอยู่บนเกาะ) · ขอบเป็นน้ำเกือบหมดค่อยใช้สีน้ำ
  const count = new Map();
  let wet = 0;
  let all = 0;
  const tally = (x, y) => {
    const j = y * W + x;
    all++;
    if (R.cls[j] === CLS.water) return void wet++;
    const i = j * 3;
    const k = `${R.px[i]},${R.px[i + 1]},${R.px[i + 2]}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  };
  for (let x = 0; x < W; x += 4) { tally(x, 0); tally(x, H - 1); }
  for (let y = 0; y < H; y += 4) { tally(0, y); tally(W - 1, y); }
  const edge = wet / all > 0.8 || !count.size
    ? R.hex(COL.water)
    : [...count].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
  const hex2 = (n) => n.toString(16).padStart(2, "0");

  mkdirSync(new URL("../public/osm/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../public/osm/${circuitId}.png`, import.meta.url), png(W, H, R.px));
  writeFileSync(
    new URL(`../public/osm/${circuitId}.json`, import.meta.url),
    JSON.stringify({
      v: 1,
      attribution: "© OpenStreetMap contributors (ODbL)",
      urban,
      bounds: [r3(x0), r3(z0), r3(x1), r3(z1)],
      outside: `#${edge.map(hex2).join("")}`,
      mpu: Math.round(P.mpu),
      buildings: keepB,
      trees,
    }),
  );
  console.log(`  ตึก 3D ${keepB.length}/${buildings.length} · ต้นไม้ ${trees.length / 2} · ${urban ? "เมือง" : "ชนบท"}`);
}

/**
 * หาเส้นสนามใน GeoJSON ที่ตรงกับผังในเว็บ: ฉายแล้ว w/h และจุดแรกต้องตรงกับ lib/circuits.ts
 * (ยืนยันไปในตัวว่าตึก/พื้นจะวางตรงตำแหน่ง)
 */
function featureFor(all, circuitId) {
  const src = readFileSync(new URL("../lib/circuits.ts", import.meta.url), "utf8");
  const m = src.match(new RegExp(`\\b${circuitId}: \\{ d: "M(-?[\\d.]+),(-?[\\d.]+)[^"]*", w: ([\\d.]+), h: ([\\d.]+)`));
  if (!m) throw new Error(`ไม่มีผังสนาม ${circuitId} ใน lib/circuits.ts`);
  const [fx, fy, w, h] = m.slice(1).map(Number);
  for (const f of all.features) {
    const c = f.geometry?.coordinates;
    if (!Array.isArray(c) || !Array.isArray(c[0]) || typeof c[0][0] !== "number") continue;
    const P = projection(c);
    if (Math.abs(P.w - w) > 0.05 || Math.abs(P.h - h) > 0.05) continue;
    const [x, z] = P.toScene(c[0][0], c[0][1]);
    if (Math.abs(x / 0.1 + P.w / 2 - fx) < 0.05 && Math.abs(z / 0.1 + P.h / 2 - fy) < 0.05) return f;
  }
  throw new Error(`${circuitId}: หาเส้นสนามที่ตรงกับผังในเว็บไม่เจอ`);
}

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("ระบุ circuitId เช่น baku monaco");
const all = process.env.CIRCUITS_FILE
  ? JSON.parse(readFileSync(process.env.CIRCUITS_FILE, "utf8"))
  : await (await fetch(CIRCUITS_GEOJSON, { headers: { "user-agent": UA } })).json();
for (const [i, id] of ids.entries()) {
  const f = featureFor(all, id);
  if (i) await sleep(5000); // เว้นระยะระหว่างคำขอ ไม่รบกวนเซิร์ฟเวอร์ Overpass
  await scene(id, f);
}

// รายชื่อสนามที่มีฉาก OSM — เว็บใช้เช็คก่อนโหลด (ไม่ยิงคำขอ 404 ให้สนามที่ไม่มี)
const done = new Set(ids);
try {
  const prev = readFileSync(new URL("../lib/osm-scenes.gen.ts", import.meta.url), "utf8").match(/"([a-z_]+)"/g) ?? [];
  for (const p of prev) done.add(p.slice(1, -1));
} catch {}
writeFileSync(
  new URL("../lib/osm-scenes.gen.ts", import.meta.url),
  `// สร้างโดย scripts/osm-scene.mjs — อย่าแก้เอง\nexport const OSM_SCENES: readonly string[] = ${JSON.stringify([...done].sort())};\n`,
);
