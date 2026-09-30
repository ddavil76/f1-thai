import { describe, expect, it } from "vitest";
import { cardName, cardSessions, fitName, lastWinner, lightsLit, raceLaps, sessionCode } from "@/lib/widget-card";

describe("การ์ด widget", () => {
  it("ชื่อสนามสั้น: สนามที่รู้จักใช้ชื่อที่คนเรียก · สนามใหม่ตัดคำทั่วไปออก", () => {
    expect(cardName("sepang", "Sepang International Circuit")).toBe("SEPANG");
    expect(cardName("rodriguez", "Autódromo Hermanos Rodríguez")).toBe("MEXICO CITY");
    expect(cardName("new_one", "Kuala Lumpur Street Circuit")).toBe("KUALA LUMPUR");
  });

  it("จำนวนรอบ = 305 กม. ÷ ความยาวสนาม ปัดขึ้น (โมนาโก 260 กม.)", () => {
    expect(raceLaps("sepang", 5543)).toBe(56);
    expect(raceLaps("monaco", 3337)).toBe(78);
    expect(raceLaps("baku", 6003)).toBe(51);
    expect(raceLaps("x", null)).toBeNull();
  });

  it("ไฟสตาร์ทติดเพิ่มเมื่อใกล้เวลา เริ่มแล้วดับหมด", () => {
    const D = 86_400_000;
    expect(lightsLit(9 * D)).toBe(0);
    expect(lightsLit(4.5 * D)).toBe(1);
    expect(lightsLit(2.2 * D)).toBe(3);
    expect(lightsLit(5 * 60_000)).toBe(5);
    expect(lightsLit(0)).toBe(0);
    expect(lightsLit(-1000)).toBe(0);
  });

  it("ตารางสุดสัปดาห์: เวลาตามเขตเวลาของเครื่อง + จบแล้ว / ตัวถัดไป / กำลังแข่ง", () => {
    const at = (iso: string) => Date.parse(iso);
    const w = [
      { label: "ซ้อม 1", start: at("2026-10-02T04:30:00Z"), end: 0 },
      { label: "Qualifying", start: at("2026-10-03T08:00:00Z"), end: 0 },
      { label: "Race", start: at("2026-10-04T07:00:00Z"), end: 0 },
    ];
    const th = cardSessions(w, { next: "Q", live: false, tzMin: 420 });
    expect(th.map((s) => [s.code, s.day, s.time, s.state])).toEqual([
      ["FP1", "ศ. 2 ต.ค.", "11:30", "done"],
      ["Q", "ส. 3 ต.ค.", "15:00", "next"],
      ["RACE", "อา. 4 ต.ค.", "14:00", "todo"],
    ]);
    // ข้ามวันตามเขตเวลา (ลอนดอนหน้าร้อน +60)
    expect(cardSessions(w, { next: "FP1", live: true, tzMin: 60 })[0]).toMatchObject({ day: "ศ. 2 ต.ค.", time: "05:30", state: "live" });
    // ไม่รู้ตัวถัดไป = จบหมดแล้ว
    expect(cardSessions(w, { next: null, live: false, tzMin: 420 }).every((s) => s.state === "done")).toBe(true);
  });

  it("ผู้ชนะครั้งล่าสุดของสนาม (ปีล่าสุด)", () => {
    const r = (season: string, fam: string) => ({ season, Results: [{ Driver: { familyName: fam } }] });
    expect(lastWinner([r("2016", "Rosberg"), r("2017", "Verstappen"), r("2015", "Vettel")])).toEqual({ name: "VERSTAPPEN", year: 2017 });
    expect(lastWinner([])).toBeNull();
  });

  it("ขนาดชื่อพอดีความกว้าง ไม่เกินค่าสูงสุด ไม่เล็กกว่าขั้นต่ำ", () => {
    expect(fitName("SEPANG", 300, 64)).toBe(64);
    expect(fitName("MEXICO CITY", 140, 38)).toBeLessThan(38);
    expect(fitName("A VERY VERY LONG CIRCUIT NAME", 100, 38)).toBe(14);
  });

  it("รหัส session แบบ F1 จากชื่อใน lib/f1 (ใช้ร่วมกับ /api/widget)", () => {
    expect(["ซ้อม 1", "Sprint Quali", "Sprint", "Qualifying", "Race"].map(sessionCode)).toEqual([
      "FP1", "SQ", "SPRINT", "Q", "RACE",
    ]);
    expect(sessionCode("Shootout")).toBe("SHO");
  });
});
