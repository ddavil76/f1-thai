"use client";
import { useEffect, useState } from "react";
import Countdown from "./Countdown";
import { pickSession, type SessionWindow } from "@/lib/race-window";

/** เช็กบ่อยแค่ไหนว่า session ปัจจุบันจบหรือยัง — ช้าไปไม่กี่วินาทีไม่เป็นไร */
const RECHECK_MS = 15_000;

/**
 * เลือก session ถัดไปฝั่ง client — หน้าถูกแคชไว้ (ISR) ถ้าเลือกครั้งเดียวตอน render
 * พอ session เริ่มแล้วจะค้าง "กำลังแข่ง" ไปจนกว่าหน้าจะถูกสร้างใหม่ แม้จบไปนานแล้วก็ตาม
 */
export default function SessionTicker({
  windows,
  serverNow,
}: {
  windows: SessionWindow[];
  serverNow: number;
}) {
  // เริ่มจาก serverNow ให้ตรงกับ HTML ที่ render มา แล้วค่อยใช้นาฬิกาเครื่องหลัง hydrate
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, RECHECK_MS);
    return () => clearInterval(id);
  }, []);

  const session = pickSession(windows, now);
  if (!session) return null;

  const isRace = session.label === "Race";
  const kicker = isRace ? "ออกสตาร์ทอีก" : `${session.label} · เริ่มอีก`;
  const liveText = isRace ? "กำลังแข่งอยู่!" : `${session.label} กำลังแข่ง`;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        {kicker}
      </p>
      <Countdown
        key={session.label}
        target={new Date(session.start).toISOString()}
        serverNow={now}
        race={isRace}
        liveText={liveText}
      />
    </div>
  );
}
