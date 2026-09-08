import Link from "next/link";
import type { DriverRaceResult } from "@/lib/f1";

function Bar({ label, a, b }: { label: string; a: number; b: number }) {
  const total = a + b || 1;
  const aPct = (a / total) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold tabular-nums text-white/80">{a}</span>
        <span className="text-white/40">{label}</span>
        <span className="font-semibold tabular-nums text-white/50">{b}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="grow-x bg-(--color-f1)" style={{ width: `${aPct}%` }} />
        <div className="flex-1 bg-white/25" />
      </div>
    </div>
  );
}

export default function TeammateH2H({
  teammateId,
  teammateName,
  self,
  mate,
  selfPoints,
  matePoints,
}: {
  teammateId: string;
  teammateName: string;
  self: DriverRaceResult[];
  mate: DriverRaceResult[];
  selfPoints: number;
  matePoints: number;
}) {
  const mateByRound = new Map(mate.map((r) => [r.round, r.result]));
  let gridSelf = 0;
  let gridMate = 0;
  let finSelf = 0;
  let finMate = 0;

  for (const r of self) {
    const m = mateByRound.get(r.round);
    if (!m) continue;
    const gs = Number(r.result.grid);
    const gm = Number(m.grid);
    if (gs && gm) {
      if (gs < gm) gridSelf++;
      else gridMate++;
    }

    const fin = (x: string) => x === "Finished" || x.startsWith("+");
    const ps = Number(r.result.position);
    const pm = Number(m.position);
    if (fin(r.result.status) && fin(m.status)) {
      if (ps < pm) finSelf++;
      else finMate++;
    } else if (fin(r.result.status)) finSelf++;
    else if (fin(m.status)) finMate++;
  }

  if (gridSelf + gridMate + finSelf + finMate === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-bold">ปะทะเพื่อนร่วมทีม</h2>
      <p className="mb-4 text-xs text-white/40">
        เทียบกับ{" "}
        <Link
          href={`/driver/${teammateId}`}
          className="text-white/70 underline-offset-2 hover:underline"
        >
          {teammateName}
        </Link>
      </p>
      <div className="space-y-3">
        <Bar label="ออกตัวนำ" a={gridSelf} b={gridMate} />
        <Bar label="จบก่อน" a={finSelf} b={finMate} />
        <Bar label="แต้มสะสม" a={selfPoints} b={matePoints} />
      </div>
    </section>
  );
}
