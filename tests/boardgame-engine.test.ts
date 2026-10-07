import { describe, expect, it } from "vitest";
import {
  CRUISE_MOVE, DECK_LIST, HAND_SIZE, PIT_COST, TYRE_SLOTS, WORN_MOVE,
  activePlayer, applyEvent, canPlay, canSwap, forecastAt, makeWeatherPlan, newGame, pitCost,
  playTurn, shiftSky, shuffle, standings, validTyres, weatherEffect, weatherFlipped,
  type Action, type GameState, type Mode, type Rng, type Tyre, type Weather, type WeatherPlan,
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
// ผลเต๋า 1..6 จาก rng: ค่า (d-1)/6 + นิดหน่อย
const die = (d: number) => (d - 1) / 6 + 0.01;
// จบรอบแบบเงียบ: ไม่มีธงแดง (>= RED_FLAG_CHANCE) และไม่มีธงเหลือง (>= YELLOW_CHANCE)
const QUIET = [0.99, 0.99];

const TYRES: Tyre[][] = [
  ["medium", "soft", "hard", "wet"],
  ["medium", "soft", "hard", "wet"],
];

const dryPlan = (): WeatherPlan => ({
  weather: Array<Weather>(30).fill("dry"),
  fcWrong: Array<boolean>(30).fill(false),
});

/** เกมใหม่อากาศแห้งตลอด และกำหนดมือผู้เล่นทุกคนเอง (สำรับที่เหลือไว้จั่วเติม) */
function game(
  total = 30,
  hand: Action[] = ["boost", "pit", "save"],
  plan: WeatherPlan = dryPlan(),
): GameState {
  const s = newGame(["A", "B"], total, TYRES, plan, () => 0.5);
  return { ...s, players: s.players.map((p) => ({ ...p, hand: [...hand] })) };
}

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
    const s = newGame(["A", "B"], 30, TYRES, dryPlan(), Math.random);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
      expect(p.hand.length + p.deck.length).toBe(
        Object.values(DECK_LIST).reduce((a, b) => a + b, 0),
      );
      expect(p.life).toBe(5); // medium
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
  it("ขับคุม: เดินคงที่ ไม่ทอยเต๋า ยางไม่สึก", () => {
    const s = playTurn(game(), cruise(), never);
    expect(s.players[0].progress).toBe(CRUISE_MOVE);
    expect(s.players[0].life).toBe(5);
    expect(s.lastTurn?.die).toBeNull();
  });

  it("เร่ง: เต๋า + โบนัสยาง และยางสึก 1", () => {
    const s = playTurn(game(), push(), seq(die(4)));
    expect(s.players[0].progress).toBe(4 + 2);
    expect(s.players[0].life).toBe(4);
    expect(s.lastTurn?.die).toBe(4);
  });

  it("เล่นการ์ดแล้วการ์ดไปกองทิ้ง และจั่วเติมให้ครบ 3 ใบ", () => {
    const s = playTurn(game(), push("save"), seq(die(3)));
    const me = s.players[0];
    expect(me.hand).toHaveLength(HAND_SIZE);
    expect(me.discard).toEqual(["save"]);
  });

  it("การ์ดที่ไม่มีในมือ หรือใช้ผิดโหมด = เล่นไม่ได้ state ไม่เปลี่ยน", () => {
    const s = game(30, ["boost", "save", "reroll"]);
    expect(playTurn(s, push("block"), seq(die(3)))).toBe(s);
    expect(playTurn(s, cruise("boost"), never)).toBe(s);
    expect(playTurn(s, cruise("save"), never)).toBe(s);
    expect(playTurn(s, cruise("reroll"), never)).toBe(s);
  });

  it("ดันสุด +3 ช่อง ยางสึกเพิ่ม 1 / ประหยัดยาง −1 ช่อง ยางไม่สึก", () => {
    const boost = playTurn(game(), push("boost"), seq(die(2)));
    expect(boost.players[0].progress).toBe(2 + 2 + 3);
    expect(boost.players[0].life).toBe(3);
    const save = playTurn(game(), push("save"), seq(die(2)));
    expect(save.players[0].progress).toBe(2 + 2 - 1);
    expect(save.players[0].life).toBe(5);
  });

  it("ดูดอากาศ: ใช้ได้ทั้งสองโหมด +2 ปกติ, +4 เมื่อตามหลัง", () => {
    const lead = game(30, ["slipstream", "boost", "save"]);
    expect(playTurn(lead, cruise("slipstream"), never).players[0].progress).toBe(CRUISE_MOVE + 2);
    expect(playTurn(lead, push("slipstream"), seq(die(1))).players[0].progress).toBe(1 + 2 + 2);
    const behind = setPlayer(lead, 1, { progress: 9 });
    const second = playTurn(behind, cruise("slipstream"), never);
    expect(second.players[0].progress).toBe(CRUISE_MOVE + 4);
  });

  it("ทอยซ้ำ: เอาค่าสูงของสองครั้ง", () => {
    const s = game(30, ["reroll", "boost", "save"]);
    const out = playTurn(s, push("reroll"), seq(die(2), die(5)));
    expect(out.lastTurn?.die).toBe(5);
    expect(out.players[0].progress).toBe(5 + 2);
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

  it("สำรับหมดแล้วสับกองทิ้งกลับมาจั่วต่อ", () => {
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
});

describe("ยางพัง", () => {
  const worn = (s: GameState) => setPlayer(s, 0, { life: 0 });

  it("บังคับขับคุมแบบลดทอน แม้เลือกเร่ง และไม่ใช้เต๋า", () => {
    const out = playTurn(worn(game()), push(), never);
    expect(out.players[0].progress).toBe(WORN_MOVE);
    expect(out.lastTurn).toMatchObject({ mode: "cruise", worn: true, die: null });
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
    expect(me.life).toBe(3);
    expect(me.hand).toEqual(["boost", "save", "reroll"]);
    expect(me.discard).toEqual([]);
  });

  it("ไม่มียางสำรองแล้วเข้าพิทไม่ได้", () => {
    const s = worn(game());
    const lonely = setPlayer(s, 0, { tyres: ["hard" as Tyre] });
    expect(canPlay(lonely, activePlayer(lonely), "pit", "cruise")).toBe(false);
  });

  it("ยางสึกถึง 0 จากการเร่ง แล้วเทิร์นถัดไปเป็นยางพัง", () => {
    const s = setPlayer(game(), 0, { life: 1 });
    const after = playTurn(s, push(), seq(die(3)));
    expect(after.players[0].life).toBe(0);
    expect(after.lastTurn?.worn).toBe(false);
  });
});

describe("เข้าพิท", () => {
  it("เปลี่ยนเป็นยางสำรองที่เลือก อายุเต็ม เสียเวลา และยางสำรองที่เหลือไม่หาย", () => {
    const out = playTurn(game(), cruise("pit", { pitTo: 2 }), never); // ยางสำรองลำดับ 2 = hard
    const me = out.players[0];
    expect(me.tyres).toEqual(["hard", "soft", "wet"]);
    expect(me.life).toBe(7);
    expect(me.progress).toBe(Math.max(1, CRUISE_MOVE - PIT_COST));
    expect(me.discard).toEqual(["pit"]);
  });

  it("ค่าเริ่มต้นคือยางสำรองใบแรก และเลือกยางที่ไม่มีจริงไม่ได้", () => {
    const s = game();
    expect(playTurn(s, cruise("pit"), never).players[0].tyres).toEqual(["soft", "hard", "wet"]);
    expect(playTurn(s, cruise("pit", { pitTo: 4 }), never)).toBe(s);
    expect(playTurn(s, cruise("pit", { pitTo: 0 }), never)).toBe(s);
  });

  it("เข้าพิทบังคับให้เป็นขับคุม ไม่ทอยเต๋า แม้เลือกเร่ง", () => {
    const out = playTurn(game(), push("pit"), never);
    expect(out.lastTurn).toMatchObject({ mode: "cruise", die: null });
  });
});

describe("เซฟตี้คาร์", () => {
  it("เข้าพิทฟรีเฉพาะรอบที่เป็นเซฟตี้คาร์ รอบอื่นเสียเต็ม", () => {
    expect(pitCost(game())).toBe(PIT_COST);
    expect(pitCost(applyEvent(game(), "safety_car"))).toBe(0);
    const sc = applyEvent(game(), "safety_car");
    expect(playTurn(sc, cruise("pit"), never).players[0].progress).toBe(CRUISE_MOVE);
  });

  it("เต๋าตอนเร่งสูงสุด 3", () => {
    const sc = applyEvent(game(), "safety_car");
    expect(playTurn(sc, push(), seq(die(6))).players[0].progress).toBe(3 + 2);
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
  it("ยางไม่สึกในฝน (ทุกชนิด) แต่ในแห้งสึก", () => {
    const rain = withWeather(game(), "light_rain");
    const inter = setPlayer(rain, 0, { tyres: ["inter", "hard"], life: 5 });
    expect(playTurn(inter, push(), seq(die(3))).players[0].life).toBe(5);
    expect(playTurn(game(), push(), seq(die(3))).players[0].life).toBe(4);
  });

  it("ยางที่เหมาะกับฝนได้โบนัสก้าว และไม่ต้องเสี่ยงหมุน", () => {
    const rain = withWeather(game(), "light_rain");
    const inter = setPlayer(rain, 0, { tyres: ["inter", "hard"], life: 5 });
    // rng = 0 จะหมุนทุกครั้งถ้ามีการเช็ก — ยางฝนไม่เช็ก จึงเดินปกติ
    const out = playTurn(inter, push(), seq(die(5), 0));
    expect(out.players[0].progress).toBe(5 + 2 + 1);
    expect(out.lastTurn?.spun).toBe(false);
  });

  it("ยางสลิกเร่งในฝน: ถ้าหมุน เดินแค่ 1 ช่อง และเกิดธงเหลืองรอบหน้า", () => {
    const rain = withWeather(game(), "heavy_rain");
    let s = playTurn(rain, push(), seq(die(6), 0.1)); // เช็กหมุน 0.1 < 0.6
    expect(s.lastTurn).toMatchObject({ spun: true, moved: 1 });
    expect(s.players[0].progress).toBe(1);
    expect(s.incident).toBe(true);
    s = playTurn(s, cruise(), seq(0.99)); // จบรอบ: ไม่มีธงเหลืองเดิม → เช็กธงแดง 0.99 ไม่เกิด
    expect(s.yellow).toBe(true); // เพราะมีคนหมุน ไม่ต้องสุ่ม
    expect(s.incident).toBe(false);
  });

  it("ยางสลิกเร่งในฝนแล้วไม่หมุน เดินเต็มที่", () => {
    const rain = withWeather(game(), "light_rain");
    const out = playTurn(rain, push(), seq(die(5), 0.99)); // 0.99 ≥ 0.35
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(5 + 2);
  });

  it("ขับคุมในฝนปลอดภัย ไม่เช็กหมุน", () => {
    const rain = withWeather(game(), "heavy_rain");
    const out = playTurn(rain, cruise(), never);
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(CRUISE_MOVE);
  });

  it("ยางฝนในสนามแห้ง: ก้าวลด และสึกเร็วกว่า", () => {
    const inter = setPlayer(game(), 0, { tyres: ["inter", "hard"], life: 5 });
    const out = playTurn(inter, push(), seq(die(4)));
    expect(out.players[0].progress).toBe(4 + 2 - 1);
    expect(out.players[0].life).toBe(3);
  });

  it("weatherEffect บอกก้าวและโอกาสหมุน", () => {
    expect(weatherEffect("light_rain", "inter")).toEqual({ move: 1, spin: 0 });
    expect(weatherEffect("heavy_rain", "soft").spin).toBeGreaterThan(0.5);
    expect(weatherEffect("dry", "medium")).toEqual({ move: 0, spin: 0 });
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
    expect(me.life).toBe(6);
    expect(me.progress).toBe(CRUISE_MOVE);
  });

  it("ใช้ยางใหม่กับอากาศเดิมทันที ทำให้เร่งได้โดยไม่เสี่ยงหมุน", () => {
    const s = at(3);
    const out = playTurn(s, push(null, { swap: 3 }), seq(die(4), 0));
    expect(out.lastTurn?.spun).toBe(false);
    expect(out.players[0].progress).toBe(4 + 1 + 0);
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
    const s = setPlayer(at(5), 0, { tyres: ["wet", "soft", "hard", "medium"], life: 6 });
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

  it("ลัดฟ้า: อากาศถัดไปมาเร็วขึ้น 1 รอบ ความยาวแผนคงเดิม และรอบนี้ไม่เปลี่ยน", () => {
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
    let s = game();
    s = playTurn(s, cruise(), never); // A = 3
    s = playTurn(s, push(), seq(die(5), ...QUIET)); // B = 5+2
    expect(s.round).toBe(2);
    expect(s.order).toEqual([1, 0]);
    expect(activePlayer(s).id).toBe(1);
    expect(standings(s).map((p) => p.id)).toEqual([1, 0]);
  });

  it("ขวางทางตกที่คนที่เดินต่อจากเราตามลำดับอันดับ ไม่ใช่เลขผู้เล่น", () => {
    let s = game(30, ["block", "boost", "save"]);
    s = playTurn(s, cruise(), never);
    s = playTurn(s, push(), seq(die(5), ...QUIET)); // รอบ 2: B นำ เดินก่อน
    const out = playTurn(s, cruise("block"), never); // B ขวางคนที่เดินต่อ = A
    expect(out.players[0].debuff).toBe(2);
  });

  it("ใครข้ามเส้นชัยก่อนชนะทันที คนที่เหลือไม่ได้เดินต่อ", () => {
    let s = game(5);
    s = setPlayer(s, 1, { progress: 3 });
    s = playTurn(s, push(), seq(die(6))); // A: 6+2 = 8 ข้ามเส้นชัย
    expect(s.winner).toBe(0);
    expect(s.players[1].progress).toBe(3); // B ไม่ได้เดิน
  });

  it("ผู้นำเดินก่อนในรอบถัดไป จึงข้ามเส้นก่อนได้ แม้คนตามหลังเดินไกลกว่าในรอบเดียวกัน", () => {
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
    expect(out.players.map((p) => p.life)).toEqual([5, 5]);
    expect(out.players.map((p) => p.progress)).toEqual([20, 13]);
    expect(applyEvent(game(), "red_flag").players.map((p) => p.progress)).toEqual([0, 0]);
  });
});
