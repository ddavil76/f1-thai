import { describe, expect, it } from "vitest";
import {
  WORN_AT, applyEvent, newGame, playTurn, standings,
  type GameState, type Rng,
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

const fresh = (total = 30): GameState => newGame(["A", "B"], total);

describe("playTurn", () => {
  it("ก้าว = เต๋า + โบนัสยาง และบวกความสึกหรอ", () => {
    const s = playTurn(fresh(), "medium", null, seq(die(4)));
    expect(s.players[0].progress).toBe(4 + 2);
    expect(s.players[0].wear).toBe(2);
    expect(s.turn).toBe(1);
  });

  it("เข้าพิท: ยางรีเซ็ต แต่เต๋าเหลือครึ่ง (ปัดขึ้น) และใช้การ์ดหมดไปหนึ่งใบ", () => {
    let s = fresh();
    s = { ...s, players: s.players.map((p) => ({ ...p, wear: 9 })) };
    const out = playTurn(s, "hard", "pit", seq(die(5)));
    expect(out.players[0].progress).toBe(3 + 1); // ceil(5/2) + แข็ง 1
    expect(out.players[0].wear).toBe(1);
    expect(out.players[0].cards.pit).toBe(1);
    expect(out.lastTurn?.worn).toBe(false);
  });

  it("ยางหมดสภาพ (>= WORN_AT) ก้าวลด 2 แต่ไม่ต่ำกว่า 1", () => {
    let s = fresh();
    s = { ...s, players: s.players.map((p) => ({ ...p, wear: WORN_AT })) };
    expect(playTurn(s, "medium", null, seq(die(5))).players[0].progress).toBe(5);
    expect(playTurn(s, "hard", null, seq(die(1))).players[0].progress).toBe(1);
  });

  it("ดันสุด +3 ช่อง ยางสึกเพิ่ม 3 / ประหยัด −1 ช่อง ยางสึกลด 2 (ไม่ติดลบ)", () => {
    const push = playTurn(fresh(), "soft", "push", seq(die(2)));
    expect(push.players[0].progress).toBe(2 + 3 + 3);
    expect(push.players[0].wear).toBe(6);
    const eco = playTurn(fresh(), "hard", "eco", seq(die(2)));
    expect(eco.players[0].progress).toBe(2 + 1 - 1);
    expect(eco.players[0].wear).toBe(0);
  });

  it("ไม่มีการ์ดเหลือ = เล่นไม่ได้ state ไม่เปลี่ยน", () => {
    let s = fresh();
    s = { ...s, players: s.players.map((p) => ({ ...p, cards: { ...p.cards, eco: 0 } })) };
    expect(playTurn(s, "soft", "eco", seq(die(3)))).toBe(s);
  });

  it("ฝน: เต๋าสูงสุด 4 และยางสึกเพิ่ม 1", () => {
    const s = applyEvent(fresh(), "rain");
    const out = playTurn(s, "medium", null, seq(die(6)));
    expect(out.players[0].progress).toBe(4 + 2);
    expect(out.players[0].wear).toBe(3);
  });
});

describe("รอบและผู้ชนะ", () => {
  it("เล่นครบทุกคนแล้วขึ้นรอบใหม่ ผู้เล่นคนแรกเริ่มก่อน", () => {
    let s = fresh();
    s = playTurn(s, "medium", null, seq(die(3)));
    s = playTurn(s, "medium", null, seq(die(3), NO_EVENT));
    expect(s.round).toBe(2);
    expect(s.turn).toBe(0);
    expect(s.event).toBeNull();
  });

  it("ผู้ถึงเส้นชัยก่อนไม่ชนะทันที — รอให้ทุกคนเล่นครบรอบก่อน แล้วใครไปไกลสุดชนะ", () => {
    let s = fresh(5);
    s = playTurn(s, "medium", null, seq(die(6))); // A: 8 ถึงเส้นชัยแล้ว
    expect(s.winner).toBeNull();
    s = playTurn(s, "soft", "push", seq(die(6), NO_EVENT)); // B: 6+3+3 = 12
    expect(s.winner).toBe(1);
  });

  it("ก้าวเท่ากัน ตัดสินด้วยยางสึกน้อยกว่า", () => {
    let s = fresh(5);
    s = playTurn(s, "medium", null, seq(die(3))); // A: 5 wear 2
    s = playTurn(s, "hard", "push", seq(die(1), NO_EVENT)); // B: 1+1+3 = 5 wear 1+3=4
    expect(s.players.map((p) => p.progress)).toEqual([5, 5]);
    expect(s.winner).toBe(0);
  });

  it("จบเกมแล้วเล่นต่อไม่ได้", () => {
    let s = fresh(1);
    s = playTurn(s, "medium", null, seq(die(1)));
    s = playTurn(s, "medium", null, seq(die(1), NO_EVENT));
    expect(playTurn(s, "medium", null, seq(die(6)))).toBe(s);
  });

  it("ต้นรอบมีโอกาสเกิดเหตุการณ์ตาม rng", () => {
    let s = fresh();
    s = playTurn(s, "medium", null, seq(die(3)));
    // rng: เต๋า, เหตุการณ์เกิด (0.1 < 0.35), เลือกชนิด = rain (0.4 → index 1)
    s = playTurn(s, "medium", null, seq(die(3), 0.1, 0.4));
    expect(s.event).toBe("rain");
  });
});

describe("applyEvent", () => {
  const spread = (): GameState => {
    const s = fresh(40);
    return {
      ...s,
      players: [
        { ...s.players[0], progress: 20, wear: 5 },
        { ...s.players[1], progress: 10, wear: 7 },
      ],
    };
  };

  it("เซฟตี้คาร์: ช่องว่างจากผู้นำเหลือครึ่ง", () => {
    const s = applyEvent(spread(), "safety_car");
    expect(s.players.map((p) => p.progress)).toEqual([20, 15]);
    expect(s.event).toBe("safety_car");
  });

  it("ธงแดง: ยางใหม่ทุกคน คันท้ายได้ +3", () => {
    const s = applyEvent(spread(), "red_flag");
    expect(s.players.map((p) => p.wear)).toEqual([0, 0]);
    expect(s.players.map((p) => p.progress)).toEqual([20, 13]);
  });

  it("ธงแดง: ถ้าทุกคนเสมอกัน ไม่มีใครได้โบนัส", () => {
    const s = applyEvent(fresh(), "red_flag");
    expect(s.players.map((p) => p.progress)).toEqual([0, 0]);
  });
});

describe("standings", () => {
  it("เรียงผู้นำก่อน เสมอกันตามลำดับผู้เล่น", () => {
    const s = fresh();
    expect(standings(s).map((p) => p.id)).toEqual([0, 1]);
    const t = { ...s, players: [s.players[0], { ...s.players[1], progress: 3 }] };
    expect(standings(t).map((p) => p.id)).toEqual([1, 0]);
  });
});
