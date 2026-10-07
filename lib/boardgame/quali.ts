/**
 * ควอลิฟาย 2 ช่วง — ฟังก์ชันล้วน ความสุ่มผ่าน `rng`
 *
 * ไพ่ควอลิฟายเลข 1..36 (เลขน้อย = รอบเร็ว) ผู้เล่นได้คันละ 2 ใบ เลือกใบหนึ่งวิ่ง Q1 อีกใบเก็บไว้ Q2
 * รถ AI จั่วใบเดียวทุกช่วง · Q1 ครึ่งหลังตกรอบ ล็อกกริดท้าย · Q2 ชิงกริดหน้า
 * รอบพิเศษ: คันละครั้งตลอดควอลิฟาย จั่วเพิ่ม 1 ใบ เร็วกว่าก็ใช้ — แต่ยางออกสตาร์ทสึกครึ่งราง
 */

import { QUALI_CARDS } from "./cards";
import { WEAR_MAX, shuffle, type CarSpec, type Rng } from "./engine";

export type QualiStage = "pick" | "q1" | "q2" | "done";

export type Quali = {
  stage: QualiStage;
  deck: number[];
  /** ไพ่ 2 ใบของรถผู้เล่น (รถ AI = []) */
  hands: number[][];
  /** เวลาในช่วงปัจจุบัน (เลขไพ่) — null = ไม่ได้วิ่งช่วงนี้ */
  times: (number | null)[];
  /** ไพ่ที่เก็บไว้ใช้ Q2 */
  saved: (number | null)[];
  /** ใช้รอบพิเศษแล้ว (ยางสึกครึ่งราง) */
  extra: boolean[];
  /** id ที่เข้า Q2 */
  q2: number[];
  /** id ที่ตกรอบ Q1 เรียงตามเวลา (กริดท้าย) */
  locked: number[];
  /** ผลรอบพิเศษล่าสุด ไว้ให้หน้าจอโชว์ */
  last: { id: number; card: number; better: boolean } | null;
  grid: number[];
};

export const HALF_WEAR = Math.floor(WEAR_MAX / 2);

export function newQuali(cars: CarSpec[], rng: Rng): Quali {
  let deck = shuffle(
    Array.from({ length: QUALI_CARDS }, (_, i) => i + 1),
    rng,
  );
  const hands = cars.map((c) => {
    if (c.ai) return [];
    const h = deck.slice(0, 2);
    deck = deck.slice(2);
    return h;
  });
  return {
    stage: "pick",
    deck,
    hands,
    times: cars.map(() => null),
    saved: cars.map(() => null),
    extra: cars.map(() => false),
    q2: [],
    locked: [],
    last: null,
    grid: [],
  };
}

/** ลำดับ id ตามเวลา (เร็วก่อน) เฉพาะคันที่มีเวลา */
export const byTime = (q: Quali) =>
  q.times
    .map((t, id) => ({ t, id }))
    .filter((x): x is { t: number; id: number } => x.t !== null)
    .sort((a, b) => a.t - b.t || a.id - b.id)
    .map((x) => x.id);

/** จั่วให้รถ AI ทุกคันในรายการ */
function aiDraw(q: Quali, cars: CarSpec[], who: number[]): Quali {
  const times = [...q.times];
  let deck = q.deck;
  for (const id of who) {
    if (!cars[id].ai) continue;
    times[id] = deck[0];
    deck = deck.slice(1);
  }
  return { ...q, times, deck };
}

/** เริ่ม Q1: picks[id] = ใบที่ (0/1) จะใช้ Q1 ของรถผู้เล่นแต่ละคัน */
export function runQ1(q: Quali, cars: CarSpec[], picks: Record<number, 0 | 1>): Quali {
  if (q.stage !== "pick") return q;
  const times = [...q.times];
  const saved = [...q.saved];
  cars.forEach((c, id) => {
    if (c.ai) return;
    const k = picks[id] ?? 0;
    times[id] = q.hands[id][k];
    saved[id] = q.hands[id][1 - k];
  });
  return aiDraw({ ...q, stage: "q1", times, saved, last: null }, cars, cars.map((_, i) => i));
}

/** วิ่งรอบพิเศษได้ไหม: รถผู้เล่นที่ยังวิ่งช่วงนี้อยู่ และยังไม่เคยใช้ */
export const canExtra = (q: Quali, cars: CarSpec[], id: number) =>
  (q.stage === "q1" || q.stage === "q2") && !cars[id].ai && !q.extra[id] && q.times[id] !== null && q.deck.length > 0;

export function extraLap(q: Quali, cars: CarSpec[], id: number): Quali {
  if (!canExtra(q, cars, id)) return q;
  const card = q.deck[0];
  const better = card < q.times[id]!;
  const times = [...q.times];
  if (better) times[id] = card;
  const extra = [...q.extra];
  extra[id] = true;
  return { ...q, deck: q.deck.slice(1), times, extra, last: { id, card, better } };
}

/** จบ Q1: ครึ่งหลังตกรอบ (ล็อกกริดท้าย) ที่เหลือวิ่ง Q2 ด้วยใบที่เก็บไว้ รถ AI จั่วใหม่ */
export function toQ2(q: Quali, cars: CarSpec[]): Quali {
  if (q.stage !== "q1") return q;
  const order = byTime(q);
  const cut = Math.ceil(order.length / 2);
  const q2 = order.slice(0, cut);
  const locked = order.slice(cut);
  // ไพ่ที่ใช้ไปแล้วไม่กลับเข้ากอง ส่วนใบที่ผู้เล่นเก็บไว้ยังอยู่ในมือ
  const times = cars.map((c, id) => (q2.includes(id) && !c.ai ? q.saved[id] : null));
  return aiDraw({ ...q, stage: "q2", q2, locked, times, last: null }, cars, q2);
}

/** จบ Q2: กริด = ผล Q2 แล้วต่อด้วยคันที่ตก Q1 */
export function finishQuali(q: Quali): Quali {
  if (q.stage !== "q2") return q;
  return { ...q, stage: "done", grid: [...byTime(q), ...q.locked], last: null };
}

/** ยางสึกตั้งต้นของแต่ละคันหลังควอลิฟาย */
export const startWear = (q: Quali, id: number) => (q.extra[id] ? HALF_WEAR : 0);
