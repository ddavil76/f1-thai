import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { applyCard, CARDS, computeStats, FAC_MAX, LIMP_TOP, makeHand, newDeck, TIER_MAX, xpCost } from "@/lib/pitwall/gambit/cards";
import { callPit, chooseCard, createSession, heroCar, heroCrew, posOf, stepSession, type Setup } from "@/lib/pitwall/gambit/session";

let monza: DriveTrack;
beforeAll(async () => {
  monza = buildDriveTrack("monza", await loadRawTrack("monza"))!;
});

const SETUP: Setup = { circuit: "monza", laps: 3, difficulty: "normal", startTyre: "medium", team: 0, field: 12, seed: 3 };

describe("โหมดกลยุทธ์: การ์ด", () => {
  it("มี 22 ใบ 6 หมวด · อัปได้ 3 ขั้น · หมวดเต็ม 6 ช่อง", () => {
    expect(CARDS).toHaveLength(22);
    const seed = { s: 1 };
    const d = newDeck();
    for (let k = 0; k < 3; k++) applyCard(seed, d, { id: "engine" }, 0, 40);
    expect(d.cards.engine).toBe(TIER_MAX);
    applyCard(seed, d, { id: "engine" }, 0, 40);
    expect(d.cards.engine).toBe(TIER_MAX);
    for (const id of ["drag", "tgrip"]) applyCard(seed, d, { id }, 0, 40);
    expect(d.fac.speed).toBe(FAC_MAX);
  });

  it("การ์ดเพิ่มค่า · การ์ดทองชั่วคราว · เครื่องรวนลดความเร็ว", () => {
    const seed = { s: 2 };
    const d = newDeck();
    const base = computeStats(d, 0).boost.top;
    applyCard(seed, d, { id: "drag" }, 0, 40);
    expect(computeStats(d, 0).boost.top).toBeGreaterThan(base);
    const one = computeStats(d, 0).boost.top;
    applyCard(seed, d, { id: "drag", gold: true }, 0, 40);
    expect(computeStats(d, 10).boost.top).toBeGreaterThan(one);
    expect(computeStats(d, 41).boost.top).toBeCloseTo(one);
    d.limpUntil = 100;
    expect(computeStats(d, 50).boost.top).toBeCloseTo(computeStats(d, 120).boost.top * LIMP_TOP);
  });

  it("มือการ์ด: 3 ใบไม่ซ้ำ · ใบที่ครบแล้วกลายเป็นการ์ดทอง · การ์ดเสี่ยงข้ามไปขั้น 3", () => {
    const seed = { s: 5 };
    const d = newDeck();
    for (let k = 0; k < 50; k++) {
      const h = makeHand(seed, d)!;
      expect(new Set(h.map((x) => x.id)).size).toBe(h.length);
      for (const x of h) if (!x.gold) expect(d.cards[x.id] ?? 0).toBeLessThan(TIER_MAX);
      for (const x of h) if (x.gold) expect(d.cards[x.id]).toBe(TIER_MAX);
      applyCard(seed, d, h[0], 0, 40);
    }
    const d2 = newDeck();
    applyCard(seed, d2, { id: "kick", risky: { chance: 0, window: 30 } }, 0, 40);
    expect(d2.cards.kick).toBe(TIER_MAX);
    expect(d2.fac.boost).toBe(TIER_MAX);
  });

  it("XP ต่อเลเวลตามระยะการแข่ง", () => {
    expect(xpCost(3, 5800)).toBeGreaterThanOrEqual(5);
    expect(xpCost(8, 5800)).toBeGreaterThan(xpCost(3, 5800));
  });
});

describe("โหมดกลยุทธ์: การแข่ง", { timeout: 60000 }, () => {
  it("แข่งจนจบ: เลเวลอัปเลือกการ์ดได้ · AI ก็อัปเกรด · สั่งพิทได้", () => {
    const s = createSession(monza, SETUP);
    const rc = heroCar(s);
    expect(rc.hero).toBe(true);
    let picks = 0;
    let pitted = false;
    for (let k = 0; k < 60 * 60 && !s.over; k++) {
      stepSession(s, 0.5);
      if (s.offer) {
        chooseCard(s, 0);
        picks++;
      }
      if (!pitted && rc.car.lap >= 1 && rc.tyre.wear > 0.4) {
        callPit(s, "soft");
        pitted = true;
      }
    }
    expect(s.over).toBe(true);
    expect(picks).toBeGreaterThan(10);
    expect(heroCrew(s).level).toBeGreaterThan(10);
    expect(rc.pits).toBe(1);
    expect(rc.boost.top).toBeGreaterThanOrEqual(1);
    // AI เลือกการ์ดด้วย
    expect(s.crews.filter((c, i) => i !== s.hero && Object.keys(c.deck.cards).length > 0).length).toBeGreaterThan(5);
    expect(posOf(s, s.hero)).toBeGreaterThan(0);
  });

  it("อัปเกรดช่วยให้เร็วขึ้นจริง: รถเราที่เลือกการ์ดจบดีกว่าไม่เลือกเลย (เฉลี่ยหลายเมล็ด)", () => {
    const run = (choose: boolean, seed: number) => {
      const s = createSession(monza, { ...SETUP, seed });
      for (let k = 0; k < 60 * 60 && !s.over; k++) {
        stepSession(s, 0.5);
        if (s.offer) {
          if (choose) chooseCard(s, 0);
          else s.offer = null;
        }
      }
      return posOf(s, s.hero);
    };
    let withCards = 0;
    let without = 0;
    for (const seed of [1, 2, 3, 4]) {
      withCards += run(true, seed);
      without += run(false, seed);
    }
    expect(withCards).toBeLessThan(without);
  });
});
