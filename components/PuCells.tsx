import { PU_INFO, PU_KEYS, type PuUsed } from "@/lib/power-units";

/** 7 ช่องชิ้นส่วน: จำนวนที่ใช้ + จุดเทียบโควตา (เกินโควตา = แดง) */
export default function PuCells({ used }: { used: PuUsed }) {
  return (
    <ul className="grid grid-cols-7 gap-1">
      {PU_KEYS.map((k) => {
        const { limit, th } = PU_INFO[k];
        const n = used[k];
        const over = n - limit;
        const label = `${th} (${k}) ใช้ ${n} จากโควตา ${limit}${over > 0 ? ` · เกิน ${over}` : ""}`;
        return (
          <li
            key={k}
            title={label}
            aria-label={label}
            className={`rounded-md px-0.5 py-1.5 text-center ${
              over > 0 ? "bg-red-500/10 ring-1 ring-inset ring-red-500/30" : "bg-white/[0.04]"
            }`}
          >
            <p className="truncate text-[9px] font-semibold tracking-wide text-white/40">
              {k.replace("PU-", "")}
            </p>
            <p
              className={`display text-base font-bold leading-tight tabular-nums ${
                over > 0 ? "text-red-400" : over === 0 ? "text-amber-300" : ""
              }`}
            >
              {n}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-px px-0.5">
              {Array.from({ length: Math.max(n, limit) }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full ${
                    i >= n ? "bg-white/15" : i >= limit ? "bg-red-400" : "bg-white/60"
                  }`}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
