import SessionTicker from "./SessionTicker";
import { getSessionWindows, nowMs, type Race } from "@/lib/f1";

/** นับถอยหลังไป session ถัดไปของสุดสัปดาห์ (ซ้อม/ควอลิฟาย/สปรินต์/เรซ) */
export default function SessionCountdown({ race }: { race: Race }) {
  const windows = getSessionWindows(race);
  if (windows.length === 0) return null;
  return <SessionTicker windows={windows} serverNow={nowMs()} />;
}
