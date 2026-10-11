/**
 * เรซหนึ่งของโหมดคุมนักขับ AI: ห่อเครื่องจำลองของโหมดนักขับ (lib/pitwall/drive/race.ts)
 * — รถเรา (hero) AI ขับ · ทีมเราสั่งเข้าพิท/เลือกยาง · ได้ XP จากการแซง จบรอบ รอบสะอาด → เลเวลอัป (เกมหยุดให้เลือกการ์ด)
 * — การ์ดเสี่ยง: เครื่องพัง (ช้าลง + ต้องเข้าพิทซ่อม) · หมุนในโค้งช้า (ความเร็วหาย)
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (เทสต์และจำลองหาสมดุลได้)
 */
import { createRace, setBoost, stepRace, STEP, type Race, type RaceEvent } from "../drive/race";
import { laneZone, type DriveTrack } from "../drive/line";
import { rand, type Seed } from "../rng";
import type { Compound } from "../types";
import { cardOf, combine, riskOf, XP, xpNeed, type Card } from "./cards";
import { levelChoices, type RaceSetup } from "./run";

export type Feed = { id: number; text: string; tone: "good" | "bad" | "info" };

export type Session = {
  race: Race;
  hero: number;
  setup: RaceSetup;
  rng: Seed;
  xp: number;
  level: number;
  /** เลเวลอัปที่ยังไม่ได้เลือก (เกมหยุดจนกว่าจะเลือก) · ตัวเลือกของใบที่กำลังเลือก */
  levelUps: number;
  offer: Card[] | null;
  /** การ์ดเลเวลอัปที่ได้ในเรซนี้ */
  cards: string[];
  /** เครื่องเสีย (รอเข้าพิทซ่อม) */
  damaged: boolean;
  pos: number;
  bestPos: number;
  lapOffs: number;
  zone: string;
  feed: Feed[];
  feedId: number;
  /** เวลาที่รถเราเข้าเส้นชัย (รอคันอื่นจบอีกครู่แล้วสรุปผล) */
  doneAt: number | null;
  over: boolean;
};

/** หลังรถเราเข้าเส้นชัย รอคันอื่นอีกกี่วินาทีก่อนสรุปผล */
const FINISH_WAIT = 20;
/** เครื่องเสีย: ความเร็วปลาย/อัตราเร่งเหลือกี่ส่วน */
const DAMAGE_TOP = 0.93;
const DAMAGE_ACCEL = 0.85;

export function createSession(track: DriveTrack, setup: RaceSetup): Session {
  const race = createRace(track, setup.entrants, { laps: setup.laps, difficulty: setup.difficulty, seed: setup.seed, startTyre: setup.startTyre, mustPit: setup.mustPit });
  for (const [id, b] of Object.entries(setup.boosts)) setBoost(race, id, b);
  const hero = race.cars.findIndex((c) => c.id === setup.hero);
  const pos = race.order.indexOf(hero) + 1;
  return { race, hero, setup, rng: { s: setup.seed ^ 0x5bd1e995 }, xp: 0, level: 0, levelUps: 0, offer: null, cards: [], damaged: false, pos, bestPos: pos, lapOffs: 0, zone: "throttle", feed: [], feedId: 0, doneAt: null, over: false };
}

export const heroCar = (s: Session) => s.race.cars[s.hero];

function say(s: Session, text: string, tone: Feed["tone"] = "info") {
  s.feed.push({ id: ++s.feedId, text, tone });
  if (s.feed.length > 30) s.feed.splice(0, s.feed.length - 30);
}

/** อัปเกรดรวมตอนนี้: ชิ้นส่วน + การ์ดในเรซ + เครื่องเสีย */
function applyBoost(s: Session) {
  const base = s.setup.boosts[s.setup.hero];
  let b = combine(s.cards, base);
  if (s.damaged) b = { ...b, top: b.top * DAMAGE_TOP, accel: b.accel * DAMAGE_ACCEL };
  setBoost(s.race, s.setup.hero, b);
}

function gainXp(s: Session, n: number) {
  s.xp += n;
  while (s.xp >= xpNeed(s.level)) {
    s.xp -= xpNeed(s.level);
    s.level++;
    s.levelUps++;
  }
  if (s.levelUps > 0 && !s.offer) s.offer = levelChoices(s.rng, s.cards);
}

/** เลือกการ์ดเลเวลอัป (idx ของ offer) — มีผลทันที */
export function chooseCard(s: Session, idx: number) {
  if (!s.offer) return;
  const c = s.offer[idx];
  if (c) {
    s.cards.push(c.id);
    applyBoost(s);
    say(s, `อัปเกรด: ${c.name} — ${c.text}`, "good");
  }
  s.levelUps = Math.max(0, s.levelUps - 1);
  s.offer = s.levelUps > 0 ? levelChoices(s.rng, s.cards) : null;
}

/** สั่งเข้าพิทรอบนี้ (ยางที่จะใส่) · null = ยกเลิก */
export function callPit(s: Session, c: Compound | null) {
  const rc = heroCar(s);
  if (rc.finish !== null || rc.pit) return;
  rc.pitWant = c;
}

/** เกมหยุดอยู่ (รอเลือกการ์ด) */
export const paused = (s: Session) => s.offer !== null;

/**
 * เดินเวลา secs วินาที (หยุดทันทีเมื่อมีเลเวลอัป) · คืนเหตุการณ์ของเครื่องจำลอง
 */
export function stepSession(s: Session, secs: number): RaceEvent[] {
  const events: RaceEvent[] = [];
  const r = s.race;
  const rc = heroCar(s);
  const risk = riskOf(s.cards);
  for (let t = 0; t < secs && !paused(s) && !s.over; t += STEP) {
    const evs = stepRace(r, { throttle: false, brake: false }, []);
    events.push(...evs);
    for (const e of evs) {
      if (e.kind === "lap" && e.id === rc.id && e.lap >= 1) {
        gainXp(s, XP.lap + (rc.offs === s.lapOffs ? XP.clean : 0));
        s.lapOffs = rc.offs;
        // การ์ดเสี่ยง: เครื่องพัง
        if (!s.damaged && rc.finish === null && risk.engine > 0 && rand(s.rng) < risk.engine) {
          s.damaged = true;
          applyBoost(s);
          if (!rc.pitWant && !rc.pit) rc.pitWant = rc.tyre.c;
          say(s, "เครื่องมีปัญหา! ช้าลง — สั่งเข้าพิทซ่อมให้แล้ว", "bad");
        }
      }
      if (e.kind === "pitStop" && e.id === rc.id) {
        say(s, `เปลี่ยนยางเสร็จ ${e.time.toFixed(1)} วิ`, e.time < 3 ? "good" : "info");
        if (s.damaged) {
          s.damaged = false;
          applyBoost(s);
          say(s, "ซ่อมเครื่องเรียบร้อย", "good");
        }
      }
      if (e.kind === "offtrack" && e.id === rc.id) say(s, "หลุดโค้ง! เสียความเร็ว", "bad");
      if (e.kind === "finish" && e.id === rc.id) s.doneAt = r.t;
    }
    // การ์ดเสี่ยง: หมุนตอนเข้าโค้งช้า (เริ่มโซนเบรก)
    const z = laneZone(r.track, rc.car.s, rc.car.lat);
    if (z === "brake" && s.zone !== "brake" && rc.car.v > 45 && !rc.pit && rc.finish === null && risk.spin > 0 && rand(s.rng) < risk.spin) {
      rc.car.v *= 0.35;
      rc.car.slide = (rand(s.rng) < 0.5 ? -1 : 1) * 2.5;
      say(s, "หมุน! เข้าโค้งดุเกินไป", "bad");
    }
    s.zone = z;
    // แซงได้ (ไม่นับคันที่อยู่ในพิท / ตอนเราอยู่ในพิท)
    const pos = r.order.indexOf(s.hero) + 1;
    if (pos < s.pos && rc.pitOff === null && rc.finish === null) {
      const passed = r.cars[r.order[pos]];
      if (passed && passed.pitOff === null) {
        gainXp(s, XP.pass * (s.pos - pos));
        if (pos < s.bestPos) say(s, `แซงขึ้น P${pos}!`, "good");
      }
    }
    s.pos = pos;
    s.bestPos = Math.min(s.bestPos, pos);
    if (s.doneAt !== null && (r.cars.every((c) => c.finish !== null) || r.t - s.doneAt > FINISH_WAIT)) s.over = true;
  }
  return events;
}

/** อันดับจบ (รถที่ยังไม่จบเรียงตามระยะต่อท้าย) */
export const finalPos = (s: Session) => s.race.order.indexOf(s.hero) + 1;

/** ชื่อการ์ดทั้งหมดที่ใช้ในเรซนี้ (สำหรับหน้าผล) */
export const cardNames = (s: Session) => s.cards.map((id) => cardOf(id).name);
