import { describe, expect, it } from "vitest";
import { buildIcs, type IcsEvent } from "@/lib/ics";

const enc = new TextEncoder();
const octets = (s: string) => enc.encode(s).length;
const lines = (ics: string) => ics.split("\r\n");

const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "u1@f1-week-race",
  title: "F1 Dutch Grand Prix — ซ้อม 1",
  start: new Date("2026-08-28T09:30:00Z"),
  end: new Date("2026-08-28T10:30:00Z"),
  ...over,
});

describe("buildIcs", () => {
  it("ห่อโครง VCALENDAR/VEVENT และปิดท้ายด้วย CRLF", () => {
    const out = buildIcs([ev()]);
    expect(lines(out)[0]).toBe("BEGIN:VCALENDAR");
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines(out)).toContain("BEGIN:VEVENT");
    expect(lines(out)).toContain("END:VEVENT");
  });

  it("แปลงเวลาเป็น UTC stamp", () => {
    const out = buildIcs([ev()]);
    expect(lines(out)).toContain("DTSTART:20260828T093000Z");
    expect(lines(out)).toContain("DTEND:20260828T103000Z");
  });

  it("escape อักขระที่ RFC 5545 สงวนไว้", () => {
    const out = buildIcs([ev({ title: String.raw`a,b;c\d`, location: "x,y" })]);
    expect(out).toContain(String.raw`SUMMARY:a\,b\;c\\d`);
    expect(out).toContain(String.raw`LOCATION:x\,y`);
  });

  // บั๊กเดิม: fold นับจำนวนตัวอักษร อักษรไทยตัวละ 3 bytes เลยทะลุ 75 octets ได้สบาย
  it.each([
    ["อังกฤษ", "F1 Dutch Grand Prix — Free Practice 1 at Circuit Zandvoort"],
    ["ไทยล้วน", "F1 กรังด์ปรีซ์เนเธอร์แลนด์ — ซ้อม 1 ที่สนามซานด์โวร์ทริมทะเลเหนือ"],
    ["อิโมจิ", "F1 " + "🏎️🏁🔥".repeat(30)],
  ])("ไม่มีบรรทัดไหนเกิน 75 octets (%s)", (_name, title) => {
    const out = buildIcs([ev({ title, description: title })], title);
    for (const line of lines(out)) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it("บรรทัดต่อขึ้นต้นด้วยช่องว่างเดียว", () => {
    const out = buildIcs([ev({ title: "ก".repeat(200) })]);
    const cont = lines(out).filter((l) => l.startsWith(" "));
    expect(cont.length).toBeGreaterThan(0);
    for (const l of cont) expect(l.startsWith("  ")).toBe(false);
  });

  it("unfold กลับแล้วได้ข้อความเดิม ไม่มีอักขระพัง", () => {
    const title = "F1 " + "🏎️🏁ซ้อม".repeat(20);
    const out = buildIcs([ev({ title })]);
    const unfolded = out.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
    expect(out).not.toContain("�");
  });

  it("ไม่ใส่ LOCATION/DESCRIPTION ถ้าไม่ได้ส่งมา", () => {
    const out = buildIcs([ev()]);
    expect(out).not.toContain("LOCATION:");
    expect(out).not.toContain("DESCRIPTION:");
  });
});
