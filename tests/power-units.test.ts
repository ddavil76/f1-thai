import { describe, expect, it } from "vitest";
import {
  PU_INFO, PU_KEYS, decisionTh, findUsage, minSpare, nextChange, overBy,
  puLabel, puStatus, sessionTh, teamIdOf, type PuData, type PuUsed,
} from "@/lib/power-units";

/** ยอดใช้เริ่มต้น = ใช้ไป 1 ชิ้นทุกอย่าง (ยังไม่ถึงโควตาสักตัว) */
const used = (): PuUsed => Object.fromEntries(PU_KEYS.map((k) => [k, 1])) as PuUsed;

/** ยอดใช้เริ่มต้น ทับเฉพาะชิ้นที่เทสต์นั้นสนใจ */
const withKeys = (over: Partial<PuUsed>): PuUsed => ({ ...used(), ...over });

describe("โควตาและสถานะ", () => {
  it("ยังไม่ถึงโควตา = ปลอดภัย", () => {
    expect(puStatus(used())).toBe("safe");
    expect(overBy(used())).toBe(0);
  });

  it("ใช้ครบโควตาพอดี = ใกล้โดน (ยังไม่โดนโทษ)", () => {
    expect(puStatus(withKeys({ ICE: PU_INFO.ICE.limit }))).toBe("edge");
    expect(overBy(withKeys({ ICE: PU_INFO.ICE.limit }))).toBe(0);
  });

  it("เกินโควตา = โดนโทษแล้ว และนับจำนวนชิ้นที่เกิน", () => {
    const u = withKeys({ ICE: PU_INFO.ICE.limit + 2, ES: PU_INFO.ES.limit + 1 });
    expect(puStatus(u)).toBe("penalized");
    expect(overBy(u)).toBe(3);
  });

  it("minSpare คืนชิ้นที่เหลือเผื่อน้อยที่สุด", () => {
    expect(minSpare(withKeys({ ICE: PU_INFO.ICE.limit }))).toBe(0);
    expect(minSpare(withKeys({ ICE: PU_INFO.ICE.limit + 1 }))).toBe(-1);
  });
});

describe("nextChange", () => {
  it("ยังไม่ถึงโควตาเลย = ไม่มีโทษรออยู่", () => {
    expect(nextChange(used())).toEqual([]);
  });

  it("ชิ้นที่ครบโควตาพอดี เปลี่ยนอีกชิ้นโดน 10", () => {
    const r = nextChange(withKeys({ ICE: PU_INFO.ICE.limit }));
    expect(r).toEqual([{ penalty: 10, keys: ["ICE"] }]);
  });

  it("ชิ้นที่เกินไปแล้ว เปลี่ยนอีกชิ้นโดน 5", () => {
    const r = nextChange(withKeys({ ES: PU_INFO.ES.limit + 1 }));
    expect(r).toEqual([{ penalty: 5, keys: ["ES"] }]);
  });

  it("มีทั้งสองแบบ เรียง 10 ก่อน 5", () => {
    const r = nextChange(withKeys({ ICE: PU_INFO.ICE.limit, ES: PU_INFO.ES.limit + 1 }));
    expect(r.map((x) => x.penalty)).toEqual([10, 5]);
  });
});

describe("teamIdOf", () => {
  // ชื่อทีมใน FIA พ่วงชื่อผู้ผลิตเครื่อง — ต้องจับชื่อทีมก่อนชื่อเครื่อง
  it.each([
    ["Haas Ferrari", "haas"],
    ["Racing Bulls Honda RBPT", "rb"],
    ["Oracle Red Bull Racing", "red_bull"],
    ["Stake Sauber Ferrari", "audi"],
    ["Mercedes-AMG Petronas", "mercedes"],
    ["Scuderia Ferrari", "ferrari"],
    ["ทีมที่ไม่รู้จัก", ""],
  ])("%s → %s", (fia, want) => {
    expect(teamIdOf(fia)).toBe(want);
  });
});

describe("findUsage", () => {
  const data = {
    drivers: [
      { number: "81", driver: "Oscar Piastri", team: "McLaren", used: used() },
      { number: "44", driver: "Lewis Hamilton", team: "Ferrari", used: used() },
      { number: "27", driver: "Nico Hulkenberg", team: "Sauber", used: used() },
    ],
  } as PuData;

  it("จับคู่จากชื่อเต็ม", () => {
    expect(findUsage(data, { givenName: "Oscar", familyName: "Piastri" })?.number).toBe("81");
  });

  it("จับคู่จากนามสกุลเมื่อชื่อต้นเขียนต่างกัน", () => {
    expect(findUsage(data, { givenName: "L.", familyName: "Hamilton" })?.number).toBe("44");
  });

  it("มองข้ามวรรณยุกต์/เครื่องหมาย (Hülkenberg ↔ Hulkenberg)", () => {
    expect(findUsage(data, { givenName: "Nico", familyName: "Hülkenberg" })?.number).toBe("27");
  });

  it("ตกมาที่เลขรถเมื่อชื่อไม่ตรงเลย", () => {
    expect(
      findUsage(data, { givenName: "ไม่", familyName: "รู้จัก", permanentNumber: "44" })?.driver,
    ).toBe("Lewis Hamilton");
  });

  it("คืน undefined เมื่อหาไม่เจอจริง ๆ", () => {
    expect(findUsage(data, { givenName: "ไม่", familyName: "มีจริง" })).toBeUndefined();
  });
});

describe("แปลข้อความ FIA เป็นไทย", () => {
  it.each([
    ["Drop of 10 grid positions", "ถอยกริด 10 อันดับ"],
    ["Start from the pit lane", "ออกสตาร์ทจากพิทเลน"],
    ["Start from the back of the grid", "ออกสตาร์ทท้ายกริด"],
    ["No further action", "ไม่มีโทษเพิ่ม"],
  ])("decisionTh: %s", (en, th) => expect(decisionTh(en)).toBe(th));

  it("ข้อความที่ไม่รู้จักส่งคืนตามเดิม", () => {
    expect(decisionTh("Something else entirely")).toBe("Something else entirely");
  });

  it.each([
    ["Free Practice 2", "FP2"],
    ["Qualifying", "ควอลิฟาย"],
    ["Sprint", "สปรินต์"],
  ])("sessionTh: %s", (en, th) => expect(sessionTh(en)).toBe(th));

  it("puLabel ตัด PU- ออก", () => {
    expect(puLabel("PU-CE")).toBe("CE");
    expect(puLabel("ICE")).toBe("ICE");
  });
});
