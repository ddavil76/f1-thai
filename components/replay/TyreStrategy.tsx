import type { ReplayDriver, ReplayFrame, ReplayStint } from "@/lib/replay";

const TYRE_COLOR: Record<string, string> = {
  S: "#e0203a",
  M: "#e6c74d",
  H: "#e8e8e8",
  I: "#43b02a",
  W: "#3a8dde",
};
const TYRE_NAME: Record<string, string> = {
  S: "อ่อน",
  M: "กลาง",
  H: "แข็ง",
  I: "อินเตอร์",
  W: "ฝน",
};

/** กราฟกลยุทธ์ยาง — แถบต่อนักแข่ง แบ่งช่วงตาม stint */
export default function TyreStrategy({
  stints,
  totalLaps,
  finalOrder,
  drivers,
}: {
  stints: ReplayStint[];
  totalLaps: number;
  finalOrder: ReplayFrame["rows"];
  drivers: Record<number, ReplayDriver>;
}) {
  if (stints.length === 0) return null;

  const byDriver = new Map<number, ReplayStint[]>();
  for (const s of stints) {
    if (!byDriver.has(s.num)) byDriver.set(s.num, []);
    byDriver.get(s.num)!.push(s);
  }
  for (const arr of byDriver.values()) arr.sort((a, b) => a.from - b.from);

  const used = [...new Set(stints.map((s) => s.compound).filter(Boolean))];
  const ticks = [1, ...Array.from({ length: 4 }, (_, i) =>
    Math.round(((i + 1) * totalLaps) / 4),
  )];

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-bold">กลยุทธ์ยาง</h2>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
          {used.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: TYRE_COLOR[c] ?? "#aaa" }}
              />
              {TYRE_NAME[c] ?? c}
            </span>
          ))}
        </span>
      </div>
      <p className="mb-3 text-xs text-white/35">
        เลขในแถบ = จำนวนรอบของยางชุดนั้น
      </p>

      <div className="min-w-[460px] space-y-1">
        {finalOrder.map((r) => {
          const arr = byDriver.get(r.num) ?? [];
          const d = drivers[r.num];
          return (
            <div key={r.num} className="flex items-center gap-2">
              <span className="w-6 text-right text-[11px] tabular-nums text-white/35">
                {r.pos}
              </span>
              <span className="flex w-14 shrink-0 items-center gap-1.5">
                <span
                  className="h-3 w-1 shrink-0 rounded-full"
                  style={{ background: d?.colour }}
                />
                <span className="text-xs font-bold">{d?.code}</span>
              </span>
              <span className="flex h-5 flex-1 gap-px overflow-hidden rounded">
                {arr.length === 0 ? (
                  <span className="flex-1 bg-white/5" />
                ) : (
                  arr.map((s, i) => {
                    const laps = s.to - s.from + 1;
                    const col = TYRE_COLOR[s.compound] ?? "#777";
                    return (
                      <span
                        key={i}
                        className="flex items-center justify-center text-[9px] font-bold text-black/70"
                        style={{
                          flexGrow: laps,
                          flexBasis: 0,
                          background: col,
                        }}
                        title={`${TYRE_NAME[s.compound] ?? s.compound} · รอบ ${s.from}–${s.to} (${laps} รอบ)`}
                      >
                        {laps >= 4 ? laps : ""}
                      </span>
                    );
                  })
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* แกนรอบ */}
      <div className="ml-[calc(1.5rem+0.5rem+3.5rem+0.5rem)] mt-1.5 flex min-w-[380px] justify-between text-[10px] tabular-nums text-white/30">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </section>
  );
}
