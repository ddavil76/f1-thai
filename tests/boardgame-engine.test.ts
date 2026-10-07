import { describe, expect, it } from "vitest";
import {
  DECK_LIST, HAND_SIZE, PIT_COST, TYRE_SLOTS, applyEvent, canPlay, forecastAt, makeWeatherPlan,
  newGame, pitCost, playTurn, shuffle, standings, validTyres, weatherEffect,
  type Action, type GameState, type Rng, type Tyre, type Weather, type WeatherPlan,
} from "@/lib/boardgame/engine";

/** rng ที่คืนค่าตามลำดับที่กำหนด แล้ววนซ้ำ */
const seq = (...v: number[]): Rng => {
  let i = 0;
  return () => v[i++ % v.length];
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

describe("เริ่มเกม", () => {
  it("แจกมือครบ 3 ใบ สำรับ 12 ใบรวมมือ และยางใบแรกคือยางที่ใช้", () => {
    const s = newGame(["A", "B"], 30, TYRES, dryPlan(), Math.random);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(HAND_SIZE);
      expect(p.hand.length + p.deck.length).toBe(
        Object.values(DECK_LIST).reduce((a, b) => a + b, 0),
      );
      expect(p.life).toBe(5); // medium
    }
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
  it("makeWeatherPlan: มีฝนอย่างน้อย 2 รอบ เริ่มไม่ก่อนรอบ 3 และสองรอบแรกแห้ง", () => {
    for (let n = 0; n < 50; n++) {
      const plan = makeWeatherPlan(Math.random);
      expect(plan.weather).toHaveLength(plan.fcWrong.length);
      expect(plan.weather.slice(0, 2)).toEqual(["dry", "dry"]);
      expect(plan.weather.filter((w) => w !== "dry").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("พยากรณ์ 2 รอบแรกที่มองไปข้างหน้าแม่นเสมอและมั่นใจ", () => {
    const plan: WeatherPlan = {
      weather: ["dry", "dry", "light_rain", "heavy_rain", "dry", ...Array<Weather>(25).fill("dry")],
      fcWrong: Array<boolean>(30).fill(true), // ผิดทุกรอบ แต่ไม่ควรกระทบระยะใกล้
    };
    expect(forecastAt(plan, 3, 0)).toEqual({ weather: "light_rain", sure: true });
    expect(forecastAt(plan, 3, 1)).toEqual({ weather: "heavy_rain", sure: true });
  });

  it("พยากรณ์ระยะไกล: ไม่แน่ใจ และคลาดเคลื่อนหนึ่งขั้นเมื่อ fcWrong", () => {
    const plan: WeatherPlan = {
      weather: ["dry", "dry", "light_rain", "heavy_rain", "dry", ...Array<Weather>(25).fill("dry")],
      fcWrong: [false, false, true, true, true, ...Array<boolean>(25).fill(false)],
    };
    expect(forecastAt(plan, 1, 2)).toEqual({ weather: "dry", sure: false }); // จริง = ฝนเบา → พยากรณ์ว่าแห้ง
    expect(forecastAt(plan, 1, 3)).toEqual({ weather: "light_rain", sure: false }); // จริง = ฝนหนัก
    expect(forecastAt(plan, 1, 4)).toEqual({ weather: "light_rain", sure: false }); // จริง = แห้ง
  });

  it("เกินแผนที่วางไว้ = แห้ง", () => {
    expect(forecastAt(dryPlan(), 40, 0).weather).toBe("dry");
  });
});

describe("ผลของอากาศต่อยาง", () => {
  it("ยางสลิกเสียเปรียบในฝน ยางที่ตรงสภาพอากาศได้เปรียบ", () => {
    expect(weatherEffect("dry", "medium").move).toBe(0);
    expect(weatherEffect("light_rain", "medium").move).toBe(-2);
    expect(weatherEffect("light_rain", "inter").move).toBe(1);
    expect(weatherEffect("heavy_rain", "wet").move).toBe(1);
    expect(weatherEffect("dry", "wet").move).toBeLessThan(0);
  });

  it("ฝนเบา: ยางกลางก้าวลด 2 ยางอินเตอร์ได้ +1 ผ่านการเล่นจริง", () => {
    const rain = withWeather(game(), "light_rain");
    expect(playTurn(rain, null, seq(die(5))).players[0].progress).toBe(5 + 2 - 2);
    const inter = {
      ...rain,
      players: rain.players.map((p) => ({ ...p, tyres: ["inter" as Tyre, "hard" as Tyre] })),
    };
    expect(playTurn(inter, null, seq(die(5))).players[0].progress).toBe(5 + 2 + 1);
  });

  it("ยางผิดสภาพอากาศเสื่อมเร็วขึ้น", () => {
    const heavy = withWeather(game(), "heavy_rain");
    expect(playTurn(heavy, null, seq(die(5))).players[0].life).toBe(5 - 1 - 2);
  });
});

describe("playTurn", () => {
  it("ไม่เล่นการ์ด: ก้าว = เต๋า + โบนัสยาง และอายุยางลด 1", () => {
    const s = playTurn(game(), null, seq(die(4)));
    expect(s.players[0].progress).toBe(4 + 2);
    expect(s.players[0].life).toBe(4);
    expect(s.turn).toBe(1);
  });

  it("เล่นการ์ดแล้วการ์ดออกจากมือไปกองทิ้ง และจั่วเติมให้ครบ 3 ใบ", () => {
    const s = playTurn(game(), "save", seq(die(3)));
    const me = s.players[0];
    expect(me.hand).toHaveLength(HAND_SIZE);
    expect(me.discard).toEqual(["save"]);
  });

  it("เล่นการ์ดที่ไม่มีในมือไม่ได้ state ไม่เปลี่ยน", () => {
    const s = game();
    expect(playTurn(s, "block", seq(die(3)))).toBe(s);
  });

  it("ดันสุด +3 ช่อง ยางเสื่อมเพิ่ม 1 / ประหยัดยาง −1 ช่อง ยางไม่เสื่อม", () => {
    const boost = playTurn(game(), "boost", seq(die(2)));
    expect(boost.players[0].progress).toBe(2 + 2 + 3);
    expect(boost.players[0].life).toBe(3);
    const save = playTurn(game(), "save", seq(die(2)));
    expect(save.players[0].progress).toBe(2 + 2 - 1);
    expect(save.players[0].life).toBe(5);
  });

  it("ดูดอากาศ: +2 ปกติ, +4 เมื่อตามหลัง", () => {
    const lead = game(30, ["slipstream", "boost", "save"]);
    expect(playTurn(lead, "slipstream", seq(die(1))).players[0].progress).toBe(1 + 2 + 2);
    const behind = {
      ...lead,
      players: [lead.players[0], { ...lead.players[1], progress: 9 }],
    };
    expect(playTurn(behind, "slipstream", seq(die(1))).players[0].progress).toBe(1 + 2 + 4);
  });

  it("ทอยซ้ำ: เอาค่าสูงของสองครั้ง", () => {
    const s = game(30, ["reroll", "boost", "save"]);
    const out = playTurn(s, "reroll", seq(die(2), die(5)));
    expect(out.lastTurn?.die).toBe(5);
    expect(out.players[0].progress).toBe(5 + 2);
  });

  it("ยางหมดอายุ ก้าวลด 2 แต่ไม่ต่ำกว่า 1", () => {
    const s = game();
    const worn = { ...s, players: s.players.map((p) => ({ ...p, life: 0 })) };
    expect(playTurn(worn, null, seq(die(5))).players[0].progress).toBe(5 + 2 - 2);
    const hard = {
      ...worn,
      players: worn.players.map((p) => ({ ...p, tyres: ["hard" as Tyre] })),
    };
    expect(playTurn(hard, null, seq(die(1))).players[0].progress).toBe(1);
  });

  it("ขวางทาง: คู่แข่งตาถัดไปโดน −2 ครั้งเดียว", () => {
    let s = playTurn(game(30, ["block", "boost", "save"]), "block", seq(die(3)));
    expect(s.players[1].debuff).toBe(2);
    s = playTurn(s, null, seq(die(3), ...QUIET));
    expect(s.players[1].progress).toBe(3 + 2 - 2);
    expect(s.players[1].debuff).toBe(0);
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
    const out = playTurn(tight, null, seq(die(3)));
    expect(out.players[0].hand).toHaveLength(HAND_SIZE);
  });
});

describe("เข้าพิท", () => {
  it("เปลี่ยนเป็นยางสำรองที่เลือก อายุเต็ม เสียเวลา 2 ช่อง และยางสำรองที่เหลือไม่หาย", () => {
    const out = playTurn(game(), "pit", seq(die(5)), 2); // ยางสำรองลำดับ 2 = hard
    const me = out.players[0];
    expect(me.tyres).toEqual(["hard", "soft", "wet"]);
    expect(me.progress).toBe(5 + 1 - PIT_COST);
    expect(me.life).toBe(6); // แข็งอายุ 7 แล้วเสื่อมไป 1
  });

  it("ค่าเริ่มต้นคือยางสำรองใบแรก", () => {
    const me = playTurn(game(), "pit", seq(die(5))).players[0];
    expect(me.tyres).toEqual(["soft", "hard", "wet"]);
  });

  it("ใช้ยางใหม่กับอากาศของรอบนี้ทันที (เปลี่ยนเป็นเว็ทตอนฝนหนักคุ้ม)", () => {
    const heavy = withWeather(game(), "heavy_rain");
    const stay = playTurn(heavy, null, seq(die(4))).players[0];
    expect(stay.progress).toBe(4 + 2 - 3); // ยางกลางในฝนหนัก
    const toWet = playTurn(heavy, "pit", seq(die(4)), 3).players[0]; // ยางสำรองลำดับ 3 = wet
    expect(toWet.tyres[0]).toBe("wet");
    expect(toWet.progress).toBe(4 + 1 + 1 - PIT_COST);
    const toHard = playTurn(heavy, "pit", seq(die(4)), 2).players[0]; // hard ผิดอากาศ เสียทั้งพิททั้งฝน
    expect(toHard.progress).toBe(Math.max(1, 4 + 1 - 3 - PIT_COST));
  });

  it("ไม่มียางสำรอง หรือเลือกลำดับยางที่ไม่มีจริง = เข้าพิทไม่ได้", () => {
    const s = game();
    const p = { ...s.players[0], tyres: ["hard" as Tyre] };
    expect(canPlay(p, "pit")).toBe(false);
    expect(playTurn(s, "pit", seq(die(3)), 4)).toBe(s);
    expect(playTurn(s, "pit", seq(die(3)), 0)).toBe(s);
  });
});

describe("เซฟตี้คาร์", () => {
  it("เข้าพิทฟรีเฉพาะรอบที่เป็นเซฟตี้คาร์ รอบอื่นเสียเต็ม", () => {
    expect(pitCost(game())).toBe(PIT_COST);
    expect(pitCost(applyEvent(game(), "safety_car"))).toBe(0);
  });

  it("เต๋าสูงสุด 3 ในรอบเซฟตี้คาร์ และพิทไม่เสียช่อง", () => {
    const sc = applyEvent(game(), "safety_car");
    expect(playTurn(sc, null, seq(die(6))).players[0].progress).toBe(3 + 2);
    expect(playTurn(sc, "pit", seq(die(6))).players[0].progress).toBe(3 + 3); // นิ่ม +3 ไม่เสียพิท
  });

  it("ช่องว่างจากผู้นำเหลือครึ่ง", () => {
    const s = game(40);
    const spread = {
      ...s,
      players: [{ ...s.players[0], progress: 20 }, { ...s.players[1], progress: 10 }],
    };
    const out = applyEvent(spread, "safety_car");
    expect(out.players.map((p) => p.progress)).toEqual([20, 15]);
    expect(out.event).toBe("safety_car");
  });
});

describe("ธงเหลืองและเหตุการณ์ต้นรอบ", () => {
  /** เล่นครบรอบ: A เล่นก่อนด้วยเต๋า 3 แล้ว B เล่นด้วย `tail` */
  const round = (s: GameState, ...tail: number[]) =>
    playTurn(playTurn(s, null, seq(die(3))), null, seq(die(3), ...tail));

  it("ธงเหลือง → รอบหน้าเป็นเซฟตี้คาร์ถ้า rng < 0.6", () => {
    const yellow = { ...game(), yellow: true };
    const sc = round(yellow, 0.1);
    expect(sc.event).toBe("safety_car");
    expect(sc.yellow).toBe(false);
  });

  it("ธงเหลืองแต่ไม่เป็นเซฟตี้คาร์ (rng >= 0.6): ไม่มีเหตุการณ์ และอาจมีธงเหลืองใหม่", () => {
    const yellow = { ...game(), yellow: true };
    const calm = round(yellow, 0.9, 0.99);
    expect(calm.event).toBeNull();
    expect(calm.yellow).toBe(false);
    const again = round(yellow, 0.9, 0.1);
    expect(again.event).toBeNull();
    expect(again.yellow).toBe(true);
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
    const spread = {
      ...s,
      players: [
        { ...s.players[0], progress: 20, life: 1 },
        { ...s.players[1], progress: 10, life: 0 },
      ],
    };
    const out = applyEvent(spread, "red_flag");
    expect(out.players.map((p) => p.life)).toEqual([5, 5]);
    expect(out.players.map((p) => p.progress)).toEqual([20, 13]);
    expect(applyEvent(game(), "red_flag").players.map((p) => p.progress)).toEqual([0, 0]);
  });
});

describe("ผู้ชนะ", () => {
  it("ผู้ถึงเส้นชัยก่อนไม่ชนะทันที — รอให้ทุกคนเล่นครบรอบก่อน แล้วใครไปไกลสุดชนะ", () => {
    let s = game(5);
    s = playTurn(s, null, seq(die(6))); // A: 8 ถึงเส้นชัยแล้ว
    expect(s.winner).toBeNull();
    s = playTurn(s, "boost", seq(die(6), ...QUIET)); // B: 6+2+3 = 11
    expect(s.winner).toBe(1);
  });

  it("ก้าวเท่ากัน ตัดสินด้วยอายุยางเหลือมากกว่า", () => {
    let s = game(5);
    s = playTurn(s, null, seq(die(3))); // A: 5, life 4
    s = playTurn(s, "save", seq(die(4), ...QUIET)); // B: 4+2−1 = 5, life 5 (ประหยัดยาง)
    expect(s.players.map((p) => p.progress)).toEqual([5, 5]);
    expect(s.winner).toBe(1);
  });

  it("จบเกมแล้วเล่นต่อไม่ได้", () => {
    let s = game(1);
    s = playTurn(s, null, seq(die(1)));
    s = playTurn(s, null, seq(die(1), ...QUIET));
    expect(playTurn(s, null, seq(die(6)))).toBe(s);
  });
});

describe("standings", () => {
  it("เรียงผู้นำก่อน เสมอกันตามลำดับผู้เล่น", () => {
    const s = game();
    expect(standings(s).map((p) => p.id)).toEqual([0, 1]);
    const t = { ...s, players: [s.players[0], { ...s.players[1], progress: 3 }] };
    expect(standings(t).map((p) => p.id)).toEqual([1, 0]);
  });
});
