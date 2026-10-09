#!/usr/bin/env node
/*
 * เส้นกลางสนาม + ความกว้างถนนจริงสำหรับโหมดนักขับ → lib/pitwall/drive/tracks/{circuitId}.ts
 *
 * ที่มา: TUMFTM/racetrack-database (Technical University of Munich) — LGPL-3.0
 *   https://github.com/TUMFTM/racetrack-database
 *   เส้นกลางมาจาก OpenStreetMap (© OpenStreetMap contributors, ODbL) ความกว้างถนนวัดจากภาพดาวเทียม
 * ไฟล์ที่ได้เป็นข้อมูลแยกต่างหาก (แทนที่/อัปเดตได้ด้วยการรันสคริปต์นี้ใหม่) — ต้องแสดงเครดิตในเว็บ
 *
 * รูปแบบ: ตัวเลขจำนวนเต็มคั่นด้วยจุลภาค หน่วย 0.1 ม. · 4 ค่าต่อจุด [x, y, กว้างขวา, กว้างซ้าย]
 *   จุดแรกเป็นค่าจริง จุดถัดไปเป็นผลต่างจากจุดก่อนหน้า (ไฟล์เล็กลง) · จุดแรก = เส้นสตาร์ท เรียงตามทิศแข่ง
 *
 * ใช้: node scripts/tumftm-tracks.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks";
/** circuitId ของเว็บ → ชื่อไฟล์ใน TUMFTM */
const MAP = {
  spa: "Spa",
  monza: "Monza",
  silverstone: "Silverstone",
  suzuka: "Suzuka",
  interlagos: "SaoPaulo",
  bahrain: "Sakhir",
  zandvoort: "Zandvoort",
  hungaroring: "Budapest",
  catalunya: "Catalunya",
  albert_park: "Melbourne",
  americas: "Austin",
};

const out = new URL("../lib/pitwall/drive/tracks/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [id, file] of Object.entries(MAP)) {
  const csv = await (await fetch(`${SRC}/${file}.csv`)).text();
  const rows = csv
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(",").map((v) => Math.round(parseFloat(v) * 10)));
  const nums = [];
  let prev = [0, 0, 0, 0];
  for (const r of rows) {
    nums.push(...r.map((v, k) => v - prev[k]));
    prev = r;
  }
  const body =
    `// สร้างโดย scripts/tumftm-tracks.mjs — อย่าแก้ด้วยมือ\n` +
    `// ข้อมูล: TUMFTM/racetrack-database (${file}.csv), LGPL-3.0 · เส้นกลางจาก © OpenStreetMap contributors (ODbL)\n` +
    `const data = "${nums.join(",")}";\nexport default data;\n`;
  writeFileSync(new URL(`${id}.ts`, out), body);
  console.log(id, rows.length, "points", body.length, "bytes");
}
