import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import CompareSelect from "@/components/CompareSelect";
import H2HBar from "@/components/H2HBar";
import SiteFooter from "@/components/SiteFooter";
import {
  getDriverStandings, getDriverSeasonQualifying, getDriverSeasonResults, isClassifiedFinish,
  type DriverStanding, type RaceResult,
} from "@/lib/f1";
import {
  qualiHeadToHead, raceHeadToHead, roundByRound, summarizeDriver,
} from "@/lib/compare";
import { getDriverImages } from "@/lib/drivers";
import { teamColor, teamName } from "@/lib/teams";
import { SEASON } from "@/lib/season";

export const metadata: Metadata = {
  title: "เทียบนักขับ",
  description: `เทียบนักขับ F1 สองคนตรง ๆ — ควอลิฟาย ผลการแข่ง แต้ม และผลรายสนาม ฤดูกาล ${SEASON}`,
};

type Props = { searchParams: Promise<{ a?: string | string[]; b?: string | string[] }> };

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

const code = (s: DriverStanding) =>
  s.Driver.code ?? s.Driver.familyName.slice(0, 3).toUpperCase();

const finishLabel = (r: RaceResult | null) =>
  r ? (isClassifiedFinish(r.status) ? `P${r.position}` : "DNF") : "–";

export default async function ComparePage({ searchParams }: Props) {
  const [sp, standings] = await Promise.all([searchParams, getDriverStandings(SEASON)]);

  // ค่าจาก URL ที่ไม่มีในตารางคะแนน → ใช้อันดับ 1 กับ 2 แทน
  const byId = new Map(standings.map((s) => [s.Driver.driverId, s]));
  const a = byId.get(first(sp.a)) ?? standings[0];
  let b = byId.get(first(sp.b)) ?? standings.find((s) => s !== a);
  if (b === a) b = standings.find((s) => s !== a);

  const header = (
    <header className="space-y-1">
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">
        เทียบ<span className="text-(--color-f1)">นักขับ</span>
      </h1>
      <p className="text-sm text-white/50">ฤดูกาล {SEASON} · เลือกสองคนมาเทียบกันตรง ๆ</p>
    </header>
  );

  if (!a || !b) {
    return (
      <main className="mx-auto max-w-3xl space-y-6">
        {header}
        <p className="card p-6 text-center text-sm text-white/50">
          ยังไม่มีข้อมูลนักขับของฤดูกาล {SEASON}
        </p>
        <SiteFooter source="jolpica" />
      </main>
    );
  }

  const [aResults, bResults, aQuali, bQuali, photos] = await Promise.all([
    getDriverSeasonResults(SEASON, a.Driver.driverId),
    getDriverSeasonResults(SEASON, b.Driver.driverId),
    getDriverSeasonQualifying(SEASON, a.Driver.driverId),
    getDriverSeasonQualifying(SEASON, b.Driver.driverId),
    getDriverImages([a.Driver, b.Driver]),
  ]);

  const sa = summarizeDriver(aResults);
  const sb = summarizeDriver(bResults);
  const { race } = raceHeadToHead(aResults, bResults);
  const quali = qualiHeadToHead(aQuali, bQuali);
  const rows = roundByRound(aResults, bResults);

  const aColor = teamColor(a.Constructors.at(-1)?.constructorId);
  const bTeamColor = teamColor(b.Constructors.at(-1)?.constructorId);
  // เพื่อนร่วมทีมสีเดียวกัน → ฝั่งขวาใช้ขาวแทน จะได้แยกออก
  const bColor = bTeamColor === aColor ? "rgb(255 255 255 / 0.35)" : bTeamColor;

  const stats: {
    label: string;
    a: number | null;
    b: number | null;
    better: "high" | "low";
    fmt?: (v: number) => string;
  }[] = [
    { label: "ชนะ", a: sa.wins, b: sb.wins, better: "high" },
    { label: "โพเดียม", a: sa.podiums, b: sb.podiums, better: "high" },
    { label: "จบดีที่สุด", a: sa.bestFinish, b: sb.bestFinish, better: "low", fmt: (v) => `P${v}` },
    { label: "อันดับจบเฉลี่ย", a: sa.avgFinish, b: sb.avgFinish, better: "low", fmt: (v) => v.toFixed(1) },
    { label: "ออกตัวเฉลี่ย", a: sa.avgGrid, b: sb.avgGrid, better: "low", fmt: (v) => v.toFixed(1) },
    { label: "ไม่จบการแข่ง", a: sa.dnfs, b: sb.dnfs, better: "low" },
  ];
  const tone = (mine: number | null, other: number | null, better: "high" | "low") => {
    if (mine == null || other == null || mine === other) return "text-white/70";
    const wins = better === "high" ? mine > other : mine < other;
    return wins ? "font-bold text-white" : "text-white/40";
  };

  const side = (s: DriverStanding, color: string) => {
    const photo = photos[s.Driver.driverId];
    const team = s.Constructors.at(-1);
    return (
      <Link
        href={`/driver/${s.Driver.driverId}`}
        className="flex min-w-0 flex-col items-center gap-2 p-4 text-center transition-colors hover:bg-white/[0.03]"
      >
        <span
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
          style={{
            boxShadow: `0 0 0 2px ${color}`,
            background: `color-mix(in srgb, ${color} 22%, transparent)`,
          }}
        >
          {photo && (
            <Image src={photo} alt="" fill sizes="64px" className="object-cover object-top" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold leading-tight">
            {s.Driver.givenName} <span className="uppercase">{s.Driver.familyName}</span>
          </span>
          <span className="block truncate text-xs text-white/50">
            {team && teamName(team.constructorId, team.name)}
          </span>
        </span>
        <span className="text-sm tabular-nums">
          <b>P{s.position}</b> <span className="text-white/50">· {s.points} แต้ม</span>
        </span>
      </Link>
    );
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {header}

      <CompareSelect
        drivers={standings.map((s) => ({
          id: s.Driver.driverId,
          name: `${s.Driver.givenName} ${s.Driver.familyName}`,
        }))}
        a={a.Driver.driverId}
        b={b.Driver.driverId}
      />

      <section className="card grid grid-cols-2 divide-x divide-white/5 p-0">
        {side(a, aColor)}
        {side(b, bTeamColor)}
      </section>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="text-lg font-bold">ปะทะกันตรง ๆ</h2>
          <p className="text-xs text-white/40">นับเฉพาะสนามที่ลงแข่งทั้งคู่</p>
        </div>
        {quali[0] + quali[1] > 0 && (
          <H2HBar label="ควอลิฟายนำ" a={quali[0]} b={quali[1]} aColor={aColor} bColor={bColor} />
        )}
        <H2HBar label="จบก่อน" a={race[0]} b={race[1]} aColor={aColor} bColor={bColor} />
        <H2HBar
          label="แต้มสะสม"
          a={Number(a.points)}
          b={Number(b.points)}
          aColor={aColor}
          bColor={bColor}
        />
      </section>

      <section className="card overflow-hidden p-0">
        <div className="grid grid-cols-[1fr_auto_1fr] border-b border-white/5 px-4 py-3 text-xs font-bold text-white/50 sm:px-5">
          <span className="text-center">{code(a)}</span>
          <span className="text-center">สถิติทั้งฤดูกาล</span>
          <span className="text-center">{code(b)}</span>
        </div>
        <ul className="divide-y divide-white/5">
          {stats.map((s) => (
            <li
              key={s.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 text-sm tabular-nums sm:px-5"
            >
              <span className={`text-center ${tone(s.a, s.b, s.better)}`}>
                {s.a == null ? "–" : (s.fmt?.(s.a) ?? s.a)}
              </span>
              <span className="text-center text-xs text-white/45">{s.label}</span>
              <span className={`text-center ${tone(s.b, s.a, s.better)}`}>
                {s.b == null ? "–" : (s.fmt?.(s.b) ?? s.b)}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-white/5 px-4 py-2.5 text-[11px] text-white/35 sm:px-5">
          นับเฉพาะเรซหลัก ไม่รวมสปรินต์ · แต้มสะสมด้านบนรวมสปรินต์แล้ว
        </p>
      </section>

      {rows.length > 0 && (
        <section className="card overflow-hidden p-0">
          <div className="grid grid-cols-[1.5rem_1fr_3rem_3rem] items-center gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
            <h2 className="col-span-2 text-lg font-bold">ผลรายสนาม</h2>
            <span className="text-right text-xs font-bold text-white/50">{code(a)}</span>
            <span className="text-right text-xs font-bold text-white/50">{code(b)}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {rows.map((r) => (
              <li key={r.round}>
                <Link
                  href={`/race/${r.round}`}
                  className="grid grid-cols-[1.5rem_1fr_3rem_3rem] items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.04] sm:px-5"
                >
                  <span className="text-right tabular-nums text-white/40">{r.round}</span>
                  <span className="truncate">{r.raceName}</span>
                  <span
                    className={`text-right tabular-nums ${
                      r.winner === "a" ? "font-bold text-white" : "text-white/45"
                    }`}
                  >
                    {finishLabel(r.a)}
                  </span>
                  <span
                    className={`text-right tabular-nums ${
                      r.winner === "b" ? "font-bold text-white" : "text-white/45"
                    }`}
                  >
                    {finishLabel(r.b)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SiteFooter source="jolpica" />
    </main>
  );
}
