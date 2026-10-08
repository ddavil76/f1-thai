import type { CSSProperties, ReactNode } from "react";
import {
  ACTION_INFO, COMPOUNDS, INCIDENT_INFO, MOVE_DECK, PITWALL_DECK, PITWALL_INFO, moveValue,
  type ActionKind, type Compound, type IncidentFace,
} from "@/lib/boardgame/engine";
import { ACTION_ART, CardBack, DIE_ART, PITWALL_ART, Scene } from "@/components/boardgame/art";
import { ActionIcon, IconAlert, IconBolt, IconWear, IconWrench, PitwallIcon, TyreBadge } from "@/components/boardgame/icons";

export function Meter({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <span className="flex flex-1 items-center gap-0.5" role="img" aria-label={`${label} ${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        // ช่องที่เต็มครึ่งเดียว (ERS ชาร์จทีละครึ่ง) ระบายครึ่งซ้าย
        <span
          key={i}
          className="h-2 flex-1 rounded-sm"
          style={{
            background:
              i + 1 <= value
                ? color
                : i < value
                  ? `linear-gradient(90deg, ${color} 50%, rgba(255,255,255,0.12) 50%)`
                  : "rgba(255,255,255,0.12)",
          }}
        />
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
  i, onClick, disabled, tone, kicker, big, foot, peek = false, icon, badges, art,
}: {
  /** ชื่อภาพไพ่ (public/boardgame/art) — มีแล้วโชว์ภาพฉากแทนไอคอน */
  art?: string;
  /** รูปบอกว่าไพ่ทำอะไร */
  icon?: ReactNode;
  /** ป้ายไอคอนเล็กมุมขวาบน (เช่น ไพ่ MOVE: สึก / สายฟ้า / ACT / PIT) */
  badges?: ReactNode;
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
    <div className="bg-deal w-[5.3rem] flex-none" style={{ animationDelay: `${i * 0.07}s` }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-[8rem] w-full flex-col justify-between rounded-2xl border-2 p-2 text-left transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none ${tones[tone]} ${peek && !disabled ? "bg-peek" : ""}`}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="poster whitespace-nowrap text-[10px] tracking-tight opacity-80">{kicker}</span>
          {badges && !art && <span className="flex min-w-0 flex-wrap justify-end gap-0.5">{badges}</span>}
        </span>
        {art ? (
          <Scene name={art} className="-mx-1 my-1 flex-1 rounded-lg">
            {badges && <span className="absolute top-0.5 right-0.5 flex">{badges}</span>}
            {big !== "" && (
              <span className="poster absolute right-1 bottom-0.5 text-2xl leading-none text-white [text-shadow:0_1px_3px_#000,0_0_8px_#000]">{big}</span>
            )}
          </Scene>
        ) : icon ? (
          <span className="flex items-center justify-center gap-1">
            <span className="opacity-90">{icon}</span>
            <span className="poster text-2xl leading-none">{big}</span>
          </span>
        ) : (
          <span className="poster text-center text-3xl leading-none">{big}</span>
        )}
        <span className="text-center text-[10px] leading-tight opacity-80">{foot}</span>
      </button>
    </div>
  );
}

/** ไพ่ MOVE ที่เปิดแล้ว: พลิกจากหลังไพ่มาหน้าไพ่ตอนแสดงครั้งแรก */
export function MoveCard3D({ id, compound, playing }: { id: number; compound: Compound; playing: boolean }) {
  const c = MOVE_DECK[id];
  const rows: { k: Compound; label: string; v: number }[] = [
    { k: "red", label: COMPOUNDS.red.label, v: moveValue(c, "red") },
    { k: "yellow", label: COMPOUNDS.yellow.label, v: moveValue(c, "yellow") },
  ];
  return (
    <div className={`bg-stage h-[148px] w-[104px] flex-none ${playing ? "bg-play" : ""}`}>
      <div
        className="bg-card3d bg-flip h-full w-full"
        role="img"
        aria-label={`ไพ่ FLAT OUT ยาง M ${c.y} ยาง S ${c.r}${c.tires ? " สึกยาง" : ""}${c.ers ? " ชาร์จ ERS" : ""}${c.action ? " เปิด ACTION" : ""}${c.pitwall ? " จั่ว PITWALL" : ""}`}
      >
        <div className="bg-face overflow-hidden border-[3px] border-white bg-(--color-f1)">
          <CardBack name="back-flat-out" />
        </div>
        <div className="bg-face bg-front flex flex-col gap-1 border-[3px] border-white bg-[#f4f4f2] p-1.5 text-[#08080A]">
          <Scene name="flat-out" className="flex-1 rounded-md">
            <span className="absolute top-1 right-1">
              <MoveBadges c={c} />
            </span>
          </Scene>
          {rows.map((r) => (
            <div
              key={r.k}
              className={`flex items-center justify-between rounded-md px-1.5 py-0.5 ${r.k === compound ? "bg-[#08080A] text-white" : "bg-[#e7e7e3] text-black/55"}`}
            >
              <span className="flex items-center gap-1 text-[10px] font-bold">
                <TyreBadge compound={r.k} className="h-4 w-4" />
                {r.label}
              </span>
              <span className={`poster tabular-nums ${r.k === compound ? "text-2xl" : "text-base"}`}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ป้ายไอคอนของไพ่ MOVE: สึกยาง · ชาร์จ ERS · เปิดเหตุการณ์ · จั่ว PITWALL */
export function MoveBadges({ c }: { c: (typeof MOVE_DECK)[number] }) {
  const chip = "flex h-4 w-4 items-center justify-center rounded";
  return (
    <span className="flex gap-0.5">
      {c.tires && (
        <span className={`${chip} bg-(--color-f1) text-white`} title="ยางสึก">
          <IconWear />
        </span>
      )}
      {c.ers && (
        <span className={`${chip} bg-[#08080A] text-yellow-300`} title="ชาร์จ ERS">
          <IconBolt />
        </span>
      )}
      {c.action && (
        <span className={`${chip} bg-[#facc15] text-[#08080A]`} title="เปิดไพ่เหตุการณ์">
          <IconAlert />
        </span>
      )}
      {c.pitwall && (
        <span className={`${chip} bg-[#fb923c] text-[#08080A]`} title="จั่ว PITWALL">
          <IconWrench />
        </span>
      )}
    </span>
  );
}

export function SimpleCard({ kicker, value, playing, icon, art }: { kicker: string; value: number; playing: boolean; icon?: ReactNode; art?: string }) {
  if (art)
    return (
      <div className={`flex h-[148px] w-[104px] flex-none flex-col gap-1 rounded-2xl border-2 border-white/25 bg-[#1F1F24] p-1.5 ${playing ? "bg-play" : ""}`}>
        <span className="poster px-0.5 text-xs text-white/70">{kicker}</span>
        <Scene name={art} className="flex-1 rounded-lg">
          <span className="poster absolute right-1 bottom-0.5 text-4xl leading-none text-white tabular-nums [text-shadow:0_1px_3px_#000,0_0_8px_#000]">
            {value}
          </span>
        </Scene>
      </div>
    );
  return (
    <div className={`flex h-[148px] w-[104px] flex-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/25 bg-[#1F1F24] ${playing ? "bg-play" : ""}`}>
      <span className="poster text-xs text-white/70">{kicker}</span>
      {icon && <span className="text-white/85 [&_svg]:h-11 [&_svg]:w-11">{icon}</span>}
      <span className="poster text-5xl leading-none text-white tabular-nums">{value}</span>
    </div>
  );
}

/** ไพ่ ACTION พลิกหน้า */
export function ActionCard3D({ kind, ok, text }: { kind: ActionKind; ok: boolean; text?: string }) {
  const info = { ...ACTION_INFO[kind], ...(text ? { text } : {}) };
  const art = ACTION_ART[kind];
  return (
    <div className="bg-stage h-[132px] w-[96px] flex-none">
      <div className="bg-card3d bg-flip h-full w-full" role="img" aria-label={`ไพ่ ACTION ${info.title}: ${info.text}`}>
        <div className="bg-face overflow-hidden border-[3px] border-white bg-[#7a0300]">
          <CardBack name="back-action" />
        </div>
        <div className={`bg-face bg-front flex flex-col gap-1 border-[3px] border-(--color-f1) bg-[#f4f4f2] text-[#08080A] ${art ? "p-1.5" : "p-2"}`}>
          {art ? (
            <Scene name={art} className="h-12 flex-none rounded-md" />
          ) : (
            <span className="flex items-center justify-between">
              <span className="poster text-[10px] text-(--color-f1)">ACTION</span>
              <span className="text-(--color-f1)">
                <ActionIcon kind={kind} />
              </span>
            </span>
          )}
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
  const art = DIE_ART[face];
  if (art)
    return (
      <span
        className="bg-roll block h-12 w-12 flex-none rounded-lg border-2 bg-[#121216] bg-cover bg-center"
        style={{ borderColor: f.color, backgroundImage: `url(/boardgame/art/${art}.webp)`, animationDelay: `${delay}s` }}
        role="img"
        aria-label={`ลูกเต๋า: ${f.title}`}
      />
    );
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
  const art = PITWALL_ART[c.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-12 w-[5.2rem] flex-none items-center gap-1 rounded-lg border-2 px-1 py-1 text-left transition-transform ${
        selected ? "-translate-y-1 border-white" : "border-[#fb923c]/60"
      } ${disabled ? "bg-[#3a2516] text-white/55" : "bg-[#fb923c] text-[#08080A]"}`}
    >
      {art ? (
        <Scene name={art} zoom={170} className={`h-9 w-7 flex-none rounded ${disabled ? "opacity-50" : ""}`} />
      ) : (
        <span className="flex-none [&_svg]:h-7 [&_svg]:w-7">
          <PitwallIcon kind={c.kind} />
        </span>
      )}
      <span className="min-w-0">
        <span className="poster block text-[7px] opacity-75">PITWALL</span>
        <span className="line-clamp-2 text-[10px] font-black leading-tight">
          {info.title}
          {c.value ? ` ${c.value}` : ""}
        </span>
      </span>
    </button>
  );
}
