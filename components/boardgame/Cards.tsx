import type { CSSProperties, ReactNode } from "react";
import { CloudRain, Zap } from "lucide-react";
import {
  ACTION_INFO, COMPOUNDS, INCIDENT_INFO, MOVE_DECK, PITWALL_DECK, PITWALL_INFO, moveValue,
  type ActionKind, type Compound, type IncidentFace,
} from "@/lib/boardgame/engine";
import { COMPOUND_COLOR, WET_COLOR } from "@/components/boardgame/look";

export function Meter({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="flex flex-1 items-center gap-0.5" role="img" aria-label={`${label} ${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2 flex-1 rounded-sm" style={{ background: i < value ? color : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

export function Coin({ n, style, label }: { n: number; style: CSSProperties; label?: string }) {
  return (
    <span
      className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10px] font-extrabold text-white tabular-nums"
      style={style}
      role={label ? "img" : undefined}
      aria-label={label ? `${label} ${n}` : undefined}
    >
      {n}
    </span>
  );
}

/** ไพ่ตัวเลือกในมือ — ปุ่มจริง แจกเข้ามือทีละใบ */
export function HandCard({
  i, onClick, disabled, tone, kicker, big, foot, peek = false,
}: {
  i: number;
  onClick: () => void;
  disabled?: boolean;
  tone: "dark" | "red" | "light" | "yellow" | "orange";
  kicker: string;
  big: ReactNode;
  foot: string;
  peek?: boolean;
}) {
  const tones = {
    dark: "bg-[#1F1F24] text-white border-white/20",
    red: "bg-(--color-f1) text-white border-white shadow-[3px_3px_0_#8a0400,6px_6px_0_#4d0200]",
    light: "bg-[#DEDEDE] text-[#08080A] border-white",
    yellow: "bg-[#facc15] text-[#08080A] border-white",
    orange: "bg-[#fb923c] text-[#08080A] border-white",
  } as const;
  return (
    <div className="bg-deal w-[6.4rem] flex-none" style={{ animationDelay: `${i * 0.07}s` }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-[7.4rem] w-full flex-col justify-between rounded-2xl border-2 p-2 text-left transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none ${tones[tone]} ${peek && !disabled ? "bg-peek" : ""}`}
      >
        <span className="poster text-[11px] opacity-80">{kicker}</span>
        <span className="poster text-center text-3xl leading-none">{big}</span>
        <span className="text-center text-[10px] leading-tight opacity-80">{foot}</span>
      </button>
    </div>
  );
}

/** ไพ่ MOVE ที่เปิดแล้ว: พลิกจากหลังไพ่มาหน้าไพ่ตอนแสดงครั้งแรก */
export function MoveCard3D({ id, compound, wet, rain, playing }: { id: number; compound: Compound; wet: boolean; rain: boolean; playing: boolean }) {
  const c = MOVE_DECK[id];
  const rows: { k: Compound | "wet"; label: string; color: string; v: number }[] = [
    { k: "yellow", label: COMPOUNDS.yellow.label, color: COMPOUND_COLOR.yellow, v: moveValue(c, "yellow") },
    { k: "red", label: COMPOUNDS.red.label, color: COMPOUND_COLOR.red, v: moveValue(c, "red") },
    { k: "wet", label: "ฝน", color: WET_COLOR, v: c.w },
  ];
  const use = rain && wet ? "wet" : compound;
  const spin = rain && (wet ? c.spinWet : c.spinDry);
  return (
    <div className={`bg-stage h-[148px] w-[104px] flex-none ${playing ? "bg-play" : ""}`}>
      <div
        className="bg-card3d bg-flip h-full w-full"
        role="img"
        aria-label={`ไพ่ MOVE เหลือง ${c.y} แดง ${c.r} ฝน ${c.w}${c.tires ? " สึกยาง" : ""}${c.ers ? " ชาร์จ ERS" : ""}${c.action ? " เปิด ACTION" : ""}${c.pitwall ? " จั่ว PITWALL" : ""}${spin ? " หมุนในฝน" : ""}`}
      >
        <div className="bg-face flex items-center justify-center border-[3px] border-white bg-(--color-f1)">
          <span className="poster text-xl text-white">MOVE</span>
        </div>
        <div className="bg-face bg-front flex flex-col gap-1 border-[3px] border-white bg-[#f4f4f2] p-1.5 text-[#08080A]">
          <div className="flex flex-wrap items-center gap-0.5">
            {c.tires && <Tag className="bg-(--color-f1) text-white">สึก</Tag>}
            {c.ers && (
              <Tag className="bg-[#08080A] text-white">
                <Zap className="h-2.5 w-2.5 fill-white" aria-hidden />
              </Tag>
            )}
            {c.action && <Tag className="bg-[#08080A] text-white">ACT</Tag>}
            {c.pitwall && <Tag className="bg-[#fb923c]">PIT</Tag>}
          </div>
          {rows.map((r) => (
            <div
              key={r.k}
              className={`flex items-center justify-between rounded-md px-1.5 ${r.k === use ? "bg-[#08080A] text-white" : "bg-[#e7e7e3] text-black/55"}`}
            >
              <span className="flex items-center gap-1 text-[9px] font-semibold">
                <span className="h-2 w-2 rounded-full border border-current" style={{ background: r.color }} />
                {r.label}
                {r.k !== "wet" && rain && (c.spinDry ? <CloudRain className="h-2.5 w-2.5" aria-label="หมุน" /> : null)}
                {r.k === "wet" && c.spinWet ? <CloudRain className="h-2.5 w-2.5" aria-label="หมุน" /> : null}
              </span>
              <span className={`poster tabular-nums ${r.k === use ? "text-2xl" : "text-base"}`}>{r.v}</span>
            </div>
          ))}
          {spin && <span className="mt-auto text-center text-[9px] font-bold text-(--color-f1)">ลื่น! หมุนออกนอกสนาม</span>}
        </div>
      </div>
    </div>
  );
}

function Tag({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`flex items-center rounded px-1 py-px text-[8px] font-extrabold ${className}`}>{children}</span>;
}

export function SimpleCard({ kicker, value, playing }: { kicker: string; value: number; playing: boolean }) {
  return (
    <div className={`flex h-[148px] w-[104px] flex-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/25 bg-[#1F1F24] ${playing ? "bg-play" : ""}`}>
      <span className="poster text-xs text-white/70">{kicker}</span>
      <span className="poster text-5xl leading-none text-white tabular-nums">{value}</span>
    </div>
  );
}

/** ไพ่ ACTION พลิกหน้า */
export function ActionCard3D({ kind, ok, text }: { kind: ActionKind; ok: boolean; text?: string }) {
  const info = { ...ACTION_INFO[kind], ...(text ? { text } : {}) };
  return (
    <div className="bg-stage h-[132px] w-[96px] flex-none">
      <div className="bg-card3d bg-flip h-full w-full" role="img" aria-label={`ไพ่ ACTION ${info.title}: ${info.text}`}>
        <div className="bg-face flex items-center justify-center border-[3px] border-white bg-[#7a0300]">
          <span className="poster text-lg text-white">ACTION</span>
        </div>
        <div className="bg-face bg-front flex flex-col gap-1 border-[3px] border-(--color-f1) bg-[#f4f4f2] p-2 text-[#08080A]">
          <span className="poster text-[10px] text-(--color-f1)">ACTION</span>
          <span className="text-sm font-black leading-tight">{info.title}</span>
          <span className="text-[9px] leading-snug text-black/70">{info.text}</span>
          {!ok && <span className="mt-auto text-[9px] font-bold text-black/55">ไม่มีผล</span>}
        </div>
      </div>
    </div>
  );
}

/** หน้าลูกเต๋าอุบัติเหตุ หมุนแล้วหยุด */
export function DieFace({ face, delay = 0 }: { face: IncidentFace; delay?: number }) {
  const f = INCIDENT_INFO[face];
  return (
    <span
      className="bg-roll flex h-9 w-9 flex-none items-center justify-center rounded-lg border-2 bg-[#121216]"
      style={{ borderColor: f.color, animationDelay: `${delay}s` }}
      role="img"
      aria-label={`ลูกเต๋า: ${f.title}`}
    >
      <span className="h-4 w-4 rounded-full" style={{ background: f.color }} />
    </span>
  );
}

/** ไพ่ PITWALL ใบเล็กในมือทีม */
export function PitwallChip({
  id, selected, disabled, onClick,
}: {
  id: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const c = PITWALL_DECK[id];
  const info = PITWALL_INFO[c.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-12 w-[4.6rem] flex-none flex-col justify-between rounded-lg border-2 px-1.5 py-1 text-left transition-transform ${
        selected ? "-translate-y-1 border-white" : "border-[#fb923c]/60"
      } ${disabled ? "bg-[#3a2516] text-white/55" : "bg-[#fb923c] text-[#08080A]"}`}
    >
      <span className="poster text-[8px] opacity-75">PITWALL</span>
      <span className="truncate text-[11px] font-black leading-none">
        {info.title}
        {c.value ? ` ${c.value}` : ""}
      </span>
    </button>
  );
}
