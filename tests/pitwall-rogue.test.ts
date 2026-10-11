import { describe, expect, it } from "vitest";
import { Room } from "@/lib/pitwall/room";
import { activeSets, combineMods, STRATEGY, UPGRADES } from "@/lib/pitwall/rogue/cards";
import { ACTS, buy, chooseEvent, chooseReward, choices, enter, finishRace, isRace, leaveShop, newRun, nodeOf, playerCar, raceCfg, targetOf, type RunState } from "@/lib/pitwall/rogue/run";

describe("Roguelike: แผนที่", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i: 2 ช่วง · เริ่มด้วยเรซ จบด้วยบอส · มีโรงงาน · ทุกโหนดไปถึงได้และไปต่อได้", (seed) => {
    const run = newRun(seed, 2, "tyre");
    expect(run.maps).toHaveLength(ACTS);
    for (const m of run.maps) {
      const rows = Math.max(...m.nodes.map((n) => n.row)) + 1;
      const first = m.nodes.filter((n) => n.row === 0);
      const last = m.nodes.filter((n) => n.row === rows - 1);
      expect(first.map((n) => n.kind)).toEqual(["race"]);
      expect(last.map((n) => n.kind)).toEqual(["boss"]);
      expect(m.nodes.some((n) => n.kind === "shop")).toBe(true);
      for (const n of m.nodes) {
        if (n.row < rows - 1) expect(n.next.length).toBeGreaterThan(0);
        if (n.row > 0) expect(m.nodes.some((p) => p.next.includes(n.id))).toBe(true);
        if (isRace(n.kind)) expect(n.circuit).toBeTruthy();
      }
    }
  });

  it("สุ่มด้วยเมล็ด: เมล็ดเดียวกันได้แผนที่เดิม", () => {
    expect(JSON.stringify(newRun(42, 1, "pit").maps)).toBe(JSON.stringify(newRun(42, 1, "pit").maps));
  });
});

/** เดินทั้งรันแบบอัตโนมัติ: เลือกโหนดแรก · เรซจำลองจนจบ (AI ขับรถเราแทน) · รับรางวัลแรก · โรงงานซื้อชิ้นแรกที่ซื้อได้ */
function autoRun(seed: number) {
  let run: RunState = newRun(seed, seed % 7, "battery");
  const seen: string[] = [];
  for (let guard = 0; guard < 40 && (run.status === "map" || run.status === "pending"); guard++) {
    if (run.status === "pending") {
      const p = run.pending!;
      if (p.kind === "reward") run = chooseReward(run, 0);
      else if (p.kind === "shop") {
        const i = p.items.findIndex((x) => x.price <= run.money && x.type === "upgrade");
        if (i >= 0) run = buy(run, i);
        run = leaveShop(run);
      } else run = chooseEvent(run, 1).run;
      continue;
    }
    const next = choices(run)[0];
    expect(next).toBeTruthy();
    run = enter(run, next.id);
    seen.push(next.kind);
    if (isRace(next.kind)) {
      const cfg = raceCfg(run, next, "medium");
      const room = new Room({ online: false, seed });
      room.join("me", "me");
      room.runRace(cfg);
      room.race!.cars[cfg.car].auto = true;
      room.handle("me", { t: "skip" });
      const pos = room.results!.findIndex((x) => x.id === cfg.car) + 1;
      run = finishRace(run, pos, !!room.results!.find((x) => x.id === cfg.car)?.out);
    }
  }
  return { run, seen };
}

describe("Roguelike: เดินทั้งรัน", () => {
  it.each([1, 2, 3, 4])("seed %i: จบรันได้ (แชมป์หรือหมดหัวใจ) · เงิน/หัวใจไม่ติดลบ · บันทึกผลทุกเรซ", (seed) => {
    const { run, seen } = autoRun(seed);
    expect(["won", "lost"]).toContain(run.status);
    expect(run.money).toBeGreaterThanOrEqual(0);
    expect(run.rep).toBeGreaterThanOrEqual(0);
    expect(run.log.length).toBe(seen.filter((k) => isRace(k as never)).length);
    if (run.status === "won") expect(run.act).toBe(ACTS - 1);
  });

  it("พลาดเป้าเสียหัวใจ · บอสเสีย 2 · หมดหัวใจ = แพ้", () => {
    let run = newRun(3, 0, "tyre");
    run = enter(run, choices(run)[0].id);
    run = finishRace(run, 14, false);
    expect(run.rep).toBe(2);
    expect(run.pending?.kind).toBe("reward");
    run = chooseReward(run, -1);
    expect(run.status).toBe("map");
    run.rep = 1;
    run = enter(run, choices(run)[0].id);
    const n = nodeOf(run, run.at!);
    if (isRace(n.kind)) {
      run = finishRace(run, 14, false);
      expect(run.status).toBe("lost");
    }
  });

  it("ทำได้ตามเป้า = ได้เงินโบนัส ไม่เสียหัวใจ", () => {
    let run = newRun(5, 0, "tyre");
    run = enter(run, choices(run)[0].id);
    const before = run.money;
    run = finishRace(run, 1, false);
    expect(run.rep).toBe(3);
    expect(run.money).toBeGreaterThan(before + 80);
  });
});

describe("Roguelike: เรซ", () => {
  it("ตั้งค่าเรซ: ผู้เล่นคุมคันเดียว · กริดครบทุกคัน · ทีมเราเริ่มช้า · การ์ดมีผล", () => {
    const run = newRun(9, 0, "tyre");
    const node = choices(run)[0];
    const cfg = raceCfg(run, node, "soft");
    expect(cfg.car).toBe(playerCar(run));
    expect(new Set(cfg.grid).size).toBe(14);
    expect(cfg.mods[cfg.car].wear).toBeLessThan(1);
    expect(cfg.mods[cfg.car].pace).toBeGreaterThan(1);
    expect(cfg.target).toBe(targetOf(run, node));
    const room = new Room({ online: false, seed: 1 });
    room.join("me", "me");
    room.runRace(cfg);
    expect(room.phase).toBe("race");
    expect(room.human(cfg.car)).toBe(true);
    expect(room.human(cfg.car + 1)).toBe(false);
    const snap = room.snapshot();
    expect(snap.run?.hand).toHaveLength(3);
    expect(snap.run?.energy).toBe(cfg.energy);
  });

  it("การ์ดกลยุทธ์: ใช้พลังทีม · ใบที่เล่นแล้วไปกองทิ้ง · ครบรอบได้พลัง +1 และจั่วเติม", () => {
    const run = newRun(11, 4, "battery");
    const cfg = raceCfg(run, choices(run)[0], "medium");
    cfg.deck = ["push", "push", "push", "save", "save"];
    cfg.energy = 1;
    const room = new Room({ online: false, seed: 2 });
    room.join("me", "me");
    room.runRace(cfg);
    room.handle("me", { t: "launch", car: cfg.car, kind: "ok" });
    for (let i = 0; i < 50 && !room.race!.started; i++) room.tick(100);
    expect(room.race!.started).toBe(true);
    expect(room.handle("me", { t: "card", car: cfg.car, idx: 0 })).toBeNull();
    let snap = room.snapshot();
    expect(snap.run!.energy).toBe(0);
    expect(snap.run!.hand).toHaveLength(2);
    expect(room.race!.cars[cfg.car].buffs?.length).toBe(1);
    expect(room.handle("me", { t: "card", car: cfg.car, idx: 0 })).not.toBeNull();
    // ครบหนึ่งรอบ
    for (let i = 0; i < 3000 && Math.floor(room.race!.cars[cfg.car].pos / 36) < 1; i++) room.tick(100);
    snap = room.snapshot();
    expect(snap.run!.energy).toBe(1);
    expect(snap.run!.hand).toHaveLength(3);
    // ไม่ใช่รถเรา
    expect(room.handle("me", { t: "card", car: cfg.car + 1, idx: 0 })).not.toBeNull();
  });
});

describe("Roguelike: การ์ด/โรงงาน/อีเวนต์", () => {
  it("รวมตัวปรับ: บวก/คูณถูก · สายครบ 3 ใบได้โบนัส", () => {
    const m = combineMods([UPGRADES.engine_map.mods, UPGRADES.aero_pkg.mods, UPGRADES.tyre_eng.mods, UPGRADES.whisperer.mods]);
    expect(m.pace).toBeCloseTo(-0.12 - 0.22 + 0.05, 5);
    expect(m.wear).toBeCloseTo(0.88 * 0.75, 5);
    expect(activeSets(["tyre_eng", "whisperer"])).toEqual([]);
    expect(activeSets(["engine_map", "suspension", "aero_pkg"])).toEqual(["pace"]);
    for (const k of Object.keys(STRATEGY)) expect(STRATEGY[k as keyof typeof STRATEGY].cost).toBeGreaterThan(0);
  });

  it("โรงงาน: ซื้อได้เมื่อเงินพอ · ซื้อซ้ำไม่ได้ · รักษาหัวใจไม่เกินสูงสุด", () => {
    let run = newRun(13, 1, "pit");
    run.status = "pending";
    run.at = run.maps[0].nodes[0].id;
    run.pending = {
      kind: "shop",
      items: [
        { type: "upgrade", id: "aero_pkg", price: 75, sold: false },
        { type: "heal", price: 60, sold: false },
      ],
    };
    run = buy(run, 0);
    expect(run.cards).toContain("aero_pkg");
    expect(run.money).toBe(25);
    expect(buy(run, 0)).toBe(run);
    expect(buy(run, 1)).toBe(run);
    run = leaveShop(run);
    expect(run.status).toBe("map");
  });

  it("อีเวนต์: เดิมพันเงินไม่พอเล่นไม่ได้ · สปอนเซอร์ทำให้เป้าเรซถัดไปยากขึ้น", () => {
    const run = newRun(17, 1, "pit");
    run.status = "pending";
    run.at = run.maps[0].nodes[0].id;
    run.pending = { kind: "event", event: "sponsor" };
    const r1 = chooseEvent(run, 0);
    expect(r1.run.money).toBe(run.money + 80);
    expect(r1.run.next.target).toBe(2);
    run.money = 10;
    run.pending = { kind: "event", event: "gamble" };
    expect(chooseEvent(run, 0).run).toBe(run);
  });
});
