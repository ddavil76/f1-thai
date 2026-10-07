import { describe, expect, it } from "vitest";
import {
  CARD_EVENTS, CRUISE_MOVE, DECK_LIST, HAND_SIZE, PIT_COST, SC_SPEED_CAP, SPEED_CARDS,
  OFFLINE_PENALTY, TYRE_SLOTS, TYRES, WORN_MOVE,
  activePlayer, applyEvent, cornerAt, settle, travel, canPlay, canSwap, columnAvg, forecastAt, makeWeatherPlan, newGame,
  pitCost, playTurn, shiftSky, shuffle, speedValue, spinChance, standings, validTyres,
  weatherEffect, weatherFlipped,
  type Action, type CarSpec, type GameState, type Player, type Mode, type Rng, type Tyre, type Weather, type WeatherPlan,
} from "@/lib/boardgame/engine";

/** rng ที่คืนค่าตามลำดับที่กำหนด แล้ววนซ้ำ */
const seq = (...v: number[]): Rng => {
  let i = 0;
  return () => v[i++ % v.length];
};
/** rng ที่พังถ้าถูกเรียก — ใช้ยืนยันว่าท่านั้นไม่ใช้ความสุ่มเลย */
const never: Rng = () => {
  throw new Error("rng ไม่ควรถูกเรียก");
};
// จบรอบแบบเงียบ: ไม่มีธงแดง (>= RED_FLAG_CHANCE) และไม่มีธงเหลือง (>= YELLOW_CHANCE)
const QUIET = [0.99, 0.99];

/**
 * ไพ่เร่งที่ใช้ในเทสต์ (ลำดับใน SPEED_CARDS): [นิ่ม, กลาง, แข็ง] สึก/หยดน้ำ/ไอคอน
 *  0: [9,7,5] สึก น้ำ3      3: [8,6,4] สึก น้ำ0     4: [8,5,4] ไม่สึก น้ำ2 เหตุการณ์
 *  1: [9,6,4] สึก น้ำ2      6: [7,6,4] ไม่สึก น้ำ1  7: [7,5,5] สึก น้ำ0
 *  2: [8,7,5] สึก น้ำ1 ทีม  12: [6,5,4] ไม่สึก น้ำ3  16: [5,5,5] ไม่สึก น้ำ0
 */

const TYRES_SET: Tyre[][] = [
  ["medium", "soft", "hard", "wet"],
  ["medium", "soft", "hard", "wet"],
];

const dryPlan = (): WeatherPlan => ({
  weather: Array<Weather>(30).fill("dry"),
  fcWrong: Array<boolean>(30).fill(false),
});

const humans = (...names: string[]): CarSpec[] =>
  names.map((name, i) => ({ name, num: i + 1, ai: false, tyres: TYRES_SET[i % 2] }));

/** สนามทดสอบ: รอบเดียวยาว `cells` ช่อง ไม่มีโค้ง */
const straight = (cells: number) => ({ lapCells: cells, corners: [] });

/**
 * เกมใหม่ 2 คน (A อยู่เส้นแข่ง B อยู่เลนนอก ช่องเดียวกัน) อากาศแห้งตลอด
 * และกำหนดมือผู้เล่นทุกคนเอง (สำรับที่เหลือไว้จั่วเติม)
 */
function game(
  total = 30,
  hand: Action[] = ["boost", "pit", "save"],
  plan: WeatherPlan = dryPlan(),
): GameState {
  const s = newGame(humans("A", "B"), straight(total), 1, plan, () => 0.5, [0, 1]);
  return { ...s, players: s.players.map((p) => ({ ...p, hand: [...hand] })) };
}

/** กำหนดไพ่เร่งที่จะพลิกต่อไปของทุกคน (ตามลำดับ) ที่เหลือเรียงต่อท้าย */
const fix = (s: GameState, ...ids: number[]): GameState => {
  const rest = SPEED_CARDS.map((_, i) => i).filter((i) => !ids.includes(i));
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, speedDeck: [...ids, ...rest], speedDiscard: [] })),
  };
};

const val = (id: number, t: Tyre) => speedValue(SPEED_CARDS[id], t);

const withWeather = (s: GameState, w: Weather): GameState => ({
  ...s,
  weather: s.weather.map(() => w),
});

const push = (action: Action | null = null, extra: object = {}) => ({
  mode: "push" as Mode,
  action,
  ...extra,
});
const cruise = (action: Action | null = null, extra: object = {}) => ({
  mode: "cruise" as Mode,
  action,
  ...extra,
});

const setPlayer = (s: GameState, id: number, patch: object): GameState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

describe("เริ่มเกม", () => {
  it("แจกมือครบ 3 ใบ สำรับรวมมือตรงกับ DECK_LIST และยางใบแรกคือยางที่ใช้", () => {
    const s = newGame(humans("A", "B"), straight(30), 1, dryPlan(), Math.random, [0, 1]);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
      expect(p.hand.length + p.deck.length).toBe(
        Object.values(DECK_LIST).reduce((a, b) => a + b, 0),
      );
      expect(p.life).toBe(TYRES.medium.life);
      expect(p.speedDeck).toHaveLength(SPEED_CARDS.length);
      expect([...p.speedDeck].sort((a, b) => a - b)).toEqual(SPEED_CARDS.map((_, i) => i));
    }
    expect(s.order).toEqual([0, 1]);
  });

  it("shuffle ไม่ทำการ์ดหาย และไม่แก้อาเรย์เดิม", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seq(0.1, 0.9, 0.5));
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });

  it("validTyres: ต้องครบช่อง และชนิดเดียวกันไม่เกิน 2", () => {
    expect(TYRE_SLOTS).toBe(4);
    expect(validTyres(["soft", "soft", "hard", "wet"])).toBe(true);
    expect(validTyres(["soft", "soft", "soft", "wet"])).toBe(false);
    expect(validTyres(["soft", "hard", "wet"])).toBe(false);
  });
});

describe("สำรับไพ่เร่ง", () => {
  it("ค่าเฉลี่ยของแถว นิ่ม > กลาง > แข็ง และอยู่ในช่วงที่ออกแบบ", () => {
    const [s, m, h] = [columnAvg("soft"), columnAvg("medium"), columnAvg("hard")];
    expect(s).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(h);
    expect(s).toBeGreaterThanOrEqual(6.3);
    expect(s).toBeLessThanOrEqual(6.9);
    expect(m).toBeGreaterThanOrEqual(5.1);
    expect(m).toBeLessThanOrEqual(5.7);
    expect(h).toBeGreaterThanOrEqual(4.1);
    expect(h).toBeLessThanOrEqual(4.7);
  });

  it("ทุกไพ่: ค่านิ่ม ≥ กลาง ≥ แข็ง, หยดน้ำ 0–3, สึกไม่เกินครึ่งสำรับ", () => {
    for (const c of SPEED_CARDS) {
      expect(c.v[0]).toBeGreaterThanOrEqual(c.v[1]);
      expect(c.v[1]).toBeGreaterThanOrEqual(c.v[2]);
      expect(c.risk).toBeGreaterThanOrEqual(0);
      expect(c.risk).toBeLessThanOrEqual(3);
    }
    expect(SPEED_CARDS.filter((c) => c.wear).length).toBeLessThanOrEqual(SPEED_CARDS.length / 2);
  });

  it("โอกาสหมุนตามหยดน้ำ: ฝนหนักยางเรียบ ~60%, ฝนเบา ~35%, ยางฝนที่ตรงอากาศ 0", () => {
    expect(spinChance("heavy_rain", "soft")).toBeCloseTo(0.6, 2);
    expect(spinChance("light_rain", "medium")).toBeCloseTo(0.35, 2);
    expect(spinChance("heavy_rain", "inter")).toBeCloseTo(0.15, 2);
    expect(spinChance("light_rain", "inter")).toBe(0);
    expect(spinChance("heavy_rain", "wet")).toBe(0);
    expect(spinChance("dry", "soft")).toBe(0);
  });

  it("weatherEffect บอกก้าวและโอกาสหมุน", () => {
    expect(weatherEffect("light_rain", "inter")).toEqual({ move: 1, spin: 0 });
    expect(weatherEffect("dry", "medium")).toEqual({ move: 0, spin: 0 });
    expect(weatherEffect("dry", "wet").move).toBe(-2);
  });
});

describe("แผนอากาศและพยากรณ์", () => {
  it("makeWeatherPlan: มีฝนอย่างน้อย 2 รอบ และสองรอบแรกแห้ง", () => {
    for (let n = 0; n < 50; n++) {
      const plan = makeWeatherPlan(Math.random);
      expect(plan.weather).toHaveLength(plan.fcWrong.length);
      expect(plan.weather.slice(0, 2)).toEqual(["dry", "dry"]);
      expect(plan.weather.filter((w) => w !== "dry").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("พยากรณ์ 2 รอบแรกที่มองไปข้างหน้าแม่นเสมอ ไกลกว่านั้นคลาดเคลื่อนหนึ่งขั้นเมื่อ fcWrong", () => {
    const plan: WeatherPlan = {
      weather: ["dry", "dry", "light_rain", "heavy_rain", "dry", ...Array<Weather>(25).fill("dry")],
      fcWrong: Array<boolean>(30).fill(true),
    };
    expect(forecastAt(plan, 3, 0)).toEqual({ weather: "light_rain", sure: true });
    expect(forecastAt(plan, 3, 1)).toEqual({ weather: "heavy_rain", sure: true });
    expect(forecastAt(plan, 1, 2)).toEqual({ weather: "dry", sure: false });
    expect(forecastAt(plan, 1, 3)).toEqual({ weather: "light_rain", sure: false });
    expect(forecastAt(plan, 1, 4)).toEqual({ weather: "light_rain", sure: false });
    expect(forecastAt(dryPlan(), 40, 0).weather).toBe("dry");
  });
});

describe("ขับคุม และ เร่ง", () => {
  it("ขับคุม: เดินคงที่ ไม่พลิกไพ่เร่ง ยางไม่สึก", () => {
    const s = fix(game(), 7);
    const out = playTurn(s, cruise(), never);
    expect(out.players[0].progress).toBe(CRUISE_MOVE);
    expect(out.players[0].life).toBe(TYRES.medium.life);
    expect(out.players[0].speedDeck).toEqual(s.players[0].speedDeck);
    expect(out.lastTurn?.card).toBeNull();
  });

  it("เร่ง: ใช้ค่าไพ่ตามแถวของยาง และไพ่ไปกองทิ้ง", () => {
    const out = playTurn(fix(game(), 3), push(), never);
    expect(out.players[0].progress).toBe(val(3, "medium")); // 6
    expect(out.lastTurn?.card).toBe(3);
    expect(out.players[0].speedDiscard).toEqual([3]);
    expect(out.players[0].speedDeck[0]).not.toBe(3);
  });

  it("แต่ละยางใช้แถวของตัวเอง: นิ่ม/กลาง/แข็ง และอินเตอร์ = กลาง, เว็ท = แข็ง", () => {
    const base = fix(game(), 0);
    for (const [t, expected] of [
      ["soft", 9],
      ["medium", 7],
      ["hard", 5],
    ] as const) {
      const s = setPlayer(base, 0, { tyres: [t, "hard"], life: 9 });
      expect(playTurn(s, push(), never).players[0].progress).toBe(expected);
    }
    const inter = setPlayer(withWeather(base, "light_rain"), 0, { tyres: ["inter", "hard"], life: 9 });
    expect(playTurn(inter, push(), never).players[0].progress).toBe(7 + 1); // แถวกลาง + โบนัสฝนเบา
    const wet = setPlayer(withWeather(base, "heavy_rain"), 0, { tyres: ["wet", "hard"], life: 9 });
    expect(playTurn(wet, push(), never).players[0].progress).toBe(5 + 1); // แถวแข็ง + โบนัสฝนหนัก
  });

  it("ยางสึกเฉพาะไพ่ที่มีสัญลักษณ์สึก", () => {
    const worn = playTurn(fix(game(), 7), push(), never); // ไพ่ 7 มีสัญลักษณ์สึก
    expect(worn.players[0].life).toBe(TYRES.medium.life - 1);
    const clean = playTurn(fix(game(), 6), push(), never); // ไพ่ 6 ไม่มี
    expect(clean.players[0].life).toBe(TYRES.medium.life);
  });

  it("เล่นการ์ดแล้วการ์ดไปกองทิ้ง และจั่วเติมให้ครบ 3 ใบ", () => {
    const s = playTurn(fix(game(), 7), push("save"), never);
    const me = s.players[0];
    expect(me.hand).toHaveLength(HAND_SIZE);
    expect(me.discard).toEqual(["save"]);
  });

  it("การ์ดที่ไม่มีในมือ หรือใช้ผิดโหมด = เล่นไม่ได้ state ไม่เปลี่ยน", () => {
    const s = game(30, ["boost", "save", "reroll"]);
    expect(playTurn(s, push("block"), never)).toBe(s);
    expect(playTurn(s, cruise("boost"), never)).toBe(s);
    expect(playTurn(s, cruise("save"), never)).toBe(s);
    expect(playTurn(s, cruise("reroll"), never)).toBe(s);
  });

  it("ดันสุด +3 ช่อง ยางเสื่อมเพิ่ม 1 / ประหยัดยาง −1 ช่อง ยางไม่สึก", () => {
    const boost = playTurn(fix(game(), 6), push("boost"), never); // ไพ่ 6 ไม่สึก
    expect(boost.players[0].progress).toBe(val(6, "medium") + 3);
    expect(boost.players[0].life).toBe(TYRES.medium.life - 1);
    const save = playTurn(fix(game(), 7), push("save"), never); // ไพ่ 7 สึก แต่ประหยัดยาง
    expect(save.players[0].progress).toBe(val(7, "medium") - 1);
    expect(save.players[0].life).toBe(TYRES.medium.life);
  });

  it("ดูดอากาศ: ใช้ได้ทั้งสองโหมด +2 ปกติ, +4 เมื่อตามหลัง", () => {
    const lead = fix(game(30, ["slipstream", "boost", "save"]), 6);
    expect(playTurn(lead, cruise("slipstream"), never).players[0].progress).toBe(CRUISE_MOVE + 2);
    expect(playTurn(lead, push("slipstream"), never).players[0].progress).toBe(val(6, "medium") + 2);
    const behind = setPlayer(lead, 1, { progress: 9 });
    expect(playTurn(behind, cruise("slipstream"), never).players[0].progress).toBe(CRUISE_MOVE + 4);
  });

  it("พลิกสองใบ: ใช้ใบที่ค่ามากกว่า ทั้งสองใบไปกองทิ้ง", () => {
    const s = fix(game(30, ["reroll", "boost", "save"]), 16, 0); // กลาง 5 กับ 7
    const out = playTurn(s, push("reroll"), never);
    expect(out.lastTurn?.card).toBe(0);
    expect(out.players[0].progress).toBe(7);
    expect(out.players[0].speedDiscard.sort()).toEqual([0, 16]);
  });

  it("ขวางทาง: คนที่เดินต่อจากเราโดน −2 ครั้งเดียว และคนสุดท้ายในรอบเล่นไม่ได้", () => {
    const s = game(30, ["block", "boost", "save"]);
    let t = playTurn(s, cruise("block"), never);
    expect(t.players[1].debuff).toBe(2);
    t = playTurn(t, cruise(), seq(...QUIET)); // ตาสุดท้ายของรอบ: ขับคุมไม่ใช้ rng แต่จบรอบสุ่มธง
    expect(t.players[1].progress).toBe(CRUISE_MOVE - 2);
    expect(t.players[1].debuff).toBe(0);
    // ผู้เล่นคนที่ 2 ในรอบแรกเป็นคนสุดท้าย ไม่มีใครเดินตามหลัง
    const lastInOrder = playTurn(s, cruise(), never);
    expect(canPlay(lastInOrder, activePlayer(lastInOrder), "block", "cruise")).toBe(false);
    expect(playTurn(lastInOrder, cruise("block"), never)).toBe(lastInOrder);
  });

  it("สำรับการ์ด action หมดแล้วสับกองทิ้งกลับมาจั่วต่อ", () => {
    const s = game();
    const tight = {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        deck: [],
        discard: ["boost" as Action, "save" as Action],
      })),
    };
    const out = playTurn(tight, cruise(), never);
    expect(out.players[0].hand).toHaveLength(HAND_SIZE);
  });

  it("กองไพ่เร่งหมดแล้วสับกองทิ้งกลับมาพลิกต่อ", () => {
    const s = setPlayer(game(), 0, { speedDeck: [], speedDiscard: [3, 4, 5] });
    const out = playTurn(s, push(), seq(0.5));
    expect([3, 4, 5]).toContain(out.lastTurn?.card);
    expect(out.players[0].speedDeck).toHaveLength(2);
  });
});

describe("สัญลักษณ์พิเศษบนไพ่เร่ง", () => {
  it("ไอคอนทีม: ได้จั่วการ์ด action เพิ่ม 1 ใบ (มือเกิน 3 ได้)", () => {
    const out = playTurn(fix(game(), 2), push(), never);
    expect(out.players[0].hand).toHaveLength(HAND_SIZE + 1);
  });

  // ไพ่ 4 มีไอคอนเหตุการณ์ (กลาง 5, ไม่สึก) — rng แรกคือเลือกเหตุการณ์
  // ลำดับ: ล็อกล้อ, ยางเสื่อมเร็ว, ลมส่ง, วิทยุทีม, เบรกร้อน, ขับพลาด
  const withEvent = (r: number) => playTurn(fix(game(), 4), push(), seq(r));

  it("ล็อกล้อ: ถอย 2 ช่อง (ไม่ต่ำกว่า 0)", () => {
    expect(withEvent(0.0).players[0].progress).toBe(5 - 2);
    expect(withEvent(0.0).lastTurn?.cardEvent).toBe("lockup");
    expect(CARD_EVENTS.lockup.label).toBeTruthy();
  });

  it("ยางเสื่อมเร็ว: อายุยางลดอีก 1", () => {
    const out = withEvent(0.2);
    expect(out.lastTurn?.cardEvent).toBe("wearmore");
    expect(out.players[0].life).toBe(TYRES.medium.life - 1);
  });

  it("ลมส่ง: +2 ช่อง", () => {
    const out = withEvent(0.4);
    expect(out.lastTurn?.cardEvent).toBe("tailwind");
    expect(out.players[0].progress).toBe(5 + 2);
  });

  it("วิทยุทีม: จั่วการ์ดเพิ่ม 1 ใบ", () => {
    const out = withEvent(0.55);
    expect(out.lastTurn?.cardEvent).toBe("radio");
    expect(out.players[0].hand).toHaveLength(HAND_SIZE + 1);
  });

  it("เบรกร้อน: เทิร์นถัดไปของเขาบังคับขับคุม แล้วกลับเป็นปกติ", () => {
    let s = withEvent(0.7);
    expect(s.lastTurn?.cardEvent).toBe("brakes");
    expect(s.players[0].limp).toBe(true);
    s = playTurn(s, cruise(), seq(...QUIET)); // B ขับคุมจบรอบ
    const forced = playTurn(fix(s, 7), push(), never); // A เลือกเร่ง แต่ถูกบังคับขับคุม ไม่พลิกไพ่
    expect(forced.lastTurn).toMatchObject({ mode: "cruise", card: null });
    expect(forced.players[0].limp).toBe(false);
  });

  it("ขับพลาด: เกิดเหตุผิดปกติ รอบหน้าขึ้นธงเหลือง", () => {
    let s = withEvent(0.9);
    expect(s.lastTurn?.cardEvent).toBe("yellow");
    expect(s.incident).toBe(true);
    s = playTurn(s, cruise(), seq(0.99));
    expect(s.yellow).toBe(true);
  });
});

describe("ยางพัง", () => {
  const worn = (s: GameState) => setPlayer(s, 0, { life: 0 });

  it("บังคับขับคุมแบบลดทอน แม้เลือกเร่ง และไม่พลิกไพ่", () => {
    const out = playTurn(worn(game()), push(), never);
    expect(out.players[0].progress).toBe(WORN_MOVE);
    expect(out.lastTurn).toMatchObject({ mode: "cruise", worn: true, card: null });
  });

  it("เล่นการ์ดอื่นนอกจากเข้าพิทไม่ได้", () => {
    const s = worn(game(30, ["boost", "pit", "slipstream"]));
    expect(playTurn(s, push("boost"), never)).toBe(s);
    expect(playTurn(s, cruise("slipstream"), never)).toBe(s);
  });

  it("เข้าพิทฉุกเฉินได้โดยไม่ต้องมีการ์ดพิทในมือ และไม่เปลืองการ์ด", () => {
    const s = worn(game(30, ["boost", "save", "reroll"]));
    const out = playTurn(s, cruise("pit"), never);
    const me = out.players[0];
    expect(me.tyres[0]).toBe("soft");
    expect(me.life).toBe(TYRES.soft.life);
    expect(me.hand).toEqual(["boost", "save", "reroll"]);
    expect(me.discard).toEqual([]);
  });

  it("ไม่มียางสำรองแล้วเข้าพิทไม่ได้", () => {
    const lonely = setPlayer(worn(game()), 0, { tyres: ["hard" as Tyre] });
    expect(canPlay(lonely, activePlayer(lonely), "pit", "cruise")).toBe(false);
  });

  it("ยางสึกถึง 0 จากไพ่สึก แล้วเทิร์นถัดไปเป็นยางพัง", () => {
    const s = setPlayer(fix(game(), 7), 0, { life: 1 });
    const after = playTurn(s, push(), never);
    expect(after.players[0].life).toBe(0);
    expect(after.lastTurn?.worn).toBe(false);
  });
});

describe("เข้าพิท", () => {
  it("เปลี่ยนเป็นยางสำรองที่เลือก อายุเต็ม เสียเวลา และยางสำรองที่เหลือไม่หาย", () => {
    const out = playTurn(game(), cruise("pit", { pitTo: 2 }), never); // ยางสำรองลำดับ 2 = hard
    const me = out.players[0];
    expect(me.tyres).toEqual(["hard", "soft", "wet"]);
    expect(me.life).toBe(TYRES.hard.life);
    expect(me.progress).toBe(Math.max(1, CRUISE_MOVE - PIT_COST));
    expect(me.discard).toEqual(["pit"]);
  });

  it("ค่าเริ่มต้นคือยางสำรองใบแรก และเลือกยางที่ไม่มีจริงไม่ได้", () => {
    const s = game();
    expect(playTurn(s, cruise("pit"), never).players[0].tyres).toEqual(["soft", "hard", "wet"]);
    expect(playTurn(s, cruise("pit", { pitTo: 4 }), never)).toBe(s);
    expect(playTurn(s, cruise("pit", { pitTo: 0 }), never)).toBe(s);
  });

  it("เข้าพิทบังคับให้เป็นขับคุม ไม่พลิกไพ่ แม้เลือกเร่ง", () => {
    const out = playTurn(game(), push("pit"), never);
    expect(out.lastTurn).toMatchObject({ mode: "cruise", card: null });
  });
});

describe("เซฟตี้คาร์", () => {
  it("เข้าพิทฟรีเฉพาะรอบที่เป็นเซฟตี้คาร์ รอบอื่นเสียเต็ม", () => {
    expect(pitCost(game())).toBe(PIT_COST);
    expect(pitCost(applyEvent(game(), "safety_car"))).toBe(0);
    const sc = applyEvent(game(), "safety_car");
    expect(playTurn(sc, cruise("pit"), never).players[0].progress).toBe(CRUISE_MOVE);
  });

  it("ค่าไพ่เร่งสูงสุด 5", () => {
    const sc = applyEvent(setPlayer(fix(game(), 0), 0, { tyres: ["soft", "hard"], life: 9 }), "safety_car");
    expect(playTurn(sc, push(), never).players[0].progress).toBe(SC_SPEED_CAP); // นิ่ม 9 → 5
  });

  it("ช่องว่างจากผู้นำเหลือครึ่ง", () => {
    const s = game(40);
    const spread = setPlayer(setPlayer(s, 0, { progress: 20 }), 1, { progress: 10 });
    const out = applyEvent(spread, "safety_car");
    expect(out.players.map((p) => p.progress)).toEqual([20, 15]);
    expect(out.event).toBe("safety_car");
  });
});

describe("ฝน", () => {
  it("ยางไม่สึกในฝน (แม้ไพ่มีสัญลักษณ์สึก) แต่ในแห้งสึก", () => {
    const rain = withWeather(fix(game(), 7), "light_rain");
    const inter = setPlayer(rain, 0, { tyres: ["inter", "hard"], life: 3 });
    expect(playTurn(inter, push(), never).players[0].life).toBe(3);
    expect(playTurn(fix(game(), 7), push(), never).players[0].life).toBe(TYRES.medium.life - 1);
  });

  it("ยางที่เหมาะกับฝนได้โบนัสก้าว และไม่เสี่ยงหมุนแม้ไพ่หยดน้ำเยอะ", () => {
    const rain = withWeather(fix(game(), 0), "light_rain"); // ไพ่ 0 น้ำ 3
    const inter = setPlayer(rain, 0, { tyres: ["inter", "hard"], life: 3 });
    const out = playTurn(inter, push(), never);
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(val(0, "inter") + 1);
  });

  it("ฝนหนัก ยางกลางเร่ง: ไพ่หยดน้ำ ≥ 1 หมุน → เดิน 1 ช่อง และรอบหน้าขึ้นธงเหลือง", () => {
    const rain = withWeather(fix(game(), 6), "heavy_rain"); // ไพ่ 6 น้ำ 1
    let s = playTurn(rain, push(), never);
    expect(s.lastTurn).toMatchObject({ spun: true, moved: 1 });
    expect(s.players[0].progress).toBe(1);
    expect(s.incident).toBe(true);
    s = playTurn(s, cruise(), seq(0.99)); // จบรอบ: ไม่มีธงเหลืองเดิม → เช็กธงแดง 0.99 ไม่เกิด
    expect(s.yellow).toBe(true); // เพราะมีคนหมุน ไม่ต้องสุ่ม
    expect(s.incident).toBe(false);
  });

  it("ฝนหนัก ไพ่ไม่มีหยดน้ำ (0) ไม่หมุน", () => {
    const rain = withWeather(fix(game(), 3), "heavy_rain"); // ไพ่ 3 น้ำ 0
    const out = playTurn(rain, push(), never);
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(val(3, "medium"));
  });

  it("ฝนเบาต้องน้ำ ≥ 2 ถึงหมุน", () => {
    const light = withWeather(fix(game(), 6), "light_rain"); // น้ำ 1 → ไม่หมุน
    expect(playTurn(light, push(), never).lastTurn?.spun).toBe(false);
    const spin = withWeather(fix(game(), 12), "light_rain"); // น้ำ 3 → หมุน
    expect(playTurn(spin, push(), never).lastTurn?.spun).toBe(true);
  });

  it("อินเตอร์ในฝนหนักต้องน้ำ ≥ 3, เว็ทไม่หมุนเลย", () => {
    const heavy = withWeather(game(), "heavy_rain");
    const inter = (id: number) => setPlayer(fix(heavy, id), 0, { tyres: ["inter", "hard"], life: 3 });
    expect(playTurn(inter(0), push(), never).lastTurn?.spun).toBe(true); // น้ำ 3
    expect(playTurn(inter(1), push(), never).lastTurn?.spun).toBe(false); // น้ำ 2
    const wet = setPlayer(fix(heavy, 0), 0, { tyres: ["wet", "hard"], life: 4 });
    expect(playTurn(wet, push(), never).lastTurn?.spun).toBe(false);
  });

  it("ขับคุมในฝนปลอดภัย ไม่พลิกไพ่ ไม่หมุน", () => {
    const rain = withWeather(game(), "heavy_rain");
    const out = playTurn(rain, cruise(), never);
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(CRUISE_MOVE);
  });

  it("ยางฝนในสนามแห้ง: ก้าวลด และสึกเร็วกว่า", () => {
    const inter = setPlayer(fix(game(), 6), 0, { tyres: ["inter", "hard"], life: 3 });
    const out = playTurn(inter, push(), never); // ไพ่ 6 ไม่สึก แต่ยางฝนร้อนเกิน −1 อายุ
    expect(out.players[0].progress).toBe(val(6, "inter") - 1);
    expect(out.players[0].life).toBe(2);
  });
});

describe("สลับยางด่วนตอนอากาศพลิก", () => {
  const plan = (): WeatherPlan => ({
    weather: ["dry", "dry", "light_rain", "light_rain", ...Array<Weather>(26).fill("dry")],
    fcWrong: Array<boolean>(30).fill(false),
  });
  const at = (round: number) => ({ ...game(30, ["boost", "pit", "save"], plan()), round });

  it("พลิกเฉพาะรอบที่ประเภทอากาศต่างจากรอบก่อน (แห้ง↔ฝน)", () => {
    expect(weatherFlipped(at(2))).toBe(false);
    expect(weatherFlipped(at(3))).toBe(true); // แห้ง → ฝน
    expect(weatherFlipped(at(4))).toBe(false); // ฝนต่อเนื่อง
    expect(weatherFlipped(at(5))).toBe(true); // ฝน → แห้ง
    expect(weatherFlipped(at(1))).toBe(false);
  });

  it("สลับเป็นยางฝนสำรองได้ฟรี ยางเดิมถูกทิ้ง ยางใหม่อายุเต็ม และยังเดินเทิร์นนั้นได้", () => {
    const s = at(3); // ยางที่ใช้ = medium, สำรอง wet อยู่ลำดับ 3
    expect(canSwap(s, activePlayer(s), 3)).toBe(true);
    const out = playTurn(s, cruise(null, { swap: 3 }), never);
    const me = out.players[0];
    expect(me.tyres).toEqual(["wet", "soft", "hard"]);
    expect(me.life).toBe(TYRES.wet.life);
    expect(me.progress).toBe(CRUISE_MOVE);
  });

  it("ใช้ยางใหม่กับอากาศเดิมทันที ทำให้เร่งได้โดยไม่เสี่ยงหมุน", () => {
    const s = fix(at(3), 12); // ไพ่ 12 น้ำ 3 — ยางสลิกจะหมุนแน่ แต่เว็ทไม่หมุน
    const out = playTurn(s, push(null, { swap: 3 }), never);
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(val(12, "wet") + 0);
  });

  it("สลับไม่ได้: นอกรอบที่อากาศพลิก, ยางสำรองผิดประเภท, ยางที่ใช้อยู่เหมาะอยู่แล้ว, หรือรวมกับเข้าพิท", () => {
    const quiet = at(4);
    expect(canSwap(quiet, activePlayer(quiet), 3)).toBe(false);
    const flipped = at(3);
    expect(canSwap(flipped, activePlayer(flipped), 1)).toBe(false); // soft ไม่ใช่ยางฝน
    const alreadyRain = setPlayer(flipped, 0, { tyres: ["inter", "soft", "hard", "wet"] });
    expect(canSwap(alreadyRain, activePlayer(alreadyRain), 3)).toBe(false);
    expect(playTurn(flipped, cruise("pit", { swap: 3 }), never)).toBe(flipped);
    expect(playTurn(quiet, cruise(null, { swap: 3 }), never)).toBe(quiet);
  });

  it("ฝนหยุดแล้วสลับกลับเป็นยางแห้งได้", () => {
    const s = setPlayer(at(5), 0, { tyres: ["wet", "soft", "hard", "medium"], life: 4 });
    expect(canSwap(s, activePlayer(s), 1)).toBe(true);
    expect(canSwap(s, activePlayer(s), 2)).toBe(true);
  });
});

describe("การ์ดปรับฟ้า", () => {
  const plan = (): WeatherPlan => ({
    weather: ["dry", "dry", "light_rain", "heavy_rain", "dry", ...Array<Weather>(25).fill("dry")],
    fcWrong: Array<boolean>(30).fill(false),
  });
  const s0 = (): GameState => ({ ...game(30, ["sky", "boost", "save"], plan()), round: 1 });

  it("ลัดฟ้า: อากาศถัดไปมาเร็วขึ้น 1 รอบ ความยาวแผนคงเดิม", () => {
    const out = shiftSky(s0(), "earlier");
    expect(out.weather.slice(0, 4)).toEqual(["dry", "light_rain", "heavy_rain", "dry"]);
    expect(out.weather).toHaveLength(30);
    expect(out.fcWrong).toHaveLength(30);
  });

  it("ยืดฟ้า: อากาศตอนนี้อยู่ต่ออีก 1 รอบ อากาศที่เหลือเลื่อนช้าลง", () => {
    const out = shiftSky(s0(), "later");
    expect(out.weather.slice(0, 5)).toEqual(["dry", "dry", "dry", "light_rain", "heavy_rain"]);
    expect(out.weather).toHaveLength(30);
  });

  it("เล่นผ่านการ์ดแล้วใช้ทิศที่เลือก (ค่าเริ่มต้นลัดฟ้า) และการ์ดไปกองทิ้ง", () => {
    const early = playTurn(s0(), cruise("sky"), never);
    expect(early.weather[1]).toBe("light_rain");
    expect(early.players[0].discard).toEqual(["sky"]);
    const late = playTurn(s0(), cruise("sky", { sky: "later" }), never);
    expect(late.weather[1]).toBe("dry");
    expect(late.weather[2]).toBe("dry");
    expect(late.weather[3]).toBe("light_rain");
  });
});

describe("ลำดับเดินตามอันดับ และผู้ชนะ", () => {
  it("จบรอบแล้วเรียงใหม่: คนนำเดินก่อน เสมอกันตามลำดับเดิม", () => {
    let s = fix(game(), 0);
    s = playTurn(s, cruise(), never); // A = 3
    s = playTurn(s, push(), seq(...QUIET)); // B (เลนนอก) พลิกไพ่ 0: กลาง 7 − 2 = 5
    expect(s.round).toBe(2);
    expect(s.order).toEqual([1, 0]);
    expect(activePlayer(s).id).toBe(1);
    expect(standings(s).map((p) => p.id)).toEqual([1, 0]);
  });

  it("ขวางทางตกที่คนที่เดินต่อจากเราตามลำดับอันดับ ไม่ใช่เลขผู้เล่น", () => {
    let s = fix(game(30, ["block", "boost", "save"]), 0);
    s = playTurn(s, cruise(), never);
    s = playTurn(s, push(), seq(...QUIET)); // รอบ 2: B นำ เดินก่อน
    const out = playTurn(s, cruise("block"), never); // B ขวางคนที่เดินต่อ = A
    expect(out.players[0].debuff).toBe(2);
  });

  it("ใครข้ามเส้นชัยก่อนชนะทันที คนที่เหลือไม่ได้เดินต่อ", () => {
    let s = fix(game(5), 7);
    s = setPlayer(s, 1, { progress: 3 });
    s = playTurn(s, push(), never); // A: กลาง 5 = ข้ามเส้นชัย
    expect(s.winner).toBe(0);
    expect(s.players[1].progress).toBe(3); // B ไม่ได้เดิน
  });

  it("ผู้นำเดินก่อนในรอบถัดไป จึงข้ามเส้นก่อนได้ แม้คนตามหลังจะเดินไกลกว่าในรอบเดียวกัน", () => {
    let s = game(10);
    s = playTurn(s, cruise(), never); // A=3
    s = playTurn(s, cruise(), seq(...QUIET)); // B=3, เสมอ → A นำเดินก่อน
    s = setPlayer(setPlayer(s, 0, { progress: 8 }), 1, { progress: 7 });
    const out = playTurn(s, cruise(), never); // A 8+3 = 11 ข้ามเส้น
    expect(out.winner).toBe(0);
  });

  it("จบเกมแล้วเล่นต่อไม่ได้", () => {
    let s = game(1);
    s = playTurn(s, cruise(), never);
    expect(s.winner).toBe(0);
    expect(playTurn(s, cruise(), never)).toBe(s);
  });
});

describe("ธงเหลือง และเหตุการณ์ต้นรอบ", () => {
  /** เล่นครบรอบ: A ขับคุม แล้ว B ขับคุม ตามด้วย rng จบรอบ */
  const round = (s: GameState, ...tail: number[]) =>
    playTurn(playTurn(s, cruise(), never), cruise(), seq(...tail));

  it("ธงเหลือง → รอบหน้าเป็นเซฟตี้คาร์ถ้า rng < 0.6", () => {
    const sc = round({ ...game(), yellow: true }, 0.1);
    expect(sc.event).toBe("safety_car");
    expect(sc.yellow).toBe(false);
  });

  it("ธงเหลืองแต่ไม่เป็นเซฟตี้คาร์ (rng >= 0.6): ไม่มีเหตุการณ์ และอาจมีธงเหลืองใหม่", () => {
    const yellow = { ...game(), yellow: true };
    const calm = round(yellow, 0.9, 0.99);
    expect(calm.event).toBeNull();
    expect(calm.yellow).toBe(false);
    expect(round(yellow, 0.9, 0.1).yellow).toBe(true);
  });

  it("ไม่มีธงเหลือง: ธงแดงเกิดได้ (rng < 0.08) ไม่มีธงเหลืองซ้อนในรอบเหตุการณ์", () => {
    const red = round(game(), 0.01);
    expect(red.event).toBe("red_flag");
    expect(red.yellow).toBe(false);
  });

  it("รอบเงียบ: ไม่มีเหตุการณ์ ไม่มีธง", () => {
    const quiet = round(game(), ...QUIET);
    expect(quiet.event).toBeNull();
    expect(quiet.yellow).toBe(false);
    expect(quiet.round).toBe(2);
    expect(quiet.turn).toBe(0);
  });

  it("ธงแดง: ยางที่ใช้อยู่กลับมาใหม่ คันท้ายได้ +3 (ทุกคนเสมอ = ไม่มีใครได้)", () => {
    const s = game(40);
    const spread = setPlayer(setPlayer(s, 0, { progress: 20, life: 1 }), 1, { progress: 10, life: 0 });
    const out = applyEvent(spread, "red_flag");
    expect(out.players.map((p) => p.life)).toEqual([TYRES.medium.life, TYRES.medium.life]);
    expect(out.players.map((p) => p.progress)).toEqual([20, 13]);
    expect(applyEvent(game(), "red_flag").players.map((p) => p.progress)).toEqual([0, 0]);
  });
});

describe("สนาม 2 เลน", () => {
  /** วางรถตามตำแหน่ง/เลนที่กำหนด (รถทุกคันเป็นผู้เล่น ไม่มี AI) */
  const field = (cells: number, corners: { start: number; end: number }[], at: [number, 0 | 1][]) => {
    const s = newGame(
      humans(...at.map((_, i) => `C${i}`)),
      { lapCells: cells, corners },
      3,
      dryPlan(),
      () => 0.5,
      at.map((_, i) => i),
    );
    return { ...s, players: s.players.map((p, i) => ({ ...p, progress: at[i][0], lane: at[i][1] })) };
  };
  const go = (s: GameState, id: number, n: number) => travel(s, s.players, s.players[id], n);

  it("กริดแถวละ 2 คัน: แถวหน้าอยู่เส้นสตาร์ท คันแรกของแถวอยู่เส้นแข่ง แถวหลังถอยทีละช่อง", () => {
    const s = newGame(humans("A", "B", "C", "D", "E"), straight(24), 3, dryPlan(), () => 0.5, [4, 3, 2, 1, 0]);
    const at = (id: number) => [s.players[id].progress, s.players[id].lane];
    expect(at(4)).toEqual([0, 0]);
    expect(at(3)).toEqual([0, 1]);
    expect(at(2)).toEqual([-1, 0]);
    expect(at(1)).toEqual([-1, 1]);
    expect(at(0)).toEqual([-2, 0]);
    expect(s.total).toBe(72);
  });

  it("เข้าโค้งต้องหยุดที่ช่องสุดท้ายของโค้ง", () => {
    const s = field(24, [{ start: 5, end: 6 }], [[2, 0]]);
    expect(go(s, 0, 8)).toMatchObject({ progress: 6, corner: true });
    expect(go(s, 0, 3)).toMatchObject({ progress: 5, corner: false }); // ยังไม่ถึงปลายโค้ง
  });

  it("ยืนอยู่ในโค้งแล้วออกได้ตามปกติ", () => {
    expect(go(field(24, [{ start: 5, end: 6 }], [[5, 0]]), 0, 6)).toMatchObject({ progress: 11, corner: false });
    expect(go(field(24, [{ start: 5, end: 6 }], [[6, 0]]), 0, 3)).toMatchObject({ progress: 9, corner: false });
  });

  it("โค้งที่คร่อมเส้นชัยก็นับ และนับต่อในรอบถัดไป", () => {
    const s = field(24, [{ start: 23, end: 1 }], [[20, 0]]);
    expect(cornerAt(s.track, 24)).toBe(0);
    expect(go(s, 0, 10)).toMatchObject({ progress: 25, corner: true });
  });

  it("ช่องที่รถเต็มสองเลนผ่านไม่ได้ ต้องหยุดหลัง", () => {
    const s = field(30, [], [[1, 0], [4, 0], [4, 1]]);
    expect(go(s, 0, 6)).toMatchObject({ progress: 3, lane: 0, blocked: true });
  });

  it("ลงจอดเส้นแข่งก่อน ถ้ามีรถอยู่ไปเลนนอก ถ้าเต็มทั้งคู่ถอยหนึ่งช่อง", () => {
    expect(go(field(30, [], [[0, 1], [5, 0]]), 0, 5)).toMatchObject({ progress: 5, lane: 1 });
    expect(go(field(30, [], [[0, 1], [5, 1]]), 0, 5)).toMatchObject({ progress: 5, lane: 0 });
    const full = field(30, [], [[0, 0], [5, 0], [5, 1]]);
    expect(go(full, 0, 5)).toMatchObject({ progress: 4, blocked: true });
  });

  it("ผ่านรถคันเดียวในเลนเดียวกันได้ (หลบไปอีกเลน)", () => {
    expect(go(field(30, [], [[0, 0], [2, 0]]), 0, 4)).toMatchObject({ progress: 4, blocked: false });
  });

  it("เร่งจากเลนนอกได้ค่าน้อยลง", () => {
    const s = setPlayer(fix(game(), 3), 0, { lane: 1 });
    expect(playTurn(s, push(), never).players[0].progress).toBe(val(3, "medium") - OFFLINE_PENALTY);
  });

  it("settle: รถที่ทับกันถอยไปช่องหลัง คันหน้าได้ที่ก่อน", () => {
    const base = game().players[0];
    const cars: Player[] = [0, 1, 2].map((id) => ({ ...base, id, progress: 5, lane: 0 }));
    const out = settle(cars);
    expect(out.map((c) => [c.progress, c.lane])).toEqual([[5, 0], [5, 1], [4, 0]]);
  });

  it("อันดับเสมอช่องเดียวกัน: เส้นแข่งนำเลนนอก", () => {
    const s = field(30, [], [[5, 1], [5, 0]]);
    expect(standings(s).map((p) => p.id)).toEqual([1, 0]);
  });
});

describe("รถ AI", () => {
  const cars = (): CarSpec[] => [
    { name: "คน", num: 7, ai: false, tyres: TYRES_SET[0] },
    { name: "บอท", num: 22, ai: true },
  ];

  it("AI ที่อยู่หน้าผู้เล่นในกริดเดินไปก่อนเลยตั้งแต่เริ่ม แล้วรอผู้เล่น", () => {
    const s = newGame(cars(), straight(60), 1, dryPlan(), () => 0.5, [1, 0]);
    expect(activePlayer(s).ai).toBe(false);
    expect(s.feed).toHaveLength(1);
    expect(s.feed[0]).toMatchObject({ player: 1, ai: true });
    expect(s.players[1].progress).toBeGreaterThan(0);
  });

  it("ผู้เล่นเดินแล้ว AI ที่ต่อคิวเดินตามเอง ไม่ต้องกดอะไร", () => {
    let s = newGame(cars(), straight(60), 1, dryPlan(), () => 0.5, [0, 1]);
    s = fix(s, 7);
    s = playTurn(s, cruise(), seq(...QUIET));
    expect(s.feed.map((l) => l.ai)).toEqual([false, true]);
    expect(s.players[1].progress).toBe(val(7, "medium") - OFFLINE_PENALTY); // AI เลนนอก แถวกลาง
    expect(s.round).toBe(2);
  });

  it("AI ไม่สึกยาง และไม่มีการ์ดในมือ", () => {
    let s = newGame(cars(), straight(60), 1, dryPlan(), () => 0.5, [0, 1]);
    s = playTurn(fix(s, 0), cruise(), seq(...QUIET));
    expect(s.players[1].hand).toEqual([]);
    expect(s.players[1].life).toBeGreaterThan(50);
  });

  it("AI ข้ามเส้นชัยก่อน = AI ชนะ พร้อมอันดับทั้งสนาม", () => {
    let s = newGame(cars(), straight(6), 1, dryPlan(), () => 0.5, [0, 1]);
    s = fix(s, 0); // AI พลิกไพ่ 0: กลาง 7 − 2 = 5 … ยังไม่ถึง 6
    s = setPlayer(s, 1, { progress: 3 });
    s = playTurn(s, cruise(), never); // คน 0 → 3, AI 3 → 8 ชนะ
    expect(s.winner).toBe(1);
    expect(s.finish).toEqual([1, 0]);
  });
});
