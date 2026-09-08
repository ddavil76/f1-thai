import Countdown from "./Countdown";
import { getNextSession, toDate, type Race } from "@/lib/f1";

/** นับถอยหลังไป session ถัดไปของสุดสัปดาห์ (ซ้อม/ควอลิฟาย/สปรินต์/เรซ) */
export default function SessionCountdown({ race }: { race: Race }) {
  const session = getNextSession(race);
  const target = session?.at ?? toDate({ date: race.date, time: race.time });
  if (!target) return null;

  const isRace = !session || session.label === "🏁 Race";
  const name = session?.label.replace("🏁 ", "") ?? "Race";
  const kicker = isRace ? "ออกสตาร์ทอีก" : `${name} · เริ่มอีก`;
  const liveText = isRace ? "🔴 กำลังแข่งอยู่!" : `🟢 ${name} กำลังแข่ง`;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        {kicker}
      </p>
      <Countdown target={target.toISOString()} liveText={liveText} />
    </div>
  );
}
