import type { ReactNode } from "react";
import { TEAMS } from "@/lib/pitwall/teams";
import { COMPOUND_INFO, type Car, type Compound } from "@/lib/pitwall/types";

export const teamOf = (car: Pick<Car, "team">) => TEAMS[car.team] ?? TEAMS[0];

/** 1:44.382 */
export function fmtLap(s: number | null | undefined): string {
  if (s === null || s === undefined || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}
/** นาฬิกา 5:12 */
export function fmtClock(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
export const fmtGap = (s: number | null | undefined) => (s === null || s === undefined ? "—" : `+${s.toFixed(s < 10 ? 2 : 1)}`);

export function TyreDot({ c, size = 18, wear }: { c: Compound; size?: number; wear?: number }) {
  const info = COMPOUND_INFO[c];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`ยาง ${info.label}${wear !== undefined ? ` สึก ${Math.round(wear * 100)}%` : ""}`} className="flex-none">
      <circle cx="12" cy="12" r="11" fill="#121214" />
      <circle cx="12" cy="12" r="8.4" fill="none" stroke={info.color} strokeWidth="2.6" />
      <text x="12" y="12.6" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="900" fill="#fff">
        {info.short}
      </text>
    </svg>
  );
}

/** ปุ่มกลุ่มเลือกได้อันเดียว */
export function Seg<T extends string | number>({
  value, options, onChange, disabled = false, size = "md",
}: {
  value: T;
  options: { v: T; label: ReactNode; tone?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className={`grid gap-1 rounded-xl bg-[#08080A] p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(o.v)}
            className={`flex items-center justify-center gap-1 rounded-lg font-bold transition-colors disabled:opacity-40 ${size === "sm" ? "min-h-8 text-[11px]" : "min-h-10 text-xs"} ${
              on ? "text-[#08080A]" : "text-white/75 hover:bg-white/10"
            }`}
            style={on ? { background: o.tone ?? "#DEDEDE" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Btn({
  onClick, children, tone = "red", disabled = false, className = "", type = "button",
}: {
  onClick?: () => void;
  children: ReactNode;
  tone?: "red" | "ghost" | "white";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const cls =
    tone === "red"
      ? "bg-(--color-f1) text-white"
      : tone === "white"
        ? "bg-white text-[#08080A]"
        : "border border-white/20 text-white/85 hover:bg-white/10";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`min-h-11 rounded-full px-4 text-sm font-bold disabled:opacity-40 ${cls} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card space-y-3 p-4 ${className}`}>{children}</section>;
}

export function Head({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="space-y-1">
      {kicker && <p className="poster text-xs text-(--color-f1-text)">{kicker}</p>}
      <h2 className="poster text-2xl text-white">{title}</h2>
      {sub && <p className="text-sm text-white/65">{sub}</p>}
    </div>
  );
}

export function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${label} ${Math.round(v * 100)}%`}>
      <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: color }} />
    </span>
  );
}
