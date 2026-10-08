import { describe, expect, it } from "vitest";
import {
  ACTION_DECK, ACTION_OURS, BACK_CELLS, ERS_BASE_CHARGE, ERS_MAX, PASS_NEED, PASS_NEED_DRS, FAST_CORNER_COST, SLOW_CORNER_COST, HAND_SIZE, TOW, DEFEND_ERS, DEFEND_EXTRA, FRESH_TURNS, AI_LEVEL, DAMP, DAMP_ROUNDS, NEUTRAL_ROUNDS, BASE_MOVE, ERS_DRS_BONUS, INCIDENT_DIE_OURS, MOVE_DECK, OFFLINE_PENALTY,
  PITWALL_DECK, PITWALL_OURS, RAIN_ROUNDS, WEAR_MAX,
  activeDriver, applyLaunch, canPitwall, choose, launchKind, stepCost, commit, moveFor, newGame, options, playPitwall, travel,
  type ActionKind, type CarSpec, type GameState, type IncidentFace, type Lane, type Rng, type Track,
} from "@/lib/boardgame/engine";

/** ทดสอบกติกาของเรา (ours) — เวอร์ชันง่ายที่เป็นค่าเริ่มต้นของหน้าเว็บ */
const never: Rng = () => {
  throw new Error("rng ไม่ควรถูกเรียก");
};
const seq = (...xs: number[]): Rng => () => {
  if (!xs.length) throw new Error("rng หมด");
  return xs.shift()!;
};
const face = (f: IncidentFace) => (INCIDENT_DIE_OURS.indexOf(f) + 0.5) / INCIDENT_DIE_OURS.length;

const track = (patch: Partial<Track> = {}): Track => ({
  lapCells: 36, corners: [], drs: [], pitEntry: { start: 33, end: 35 }, vbox: 18, ...patch,
});

const cars: CarSpec[] = [
  { name: "A", num: 1, team: 0, ai: false, compound: "yellow" },
  { name: "B", num: 2, team: 0, ai: false, compound: "red" },
  { name: "C", num: 3, team: 1, ai: false, compound: "yellow" },
];

const game = (n = 2, t: Track = track(), weather = 1): GameState => {
  const c = cars.slice(0, n);
  return newGame(c, ["ทีม", "ทีม 2"], t, 4, () => 0.5, c.map((_, i) => i), { rules: "ours", weather });
};
const at = (s: GameState, pos: [number, Lane][]): GameState => ({
  ...s,
  round: 2,
  turn: 0,
  order: pos.map((_, i) => i),
  drivers: s.drivers.map((d, i) => (pos[i] ? { ...d, progress: pos[i][0], lane: pos[i][1] } : d)),
});
const PLAIN = MOVE_DECK.findIndex((c) => !c.action && !c.pitwall && !c.tires && !c.ers && !c.spinDry && !c.spinWet);
const ACTION_CARD = MOVE_DECK.findIndex((c) => c.action && !c.pitwall && !c.tires && !c.spinDry && !c.spinWet);
/** กติกาของเรา: ใส่ไพ่ใบนี้ไว้ใบแรกในมือทีม 0 (เลือกเล่นโดยไม่ระบุใบ = ใบแรก) */
const topMove = (s: GameState, id: number): GameState => ({
  ...s,
  teams: s.teams.map((t, i) =>
    i === 0 ? { ...t, hand: [id, ...t.hand.filter((k) => k !== id)].slice(0, 3), moveDeck: t.moveDeck.filter((k) => k !== id) } : t,
  ),
});
const topAction = (s: GameState, kind: ActionKind): GameState => ({ ...s, actionDeck: [ACTION_DECK.indexOf(kind), ...s.actionDeck] });
const events = (s: GameState) => s.feed.flatMap((l) => l.events);

describe("กติกาของเรา", () => {
  it("ไม่มีเหรียญ ไม่มี DRS / SLIP / ATTACK / BLOCK", () => {
    const s = at(game(2, track({ drs: [{ start: 8, end: 14 }] })), [[9, 0], [10, 0]]);
    expect(s.drivers[0].tokens).toEqual({ attack: 0, block: 0, slip: 0 });
    expect(options(s)).toMatchObject({ drs: false, slip: false });
  });

  it("นอกเส้นแข่งเปิดไพ่ MOVE ได้ แต่ระยะ −1", () => {
    const s = topMove(at(game(), [[0, 1], [20, 0]]), PLAIN);
    expect(options(s).card).toBe(true);
    expect(choose(s, { kind: "card" }, never).pending?.value).toBe(MOVE_DECK[PLAIN].y - OFFLINE_PENALTY);
  });

  it("เดิน BASE โดยไม่ใช้ ERS ชาร์จคืน +0.5 · ต้องมีอย่างน้อย 1 ขั้นถึงใช้ได้", () => {
    const low = (ers: number) => ({ ...at(game(), [[0, 0], [30, 0]]), drivers: at(game(), [[0, 0], [30, 0]]).drivers.map((d, i) => (i === 0 ? { ...d, ers } : d)) });
    let s = commit(choose(low(1), { kind: "base" }, never), {}, never);
    expect(s.drivers[0].ers).toBe(1 + ERS_BASE_CHARGE);
    expect(s.feed[0].charged).toBe(ERS_BASE_CHARGE);
    // ใช้ ERS ตานั้น = ไม่ได้ชาร์จ
    s = commit(choose(low(1), { kind: "base" }, never), { ers: true }, never);
    expect(s.drivers[0].ers).toBe(0);
    // มีแค่ครึ่งขั้น ใช้ไม่ได้ เดินปกติแล้วชาร์จต่อ
    s = commit(choose(low(0.5), { kind: "base" }, never), { ers: true }, never);
    expect(s.drivers[0]).toMatchObject({ progress: BASE_MOVE, ers: 1 });
    // เต็มแล้วไม่ล้น
    s = commit(choose(low(ERS_MAX), { kind: "base" }, never), {}, never);
    expect(s.drivers[0].ers).toBe(ERS_MAX);
  });

  it("ERS ในโซน DRS ได้ +3", () => {
    const s = at(game(2, track({ drs: [{ start: 8, end: 20 }] })), [[9, 0], [30, 0]]);
    const out = commit(choose(s, { kind: "base" }, never), { ers: true }, never);
    expect(out.drivers[0].progress).toBe(9 + BASE_MOVE + ERS_DRS_BONUS);
  });

  it("ไม่ต้องหยุดในโค้ง แต่ช่องโค้งกินแรง: ทางปกติ 1 · โค้งความเร็วสูง 2 · โค้งความเร็วต่ำ 3", () => {
    const t = track({ corners: [{ start: 3, end: 4 }, { start: 8, end: 8, slow: true }] });
    const s = at(game(2, t), [[0, 0], [30, 0]]);
    expect([1, 3, 8].map((p) => stepCost(t, p))).toEqual([1, FAST_CORNER_COST, SLOW_CORNER_COST]);
    // 1+1 (ช่อง 1–2) + 2+2 (โค้งเร็ว 3–4) = 6 → ถึงช่อง 4 แรงหมดพอดี ไม่ต้องหยุดในโค้ง
    expect(travel(s, s.drivers[0], 6)).toMatchObject({ progress: 4, corner: true });
    // แรง 9: ถึงช่อง 4 ใช้ 6 แล้วช่อง 5–7 อีก 3 = 9 → ช่อง 7
    expect(travel(s, s.drivers[0], 9)).toMatchObject({ progress: 7 });
    // แรง 11: ช่อง 8 เป็นโค้งช้าใช้ 3 → ต้องมี 12 ถึงเข้าได้ จึงหยุดช่อง 7
    expect(travel(s, s.drivers[0], 11)).toMatchObject({ progress: 7 });
    expect(travel(s, s.drivers[0], 12)).toMatchObject({ progress: 8 });
  });

  it("แซงด้วยแรงเหลือ: ถึงช่องหลังคันหน้าต้องเหลือมากกว่า 2 ถึงแซงได้ แล้ววิ่งต่อจนครบ", () => {
    const s = at(game(2), [[0, 0], [3, 0]]);
    // ไปถึงช่อง 2 (หลังคันหน้า) เหลือ 2 — ไม่พอ
    expect(travel(s, s.drivers[0], 4)).toMatchObject({ progress: 2, blocked: true, stuck: { id: 1, left: 2, need: PASS_NEED } });
    // เหลือ 3 — แซงได้ จบช่อง 5
    expect(travel(s, s.drivers[0], 5)).toMatchObject({ progress: 5, passed: [1], stuck: null });
  });

  it("รถจอดคู่ 2 เลนนับเป็นคันเดียว · แซงหลายคันเช็กทีละคัน", () => {
    const s = at(game(3), [[0, 0], [3, 0], [3, 1]]);
    expect(travel(s, s.drivers[0], 6)).toMatchObject({ progress: 6, passed: [1, 2] });
    // คันแรกช่อง 3 คันที่สองช่อง 6: ถึงหลังคันที่สอง (ช่อง 5) เหลือ 2 — แซงได้แค่คันแรก
    const t = at(game(3), [[0, 0], [3, 0], [6, 0]]);
    expect(travel(t, t.drivers[0], 7)).toMatchObject({ progress: 5, passed: [1], stuck: { id: 2 } });
  });

  it("ในโซน DRS แซงง่ายขึ้น: เหลือมากกว่า 1 ก็พอ", () => {
    const s = at(game(2, track({ drs: [{ start: 0, end: 10 }] })), [[0, 0], [3, 0]]);
    expect(travel(s, s.drivers[0], 4)).toMatchObject({ progress: 4, passed: [1] });
    expect(travel(s, s.drivers[0], 3)).toMatchObject({ progress: 2, stuck: { need: PASS_NEED_DRS } });
  });

  it("ช่องปลายทางเต็มสองเลน ถอยมาจอดช่องว่างที่ใกล้ที่สุด", () => {
    const four: CarSpec[] = [...cars, { name: "D", num: 4, team: 1, ai: false }];
    const s0 = newGame(four, ["ทีม", "ทีม 2"], track(), 4, () => 0.5, [0, 1, 2, 3], { rules: "ours" });
    const s = at(s0, [[0, 0], [2, 0], [8, 0], [8, 1]]);
    expect(travel(s, s.drivers[0], 8)).toMatchObject({ progress: 7, passed: [1] });
  });

  it("ออกนอกขอบสนาม = ถอยหลัง 2 ช่องทันที ไม่มีใบเตือน", () => {
    const s = topAction(topMove(at(game(), [[0, 0], [30, 0]]), ACTION_CARD), "trackLimits");
    const out = commit(choose(s, { kind: "card" }, never), {}, never);
    expect(out.drivers[0].progress).toBe(MOVE_DECK[ACTION_CARD].y - BACK_CELLS);
    expect(out.drivers[0].warn).toBe(false);
    expect(events(out).some((e) => e.t === "back")).toBe(true);
  });

  it("เฉี่ยวชน: รถผู้เล่นทอยได้ชนออกจะกลายเป็นแค่รถเสียหาย", () => {
    const s = topAction(topMove(at(game(), [[0, 0], [30, 0]]), ACTION_CARD), "incident");
    const out = commit(choose(s, { kind: "card" }, never), {}, seq(face("crash")));
    expect(out.drivers[0]).toMatchObject({ out: false, damage: true });
    expect(events(out).find((e) => e.t === "incident")).toMatchObject({ rolls: [{ driver: 0, face: "damage" }] });
  });

  it("อากาศ แดด → เมฆ → ฝน → ทางหมาด → แดด ตามจำนวนเทิร์น", () => {
    let s = topAction(topMove(at(game(), [[0, 0], [30, 0]]), ACTION_CARD), "weather");
    s = commit(choose(s, { kind: "card" }, never), {}, never);
    expect(s.weather).toBe(3);
    s = { ...s, weather: 5, rainLeft: RAIN_ROUNDS };
    const round = () => {
      s = commit(choose(s, { kind: "base" }, never), {}, never);
      s = commit(choose(s, { kind: "base" }, never), {}, never);
    };
    for (let r = 0; r < RAIN_ROUNDS; r++) round();
    expect(s.weather).toBe(DAMP);
    expect(s.rainLeft).toBe(DAMP_ROUNDS);
    for (let r = 0; r < DAMP_ROUNDS; r++) round();
    expect(s.weather).toBe(1);
  });

  it("ยางผิดสภาพแค่ช้าลง: ยางแห้งในฝน −2 · ทางหมาด −1 · ยางฝนบนทางแห้งไม่ถูกล็อก", () => {
    const c = MOVE_DECK[PLAIN];
    const base = at(game(), [[0, 0], [30, 0]]);
    expect(moveFor({ ...base, weather: 5 }, c, base.drivers[0])).toBe(c.y - 2);
    expect(moveFor({ ...base, weather: DAMP }, c, base.drivers[0])).toBe(c.y - 1);
    const wet = { ...base, drivers: base.drivers.map((d, i) => (i === 0 ? { ...d, wet: true } : d)) };
    expect(options(wet).card).toBe(true);
    expect(moveFor(wet, c, wet.drivers[0])).toBe(c.w);
  });

  it("รถเสียหาย = VSC: ทุกคันได้แค่ BASE 2 เทิร์น เทิร์นสุดท้ายเป็น ENDING แล้วจบ", () => {
    let s = topAction(topMove(at(game(), [[0, 0], [30, 0]]), ACTION_CARD), "incident");
    s = commit(choose(s, { kind: "card" }, never), {}, seq(face("damage")));
    expect(s.neutral).toEqual({ kind: "vsc", left: NEUTRAL_ROUNDS });
    expect(events(s).some((e) => e.t === "vsc")).toBe(true);
    expect(options(s)).toMatchObject({ card: false });
    s = commit(choose(s, { kind: "base" }, never), {}, never); // จบเทิร์น
    expect(s.neutral).toEqual({ kind: "vsc", left: 1 });
    // A รถเสียหาย เดินเอง · B เดิน BASE → จบเทิร์น ENDING
    s = choose(at({ ...s }, [[10, 0], [30, 0]]), { kind: "worn" }, never);
    s = commit(choose(s, { kind: "base" }, never), {}, never);
    expect(s.neutral).toBeNull();
    expect(events(s).some((e) => e.t === "green")).toBe(true);
  });

  it("ช่วงเซฟตี้คาร์ห้ามแซง: ตามหลังคันหน้าทุกเลน", () => {
    const s = { ...at(game(3), [[0, 0], [3, 1], [30, 0]]), neutral: { kind: "sc" as const, left: 2 } };
    expect(travel(s, s.drivers[0], 4)).toMatchObject({ progress: 2, blocked: true });
  });

  it("แข่งแดดออกอย่างเดียว: ทั้งสองกติกาไม่มีไพ่ที่เปลี่ยนอากาศในกอง", () => {
    for (const rules of ["ours", "full"] as const) {
      const s = newGame(cars.slice(0, 2), ["ทีม"], track(), 4, () => 0.5, [0, 1], { rules });
      expect(s.weather).toBe(1);
      expect(s.actionDeck.some((i) => ["weather", "storm"].includes(ACTION_DECK[i]))).toBe(false);
      const pw = [...s.pwDeck, ...s.teams.flatMap((t) => t.pitwall)];
      expect(pw.some((i) => PITWALL_DECK[i].kind === "radar")).toBe(false);
    }
  });

  it("กองไพ่ ACTION / PITWALL มีเฉพาะแบบที่เข้าใจง่าย", () => {
    const s = game();
    expect(s.actionDeck.every((i) => ACTION_OURS.includes(ACTION_DECK[i]))).toBe(true);
    const all = [...s.pwDeck, ...s.teams.flatMap((t) => t.pitwall)];
    expect(all.every((i) => PITWALL_OURS.includes(PITWALL_DECK[i].kind))).toBe(true);
  });

  it("จำลองเรซเต็มด้วยกติกาของเรา เล่นจนจบไม่ค้าง", () => {
    const seeded = (seed: number): Rng => () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (const seed of [5, 17, 123]) {
      const rng = seeded(seed);
      const field: CarSpec[] = [
        ...cars,
        { name: "D", num: 4, team: 1, ai: false, compound: "red" },
        ...Array.from({ length: 8 }, (_, i): CarSpec => ({ name: `AI${i}`, num: 20 + i, team: -1, ai: true })),
      ];
      const t = track({ corners: [{ start: 8, end: 9 }, { start: 20, end: 22 }], drs: [{ start: 24, end: 30 }] });
      let s = newGame(field, ["ทีม", "ทีม 2"], t, 4, rng, undefined, { rules: "ours", weather: 3 });
      let steps = 0;
      while (!s.over && steps < 4000) {
        steps++;
        if (s.pending) {
          s = commit(s, { ers: true }, rng);
          continue;
        }
        const d = activeDriver(s);
        const k = s.teams[d.team].pitwall.findIndex((id) => canPitwall(s, PITWALL_DECK[id].kind));
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
          : o.card ? "card"
          : "base";
        const next = choose(s, { kind, box: d.wear >= WEAR_MAX - 1 }, rng);
        expect(next, `ค้างที่ ${kind}`).not.toBe(s);
        s = next;
      }
      expect(s.over).toBe(true);
      // รถผู้เล่นไม่ชนออกในกติกานี้
      expect(s.drivers.filter((x) => !x.ai && x.out)).toHaveLength(0);
    }
  });
});

describe("ออกตัวตอนไฟดับ", () => {
  it("แปลงเวลาเป็นผลออกตัว", () => {
    expect([150, 250, 400, 600].map(launchKind)).toEqual(["great", "good", "ok", "slow"]);
    expect(launchKind("jump")).toBe("jump");
  });

  it("จัดกริดใหม่ตามผล: ออกตัวสุดยอดแซง 2 อันดับ jump start หล่น 3", () => {
    const six: CarSpec[] = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, num: i + 1, team: 0, ai: false }));
    const s = newGame(six, ["ทีม"], track(), 4, () => 0.5, [0, 1, 2, 3, 4, 5], { rules: "ours", stepAI: true });
    const out = applyLaunch(s, { 3: "great", 0: "jump" });
    // คันที่ 0 หล่นไปหลัง → คันที่ 3 (ออกตัวสุดยอด) ชนะจังหวะเท่ากับคันที่ 1 ขึ้นนำ
    expect(out.order).toEqual([3, 1, 2, 0, 4, 5]);
    expect(out.drivers[3]).toMatchObject({ progress: 0, lane: 0 });
    expect(out.drivers[0]).toMatchObject({ progress: -1, lane: 1 });
    // หลังเริ่มเดินแล้วจัดใหม่ไม่ได้
    const moved = commit(choose(out, { kind: "base" }, never), {}, never);
    expect(applyLaunch(moved, { 5: "great" })).toBe(moved);
  });
});

describe("กติกาของเรา: ไพ่ในมือ สลิปสตรีม ปิดไลน์ ยางใหม่", () => {
  it("ถือไพ่ MOVE 3 ใบ เลือกใบไหนก็ได้ แล้วจั่วเติมให้ครบ", () => {
    const s = at(game(), [[0, 0], [30, 0]]);
    expect(s.teams[0].hand).toHaveLength(HAND_SIZE);
    const pick = s.teams[0].hand[2];
    const p = choose(s, { kind: "card", card: pick }, never);
    expect(p.pending?.card).toBe(pick);
    expect(p.teams[0].hand).toHaveLength(HAND_SIZE);
    expect(p.teams[0].hand).not.toContain(pick);
    expect(p.teams[0].moveDiscard).toContain(pick);
  });

  it("จบตาติดท้ายคันหน้า: ทางตรงตาหน้า +1 · ในโค้งตาหน้า −1", () => {
    let s = at(game(2), [[0, 0], [5, 0]]);
    s = commit(choose(s, { kind: "base" }, never), {}, never); // A ไปช่อง 4 ติดท้าย B
    expect(s.drivers[0].tow).toBe(TOW);
    const t = track({ corners: [{ start: 4, end: 5 }] });
    let c = at(game(2, t), [[0, 0], [5, 0]]);
    c = commit(choose(c, { kind: "base" }, never), {}, never); // ช่อง 1–3 ใช้ 3 · ช่อง 4 เป็นโค้ง ใช้ 2 เกินแรง → จอดช่อง 3
    expect(c.drivers[0].progress).toBe(3);
    const d = commit(choose(at(game(2, t), [[2, 0], [5, 0]]), { kind: "base" }, never), {}, never); // ช่อง 3 (1) + ช่อง 4 โค้ง (2) = 3 → ช่อง 4 ติดท้าย B ในโค้ง
    expect(d.drivers[0]).toMatchObject({ progress: 4, tow: -TOW });
    // ตาถัดไปได้/เสียแรงตามนั้น แล้วล้างค่า
    const next = commit(choose({ ...s, turn: 0, order: [0, 1], drivers: s.drivers.map((x, i) => (i === 1 ? { ...x, progress: 30 } : x)) }, { kind: "base" }, never), {}, never);
    expect(next.drivers[0]).toMatchObject({ progress: 4 + BASE_MOVE + TOW, tow: 0 });
  });

  it("ปิดไลน์: ใช้ ERS ครึ่งขั้น คันที่จะแซงต้องเหลือแรงมากขึ้น", () => {
    let s = at(game(2), [[10, 0], [0, 0]]);
    s = commit(choose(s, { kind: "base" }, never), { defend: true }, never);
    expect(s.drivers[0]).toMatchObject({ progress: 14, defending: true, ers: 3 - DEFEND_ERS });
    // B อยู่ช่อง 10 ถึงหลัง A (ช่อง 13) เหลือ 3 — ปกติแซงได้ แต่โดนปิดไลน์ต้องมากกว่า 3
    const b = { ...s, drivers: s.drivers.map((x, i) => (i === 1 ? { ...x, progress: 10 } : x)) };
    expect(travel(b, b.drivers[1], 6)).toMatchObject({ progress: 13, stuck: { need: PASS_NEED + DEFEND_EXTRA } });
    expect(travel(b, b.drivers[1], 7)).toMatchObject({ progress: 17 });
  });

  it("ยางใหม่จากพิท: 2 ตาแรกได้ +1", () => {
    let s = at(game(2), [[34, 0], [2, 0]]);
    s = choose(s, { kind: "pitIn" }, never);
    s = choose({ ...s, turn: 0, order: [0, 1] }, { kind: "box", set: "red" }, never);
    expect(s.drivers[0].fresh).toBe(FRESH_TURNS);
    const out = s.drivers[0].progress;
    s = commit(choose({ ...s, turn: 0, order: [0, 1] }, { kind: "base" }, never), {}, never);
    expect(s.drivers[0]).toMatchObject({ progress: out + BASE_MOVE + 1, fresh: FRESH_TURNS - 1 });
  });

  it("ระดับ AI: ยากวิ่งไกลกว่าง่าย", () => {
    const field: CarSpec[] = [{ name: "P", num: 1, team: 0, ai: false }, { name: "B", num: 9, team: -1, ai: true }];
    const run = (aiLevel: "easy" | "hard") =>
      newGame(field, ["ทีม"], track(), 4, () => 0.5, [1, 0], { rules: "ours", aiLevel }).drivers[1].progress;
    expect(run("hard") - run("easy")).toBe(AI_LEVEL.hard.add - AI_LEVEL.easy.add);
  });
});
