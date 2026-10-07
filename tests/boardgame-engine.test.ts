import { describe, expect, it } from "vitest";
import {
  DECK_LIST, HAND_SIZE, applyEvent, canPlay, newGame, playTurn, shuffle, standings, validTyres,
  type Action, type GameState, type Rng, type Tyre,
} from "@/lib/boardgame/engine";

/** rng ที่คืนค่าตามลำดับที่กำหนด แล้ววนซ้ำ */
const seq = (...v: number[]): Rng => {
  let i = 0;
  return () => v[i++ % v.length];
};
// ผลเต๋า 1..6 จาก rng: ค่า (d-1)/6 + นิดหน่อย
const die = (d: number) => (d - 1) / 6 + 0.01;
// rng สำหรับจบรอบแบบไม่มีเหตุการณ์ (>= EVENT_CHANCE)
const NO_EVENT = 0.99;

const TYRES: Tyre[][] = [
  ["medium", "soft", "hard"],
  ["medium", "soft", "hard"],
];

/** เกมใหม่ที่กำหนดมือผู้เล่นทุกคนเอง (สำรับที่เหลือไว้จั่วเติม) */
function game(total = 30, hand: Action[] = ["boost", "pit", "save"]): GameState {
  const s = newGame(["A", "B"], total, TYRES, () => 0.5);
  return { ...s, players: s.players.map((p) => ({ ...p, hand: [...hand] })) };
}

describe("เริ่มเกม", () => {
  it("แจกมือครบ 3 ใบ สำรับ 12 ใบรวมมือ และยางใบแรกคือยางที่ใช้", () => {
    const s = newGame(["A", "B"], 30, TYRES, Math.random);
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

  it("validTyres: ต้องครบ 3 ใบ และชนิดเดียวกันไม่เกิน 2", () => {
    expect(validTyres(["soft", "soft", "hard"])).toBe(true);
    expect(validTyres(["soft", "soft", "soft"])).toBe(false);
    expect(validTyres(["soft", "hard"])).toBe(false);
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

  it("เข้าพิท: เปลี่ยนเป็นยางสำรอง อายุเต็ม เต๋าเหลือครึ่ง (ปัดขึ้น)", () => {
    const out = playTurn(game(), "pit", seq(die(5)));
    const me = out.players[0];
    expect(me.tyres).toEqual(["soft", "hard"]);
    expect(me.progress).toBe(3 + 3); // ceil(5/2) + นิ่ม 3
    expect(me.life).toBe(2); // นิ่มอายุ 3 แล้วเสื่อมไป 1
  });

  it("ไม่มียางสำรองแล้วเข้าพิทไม่ได้", () => {
    const p = { ...game().players[0], tyres: ["hard" as Tyre] };
    expect(canPlay(p, "pit")).toBe(false);
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
    s = playTurn(s, null, seq(die(3), NO_EVENT));
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

  it("ฝน: เต๋าสูงสุด 4 และยางเสื่อมเพิ่ม 1", () => {
    const s = applyEvent(game(), "rain");
    const out = playTurn(s, null, seq(die(6)));
    expect(out.players[0].progress).toBe(4 + 2);
    expect(out.players[0].life).toBe(3);
  });
});

describe("รอบและผู้ชนะ", () => {
  it("เล่นครบทุกคนแล้วขึ้นรอบใหม่ ผู้เล่นคนแรกเริ่มก่อน", () => {
    let s = game();
    s = playTurn(s, null, seq(die(3)));
    s = playTurn(s, null, seq(die(3), NO_EVENT));
    expect(s.round).toBe(2);
    expect(s.turn).toBe(0);
    expect(s.event).toBeNull();
  });

  it("ผู้ถึงเส้นชัยก่อนไม่ชนะทันที — รอให้ทุกคนเล่นครบรอบก่อน แล้วใครไปไกลสุดชนะ", () => {
    let s = game(5);
    s = playTurn(s, null, seq(die(6))); // A: 8 ถึงเส้นชัยแล้ว
    expect(s.winner).toBeNull();
    s = playTurn(s, "boost", seq(die(6), NO_EVENT)); // B: 6+2+3 = 11
    expect(s.winner).toBe(1);
  });

  it("ก้าวเท่ากัน ตัดสินด้วยอายุยางเหลือมากกว่า", () => {
    let s = game(5);
    s = playTurn(s, null, seq(die(3))); // A: 5, life 4
    s = playTurn(s, "save", seq(die(4), NO_EVENT)); // B: 4+2−1 = 5, life 5 (ประหยัดยาง)
    expect(s.players.map((p) => p.progress)).toEqual([5, 5]);
    expect(s.winner).toBe(1);
  });

  it("จบเกมแล้วเล่นต่อไม่ได้", () => {
    let s = game(1);
    s = playTurn(s, null, seq(die(1)));
    s = playTurn(s, null, seq(die(1), NO_EVENT));
    expect(playTurn(s, null, seq(die(6)))).toBe(s);
  });

  it("ต้นรอบมีโอกาสเกิดเหตุการณ์ตาม rng", () => {
    let s = game();
    s = playTurn(s, null, seq(die(3)));
    // rng: เต๋า, เหตุการณ์เกิด (0.1 < 0.35), เลือกชนิด = rain (0.4 → index 1)
    s = playTurn(s, null, seq(die(3), 0.1, 0.4));
    expect(s.event).toBe("rain");
  });
});

describe("applyEvent", () => {
  const spread = (): GameState => {
    const s = game(40);
    return {
      ...s,
      players: [
        { ...s.players[0], progress: 20, life: 1 },
        { ...s.players[1], progress: 10, life: 0 },
      ],
    };
  };

  it("เซฟตี้คาร์: ช่องว่างจากผู้นำเหลือครึ่ง", () => {
    const s = applyEvent(spread(), "safety_car");
    expect(s.players.map((p) => p.progress)).toEqual([20, 15]);
    expect(s.event).toBe("safety_car");
  });

  it("ธงแดง: ยางที่ใช้อยู่กลับมาใหม่ คันท้ายได้ +3", () => {
    const s = applyEvent(spread(), "red_flag");
    expect(s.players.map((p) => p.life)).toEqual([5, 5]);
    expect(s.players.map((p) => p.progress)).toEqual([20, 13]);
  });

  it("ธงแดง: ถ้าทุกคนเสมอกัน ไม่มีใครได้โบนัส", () => {
    const s = applyEvent(game(), "red_flag");
    expect(s.players.map((p) => p.progress)).toEqual([0, 0]);
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
