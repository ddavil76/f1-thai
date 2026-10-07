import { describe, expect, it } from "vitest";
import {
  ACTION_DECK, ACTION_OURS, BACK_CELLS, DAMP, DAMP_ROUNDS, NEUTRAL_ROUNDS, BASE_MOVE, ERS_DRS_BONUS, INCIDENT_DIE_OURS, MOVE_DECK, OFFLINE_PENALTY,
  PITWALL_DECK, PITWALL_OURS, RAIN_ROUNDS, TOKEN_USES, WEAR_MAX,
  activeDriver, canPitwall, choose, commit, moveFor, newGame, options, playPitwall, travel,
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
const topMove = (s: GameState, id: number): GameState => ({
  ...s,
  teams: s.teams.map((t, i) => (i === 0 ? { ...t, moveDeck: [id, ...t.moveDeck.filter((k) => k !== id)] } : t)),
});
const topAction = (s: GameState, kind: ActionKind): GameState => ({ ...s, actionDeck: [ACTION_DECK.indexOf(kind), ...s.actionDeck] });
const events = (s: GameState) => s.feed.flatMap((l) => l.events);

describe("กติกาของเรา", () => {
  it("เหรียญแซงคันละ 2 ไม่มี DRS / SLIP / ATTACK / BLOCK", () => {
    const s = at(game(2, track({ drs: [{ start: 8, end: 14 }] })), [[9, 0], [10, 0]]);
    expect(s.drivers[0].tokens).toEqual({ attack: 0, block: 0, slip: 0, pass: TOKEN_USES });
    expect(options(s)).toMatchObject({ drs: false, slip: false });
  });

  it("นอกเส้นแข่งเปิดไพ่ MOVE ได้ แต่ระยะ −1", () => {
    const s = topMove(at(game(), [[0, 1], [20, 0]]), PLAIN);
    expect(options(s).card).toBe(true);
    expect(choose(s, { kind: "card" }, never).pending?.value).toBe(MOVE_DECK[PLAIN].y - OFFLINE_PENALTY);
  });

  it("ERS ในโซน DRS ได้ +3", () => {
    const s = at(game(2, track({ drs: [{ start: 8, end: 20 }] })), [[9, 0], [30, 0]]);
    const out = commit(choose(s, { kind: "base" }, never), { ers: true }, never);
    expect(out.drivers[0].progress).toBe(9 + BASE_MOVE + ERS_DRS_BONUS);
  });

  it("เหรียญแซง: +1 ช่อง และลอดผ่านจุดที่รถขวางเต็มทางได้ 1 จุด", () => {
    const s = at(game(3), [[0, 0], [3, 0], [3, 1]]);
    expect(travel(s, s.drivers[0], 6)).toMatchObject({ progress: 2, blocked: true });
    const out = commit(choose(s, { kind: "base" }, never), { pass: true }, never);
    expect(out.drivers[0].progress).toBe(BASE_MOVE + 1);
    expect(out.drivers[0].tokens.pass).toBe(TOKEN_USES - 1);
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
          s = commit(s, { ers: true, pass: rng() < 0.3 }, rng);
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
