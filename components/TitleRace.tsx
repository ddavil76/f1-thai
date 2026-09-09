import Link from "next/link";
import { Trophy } from "lucide-react";
import type { DriverStanding } from "@/lib/f1";
import { teamColor } from "@/lib/teams";

const WIN = 25;
const SPRINT_WIN = 8;

/**
 * ใครยังมีสิทธิ์คว้าแชมป์ — คิดจากแต้มสูงสุดที่เก็บได้จากสนามที่เหลือ
 * (ไม่ต้องยิง API เพิ่ม ใช้ตารางคะแนน + ปฏิทินที่โหลดอยู่แล้ว)
 */
export default function TitleRace({
  drivers,
  racesLeft,
  sprintsLeft,
}: {
  drivers: DriverStanding[];
  racesLeft: number;
  sprintsLeft: number;
}) {
  if (drivers.length < 2) return null;

  const maxLeft = racesLeft * WIN + sprintsLeft * SPRINT_WIN;
  const leader = drivers[0];
  const leaderPts = Number(leader.points);

  const rows = drivers.map((d) => {
    const pts = Number(d.points);
    const gap = leaderPts - pts;
    return { d, pts, gap, max: pts + maxLeft, alive: pts + maxLeft >= leaderPts };
  });
  const alive = rows.filter((r) => r.alive);
  const out = rows.length - alive.length;
  const clinched = racesLeft === 0 || alive.length === 1;

  // สเกล: แต้มสูงสุดที่ผู้นำไปถึงได้
  const axisMax = leaderPts + maxLeft || 1;
  const pct = (v: number) => `${Math.min(100, (v / axisMax) * 100)}%`;

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Trophy className="h-4 w-4 text-(--color-f1)" />
          ลุ้นแชมป์
        </h2>
        <span className="text-xs text-white/40">
          {racesLeft > 0
            ? `เหลือ ${racesLeft} สนาม · ชิงได้สูงสุด ${maxLeft} แต้ม`
            : "จบฤดูกาลแล้ว"}
        </span>
      </div>

      <p className="mb-4 text-sm text-white/60">
        {clinched ? (
          <>
            <span className="font-bold text-(--color-f1)">
              {leader.Driver.givenName.charAt(0)}. {leader.Driver.familyName}
            </span>{" "}
            คว้าแชมป์แล้ว 🏆
          </>
        ) : (
          <>
            ยังมีสิทธิ์{" "}
            <span className="font-bold text-white">{alive.length} คน</span>
            {out > 0 && <span className="text-white/40"> · หมดลุ้น {out} คน</span>}
          </>
        )}
      </p>

      <div className="space-y-2.5">
        {alive.slice(0, 8).map((r, i) => {
          const c = teamColor(r.d.Constructors.at(-1)?.constructorId);
          const need = racesLeft > 0 ? r.gap / racesLeft : 0;
          return (
            <div key={r.d.Driver.driverId}>
              <div className="mb-1 flex items-baseline gap-2 text-xs">
                <Link
                  href={`/driver/${r.d.Driver.driverId}`}
                  className="font-semibold transition hover:text-(--color-f1)"
                >
                  {r.d.Driver.givenName.charAt(0)}. {r.d.Driver.familyName}
                </Link>
                <span className="display tabular-nums text-white/70">{r.pts}</span>
                {i === 0 ? (
                  <span className="font-semibold text-(--color-f1)">ผู้นำ</span>
                ) : (
                  <span className="tabular-nums text-white/40">−{r.gap}</span>
                )}
                {i > 0 && racesLeft > 0 && (
                  <span className="ml-auto text-right text-[11px] tabular-nums text-white/35">
                    ต้องทำมากกว่าผู้นำ {need.toFixed(1)} แต้ม/สนาม
                  </span>
                )}
              </div>
              {/* แต้มปัจจุบัน (ทึบ) + แต้มที่ยังชิงได้ (จาง) */}
              <div className="relative h-2.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: pct(r.max), background: c, opacity: 0.28 }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: pct(r.pts), background: c }}
                />
                {/* เส้นแต้มผู้นำตอนนี้ */}
                <span
                  className="absolute inset-y-0 w-px bg-white/70"
                  style={{ left: pct(leaderPts) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        แถบทึบ = แต้มตอนนี้ · แถบจาง = แต้มสูงสุดที่ไปถึงได้ · เส้นขาว = แต้มผู้นำ
        ตอนนี้ · คิดที่ชนะทุกสนาม ({WIN} แต้ม
        {sprintsLeft > 0 ? ` + สปรินต์ ${SPRINT_WIN}` : ""})
      </p>
    </section>
  );
}
