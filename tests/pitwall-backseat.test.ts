import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { NO_BOOST } from "@/lib/pitwall/drive/race";
import { combine, PARTS, RACE_CARDS, riskOf, xpNeed } from "@/lib/pitwall/backseat/cards";
import { ACTS, buy, leaveShop, choices, chooseEvent, chooseReward, enter, FIELD, finishRace, isRace, levelChoices, newRun, nodeOf, raceSetup, START_REP, targetOf, type RunState } from "@/lib/pitwall/backseat/run";
import { callPit, chooseCard, createSession, heroCar, paused, stepSession } from "@/lib/pitwall/backseat/session";

/** เดินไปโหนดแรกที่เป็นชนิดนี้ (ถ้ามีให้เลือก) */
function goKind(run: RunState, kinds: string[]) {
  const n = choices(run).find((x) => kinds.includes(x.kind)) ?? choices(run)[0];
  return { run: enter(run, n.id), node: n };
}

describe("แผนที่และรัน", () => {
  it("ทุกช่วงมีบอสแถวสุดท้าย ทุกโหนดไปต่อได้ และมีโรงงาน 1–2 แห่ง", () => {
    for (let s = 1; s <= 30; s++) {
      const run = newRun(s, s % 7);
      expect(run.maps).toHaveLength(ACTS);
      for (const m of run.maps) {
        const last = m.nodes.filter((n) => n.row === m.rows - 1);
        expect(last).toHaveLength(1);
        expect(last[0].kind).toBe("boss");
        for (const n of m.nodes) if (n.row < m.rows - 1) expect(n.next.length).toBeGreaterThan(0);
        const shops = m.nodes.filter((n) => n.kind === "shop");
        expect(shops.length).toBeGreaterThanOrEqual(1);
        expect(shops.length).toBeLessThanOrEqual(2);
        expect(m.nodes.filter((n) => n.row === 0).every((n) => n.kind !== "shop")).toBe(true);
        for (const n of m.nodes) if (isRace(n.kind)) expect(n.circuit).toBeTruthy();
      }
    }
  });

  it("พลาดเป้า = เสียหัวใจ · ได้รางวัลชิ้นส่วน · หัวใจหมด = จบรัน", () => {
    let { run } = goKind(newRun(7, 2), ["race", "sprint"]);
    run = finishRace(run, FIELD, false, 2);
    expect(run.rep).toBe(START_REP - 1);
    expect(run.pending?.kind).toBe("reward");
    const opts = run.pending?.kind === "reward" ? run.pending.options : [];
    expect(opts).toHaveLength(3);
    run = chooseReward(run, 0);
    expect(run.parts).toContain(opts[0]);
    expect(run.status).toBe("map");
    // ข้ามรางวัล = ได้เงินแทน
    ({ run } = goKind(run, ["race", "sprint"]));
    const money = run.money;
    run = finishRace(run, 1, false);
    expect(run.money).toBeGreaterThan(money);
    run = chooseReward(run, -1);
    expect(run.money).toBeGreaterThan(money + 20 - 1);
    // ออกนอกเรซกลางคัน (DNF) หลายครั้ง → หมดหัวใจ
    let r = newRun(9, 1);
    for (let i = 0; i < 30 && r.status !== "lost"; i++) {
      ({ run: r } = goKind(r, ["race", "sprint", "boss"]));
      if (r.pending?.kind === "shop") r = leaveShop(r);
      else if (r.pending?.kind === "event") r = chooseEvent(r, 0).run;
      else if (isRace(nodeOf(r, r.at!).kind)) r = finishRace(r, 1, true);
      if (r.pending?.kind === "reward") r = chooseReward(r, 0);
    }
    expect(r.status).toBe("lost");
  });

  it("โรงงานซื้อได้เมื่อเงินพอ · อีเวนต์จบแล้วกลับแผนที่", () => {
    for (let s = 1; s <= 40; s++) {
      const run = newRun(s, 0);
      const shop = choices(run).find((n) => n.kind === "shop");
      const ev = choices(run).find((n) => n.kind === "event");
      if (shop) {
        const r = { ...enter(run, shop.id), money: 500 };
        const items = r.pending?.kind === "shop" ? r.pending.items : [];
        const k = items.findIndex((i) => i.type === "part");
        const after = buy(r, k);
        expect(after.money).toBe(500 - items[k].price);
        expect(after.parts).toHaveLength(1);
        expect(buy(after, k)).toBe(after); // ซื้อซ้ำไม่ได้
        expect(buy({ ...r, money: 0 }, k).parts).toHaveLength(0);
      }
      if (ev) {
        const { run: after } = chooseEvent(enter(run, ev.id), 0);
        expect(after.pending).toBeNull();
        expect(after.status).toBe("map");
      }
    }
  });

  it("กริดเรซ: รถเรา 1 คัน ครบ 14 คัน ชิ้นส่วนเป็นบูสต์ของรถเรา", () => {
    const run = { ...newRun(3, 4), parts: ["p_engine", "p_floor"] };
    const node = choices(run).find((n) => isRace(n.kind))!;
    const st = raceSetup(run, node, "soft");
    expect(st.entrants).toHaveLength(FIELD);
    expect(st.entrants.filter((e) => e.hero)).toHaveLength(1);
    expect(st.entrants.find((e) => e.hero)!.id).toBe(st.hero);
    expect(st.boosts[st.hero].top).toBeCloseTo(1.005);
    expect(st.boosts[st.hero].grip).toBeCloseTo(1.012);
    expect(st.target).toBe(targetOf(run, node));
    expect(st.mustPit).toBe(node.kind !== "sprint");
  });

  it("การ์ดเลเวลอัป: 3 ใบ ไม่ซ้ำ เสี่ยงไม่เกิน 1 ใบ · รวมผล/ความเสี่ยงถูก", () => {
    for (let s = 1; s <= 200; s++) {
      const c = levelChoices({ s }, []);
      expect(c).toHaveLength(3);
      expect(new Set(c.map((x) => x.id)).size).toBe(3);
      expect(c.filter((x) => x.risk).length).toBeLessThanOrEqual(1);
    }
    expect(combine([], NO_BOOST)).toEqual(NO_BOOST);
    expect(combine(["r_top", "r_top"]).top).toBeCloseTo(1.01 ** 2);
    expect(combine(["r_focus", "p_coach"]).slack).toBeCloseTo(-0.012);
    expect(riskOf(["x_oc", "x_oc"]).engine).toBeCloseTo(1 - 0.88 ** 2);
    for (const c of [...RACE_CARDS, ...PARTS]) expect(c.text.length).toBeGreaterThan(3);
    expect(xpNeed(1)).toBeGreaterThan(xpNeed(0));
  });
});

describe("เรซ (session)", () => {
  let track: DriveTrack;
  beforeAll(async () => {
    track = buildDriveTrack("monza", await loadRawTrack("monza"))!;
  });

  const setupFor = (seed: number, parts: string[] = []) => {
    const run = { ...newRun(seed, 2), parts };
    const node = { ...choices(run).find((n) => isRace(n.kind))!, circuit: "monza" };
    return raceSetup(run, node, "medium");
  };

  it("เลเวลอัปหยุดเกมจนกว่าจะเลือกการ์ด · การ์ดมีผลกับรถทันที", () => {
    const s = createSession(track, setupFor(5));
    for (let i = 0; i < 3000 && !paused(s); i++) stepSession(s, 0.1);
    expect(paused(s)).toBe(true);
    const t = s.race.t;
    stepSession(s, 5);
    expect(s.race.t).toBe(t); // หยุดอยู่
    const before = { ...heroCar(s).boost };
    const card = s.offer![0];
    chooseCard(s, 0);
    expect(s.cards).toContain(card.id);
    expect(heroCar(s).boost).not.toEqual(before);
    if (!paused(s)) {
      stepSession(s, 1);
      expect(s.race.t).toBeGreaterThan(t);
    }
  }, 60000);

  it("สั่งเข้าพิทได้ · ยกเลิกได้ · เปลี่ยนเป็นยางที่สั่ง", () => {
    const s = createSession(track, setupFor(6));
    callPit(s, "hard");
    expect(heroCar(s).pitWant).toBe("hard");
    callPit(s, null);
    expect(heroCar(s).pitWant).toBeNull();
    callPit(s, "hard");
    let stopped = false;
    for (let i = 0; i < 6000 && !s.over; i++) {
      const ev = stepSession(s, 0.1);
      if (ev.some((e) => e.kind === "pitStop" && e.id === heroCar(s).id)) stopped = true;
      while (s.offer) chooseCard(s, 0);
    }
    expect(stopped).toBe(true);
    expect(heroCar(s).tyre.c).toBe("hard");
    expect(s.over).toBe(true);
  }, 60000);

  it("เครื่องพังจากการ์ดเสี่ยง: ช้าลง สั่งเข้าพิทเอง และซ่อมเสร็จเมื่อจอด", () => {
    const s = createSession(track, setupFor(8));
    // ใส่การ์ดเสี่ยงหลายใบให้พังแน่ ๆ
    s.cards.push(...Array(40).fill("x_oc"));
    let damagedSeen = false;
    let repaired = false;
    for (let i = 0; i < 6000 && !s.over && !repaired; i++) {
      stepSession(s, 0.1);
      while (s.offer) chooseCard(s, 0);
      if (s.damaged) {
        damagedSeen = true;
        expect(heroCar(s).pitWant !== null || heroCar(s).pit !== null).toBe(true);
      } else if (damagedSeen) repaired = true;
    }
    expect(damagedSeen).toBe(true);
    expect(repaired).toBe(true);
  }, 60000);
});
