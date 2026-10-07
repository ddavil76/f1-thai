import { describe, expect, it } from "vitest";
import {
  ACTION_DECK, BASE_MOVE, BOX_AT, ERS_MAX, INCIDENT_DIE, MOVE_DECK, PITWALL_DECK, PITWALL_START, RAIN_AT,
  TOKEN_USES, WEAR_MAX, WORN_MOVE,
  activeDriver, canPitwall, choose, commit, inFlag, isRain, newGame, options, playPitwall, standings,
  type ActionKind, type CarSpec, type Driver, type GameState, type IncidentFace, type Lane, type PitwallKind,
  type Rng, type Track,
} from "@/lib/boardgame/engine";
import { byTime, canExtra, extraLap, finishQuali, newQuali, runQ1, toQ2, HALF_WEAR } from "@/lib/boardgame/quali";

const never: Rng = () => {
  throw new Error("rng ไม่ควรถูกเรียก");
};

/** rng ที่คืนค่าตามลำดับ — ใช้กำหนดหน้าลูกเต๋า */
const seq = (...xs: number[]): Rng => () => {
  if (!xs.length) throw new Error("rng หมด");
  return xs.shift()!;
};
const face = (f: IncidentFace) => (INCIDENT_DIE.indexOf(f) + 0.5) / INCIDENT_DIE.length;

const track = (patch: Partial<Track> = {}): Track => ({
  lapCells: 36, corners: [], drs: [], pitEntry: { start: 33, end: 35 }, vbox: 18, ...patch,
});

const cars3: CarSpec[] = [
  { name: "A", num: 1, team: 0, ai: false, compound: "yellow" },
  { name: "B", num: 2, team: 0, ai: false, compound: "red" },
  { name: "C", num: 3, team: 1, ai: false, compound: "yellow" },
];

const game = (n = 2, weather = 1, t: Track = track(), laps = 4): GameState => {
  const cars = cars3.slice(0, n);
  return newGame(cars, ["ทีม", "ทีม 2"], t, laps, () => 0.5, cars.map((_, i) => i), { weather });
};

/** วางรถแล้วให้รอบนี้เดินตามลำดับ id (รอบ 2) */
const at = (s: GameState, pos: [number, Lane][]): GameState => ({
  ...s,
  round: 2,
  turn: 0,
  order: pos.map((_, i) => i),
  drivers: s.drivers.map((d, i) => (pos[i] ? { ...d, progress: pos[i][0], lane: pos[i][1] } : d)),
});

const patch = (s: GameState, id: number, p: Partial<Driver>): GameState => ({
  ...s,
  drivers: s.drivers.map((d) => (d.id === id ? { ...d, ...p } : d)),
});

const cardWhere = (pred: (c: (typeof MOVE_DECK)[number]) => boolean) => MOVE_DECK.findIndex(pred);
const ACTION_CARD = cardWhere((c) => c.action && !c.pitwall && !c.tires && !c.spinDry && !c.spinWet);
const PITWALL_CARD = cardWhere((c) => c.pitwall && !c.action && !c.tires && !c.spinDry && !c.spinWet);
const SPIN_DRY = cardWhere((c) => c.spinDry && !c.action && !c.pitwall && !c.tires);
const TIRES_PLAIN = cardWhere((c) => c.tires && !c.action && !c.pitwall && !c.ers);

const topMove = (s: GameState, team: number, id: number): GameState => ({
  ...s,
  teams: s.teams.map((t, i) => (i === team ? { ...t, moveDeck: [id, ...t.moveDeck.filter((k) => k !== id)] } : t)),
});
const topAction = (s: GameState, kind: ActionKind): GameState => ({
  ...s,
  actionDeck: [ACTION_DECK.indexOf(kind), ...s.actionDeck],
});
const hand = (s: GameState, team: number, ...kinds: PitwallKind[]): GameState => ({
  ...s,
  teams: s.teams.map((t, i) =>
    i === team ? { ...t, pitwall: kinds.map((k) => PITWALL_DECK.findIndex((c) => c.kind === k)) } : t,
  ),
});

const playCard = (s: GameState, rng: Rng = never, extras = {}) => commit(choose(s, { kind: "card" }, never), extras, rng);
const playBase = (s: GameState, rng: Rng = never, extras = {}) => commit(choose(s, { kind: "base" }, never), extras, rng);
const events = (s: GameState) => s.feed.flatMap((l) => l.events);

describe("ไพ่ ACTION", () => {
  it("ไพ่ MOVE ที่มีป้าย ACTION เปิดเหตุการณ์หลังเดิน — พลาดเอง: ถูกเบียดออกนอกเส้น", () => {
    const s = topAction(topMove(at(game(), [[0, 0], [20, 0]]), 0, ACTION_CARD), "mistake");
    const out = playCard(s);
    expect(out.drivers[0].lane).toBe(1);
    expect(events(out)[0]).toMatchObject({ t: "action", card: "mistake", ok: true });
  });

  it("ออกนอกขอบสนาม: ไหลไป 1 ช่อง ใบเตือน → ครั้งที่สองเป็นโทษ", () => {
    let s = topAction(topMove(at(game(), [[0, 0], [20, 0]]), 0, ACTION_CARD), "trackLimits");
    s = playCard(s);
    const moved = MOVE_DECK[ACTION_CARD].y + 1;
    expect(s.drivers[0]).toMatchObject({ progress: moved, warn: true, penalty: false });
    s = topAction(topMove(at(s, [[0, 0], [20, 0]]), 0, ACTION_CARD), "trackLimits");
    s = playCard(s);
    expect(s.drivers[0]).toMatchObject({ warn: true, penalty: true });
  });

  it("เบรกร้อน: ได้แค่ BASE ห้ามไพ่ MOVE/ERS — ผ่าน V-BOX แล้วหาย", () => {
    let s = patch(at(game(), [[10, 0], [30, 0]]), 0, { brakes: true });
    expect(options(s)).toMatchObject({ base: true, card: false });
    s = playBase(s, never, { ers: true });
    expect(s.drivers[0]).toMatchObject({ progress: 10 + BASE_MOVE, ers: ERS_MAX });
    s = playBase(at(s, [[16, 0], [30, 0]]));
    expect(s.drivers[0].brakes).toBe(false); // ผ่านช่อง 18
  });

  it("ERS ดับ / เสียสมาธิ", () => {
    let s = topAction(topMove(at(game(), [[0, 0], [20, 0]]), 0, ACTION_CARD), "ersFail");
    s = playCard(s);
    expect(s.drivers[0].ers).toBe(0);
    s = topAction(topMove(at(s, [[0, 0], [20, 0]]), 0, ACTION_CARD), "focusAll");
    s = playCard(s);
    expect(s.drivers[0].tokens).toEqual({ attack: TOKEN_USES - 1, block: TOKEN_USES - 1, slip: TOKEN_USES - 1, pass: 0 });
  });
});

describe("อุบัติเหตุ ธงเหลือง เซฟตี้คาร์", () => {
  it("เฉี่ยวชน: คันข้าง ๆ ทอยด้วย หลุดออกนอกสนาม = ธงเหลือง แล้วตาหน้ากลับเข้าสนาม", () => {
    const pos = MOVE_DECK[ACTION_CARD].y;
    let s = topAction(topMove(at(game(3), [[0, 0], [pos, 1], [30, 0]]), 0, ACTION_CARD), "incident");
    s = playCard(s, seq(face("off"), face("escape")));
    const inc = events(s).find((e) => e.t === "incident");
    expect(inc).toMatchObject({ rolls: [{ driver: 0, face: "off" }, { driver: 1, face: "escape" }] });
    expect(s.drivers[0].off).toBe(true);
    expect(s.flags).toHaveLength(1);
    // B อยู่ในเขตธงเหลือง: ได้แค่ BASE
    expect(activeDriver(s).id).toBe(1);
    expect(inFlag(s, s.drivers[1])).toBe(true);
    expect(options(s)).toMatchObject({ base: true, card: false });
    // รถที่หลุดไม่ขวางทาง และตาหน้ากลับเข้าสนาม
    s = { ...s, turn: 0, order: [0, 1, 2] };
    expect(options(s)).toMatchObject({ rejoin: true, base: false });
    s = choose(s, { kind: "rejoin" }, never);
    expect(s.drivers[0].off).toBe(false);
  });

  it("ธงเหลืองหายเมื่อจบรอบถัดไป", () => {
    let s = game();
    s = { ...at(s, [[0, 0], [20, 0]]), flags: [{ from: 18, to: 22, until: 2 }] };
    s = playBase(s);
    s = playBase(s);
    expect(s.round).toBe(3);
    expect(s.flags).toHaveLength(0);
  });

  it("ชนออก = เซฟตี้คาร์: รถที่เหลือเรียงแถวบนเส้นแข่งหลังรถนำร่อง แล้วเริ่มรอบใหม่", () => {
    const pos = MOVE_DECK[ACTION_CARD].y;
    let s = topAction(topMove(at(game(3), [[0, 0], [pos, 1], [30, 0]]), 0, ACTION_CARD), "incident");
    s = playCard(s, seq(face("crash"), face("damage")));
    expect(s.drivers[0].out).toBe(true);
    const sc = events(s).find((e) => e.t === "sc");
    // คันนำ C อยู่ 30 → +12 ห่าง +3 จากคันที่เสียหาย
    expect(sc).toMatchObject({ at: 30 + 12 + 3 });
    expect(s.drivers[2]).toMatchObject({ progress: 44, lane: 0 });
    expect(s.drivers[1]).toMatchObject({ progress: 43, lane: 0, damage: true });
    expect(s.order).toEqual([2, 1]);
    expect(s.flags).toHaveLength(0);
    expect(standings(s).at(-1)?.id).toBe(0);
  });

  it("รถเสียหาย: เดินเองช่องละ 3 จนกว่าจะผ่าน V-BOX", () => {
    let s = patch(at(game(), [[14, 0], [30, 0]]), 0, { damage: true });
    expect(options(s)).toMatchObject({ worn: true, base: false, card: false });
    s = choose(s, { kind: "worn" }, never);
    expect(s.drivers[0].progress).toBe(14 + WORN_MOVE);
    s = choose(at(s, [[17, 0], [30, 0]]), { kind: "worn" }, never);
    expect(s.drivers[0].damage).toBe(false);
  });
});

describe("โทษ", () => {
  it("โทษค้าง: เข้าพิทแล้วต้องจอดเพิ่มอีกตา", () => {
    let s = patch(at(game(), [[34, 0], [2, 0]]), 0, { penalty: true, warn: true });
    s = choose(s, { kind: "pitIn" }, never);
    s = { ...s, turn: 0, order: [0, 1] };
    s = choose(s, { kind: "box", set: "red" }, never);
    expect(s.drivers[0]).toMatchObject({ compound: "red", penalty: false, pit: { inBox: true, served: true } });
    s = { ...s, turn: 0, order: [0, 1] };
    s = choose(s, { kind: "box" }, never);
    expect(s.drivers[0].pit?.inBox ?? false).toBe(false);
  });

  it("จบเรซทั้งที่ค้างโทษ ถอย 3 อันดับ", () => {
    const four: CarSpec[] = [...cars3, { name: "D", num: 4, team: 1, ai: false }];
    let s = newGame(four, ["ทีม", "ทีม 2"], track(), 1, () => 0.5, [0, 1, 2, 3]);
    s = at(s, [[35, 0], [34, 0], [34, 1], [33, 0]]);
    s = patch(s, 0, { penalty: true });
    for (let i = 0; i < 4; i++) s = playBase(s);
    expect(s.over).toBe(true);
    expect(s.finishOrder[0]).toBe(0);
    expect(standings(s).map((d) => d.id)).toEqual([1, 2, 3, 0]);
  });
});

describe("ฝน", () => {
  it("เริ่มเรซฝนตก: ทุกคันใส่ยางฝน ไพ่ MOVE ใช้แถวยางฝน และยางไม่สึก", () => {
    let s = at(game(2, RAIN_AT), [[0, 0], [20, 0]]);
    expect(isRain(s)).toBe(true);
    expect(s.drivers.every((d) => d.wet)).toBe(true);
    s = topMove(s, 0, TIRES_PLAIN);
    const p = choose(s, { kind: "card" }, never);
    expect(p.pending?.value).toBe(MOVE_DECK[TIRES_PLAIN].w);
    expect(commit(p, {}, never).drivers[0].wear).toBe(0);
  });

  it("ฝนตกแต่ใส่ยางแห้ง เปิดไพ่ที่มีรูปหมุน = หลุดออกนอกสนาม", () => {
    let s = patch(at(game(2, RAIN_AT), [[0, 0], [20, 0]]), 0, { wet: false });
    s = playCard(topMove(s, 0, SPIN_DRY));
    expect(s.drivers[0].off).toBe(true);
    expect(events(s).some((e) => e.t === "spin")).toBe(true);
  });

  it("ผ่าน V-BOX สลับยางให้ตรงกับอากาศ · ยางฝนบนทางแห้งได้แค่ BASE", () => {
    let s = patch(at(game(2, RAIN_AT), [[15, 0], [30, 0]]), 0, { wet: false });
    s = playBase(s);
    expect(s.drivers[0].wet).toBe(true);
    const dry = patch(at(game(), [[0, 0], [30, 0]]), 0, { wet: true });
    expect(options(dry)).toMatchObject({ base: true, card: false });
  });
});

describe("ไพ่ PITWALL", () => {
  it("เริ่มเกมทีมละ 3 ใบ และไพ่ MOVE ป้าย PITWALL จั่วเพิ่ม", () => {
    let s = at(game(), [[0, 0], [20, 0]]);
    expect(s.teams[0].pitwall).toHaveLength(PITWALL_START);
    s = playCard(topMove(s, 0, PITWALL_CARD), () => 0.5);
    expect(s.teams[0].pitwall).toHaveLength(PITWALL_START + 1);
  });

  it("ชาร์จแบต / สั่งบุก / ถนอมยาง", () => {
    let s = hand(patch(at(game(), [[0, 0], [20, 0]]), 0, { ers: 1, wear: 3, tokens: { attack: 0, block: 2, slip: 2, pass: 0 } }), 0, "charge", "attack", "tires");
    s = playPitwall(s, 0, never);
    expect(s.drivers[0].ers).toBe(2);
    s = playPitwall(s, 0, never);
    expect(s.drivers[0].tokens.attack).toBe(1);
    s = playPitwall(s, 0, never);
    expect(s.drivers[0].wear).toBe(2);
    expect(s.teams[0].pitwall).toHaveLength(0);
  });

  it("เล่นไม่ได้ก็ไม่เปลี่ยนอะไร (ERS เต็ม)", () => {
    const s = hand(at(game(), [[0, 0], [20, 0]]), 0, "charge");
    expect(canPitwall(s, "charge")).toBe(false);
    expect(playPitwall(s, 0, never)).toBe(s);
  });

  it("เรดาร์ฝน: อากาศ +2 วนกลับแดดออกเมื่อเลยขั้นสุดท้าย", () => {
    let s = hand({ ...at(game(), [[0, 0], [20, 0]]), weather: 4 }, 0, "radar", "radar");
    s = playPitwall(s, 0, never);
    expect(s.weather).toBe(6);
    s = playPitwall(s, 0, never);
    expect(s.weather).toBe(2);
  });

  it("ร้องเรียน: รถติดหน้าในเลนเดียวกัน (ต่างทีม) โดนใบเตือน", () => {
    let s = hand(at(game(3), [[5, 0], [30, 0], [6, 0]]), 0, "report");
    s = playPitwall(s, 0, never);
    expect(s.drivers[2].warn).toBe(true);
  });

  it("ทีมเวิร์ก: ตานี้ +1 และเพื่อนร่วมทีมขยับ 1 ช่อง", () => {
    let s = hand(at(game(), [[0, 0], [20, 0]]), 0, "teamSpeed");
    s = playPitwall(s, 0, never);
    expect(s.drivers[1].progress).toBe(21);
    s = playBase(s);
    expect(s.drivers[0].progress).toBe(BASE_MOVE + 1);
  });

  it("โหมด PUSH: วิ่งเท่าไพ่สึกที่เร็วที่สุดทุกตา ยางสึกทุกตา", () => {
    let s = hand(at(game(), [[30, 0], [0, 0]]), 0, "push");
    s = { ...s, turn: 1 };
    s = playPitwall(s, 0, never);
    expect(options(s).push).toBe(true);
    const p = choose(s, { kind: "push" }, never);
    expect(p.pending?.value).toBe(Math.max(...MOVE_DECK.filter((c) => c.tires).map((c) => c.r)));
    const out = commit(p, {}, never);
    expect(out.drivers[1].wear).toBe(2);
    expect(out.drivers[1].mode).toEqual({ kind: "push" });
  });

  it("โหมด PACE: ติดโค้งจนวิ่งไม่ครบระยะ = จบโหมด", () => {
    let s = hand(at(game(2, 1, track({ corners: [{ start: 3, end: 3 }] })), [[0, 0], [20, 0]]), 0, "pace");
    s = playPitwall(s, 0, never);
    const out = commit(choose(s, { kind: "pace" }, never), {}, never);
    expect(out.drivers[0].progress).toBe(3);
    expect(out.drivers[0].mode).toBeNull();
    expect(events(out).some((e) => e.t === "paceEnd")).toBe(true);
  });

  it("พิทสต็อปเร็ว: ถึงช่องพิทแล้วเปลี่ยนยางในตาเดียว", () => {
    let s = hand(patch(at(game(), [[34, 0], [2, 0]]), 0, { wear: WEAR_MAX }), 0, "quickBox");
    s = playPitwall(s, 0, never, "red");
    s = choose(s, { kind: "pitIn" }, never);
    expect(s.drivers[0]).toMatchObject({ compound: "red", wear: 0, pits: 1 });
    expect(s.drivers[0].pit).toMatchObject({ pos: BOX_AT, inBox: false, served: true });
  });
});

describe("ควอลิฟาย", () => {
  const cars: CarSpec[] = [
    { name: "P1", num: 1, team: 0, ai: false },
    { name: "P2", num: 2, team: 0, ai: false },
    ...Array.from({ length: 10 }, (_, i): CarSpec => ({ name: `AI${i}`, num: 10 + i, team: -1, ai: true })),
  ];

  it("Q1 ตัดครึ่ง Q2 ใช้ใบที่เก็บไว้ กริดครบ 12 คันไม่ซ้ำ", () => {
    let q = newQuali(cars, () => 0.5);
    expect(q.hands[0]).toHaveLength(2);
    expect(q.hands[5]).toHaveLength(0);
    q = runQ1(q, cars, { 0: 1, 1: 0 });
    expect(q.times[0]).toBe(q.hands[0][1]);
    expect(q.saved[0]).toBe(q.hands[0][0]);
    expect(q.times.every((t) => t !== null)).toBe(true);
    const q1Order = byTime(q);
    q = toQ2(q, cars);
    expect(q.q2).toEqual(q1Order.slice(0, 6));
    expect(q.locked).toEqual(q1Order.slice(6));
    q = finishQuali(q);
    expect(q.stage).toBe("done");
    expect(new Set(q.grid).size).toBe(12);
    expect(q.grid.slice(6)).toEqual(q1Order.slice(6));
  });

  it("รอบพิเศษใช้ได้ครั้งเดียว เร็วกว่าถึงนับ แล้วยางสึกครึ่งราง", () => {
    let q = runQ1(newQuali(cars, () => 0.5), cars, {});
    expect(canExtra(q, cars, 2)).toBe(false); // รถ AI
    const before = q.times[0]!;
    q = extraLap(q, cars, 0);
    expect(q.extra[0]).toBe(true);
    expect(q.times[0]).toBe(Math.min(before, q.last!.card));
    expect(canExtra(q, cars, 0)).toBe(false);
    expect(HALF_WEAR).toBe(WEAR_MAX / 2);
  });
});

describe("จำลองเรซเต็มพร้อมเหตุการณ์", () => {
  const seeded = (seed: number): Rng => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it("ฝน เหตุการณ์ และไพ่ PITWALL — เล่นจนจบไม่ค้าง", () => {
    for (const seed of [3, 11, 99, 2024]) {
      const rng = seeded(seed);
      const field: CarSpec[] = [
        ...cars3,
        { name: "D", num: 4, team: 1, ai: false, compound: "red" },
        ...Array.from({ length: 8 }, (_, i): CarSpec => ({ name: `AI${i}`, num: 20 + i, team: -1, ai: true })),
      ];
      const t = track({ corners: [{ start: 8, end: 9 }, { start: 20, end: 22 }], drs: [{ start: 24, end: 30 }] });
      let s = newGame(field, ["ทีม", "ทีม 2"], t, 4, rng, undefined, { weather: 4 });
      let steps = 0;
      while (!s.over && steps < 4000) {
        steps++;
        if (s.pending) {
          s = commit(s, { ers: true, attack: true, block: rng() < 0.3 }, rng);
          continue;
        }
        const d = activeDriver(s);
        const h = s.teams[d.team].pitwall;
        const k = h.findIndex((id) => canPitwall(s, PITWALL_DECK[id].kind));
        if (k >= 0 && rng() < 0.4) {
          s = playPitwall(s, k, rng, "red");
          continue;
        }
        const o = options(s);
        const kind =
          o.inBox ? "box"
          : o.pitLane ? "pitLane"
          : o.rejoin ? "rejoin"
          : o.pitIn && (o.worn || d.wear >= WEAR_MAX - 1) ? "pitIn"
          : o.worn ? "worn"
          : o.push ? "push"
          : o.pace ? "pace"
          : o.drs ? "drs"
          : o.card ? "card"
          : "base";
        const next = choose(s, { kind, box: d.wear >= WEAR_MAX - 1 }, rng);
        expect(next, `ค้างที่ ${kind}`).not.toBe(s);
        s = next;
      }
      expect(s.over).toBe(true);
      const out = s.drivers.filter((x) => x.out).length;
      expect(s.finishOrder.length + out).toBe(field.length);
    }
  });
});

describe("รถ AI เดินทีละคัน (stepAI)", () => {
  it("ผู้เล่นเดินแล้วรถ AI ยังไม่ขยับ จนกว่าจะเรียก aiStep ทีละคัน", async () => {
    const { aiStep, aiTurnPending } = await import("@/lib/boardgame/engine");
    const field: CarSpec[] = [
      { name: "P", num: 1, team: 0, ai: false },
      { name: "B1", num: 8, team: -1, ai: true },
      { name: "B2", num: 9, team: -1, ai: true },
    ];
    let s = newGame(field, ["ทีม"], track(), 4, () => 0.5, [0, 1, 2], { stepAI: true });
    expect(activeDriver(s).id).toBe(0);
    s = playBase(s, () => 0.5);
    expect(aiTurnPending(s)).toBe(true);
    expect(s.feed).toHaveLength(1);
    // เดินทีละคัน: แต่ละครั้งเพิ่มบันทึก 1 บรรทัด จนวนกลับมาถึงผู้เล่น
    let n = 1;
    while (aiTurnPending(s)) {
      s = aiStep(s, () => 0.5);
      expect(s.feed).toHaveLength(++n);
    }
    expect(n).toBeGreaterThan(2);
    expect(activeDriver(s).id).toBe(0);
  });
});
