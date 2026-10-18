/**
 * การ์ดอัปเกรดของโหมดกลยุทธ์ (ตามต้นแบบ Pit Wall Gambit)
 * — 22 ใบ 6 หมวด · แต่ละใบอัปได้ 3 ขั้น · เลือกหนึ่งครั้งเติม 1 ช่องให้หมวดนั้น · หมวดครบ 6 ช่อง = โบนัสหมวด
 * — การ์ดที่อัปครบ 3 ขั้นแล้ว สุ่มออกมาเป็น "การ์ดทอง": +2 ขั้นชั่วคราว ซ้อนกันได้
 * — การ์ดเสี่ยง: ข้ามไปขั้น 3 ทันที แต่มีโอกาสเครื่องรวน (ความเร็วเหลือ 62% นาน 15 วิ)
 * แปลงขั้นของการ์ดเป็นอัปเกรดของเครื่องจำลอง (Boost ใน drive/race.ts)
 */
import { NO_BOOST, type Boost } from "../drive/race";
import { pick, rand, type Seed } from "../rng";

export type Fac = "speed" | "corner" | "tyre" | "boost" | "driver" | "golden";

export const FACS: Record<Fac, { name: string; color: string; bonus: string }> = {
  speed: { name: "ความเร็ว", color: "#ff6b57", bonus: "สลิปสตรีม: ลมดูดท้ายแรงขึ้น 2 เท่า" },
  corner: { name: "การเข้าโค้ง", color: "#47d18b", bonus: "แอโรบูสต์: ระหว่างใช้บูสต์ได้กริปโค้งเพิ่ม 4%" },
  tyre: { name: "ยางและพิท", color: "#3fc6d6", bonus: "ยางทนพิเศษ: ยางสึกช้าลงอีก 12% และจอดพิทเร็วขึ้น 0.4 วิ" },
  boost: { name: "บูสต์", color: "#5a8dff", bonus: "ซูเปอร์บูสต์: แรงบูสต์ +40% และแบตเต็มทุกครั้งที่ผ่านเส้นชัย" },
  driver: { name: "นักแข่ง", color: "#c37bff", bonus: "โหมดดุดัน: นักแข่งเร็วขึ้น 0.8% และ XP จากการแซงเป็น 2 เท่า" },
  golden: { name: "ทอง", color: "#f2c230", bonus: "ทองล้น: การ์ดทองชั่วคราวแรงขึ้น 50%" },
};
export const FAC_KEYS = Object.keys(FACS) as Fac[];
/** ช่องต่อหมวด · ขั้นต่อใบ · การ์ดทองเพิ่มกี่ขั้น · การ์ดทองอยู่นานกี่วินาที */
export const FAC_MAX = 6;
export const TIER_MAX = 3;
export const GOLD_TIERS = 2;
export const GOLD_BASE = 40;
/** เครื่องรวนจากการ์ดเสี่ยง: นานกี่วินาที · ความเร็วสูงสุดเหลือกี่ส่วน */
export const LIMP_TIME = 15;
export const LIMP_TOP = 0.62;

export type Card = { id: string; fac: Fac; name: string; eff: string; fx: string };

export const CARDS: Card[] = [
  { id: "engine", fac: "speed", name: "กำลังเครื่องยนต์", eff: "อัตราเร่ง +2% · ความเร็ว +0.8%", fx: "เปลวไฟท่อไอเสีย" },
  { id: "drag", fac: "speed", name: "ลดแรงต้าน", eff: "ความเร็วสูงสุด +1.5%", fx: "เส้นความเร็ว" },
  { id: "tgrip", fac: "speed", name: "กริปยาง", eff: "อัตราเร่ง +1.5% · เบรก +3%", fx: "ยางเรืองแสง" },
  { id: "turbo", fac: "speed", name: "เทอร์โบ", eff: "อัตราเร่ง +2% (แรงสุดช่วงความเร็วต่ำ)", fx: "ไฟเทอร์โบสีฟ้า" },
  { id: "weight", fac: "corner", name: "ลดน้ำหนัก", eff: "อัตราเร่ง +1% · ยึดเกาะ +0.8%", fx: "เงาติดตาตามหลังรถ" },
  { id: "tc", fac: "corner", name: "แทร็กชันคอนโทรล", eff: "อัตราเร่งตอนออกโค้ง +1.5%", fx: "ฝุ่นสีเขียวตอนออกโค้ง" },
  { id: "downforce", fac: "corner", name: "ดาวน์ฟอร์ซ", eff: "ยึดเกาะในโค้ง +2.2% · ความเร็ว −0.3%", fx: "สายลมปลายปีกในโค้ง" },
  { id: "susp", fac: "corner", name: "ช่วงล่าง", eff: "ยึดเกาะ +1.2% · เบรก +2%", fx: "ประกายไฟใต้ท้องรถ" },
  { id: "tsave", fac: "tyre", name: "ถนอมยาง", eff: "ยางสึกช้าลง 9%", fx: "ประกายสีเขียวจากยาง" },
  { id: "therm", fac: "tyre", name: "คุมอุณหภูมิยาง", eff: "ยางเก่าเสียกริปน้อยลง 18%", fx: "ไอร้อนลอยจากยาง" },
  { id: "crew", fac: "tyre", name: "ทีมพิท", eff: "เวลาจอดพิท −10%", fx: "พลุตอนออกจากพิท" },
  { id: "cool", fac: "tyre", name: "ระบายความร้อน", eff: "อัปเกรดใบอื่นทุกใบแรงขึ้น 4%", fx: "ไอเย็นข้างตัวถัง" },
  { id: "sector", fac: "boost", name: "ชาร์จต่อเซกเตอร์", eff: "แบตที่ได้คืนทุกเซกเตอร์ +40%", fx: "คลื่นพลังทุกเซกเตอร์" },
  { id: "regen", fac: "boost", name: "ชาร์จไว", eff: "ชาร์จแบตตอนเบรก +18%", fx: "ประจุไฟฟ้าตอนเบรก" },
  { id: "batt", fac: "boost", name: "ความจุแบต", eff: "ความจุแบตบูสต์ +18%", fx: "ไฟใต้ท้องตามระดับแบต" },
  { id: "kick", fac: "boost", name: "บูสต์แรง", eff: "แรงบูสต์ +15%", fx: "สายฟ้าและไฟยาวตอนบูสต์" },
  { id: "focus", fac: "driver", name: "สมาธินักแข่ง", eff: "นักแข่งเร็วขึ้นโดยรวม +0.4%", fx: "วงแสงเหนือหมวกนักแข่ง" },
  { id: "late", fac: "driver", name: "เบรกช้า", eff: "แรงเบรก +5%", fx: "จานเบรกร้อนแดง" },
  { id: "attack", fac: "driver", name: "จังหวะแซง", eff: "ลมดูดท้ายแรงขึ้น 25%", fx: "ลูกศรไล่ล่าบนถนน" },
  { id: "defend", fac: "driver", name: "ป้องกันอันดับ", eff: "ความเร็วตอนมีรถจี้ท้าย +0.6%", fx: "โล่หกเหลี่ยมท้ายรถ" },
  { id: "xpgain", fac: "golden", name: "XP ไว", eff: "ได้ XP เพิ่ม 15%", fx: "ละอองทองตอนได้ XP" },
  { id: "gdur", fac: "golden", name: "ยืดเวลาการ์ดทอง", eff: "การ์ดทองอยู่นานขึ้น 20%", fx: "ประกายทองตอนการ์ดทองทำงาน" },
];
export const CARD: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
/** เลือกการ์ดกี่ครั้งถึงอัปครบทุกใบ (ใช้คิดค่า XP ต่อเลเวล) */
export const ALL_TIERS = CARDS.length * TIER_MAX;

/** การ์ดทองที่ทำงานอยู่ (หมดเวลาที่ until — เวลาการแข่ง) */
export type Gold = { id: string; until: number };
/** การ์ดในมือหนึ่งใบ: ปกติ · ทอง · เสี่ยง (โอกาสเครื่องรวน · ภายในกี่วินาที) */
export type Hand = { id: string; gold?: boolean; risky?: { chance: number; window: number } };

/** สถานะอัปเกรดของรถคันหนึ่ง */
export type Deck = {
  cards: Record<string, number>;
  fac: Record<Fac, number>;
  golds: Gold[];
  /** เครื่องรวนจนถึงเวลานี้ · จะรวนตอนไหน (การ์ดเสี่ยงที่ดวงไม่ดี) */
  limpUntil: number;
  riskAt: number | null;
};

export const newDeck = (): Deck => ({ cards: {}, fac: { speed: 0, corner: 0, tyre: 0, boost: 0, driver: 0, golden: 0 }, golds: [], limpUntil: -1, riskAt: null });

/** ค่าที่คิดจากการ์ด: อัปเกรดเครื่องจำลอง + ค่าของโหมดเอง */
export type Stats = {
  boost: Boost;
  /** แบตที่ได้คืนต่อเซกเตอร์ (0..1) · แบตเต็มทุกครั้งที่ผ่านเส้นชัย */
  sector: number;
  fullErs: boolean;
  xpMul: number;
  goldDur: number;
  /** ตัวคูณ XP จากการแซง */
  otXp: number;
};

/** แปลงการ์ด (รวมการ์ดทองที่ยังทำงานตอนเวลา now) เป็นค่าต่าง ๆ */
export function computeStats(d: Deck, now: number): Stats {
  const F = d.fac;
  const gm = F.golden >= FAC_MAX ? 1.5 : 1;
  const gold = (id: string) => d.golds.reduce((n, g) => n + (g.id === id && g.until > now ? GOLD_TIERS * gm : 0), 0);
  const k = 1 + 0.04 * (d.cards.cool ?? 0);
  const lv = (id: string) => ((d.cards[id] ?? 0) + gold(id)) * (id === "cool" ? 1 : k);
  const max = (f: Fac) => F[f] >= FAC_MAX;
  const grip = 1 + 0.008 * lv("weight") + 0.022 * lv("downforce") + 0.012 * lv("susp");
  const limp = now < d.limpUntil ? LIMP_TOP : 1;
  return {
    boost: {
      ...NO_BOOST,
      top: (1 + 0.008 * lv("engine") + 0.015 * lv("drag") - 0.003 * lv("downforce")) * limp,
      accel: (1 + 0.02 * lv("engine") + 0.015 * lv("tgrip") + 0.01 * lv("weight") + 0.02 * lv("turbo") + 0.015 * lv("tc")) * (limp < 1 ? 0.8 : 1),
      grip,
      corner: grip,
      brake: 1 + 0.03 * lv("tgrip") + 0.02 * lv("susp") + 0.05 * lv("late"),
      wear: Math.max(0.35, (1 - 0.09 * lv("tsave")) * (max("tyre") ? 0.88 : 1)),
      keep: Math.max(0.15, 1 - 0.18 * lv("therm")),
      pit: Math.max(0.4, 1 - 0.1 * lv("crew")),
      pitMinus: max("tyre") ? 0.4 : 0,
      cap: 1 + 0.18 * lv("batt"),
      regen: 1 + 0.18 * lv("regen"),
      ot: (1 + 0.15 * lv("kick")) * (max("boost") ? 1.4 : 1),
      otGrip: max("corner") ? 1.04 : 1,
      slack: -(0.004 * lv("focus") + (max("driver") ? 0.008 : 0)),
      tow: (1 + 0.25 * lv("attack")) * (max("speed") ? 2 : 1),
      defend: 0.006 * lv("defend"),
    },
    sector: 0.08 * (1 + 0.18 * lv("regen")) * (1 + 0.4 * lv("sector")),
    fullErs: max("boost"),
    xpMul: 1 + 0.15 * lv("xpgain"),
    goldDur: GOLD_BASE * (1 + 0.2 * lv("gdur")),
    otXp: max("driver") ? 2 : 1,
  };
}

const shuffle = <T>(seed: Seed, a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(seed) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * สุ่มการ์ด 3 ใบ: ใบที่มีอยู่แล้วออกบ่อยกว่า · ใบที่ครบ 3 ขั้นแล้วมีโอกาสออกเป็นการ์ดทอง (และเติมมือเมื่อการ์ดปกติหมด)
 * บางครั้งมีการ์ดเสี่ยงหนึ่งใบ · ไม่มีการ์ดให้เลือกเลย = null
 */
export function makeHand(seed: Seed, d: Deck): Hand[] | null {
  const have = (id: string) => d.cards[id] ?? 0;
  const avail = CARDS.filter((k) => have(k.id) < TIER_MAX)
    .map((k) => ({ k, w: rand(seed) * (have(k.id) ? 2.5 : 1) }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.k);
  const maxed = shuffle(seed, CARDS.filter((k) => k.fac !== "golden" && have(k.id) >= TIER_MAX));
  const hand: Hand[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 3; i++) {
    if (maxed.length && rand(seed) < 0.3) {
      const k = maxed.pop()!;
      hand.push({ id: k.id, gold: true });
      used.add(k.id);
      continue;
    }
    const k = avail.find((x) => !used.has(x.id));
    if (!k) continue;
    hand.push({ id: k.id });
    used.add(k.id);
  }
  while (hand.length < 3 && maxed.length) {
    const k = maxed.pop()!;
    if (!used.has(k.id)) {
      hand.push({ id: k.id, gold: true });
      used.add(k.id);
    }
  }
  if (!hand.length) return null;
  if (rand(seed) < 0.2) {
    const cands = hand.filter((h) => !h.gold && have(h.id) <= 1);
    if (cands.length) pick(seed, cands).risky = { chance: Math.round((0.15 + rand(seed) * 0.25) * 20) / 20, window: Math.round((30 + rand(seed) * 60) / 5) * 5 };
  }
  return hand;
}

/** ผลของการเลือกการ์ด (ไว้แจ้งผู้เล่น) */
export type Applied = { maxedCard: boolean; maxedFacs: Fac[]; gold: boolean };

/** ใช้การ์ดหนึ่งใบตอนเวลา now · goldDur = การ์ดทองอยู่นานเท่าไร */
export function applyCard(seed: Seed, d: Deck, h: Hand, now: number, goldDur: number): Applied {
  const before = { ...d.fac };
  const cur = d.cards[h.id] ?? 0;
  const f = CARD[h.id].fac;
  let pips = 1;
  if (h.gold) d.golds.push({ id: h.id, until: now + goldDur });
  else if (h.risky) {
    d.cards[h.id] = TIER_MAX;
    pips = TIER_MAX - cur;
  } else d.cards[h.id] = Math.min(TIER_MAX, cur + 1);
  d.fac[f] = Math.min(FAC_MAX, d.fac[f] + pips);
  if (h.risky && rand(seed) < h.risky.chance) d.riskAt = now + 4 + rand(seed) * (h.risky.window - 4);
  return { maxedCard: !h.gold && cur < TIER_MAX && (d.cards[h.id] ?? 0) >= TIER_MAX, maxedFacs: FAC_KEYS.filter((k) => before[k] < FAC_MAX && d.fac[k] >= FAC_MAX), gold: !!h.gold };
}

/** AI เลือกการ์ด: ชอบหมวดประจำตัว · ชอบ XP ไว · ไม่ค่อยเอาการ์ดทอง · การ์ดเสี่ยงเอาเมื่อโอกาสพังน้อย */
export function aiChoice(seed: Seed, hand: Hand[], pref: Fac): number {
  let best = 0;
  let bw = -Infinity;
  hand.forEach((h, i) => {
    let w = rand(seed) + (CARD[h.id].fac === pref ? 1.2 : 0) + (h.gold ? -0.4 : 0) + (h.id === "xpgain" ? 1.5 : 0);
    if (h.risky) w += h.risky.chance < 0.25 ? 0.6 : -1;
    if (w > bw) {
      bw = w;
      best = i;
    }
  });
  return best;
}

/** XP ต่อเลเวล: ให้ทั้งเรซเลือกการ์ดได้ราวพอให้อัปครบทุกใบ (ตามระยะทางของการแข่ง) */
export const xpCost = (laps: number, trackLen: number) => Math.max(5, Math.round(((laps * trackLen) / XP_DIST) * 1.55 / (ALL_TIERS + 6)));
/** XP: 1 ต่อระยะ XP_DIST เมตร · แซง · รอบเร็วที่สุดของสนาม */
export const XP_DIST = 30;
export const XP_PASS = 20;
export const XP_FASTEST = 30;
