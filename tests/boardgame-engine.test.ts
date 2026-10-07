import { describe, expect, it } from "vitest";
import {
  AI_DECK, BASE_MOVE, BOX_AT, ERS_BONUS, ERS_MAX, GRID_SIZE, MOVE_DECK, PIT_LEN, TOKEN_USES,
  WEAR_MAX, WORN_MOVE,
  activeDriver, attackTarget, choose, commit, drsTarget, moveValue, newGame, options, standings,
  travel,
  type CarSpec, type Driver, type GameState, type Lane, type Rng, type Track,
} from "@/lib/boardgame/engine";

/** rng ที่พังถ้าถูกเรียก — ช่วงนี้ไม่มีความสุ่มระหว่างเล่นนอกจากสับไพ่ */
const never: Rng = () => {
  throw new Error("rng ไม่ควรถูกเรียก");
};

const track = (patch: Partial<Track> = {}): Track => ({
  lapCells: 36,
  corners: [],
  drs: [],
  pitEntry: { start: 33, end: 35 },
  vbox: 18,
  ...patch,
});

const two: CarSpec[] = [
  { name: "A", num: 1, team: 0, ai: false, compound: "yellow" },
  { name: "B", num: 2, team: 0, ai: false, compound: "red" },
];

/** เกม 2 คัน ทีมเดียว: A เส้นแข่ง B นอกเส้น ที่เส้นสตาร์ท */
const game = (t: Track = track(), laps = 4, cars: CarSpec[] = two): GameState =>
  newGame(cars, ["ทีม"], t, laps, () => 0.5, cars.map((_, i) => i));

/** วางรถตามตำแหน่ง [ช่อง, เลน] */
const place = (s: GameState, at: [number, Lane][]): GameState => ({
  ...s,
  drivers: s.drivers.map((d, i) => (at[i] ? { ...d, progress: at[i][0], lane: at[i][1] } : d)),
});

const patch = (s: GameState, id: number, p: Partial<Driver>): GameState => ({
  ...s,
  drivers: s.drivers.map((d) => (d.id === id ? { ...d, ...p } : d)),
});

/** กำหนดไพ่ MOVE ใบบนสุดของทีม 0 */
const deck = (s: GameState, ...ids: number[]): GameState => ({
  ...s,
  teams: s.teams.map((t, i) =>
    i === 0 ? { ...t, moveDeck: [...ids, ...MOVE_DECK.map((_, k) => k).filter((k) => !ids.includes(k))] } : t,
  ),
});

/** ทำให้ถึงรอบ 2 (บางกติกาใช้ไม่ได้ในตาแรก) แล้วให้ A เป็นคนเดิน */
const round2 = (s: GameState): GameState => ({ ...s, round: 2, order: [0, 1], turn: 0 });

/** ไพ่ที่ไม่มีผลหลังเดิน (ACTION / PITWALL) — เทสต์การเดินล้วน ๆ */
const idx = (pred: (c: (typeof MOVE_DECK)[number]) => boolean) =>
  MOVE_DECK.findIndex((c) => !c.action && !c.pitwall && pred(c));
const TIRES_ERS = idx((c) => c.tires && c.ers);
const TIRES_ONLY = idx((c) => c.tires && !c.ers);
const PLAIN = idx((c) => !c.tires && !c.ers && c.y === 6 && c.r === 7);

const play = (s: GameState, kind: "base" | "card" | "drs", extras = {}) =>
  commit(choose(s, { kind }, never), extras, never);

describe("เริ่มเกม", () => {
  it("กริด 12 คันแถวละ 2 แถวหลังถอยทีละช่อง ยาง ERS เหรียญพร้อม", () => {
    const cars: CarSpec[] = Array.from({ length: GRID_SIZE }, (_, i) => ({
      name: `C${i}`, num: i, team: 0, ai: false, compound: i % 2 ? "red" : "yellow",
    }));
    const s = newGame(cars, ["ทีม"], track(), 4, () => 0.5, cars.map((_, i) => i));
    expect(s.drivers.map((d) => [d.progress, d.lane])).toEqual(
      Array.from({ length: GRID_SIZE }, (_, i) => [-Math.floor(i / 2) || 0, i % 2]),
    );
    expect(s.total).toBe(36 * 4);
    const a = s.drivers[0];
    expect(a.sets.sort()).toEqual(["red", "red", "yellow"]);
    expect(a.ers).toBe(ERS_MAX);
    expect(a.tokens).toEqual({ attack: TOKEN_USES, block: TOKEN_USES, slip: TOKEN_USES, pass: 0 });
  });

  it("สำรับ MOVE: ยางแดงเร็วกว่าเหลืองโดยเฉลี่ย และไพ่เร็วสุดของแต่ละแถวมีป้ายสึก", () => {
    const avg = (f: (c: (typeof MOVE_DECK)[number]) => number) =>
      MOVE_DECK.reduce((a, c) => a + f(c), 0) / MOVE_DECK.length;
    expect(avg((c) => c.r)).toBeGreaterThan(avg((c) => c.y));
    expect(avg((c) => c.y)).toBeGreaterThan(BASE_MOVE);
    const maxY = Math.max(...MOVE_DECK.map((c) => c.y));
    const maxR = Math.max(...MOVE_DECK.map((c) => c.r));
    for (const c of MOVE_DECK) if (c.y === maxY || c.r === maxR) expect(c.tires).toBe(true);
    for (const c of MOVE_DECK) if (c.ers) expect(c.tires).toBe(true);
  });

  it("รถ AI ที่อยู่หน้าผู้เล่นในกริดเดินเองตั้งแต่เริ่ม แล้วรอผู้เล่น", () => {
    const cars: CarSpec[] = [
      { name: "คน", num: 1, team: 0, ai: false },
      { name: "บอท", num: 9, team: -1, ai: true },
    ];
    const s = newGame(cars, ["ทีม"], track(), 4, () => 0.5, [1, 0]);
    expect(activeDriver(s).ai).toBe(false);
    expect(s.feed[0]).toMatchObject({ driver: 1, ai: true });
    expect(s.drivers[1].progress).toBeGreaterThan(0);
    expect(AI_DECK.length).toBeGreaterThan(10);
  });
});

describe("เดินพื้นฐาน และไพ่ MOVE", () => {
  it("พื้นฐาน: ได้ระยะ 4 รอขั้นที่ 2 แล้วเดิน 4 ไม่สึกยาง", () => {
    const s = choose(game(), { kind: "base" }, never);
    expect(s.pending).toMatchObject({ driver: 0, kind: "base", value: BASE_MOVE });
    const out = commit(s, {}, never);
    expect(out.drivers[0]).toMatchObject({ progress: BASE_MOVE, wear: 0 });
    expect(activeDriver(out).id).toBe(1);
  });

  it("ไพ่ MOVE: ใช้ค่าตามยาง (เหลือง y / แดง r)", () => {
    const a = choose(deck(game(), PLAIN), { kind: "card" }, never);
    expect(a.pending?.value).toBe(moveValue(MOVE_DECK[PLAIN], "yellow"));
    const afterA = commit(a, {}, never);
    const b = choose(deck(afterA, PLAIN), { kind: "card" }, never);
    expect(b.pending?.value).toBe(moveValue(MOVE_DECK[PLAIN], "red"));
  });

  it("นอกเส้นแข่งเปิดไพ่ไม่ได้ ยกเว้นตาแรกของเกม", () => {
    const first = place(game(), [[0, 1], [5, 0]]);
    expect(options(first).card).toBe(true);
    const later = round2(first);
    expect(options(later).card).toBe(false);
    expect(choose(later, { kind: "card" }, never)).toBe(later);
  });

  it("ไพ่สึก: ยางเหลืองสึก 1 ขั้น แดง 2 ขั้น ไพ่ธรรมดาไม่สึก", () => {
    const y = play(deck(game(), TIRES_ONLY), "card");
    expect(y.drivers[0].wear).toBe(1);
    const r = play(deck(patch(game(), 0, { compound: "red" }), TIRES_ONLY), "card");
    expect(r.drivers[0].wear).toBe(2);
    expect(play(deck(game(), PLAIN), "card").drivers[0].wear).toBe(0);
  });

  it("สุดรางสึกแล้วเจอไพ่สึกอีก = ยางพัง: เดินเองช่องละ 3 เปิดไพ่/ERS ไม่ได้", () => {
    let s = play(deck(patch(game(), 0, { wear: WEAR_MAX }), TIRES_ONLY), "card");
    expect(s.drivers[0].worn).toBe(true);
    s = round2(place(s, [[10, 0], [2, 0]]));
    const o = options(s);
    expect(o).toMatchObject({ worn: true, base: false, card: false });
    expect(choose(s, { kind: "base" }, never)).toBe(s);
    const out = choose(s, { kind: "worn" }, never);
    expect(out.drivers[0].progress).toBe(10 + WORN_MOVE);
  });
});

describe("ERS", () => {
  it("ใช้ ERS ได้ +2 และลดหนึ่งขั้น", () => {
    const out = play(game(), "base", { ers: true });
    expect(out.drivers[0]).toMatchObject({ progress: BASE_MOVE + ERS_BONUS, ers: ERS_MAX - 1 });
  });

  it("ไพ่สายฟ้าชาร์จคืน 1 ขั้น แต่ใช้กับชาร์จในตาเดียวกันไม่ได้", () => {
    const low = patch(game(), 0, { ers: 1 });
    expect(play(deck(low, TIRES_ERS), "card").drivers[0].ers).toBe(2);
    expect(play(deck(low, TIRES_ERS), "card", { ers: true }).drivers[0].ers).toBe(0);
  });

  it("ERS หมดแล้วใช้ไม่ได้", () => {
    const out = play(patch(game(), 0, { ers: 0 }), "base", { ers: true });
    expect(out.drivers[0].progress).toBe(BASE_MOVE);
  });
});

describe("โค้งและการจราจร", () => {
  const go = (s: GameState, id: number, n: number, lane: Lane = 0) => travel(s, s.drivers[id], n, lane);

  it("เข้าโค้งต้องหยุดที่ช่องสุดท้ายของโค้ง แล้วออกได้ในตาถัดไป", () => {
    const s = place(game(track({ corners: [{ start: 5, end: 6 }] })), [[2, 0], [20, 0]]);
    expect(go(s, 0, 8)).toMatchObject({ progress: 6, corner: true });
    expect(go(place(s, [[6, 0], [20, 0]]), 0, 4)).toMatchObject({ progress: 10, corner: false });
  });

  it("ช่องเต็มสองเลนผ่านไม่ได้ ต้องหยุดหลัง", () => {
    const three: CarSpec[] = [...two, { name: "C", num: 3, team: 0, ai: false }];
    const s = place(game(track(), 4, three), [[1, 0], [4, 0], [4, 1]]);
    expect(go(s, 0, 6)).toMatchObject({ progress: 3, blocked: true });
  });

  it("แซงแนวทแยงผ่านรถ 2 คันที่อยู่เยื้องกันไม่ได้", () => {
    const three: CarSpec[] = [...two, { name: "C", num: 3, team: 0, ai: false }];
    // รถอยู่ (3, เส้นแข่ง) กับ (4, นอกเส้น) — เราอยู่ (2, นอกเส้น) จะไปไกลกว่านั้นต้องตัดทแยงระหว่างสองคัน
    const s = place(game(track(), 4, three), [[2, 1], [3, 0], [4, 1]]);
    expect(go(s, 0, 6)).toMatchObject({ progress: 3, lane: 1, blocked: true });
  });

  it("ผ่านรถคันเดียวได้ด้วยการหลบไปอีกเลน และเลือกจบที่เลนไหนก็ได้ถ้าว่าง", () => {
    const s = place(game(), [[0, 0], [2, 0]]);
    expect(go(s, 0, 4)).toMatchObject({ progress: 4, lane: 0 });
    expect(go(s, 0, 4, 1)).toMatchObject({ progress: 4, lane: 1 });
  });
});

describe("เหรียญนักขับ", () => {
  it("ATTACK: ติดท้ายรถคันหน้าบนเส้นแข่ง ข้างมันว่าง → เข้าที่แทน มันออกนอกเส้น", () => {
    const s = place(game(), [[0, 0], [5, 0]]);
    const out = play(s, "base", { attack: true });
    expect(out.drivers[0]).toMatchObject({ progress: 5, lane: 0 });
    expect(out.drivers[0].tokens.attack).toBe(TOKEN_USES - 1);
    expect(out.drivers[1].lane).toBe(1);
  });

  it("ATTACK ไม่ได้ถ้าข้างรถคันหน้าไม่ว่าง หรือมันเพิ่ง BLOCK เรา", () => {
    const three: CarSpec[] = [...two, { name: "C", num: 3, team: 0, ai: false }];
    const busy = place(game(track(), 4, three), [[0, 0], [5, 0], [5, 1]]);
    expect(attackTarget(busy, busy.drivers[0], { progress: 4, lane: 0 })).toBeNull();
    const blocked = patch(place(game(), [[0, 0], [5, 0]]), 1, { blockVictim: 0 });
    expect(attackTarget(blocked, blocked.drivers[0], { progress: 4, lane: 0 })).toBeNull();
  });

  it("BLOCK: คันที่เดินต่อจากเราแซงหรือขึ้นคู่ไม่ได้ ต้องหยุดหลังเรา", () => {
    // A อยู่ข้างหน้า เดินพื้นฐานแล้ว BLOCK — B ตามมาด้วยระยะเยอะก็หยุดหลัง A
    let s = round2(place(game(), [[10, 0], [8, 0]]));
    s = play(s, "base", { block: true });
    expect(s.drivers[0]).toMatchObject({ progress: 14, blockVictim: 1 });
    s = play(s, "base", { ers: true });
    expect(s.drivers[1].progress).toBe(13);
  });

  it("SLIPSTREAM: ตามติดรถคันหน้าในเลนเดียวกันตอนมันออกตัว → ตามไปติดท้ายได้โดยไม่เปิดไพ่", () => {
    let s = round2(place(game(), [[10, 0], [9, 0]]));
    s = play(deck(s, PLAIN), "card"); // A เดิน 6
    expect(s.drivers[1].slipTarget).toBe(0);
    expect(options(s).slip).toBe(true);
    s = choose(s, { kind: "slip" }, never);
    expect(s.drivers[1]).toMatchObject({ progress: 15, lane: 0 });
    expect(s.drivers[1].tokens.slip).toBe(TOKEN_USES - 1);
  });

  it("DRS: อยู่ในโซนและมีรถติดหน้าในเลนเดียวกัน → ไปอยู่หน้ารถคันนั้น (ตาแรกใช้ไม่ได้)", () => {
    const t = track({ drs: [{ start: 8, end: 14 }] });
    const s = place(game(t), [[9, 0], [10, 0]]);
    expect(drsTarget(s, s.drivers[0])).toBeNull(); // ตาแรก
    const r2 = round2(s);
    expect(drsTarget(r2, r2.drivers[0])?.id).toBe(1);
    const out = play(r2, "drs");
    expect(out.drivers[0].progress).toBe(11);
  });

  it("DRS โดน BLOCK: ได้แค่ไปติดท้าย ไม่แซง", () => {
    const t = track({ drs: [{ start: 8, end: 14 }] });
    const s = patch(round2(place(game(t), [[9, 0], [10, 0]])), 1, { blockVictim: 0 });
    const out = choose(s, { kind: "drs" }, never);
    expect(out.pending?.value).toBe(0);
  });
});

describe("พิท", () => {
  it("ตั้งใจเข้าพิท: ระยะถูกตัดให้หยุดในโซนเข้าพิท", () => {
    const s = round2(place(game(), [[30, 0], [2, 0]]));
    const out = commit(choose(s, { kind: "base", box: true }, never), { ers: true }, never);
    expect(out.drivers[0].progress).toBe(35); // ช่องสุดท้ายของโซน (33–35)
  });

  it("เข้าเลนพิท → ถึงช่องพิทจอด → ตาหน้าเปลี่ยนยาง แล้ววิ่งออก กลับเข้าสนามนอกเส้นแข่ง", () => {
    let s = round2(place(game(), [[34, 0], [2, 0]]));
    s = patch(s, 0, { wear: 5, compound: "yellow" });
    expect(options(s).pitIn).toBe(true);
    s = choose(s, { kind: "pitIn" }, never);
    expect(s.drivers[0].pit).toMatchObject({ pos: BOX_AT, inBox: true });
    s = { ...s, order: [0, 1], turn: 0 };
    expect(options(s)).toMatchObject({ inBox: true });
    s = choose(s, { kind: "box", set: "red" }, never);
    const a = s.drivers[0];
    expect(a).toMatchObject({ compound: "red", wear: 0, pit: null, lane: 1, pits: 1 });
    expect(a.progress).toBe(33 + PIT_LEN);
    expect(a.sets.sort()).toEqual(["red", "yellow"]);
  });

  it("เข้าเลนพิทได้เฉพาะในโซนเข้าพิท", () => {
    const s = round2(place(game(), [[20, 0], [2, 0]]));
    expect(options(s).pitIn).toBe(false);
    expect(choose(s, { kind: "pitIn" }, never)).toBe(s);
  });
});

describe("ลำดับเดิน และเส้นชัย", () => {
  it("จบรอบแล้วเรียงใหม่: คันนำเดินก่อน ช่องเดียวกันเส้นแข่งก่อน", () => {
    let s = play(game(), "base"); // A → 4
    s = play(s, "base", { ers: true }); // B → 6
    expect(s.round).toBe(2);
    expect(s.order).toEqual([1, 0]);
    expect(standings(s).map((d) => d.id)).toEqual([1, 0]);
  });

  it("ข้ามเส้นชัยได้อันดับตามลำดับที่ข้าม และจบเกมเมื่อทุกคันเข้าเส้น", () => {
    let s = place(game(track(), 1), [[34, 0], [35, 1]]);
    s = play(s, "base"); // A ข้ามเส้นก่อน
    expect(s.drivers[0].finished).toBe(1);
    expect(s.over).toBe(false);
    s = play(s, "base");
    expect(s.drivers[1].finished).toBe(2);
    expect(s.over).toBe(true);
    expect(standings(s).map((d) => d.id)).toEqual([0, 1]);
  });
});

describe("จำลองเรซเต็ม", () => {
  /** rng แบบกำหนดเมล็ดได้ ให้ผลซ้ำทุกครั้ง */
  const seeded = (seed: number): Rng => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it("ผู้เล่น 2 คัน + AI 10 คัน เล่นจนจบได้ทุกคันเข้าเส้น ไม่ค้าง", () => {
    for (const seed of [1, 7, 42]) {
      const rng = seeded(seed);
      const cars: CarSpec[] = [
        { name: "P1", num: 7, team: 0, ai: false, compound: "red" },
        { name: "P2", num: 8, team: 0, ai: false, compound: "yellow" },
        ...Array.from({ length: 10 }, (_, i): CarSpec => ({ name: `AI${i}`, num: 20 + i, team: -1, ai: true })),
      ];
      let s = newGame(cars, ["ทีม"], track({ corners: [{ start: 8, end: 9 }, { start: 20, end: 22 }], drs: [{ start: 24, end: 30 }] }), 4, rng);
      let steps = 0;
      while (!s.over && steps < 2000) {
        steps++;
        if (s.pending) {
          s = commit(s, { ers: true, attack: true }, rng);
          continue;
        }
        const o = options(s);
        const kind =
          o.inBox ? "box"
          : o.pitLane ? "pitLane"
          : o.rejoin ? "rejoin"
          : o.pitIn && (o.worn || activeDriver(s).wear >= WEAR_MAX - 1) ? "pitIn"
          : o.worn ? "worn"
          : o.drs ? "drs"
          : o.card ? "card"
          : "base";
        const next = choose(s, { kind, box: activeDriver(s).wear >= WEAR_MAX - 1 }, rng);
        expect(next, `ค้างที่ ${kind}`).not.toBe(s);
        s = next;
      }
      expect(s.over).toBe(true);
      const out = s.drivers.filter((d) => d.out).length;
      expect(new Set(s.finishOrder).size + out).toBe(GRID_SIZE);
    }
  });
});
