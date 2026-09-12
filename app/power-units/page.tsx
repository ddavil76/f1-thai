import type { Metadata } from "next";
import Link from "next/link";
import { FileText, TriangleAlert } from "lucide-react";
import SectionTabs from "@/components/SectionTabs";
import PuCells from "@/components/PuCells";
import { getDriverStandings, type DriverStanding } from "@/lib/f1";
import {
  getPuUsage, findUsage, overBy, totalUsed, teamIdOf, decisionTh, sessionTh,
  PU_INFO, PU_KEYS, type PuDriver,
} from "@/lib/power-units";
import { teamColor } from "@/lib/teams";
import { SEASON } from "@/lib/season";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "ชิ้นส่วนเครื่องยนต์",
  description: `นักขับ F1 แต่ละคนใช้เครื่องยนต์ เทอร์โบ แบตเตอรี่ และชิ้นส่วน power unit ไปกี่ชิ้นในฤดูกาล ${SEASON} เทียบโควตา พร้อมโทษกริด`,
};

const thDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });

export default async function PowerUnitsPage() {
  const [pu, standings] = await Promise.all([
    getPuUsage(SEASON),
    getDriverStandings(SEASON).catch((): DriverStanding[] => []),
  ]);

  const header = (
    <header className="space-y-1">
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">
        ชิ้นส่วน<span className="text-(--color-f1)">เครื่องยนต์</span>
      </h1>
      <p className="text-sm text-white/50">
        ฤดูกาล {SEASON}
        {pu && ` · ข้อมูลถึง ${pu.event}`}
        {pu?.updated && ` · อัปเดต ${thDay(pu.updated)}`}
      </p>
      {pu && !pu.live && (
        <p className="text-xs text-amber-300/80">
          ดึงเอกสาร FIA ล่าสุดไม่สำเร็จ แสดงข้อมูลสำรองแทน
        </p>
      )}
    </header>
  );

  if (!pu) {
    return (
      <main className="mx-auto max-w-3xl space-y-6">
        {header}
        <p className="card p-6 text-center text-sm text-white/50">
          ยังไม่มีข้อมูลการใช้ชิ้นส่วนของฤดูกาล {SEASON}
        </p>
      </main>
    );
  }

  // แถวในเอกสาร FIA → นักขับใน Jolpica (ไว้ลิงก์ไปหน้านักขับ)
  const standingOf = new Map<string, DriverStanding>();
  for (const s of standings) {
    const row = findUsage(pu, s.Driver);
    if (row && !standingOf.has(row.number)) standingOf.set(row.number, s);
  }
  const constructorName = new Map(
    standings.flatMap((s) => {
      const c = s.Constructors.at(-1);
      return c ? [[c.constructorId, c.name] as const] : [];
    }),
  );

  const teamIdFor = (r: PuDriver) =>
    teamIdOf(r.team) || standingOf.get(r.number)?.Constructors.at(-1)?.constructorId || "";

  const teams = new Map<string, { id: string; name: string; rows: PuDriver[] }>();
  for (const r of pu.drivers) {
    const id = teamIdFor(r) || r.team;
    const team = teams.get(id) ?? { id, name: constructorName.get(id) ?? r.team, rows: [] };
    team.rows.push(r);
    teams.set(id, team);
  }

  const driverName = (r: PuDriver, className = "") => {
    const s = standingOf.get(r.number);
    return s ? (
      <Link href={`/driver/${s.Driver.driverId}`} className={`${className} hover:underline`}>
        {r.driver}
      </Link>
    ) : (
      <span className={className}>{r.driver}</span>
    );
  };
  const shortName = (r: PuDriver) => r.driver.split(" ").at(-1);

  const overList = pu.drivers.filter((r) => overBy(r.used) > 0);
  const maxIce = Math.max(...pu.drivers.map((r) => r.used.ICE));
  const iceTop = pu.drivers.filter((r) => r.used.ICE === maxIce);
  const leanest = [...pu.drivers].sort((a, b) => totalUsed(a.used) - totalUsed(b.used))[0];
  const ranked = [...pu.drivers].sort(
    (a, b) => overBy(b.used) - overBy(a.used) || totalUsed(b.used) - totalUsed(a.used),
  );

  const byTeam = (
    <div className="grid gap-4 md:grid-cols-2">
      {[...teams.values()].map((t) => (
        <section key={t.id} className="card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <span
              className="h-4 w-1 shrink-0 rounded-full"
              style={{ background: teamColor(t.id) }}
            />
            {t.name}
          </h2>
          <div className="mt-3 space-y-4">
            {t.rows.map((r) => {
              const over = overBy(r.used);
              return (
                <div key={r.number}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {driverName(r, "font-medium")}
                      <span className="ml-1.5 text-xs text-white/35">#{Number(r.number)}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs ${over > 0 ? "text-red-400" : "text-white/40"}`}
                    >
                      {over > 0 ? `เกินโควตา ${over} ชิ้น` : "ในโควตา"}
                    </span>
                  </div>
                  <PuCells used={r.used} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const byDriver = (
    <section className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-white/5 text-[11px] text-white/40">
              <th className="px-4 py-3 text-left font-medium">นักขับ</th>
              {PU_KEYS.map((k) => (
                <th key={k} title={PU_INFO[k].th} className="px-1 py-3 text-center font-semibold">
                  {k.replace("PU-", "")}
                  <span className="block font-normal text-white/25">/{PU_INFO[k].limit}</span>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">เกิน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ranked.map((r) => {
              const over = overBy(r.used);
              return (
                <tr key={r.number} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span
                        className="h-3 w-1 shrink-0 rounded-full"
                        style={{ background: teamColor(teamIdFor(r)) }}
                      />
                      {driverName(r, "font-medium")}
                    </span>
                  </td>
                  {PU_KEYS.map((k) => {
                    const n = r.used[k];
                    const limit = PU_INFO[k].limit;
                    return (
                      <td
                        key={k}
                        className={`px-1 py-2.5 text-center ${
                          n > limit
                            ? "font-bold text-red-400"
                            : n === limit
                              ? "text-amber-300"
                              : "text-white/70"
                        }`}
                      >
                        {n}
                      </td>
                    );
                  })}
                  <td
                    className={`px-4 py-2.5 text-right font-bold ${
                      over > 0 ? "text-red-400" : "text-white/25"
                    }`}
                  >
                    {over > 0 ? `+${over}` : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const penalties = pu.penalties.length > 0 && (
    <section className="space-y-2">
      <ul className="card divide-y divide-white/5 p-0">
        {pu.penalties.map((p) => (
          <li key={p.url} className="flex gap-3 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {p.driver}
                <span className="ml-2 text-xs font-normal text-white/45">
                  {p.event} · {sessionTh(p.session)}
                </span>
              </p>
              <p className="text-sm text-red-300">{decisionTh(p.decision)}</p>
              {p.elements.length > 0 && (
                <p className="mt-1 text-xs text-white/45">{p.elements.join(" · ")}</p>
              )}
            </div>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              aria-label="เปิดคำตัดสิน (PDF)"
              className="shrink-0 self-start text-white/30 transition hover:text-white/70"
            >
              <FileText className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-white/35">แสดงคำตัดสินจากสนามล่าสุด</p>
    </section>
  );

  const explainer = (
    <section className="card space-y-4 p-5">
      <ul className="divide-y divide-white/5">
        {PU_KEYS.map((k) => (
          <li key={k} className="flex items-center gap-3 py-2.5">
            <span className="w-14 shrink-0 text-xs font-bold text-white/60">{k}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{PU_INFO[k].th}</p>
              <p className="truncate text-xs text-white/40">{PU_INFO[k].en}</p>
            </div>
            <span className="shrink-0 text-sm text-white/60">
              โควตา <b className="text-white tabular-nums">{PU_INFO[k].limit}</b>
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 text-sm text-white/70">
        <p>โควตานับต่อนักขับทั้งฤดูกาล ใช้เกินเมื่อไหร่โดนโทษกริดในเรซถัดไป</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>เกินโควตาครั้งแรกของชิ้นนั้น ถอย 10 อันดับ</li>
          <li>ชิ้นถัด ๆ ไปของชนิดเดียวกัน ถอยชิ้นละ 5 อันดับ (รวมกันได้)</li>
          <li>เปลี่ยนชิ้นส่วนระหว่าง parc fermé โดยไม่ได้รับอนุญาต ต้องออกสตาร์ทจากพิทเลน</li>
        </ul>
      </div>
    </section>
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {header}

      <section className="card grid grid-cols-3 divide-x divide-white/5 p-0 text-center">
        <div className="p-4">
          <p className="display text-2xl font-bold tabular-nums">
            {overList.length}
            <span className="text-base text-white/35">/{pu.drivers.length}</span>
          </p>
          <p className="text-xs text-white/40">ใช้เกินโควตาแล้ว</p>
        </div>
        <div className="min-w-0 p-4">
          <p className="display text-2xl font-bold tabular-nums">{maxIce}</p>
          <p className="text-xs text-white/40">ICE มากสุด</p>
          <p className="truncate text-xs text-white/70">{iceTop.map(shortName).join(", ")}</p>
        </div>
        <div className="min-w-0 p-4">
          <p className="display text-2xl font-bold tabular-nums">{totalUsed(leanest.used)}</p>
          <p className="text-xs text-white/40">ใช้รวมน้อยสุด</p>
          <p className="truncate text-xs text-white/70">{shortName(leanest)}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
          ใช้ไปแล้ว
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          เหลือในโควตา
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-amber-300">3</span>
          ครบโควตาพอดี
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          เกินโควตา = โดนโทษกริด
        </span>
      </div>

      <SectionTabs
        tabs={[
          { key: "team", label: "ตามทีม", content: byTeam },
          { key: "driver", label: "เรียงตามนักขับ", content: byDriver },
          ...(penalties ? [{ key: "penalty", label: "โทษกริด", content: penalties }] : []),
          { key: "explain", label: "ชิ้นส่วนคืออะไร", content: explainer },
        ]}
      />

      <footer className="space-y-2 pb-8 text-center text-xs text-white/30">
        <p>
          ข้อมูลจากรายงาน Technical Delegate และคำตัดสินสจ๊วตของ FIA · ไม่เกี่ยวข้องกับ
          Formula 1 อย่างเป็นทางการ
        </p>
        {pu.sources.length > 0 && (
          <details className="mx-auto max-w-md text-left">
            <summary className="cursor-pointer text-center hover:text-white/50">
              เอกสารต้นทาง ({pu.sources.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {pu.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 transition hover:text-white/60"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </footer>
    </main>
  );
}
