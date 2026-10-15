import { describe, expect, it } from "vitest";
import { BIZ_SQUARES, BOARD, cellOf, circuitRent, GROUPS, groupSquares, JAIL, PASS_START, SIZE, START_CASH, type GroupId } from "@/lib/pitwall/tycoon/board";
import { act, blocks, takeoverPrice, botAction, canBuild, goalMet, GOAL_REWARD, helpsGoal, newGame, ranking, RADIO, rentOf, valueOf, WEATHER, worth, type Game } from "@/lib/pitwall/tycoon/game";

const COL = { color: "#f00", ink: "#fff" };
const game = (seed = 1, bots = [false, true, true, true], laps = 8) =>
  newGame({ seed, names: bots.map((_, i) => `P${i}`), colors: bots.map(() => COL), bots, laps });

/** วางสถานะให้ทอยได้ค่าที่ต้องการ: หาเมล็ดที่ให้ลูกเต๋าตามนั้น */
function rollTo(g: Game, sum: number, double = false): Game {
  for (let s = 1; s < 200000; s++) {
    const t = act({ ...g, seed: { s } }, { t: "roll" });
    if (t.dice && t.dice[0] + t.dice[1] === sum && (t.dice[0] === t.dice[1]) === double) return t;
  }
  throw new Error("no seed");
}

describe("กระดาน", () => {
  it("32 ช่อง · มุมถูกที่ · สนาม 6 กลุ่ม กลุ่มละ 3 · ธุรกิจ 4", () => {
    expect(SIZE).toBe(32);
    expect(BOARD[0].kind).toBe("start");
    expect(BOARD[8].kind).toBe("jail");
    expect(BOARD[16].kind).toBe("pit");
    expect(BOARD[24].kind).toBe("gojail");
    for (const g of Object.keys(GROUPS) as GroupId[]) expect(groupSquares(g)).toHaveLength(3);
    expect(BIZ_SQUARES).toHaveLength(4);
    const cells = new Set(BOARD.map((_, i) => `${cellOf(i).row},${cellOf(i).col}`));
    expect(cells.size).toBe(32);
    for (let i = 0; i < SIZE; i++) {
      const { row, col } = cellOf(i);
      expect(row === 1 || row === 9 || col === 1 || col === 9).toBe(true);
    }
  });

  it("ค่าตั๋วขึ้นตามระดับ และครบกลุ่ม ×2", () => {
    expect(circuitRent(100, 0, true)).toBe(circuitRent(100, 0, false) * 2);
    for (let l = 1; l <= 4; l++) expect(circuitRent(100, l, true)).toBeGreaterThan(circuitRent(100, l - 1, true));
  });
});

describe("กติกา", () => {
  it("ทอยแล้วเดิน · ตกสนามว่างให้ซื้อ · ซื้อแล้วหักเงิน", () => {
    let g = rollTo(game(), 3);
    expect(g.players[0].pos).toBe(3);
    expect(g.phase).toEqual({ k: "buy", sq: 3 });
    g = act(g, { t: "buy" });
    expect(g.owner[3]).toBe(0);
    expect(g.players[0].cash).toBe(START_CASH - 60);
    expect(g.phase.k).toBe("end");
  });

  it("ตกสนามคนอื่นต้องจ่ายค่าตั๋ว", () => {
    let g = game();
    g = { ...g, owner: g.owner.map((o, i) => (i === 3 ? 1 : o)) };
    g = rollTo(g, 3);
    const r = rentOf(g, 3);
    expect(r).toBeGreaterThan(0);
    expect(g.players[0].cash).toBe(START_CASH - r);
    expect(g.players[1].cash).toBe(START_CASH + r);
  });

  it("ผ่านเส้นสตาร์ทรับเงินและนับรอบ", () => {
    let g = game();
    g.players[0].pos = 30;
    g = rollTo(g, 5);
    expect(g.players[0].pos).toBe(3);
    expect(g.players[0].laps).toBe(1);
    expect(g.players[0].cash).toBeGreaterThanOrEqual(START_CASH + PASS_START - 60);
  });

  it("ทอยคู่ได้ทอยอีกครั้ง · ตกช่องโดนโทษไปห้องสจ๊วต", () => {
    let g = rollTo(game(), 4, true);
    if (g.phase.k === "buy") g = act(act(g, { t: "pass" }), { t: "bid", amount: 0 });
    expect(g.phase.k).toBe("roll");
    expect(g.turn).toBe(0);
    let h = game();
    h.players[0].pos = 20;
    h = rollTo(h, 4);
    expect(h.players[0].pos).toBe(JAIL);
    expect(h.players[0].jail).toBe(1);
    // จ่ายค่าปรับออกได้
    h = act(h, { t: "end" });
    while (h.turn !== 0) h = act(h, botAction(h));
    h = act(h, { t: "payJail" });
    expect(h.players[0].jail).toBe(0);
  });

  it("สร้างอัฒจันทร์ต้องครบกลุ่มและสร้างเท่า ๆ กัน", () => {
    const g = game();
    const me = groupSquares("me");
    expect(canBuild(g, 0, me[0])).toBe(false);
    me.forEach((i) => (g.owner[i] = 0));
    expect(canBuild(g, 0, me[0])).toBe(true);
    const b = act(g, { t: "build", sq: me[0] });
    expect(b.level[me[0]]).toBe(1);
    expect(canBuild(b, 0, me[0])).toBe(false); // ต้องสร้างช่องอื่นก่อน
    expect(rentOf(b, me[0])).toBeGreaterThan(rentOf(g, me[0]));
  });

  it("จ่ายไม่ไหว: ขายของ แล้วล้มละลาย · เหลือคนเดียวจบเกม", () => {
    let g = game(3, [false, true]);
    g.players[0].cash = 10;
    g.owner[1] = 0;
    g.players[0].pos = 20;
    const target = 27; // สปา ของบอท ตั้งค่าตั๋วแพง
    groupSquares("legend").forEach((i) => {
      g.owner[i] = 1;
      g.level[i] = 4;
    });
    g = rollTo(g, target - 20);
    expect(g.players[0].out).toBe(true);
    expect(g.owner[1]).toBeNull();
    expect(g.phase.k).toBe("over");
    expect(ranking(g)[0]).toBe(1);
  });

  it("การ์ดทุกใบใช้ได้ไม่พัง", () => {
    for (const deck of ["radio", "weather"] as const) {
      const n = (deck === "radio" ? RADIO : WEATHER).length;
      for (let c = 0; c < n; c++) {
        const g = game();
        g.players[0].pos = deck === "radio" ? 2 : 11;
        g.phase = { k: "card", deck, card: c };
        const after = act(g, { t: "ok" });
        expect(after.phase.k).not.toBe("card");
        expect(Number.isFinite(after.players[0].cash)).toBe(true);
      }
    }
  });

  it("บอทเล่นจนจบฤดูกาลได้ทุกเมล็ด ไม่ค้าง", () => {
    for (let seed = 1; seed <= 25; seed++) {
      let g = game(seed, [true, true, true, true], 6);
      let steps = 0;
      while (g.phase.k !== "over" && steps < 20000) {
        const next = act(g, botAction(g));
        expect(next).not.toBe(g); // action ของบอทต้องทำได้เสมอ
        g = next;
        steps++;
      }
      expect(g.phase.k).toBe("over");
      for (let p = 0; p < 4; p++) expect(Number.isFinite(worth(g, p))).toBe(true);
      expect(g.players.every((p) => p.cash >= 0)).toBe(true);
    }
  });

  it("ไม่ซื้อ = ประมูลยื่นซอง · คนเสนอสูงสุดได้ไปและจ่ายตามที่เสนอ", () => {
    let g = rollTo(game(), 3);
    g = act(g, { t: "pass" });
    expect(g.phase).toEqual({ k: "auction", sq: 3 });
    g = act(g, { t: "bid", amount: 400 });
    expect(g.owner[3]).toBe(0);
    expect(g.players[0].cash).toBe(START_CASH - 400);
    expect(g.auction?.winner).toBe(0);
    expect(g.phase.k).toBe("end");
    // เสนอ 0 → บอทอาจได้ไป หรือไม่มีใครได้ แต่เงินต้องไม่ติดลบ
    let h = act(rollTo(game(5), 3), { t: "pass" });
    h = act(h, { t: "bid", amount: 0 });
    expect(h.owner[3]).not.toBe(0);
    expect(h.players.every((p) => p.cash >= 0)).toBe(true);
  });

  it("Race Week: กลุ่มเจ้าภาพค่าตั๋ว ×2 · ย้ายเมื่อมีคนขึ้นรอบใหม่ และเจ้าของได้ค่าลิขสิทธิ์", () => {
    let g = game();
    const sq = groupSquares(g.spot)[0];
    g.owner[sq] = 1;
    const other = (Object.keys(GROUPS) as GroupId[]).find((x) => x !== g.spot)!;
    const sq2 = groupSquares(other)[0];
    g.owner[sq2] = 1;
    expect(rentOf(g, sq) / circuitRent((BOARD[sq] as { price: number }).price, 0, false)).toBe(2);
    expect(rentOf(g, sq2)).toBe(circuitRent((BOARD[sq2] as { price: number }).price, 0, false));
    const nextGroup = g.next;
    groupSquares(nextGroup).forEach((i) => (g.owner[i] = 2));
    const before = g.players[2].cash;
    g.players[0].pos = 30;
    g = rollTo(g, 5);
    expect(g.spot).toBe(nextGroup);
    expect(g.players[2].cash).toBeGreaterThan(before);
  });

  it("เป้าสปอนเซอร์: ทุกคนมี 2 เป้า · ทำสำเร็จได้โบนัสและได้เป้าใหม่", () => {
    let g = game();
    expect(g.players.every((p) => p.goals.length === 2)).toBe(true);
    g.players[0].goals = [{ k: "own", sq: 3 }, { k: "biz2" }];
    expect(helpsGoal(g, 0, 3)).toEqual({ k: "own", sq: 3 });
    g = rollTo(g, 3);
    g = act(g, { t: "buy" });
    expect(g.players[0].done).toBe(1);
    expect(g.players[0].cash).toBe(START_CASH - 60 + GOAL_REWARD.own);
    expect(g.players[0].goals).toHaveLength(2);
    expect(g.players[0].goals.some((x) => x.k === "own" && x.sq === 3)).toBe(false);
    expect(g.players[0].goals.every((x) => !goalMet(g, 0, x))).toBe(true);
  });

  it("มูลค่าสนามสูงขึ้นเมื่อครบกลุ่มหรือกันคู่แข่ง", () => {
    const g = game();
    const [a, b, c] = groupSquares("asia");
    const base = valueOf(g, 0, c);
    g.owner[a] = 0;
    g.owner[b] = 0;
    expect(valueOf(g, 0, c)).toBeGreaterThan(base * 1.8);
    expect(blocks(g, 1, c)).toBe(0);
    expect(valueOf(g, 1, c)).toBeGreaterThan(base);
  });

  it("เทคโอเวอร์: จ่ายค่าตั๋วแล้วซื้อต่อได้ 1.5 เท่า · ครบกลุ่มแล้วซื้อต่อไม่ได้", () => {
    let g = game();
    g.owner[3] = 1;
    g = rollTo(g, 3);
    expect(g.phase.k).toBe("takeover");
    const tp = takeoverPrice(g, 3)!;
    expect(tp).toBe(90);
    const c0 = g.players[0].cash;
    const c1 = g.players[1].cash;
    g = act(g, { t: "takeover" });
    expect(g.owner[3]).toBe(0);
    expect(g.players[0].cash).toBe(c0 - tp);
    expect(g.players[1].cash).toBe(c1 + tp);
    const h = game();
    groupSquares("me").forEach((i) => (h.owner[i] = 1));
    expect(takeoverPrice(h, 3)).toBeNull();
  });
});
