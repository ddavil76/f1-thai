import {
  PU_INFO, puLabel, nextChange, minSpare, type PuKey, type PuStatus, type PuUsed,
} from "@/lib/power-units";

export const PU_STATUS_UI: Record<
  PuStatus,
  { badge: string; title: string; desc: string; dot: string; text: string }
> = {
  penalized: {
    badge: "โดนโทษแล้ว",
    title: "โดนโทษแล้ว",
    desc: "ใช้ชิ้นส่วนเกินโควตาไปแล้วอย่างน้อย 1 ชนิด",
    dot: "bg-red-400",
    text: "text-red-400",
  },
  edge: {
    badge: "ใกล้โดนโทษ",
    title: "เปลี่ยนอีกชิ้นก็โดน",
    desc: "มีชิ้นที่ใช้ครบโควตาพอดี เปลี่ยนอีกเมื่อไหร่ถอยกริด",
    dot: "bg-amber-300",
    text: "text-amber-300",
  },
  safe: {
    badge: "ปลอดภัย",
    title: "ยังเหลือเผื่อ",
    desc: "ทุกชิ้นยังเปลี่ยนได้โดยไม่โดนโทษ",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
};

export function PuStatusBadge({ status }: { status: PuStatus }) {
  const s = PU_STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.badge}
    </span>
  );
}

function PuChip({ k, n }: { k: PuKey; n: number }) {
  const { limit, th } = PU_INFO[k];
  const over = n > limit;
  return (
    <span
      title={`${th} ใช้ ${n} จากโควตา ${limit}`}
      className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        over
          ? "bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/30"
          : "bg-white/[0.07] text-white/85"
      }`}
    >
      {puLabel(k)}
      <span className="font-normal tabular-nums opacity-60">
        {n}/{limit}
      </span>
    </span>
  );
}

/** ผลของการเปลี่ยนชิ้นส่วนครั้งถัดไป เป็นประโยคอ่านง่าย */
export function PuNextChange({ used }: { used: PuUsed }) {
  const groups = nextChange(used);
  if (groups.length === 0) {
    return (
      <p className="text-xs text-white/50">
        ทุกชิ้นยังเปลี่ยนได้อีกอย่างน้อย {minSpare(used)} ครั้งโดยไม่โดนโทษ
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {groups.map((g) => (
        <p key={g.penalty} className="flex flex-wrap items-center gap-1 text-xs text-white/50">
          <span>ถ้าเปลี่ยน</span>
          {g.keys.map((k) => (
            <PuChip key={k} k={k} n={used[k]} />
          ))}
          <span>อีก →</span>
          <span className="font-semibold text-white">
            ถอยกริด {g.penalty}
            {g.keys.length > 1 && " ต่อชิ้น"}
          </span>
        </p>
      ))}
    </div>
  );
}
