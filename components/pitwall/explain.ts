/**
 * คำอธิบายผลของคำสั่งแบบเป็นตัวเลข (คิดจากโมเดลจริงของการจำลอง) — กดแล้วรู้ทันทีว่าได้/เสียอะไร
 */
import { ERS, MODE, TYRE } from "@/lib/pitwall/model";
import type { RaceCar, RaceState } from "@/lib/pitwall/race";
import type { Msg, Snapshot } from "@/lib/pitwall/room";
import type { TrackModel } from "@/lib/pitwall/track";
import { COMPOUND_INFO, type DriveMode, type ErsMode, type Fight } from "@/lib/pitwall/types";

/** ยางเริ่มเสียเวลามาก (หน้าผา) เมื่อสึกเกินนี้ */
const TYRE_CLIFF = 0.85;

/** ยางชุดนี้วิ่งได้อีกกี่รอบก่อนถึงหน้าผา ถ้าขับโหมดนี้ */
export function tyreLaps(r: RaceState, c: RaceCar, mode: DriveMode = c.mode, fight: Fight = c.fight) {
  const perLap = TYRE[c.compound].wear * MODE[mode].wear * (fight === "attack" ? 1.15 : 1) * r.wear;
  return Math.max(0, (TYRE_CLIFF - c.wear) / perLap);
}

/** แบตต่อรอบ (บวก = เพิ่ม) ตามโหมด ERS — ทางตรงใช้ · โค้งชาร์จ */
function ersPerLap(track: TrackModel, mode: ErsMode) {
  const e = ERS[mode];
  let net = 0;
  for (const k of track.kinds) net += k === "straight" ? (mode === "harvest" ? e.charge : -e.drain) : e.charge;
  return net;
}

const sec = (x: number) => `${x.toFixed(1)} วิ/รอบ`;

export function modeEffect(mode: DriveMode, r: RaceState, c: RaceCar, lapsLeft: number) {
  const pace = MODE[mode].pace;
  const speed = pace < 0 ? `เร็วขึ้น ${sec(-pace)}` : pace > 0 ? `ช้าลง ${sec(pace)}` : "ความเร็วปกติ";
  const laps = tyreLaps(r, c, mode);
  const tyre = laps >= lapsLeft ? `ยางพอถึงจบ (~${Math.floor(laps)} รอบ)` : `ยางหมดในอีก ~${Math.max(0, Math.floor(laps))} รอบ`;
  const risk = mode === "push" ? " · เสี่ยงพลาด ×2" : mode === "save" ? " · เสี่ยงพลาดครึ่งเดียว" : "";
  return `${speed} · ${tyre}${risk}`;
}

export function ersEffect(mode: ErsMode, track: TrackModel, c: RaceCar) {
  const straight = Math.round(ERS[mode].straight * 1000) / 10;
  if (mode === "harvest") return "ช้าลงทั้งรอบเล็กน้อย · ชาร์จแบตเร็ว ไว้ใช้แซง/ป้องกันทีหลัง";
  const net = ersPerLap(track, mode);
  const left = net < 0 ? c.ers / -net : Infinity;
  const life = left === Infinity ? "แบตไม่หมด" : left < 1 ? "แบตหมดในรอบนี้" : `แบตหมดในอีก ~${Math.floor(left)} รอบ`;
  return mode === "boost" ? `ทางตรงเร็วขึ้น ${straight}% · ${life}` : `ใช้บนทางตรงเมื่อแบตเหลือเกิน 25% (เร็วขึ้น ${straight}%) · ${life}`;
}

export const FIGHT_EFFECT: Record<Fight, string> = {
  defend: "คันหลังแซงผ่านยากขึ้นครึ่งหนึ่ง · แต่ช้าลง 0.15 วิ/รอบ",
  none: "ขับตามปกติ · แซงเองเมื่อเร็วกว่าคันหน้าชัด ๆ",
  attack: "แซงเองบ่อยขึ้น ×1.6 · ใช้แบตแบบบูสต์ · ยางสึก +15% · เสี่ยงพลาดมากขึ้น",
};

/** ข้อความยืนยันเมื่อสั่งงาน (โชว์บนจอสักครู่) */
export function commandText(m: Msg, snap: Snapshot, track: TrackModel): string | null {
  const r = snap.race;
  const num = "car" in m ? `#${snap.cars[m.car]?.num ?? ""} ` : "";
  const c = r && "car" in m ? r.cars[m.car] : null;
  const lapsLeft = r && c ? Math.max(0, r.laps - Math.floor(c.pos / track.lapCells)) : 0;
  switch (m.t) {
    case "mode":
      return r && c ? `${num}${MODE[m.mode].label} — ${modeEffect(m.mode, r, c, lapsLeft)}` : null;
    case "ers":
      return c ? `${num}ERS ${ERS[m.ers].label} — ${ersEffect(m.ers, track, c)}` : null;
    case "fight":
      return `${num}${m.fight === "attack" ? "บุก" : m.fight === "defend" ? "ป้องกัน" : "ต่อสู้ปกติ"} — ${FIGHT_EFFECT[m.fight]}`;
    case "pit":
      return m.compound ? `${num}เข้าพิทเมื่อถึงทางเข้ารอบนี้ → ยาง ${COMPOUND_INFO[m.compound].label}` : `${num}ยกเลิกเข้าพิท`;
    case "order":
      return `คำสั่งทีม: ${m.order === "hold" ? "ห้ามแซงกัน รักษาอันดับ" : m.order === "swap" ? "สลับอันดับ คันหลังได้ผ่าน" : "แข่งกันได้"}`;
    case "auto":
      return `${num}${m.v ? "ให้ผู้ช่วย AI คุมกลยุทธ์" : "กลับมาคุมเอง"}`;
    default:
      return null;
  }
}
