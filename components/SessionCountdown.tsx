import Countdown from "./Countdown";
import { getNextSession, nowMs, toDate, type Race } from "@/lib/f1";

/** นับถอยหลังไป session ถัดไปของสุดสัปดาห์ (ซ้อม/ควอลิฟาย/สปรินต์/เรซ) */
export default function SessionCountdown({ race }: { race: Race }) {
  const session = getNextSession(race);
  const target = session?.at ?? toDate({ date: race.date, time: race.time });
  if (!target) return null;

  const name = session?.label ?? "Race";
  const isRace = name === "Race";
  const kicker = isRace ? "ออกสตาร์ทอีก" : `${name} · เริ่มอีก`;
  const liveText = isRace ? "กำลังแข่งอยู่!" : `${name} กำลังแข่ง`;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        {kicker}
      </p>
      <Countdown
        target={target.toISOString()}
        serverNow={nowMs()}
        race={isRace}
        liveText={liveText}
      />
    </div>
  );
}
