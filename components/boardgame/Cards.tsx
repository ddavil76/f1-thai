import type { CSSProperties, ReactNode } from "react";
import {
  ACTION_INFO, COMPOUNDS, INCIDENT_INFO, MOVE_DECK, PITWALL_DECK, PITWALL_INFO, moveValue,
  type ActionKind, type Compound, type IncidentFace,
} from "@/lib/boardgame/engine";
import { ACTION_ART, DIE_ART, PITWALL_ART, Scene } from "@/components/boardgame/art";
import { CARD_BOX, CARD_SIZE, CardFace, FlipCard, type CardCat, type CardSize } from "@/components/boardgame/CardFace";
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

/** สีป้ายหมวดตามโทนเดิมของไพ่ */
const TONE_ACCENT = { dark: "#E10600", red: "#E10600", light: "#E10600", yellow: "#CA8A04", orange: "#EA580C" } as const;

/** ไพ่ตัวเลือกในมือ — ปุ่มจริง แจกเข้ามือคว่ำไว้แล้วพลิกหน้า */
export function HandCard({
  i, onClick, disabled, tone, kicker, big, foot, peek = false, icon, badges, art, cat = "drive", back = "back-generic",
}: {
  /** รูปบอกว่าไพ่ทำอะไร (ใช้เมื่อไม่มีภาพ) */
  icon?: ReactNode;
  /** ป้ายไอคอนเล็กมุมขวาบนของภาพ (เช่น ไพ่ FLAT OUT: สึก / สายฟ้า / ACT / PIT) */
  badges?: ReactNode;
  /** ชื่อภาพไพ่ (public/boardgame/art) */
  art?: string;
  /** หมวดไพ่ (ป้ายมุมซ้ายบน) */
  cat?: CardCat;
  /** ภาพหลังไพ่ */
  back?: string;
  i: number;
  onClick: () => void;
  disabled?: boolean;
  tone: keyof typeof TONE_ACCENT;
  kicker: string;
  big: ReactNode;
  foot: string;
  peek?: boolean;
}) {
  return (
    <div className="bg-deal flex-none" style={{ animationDelay: `${i * 0.07}s` }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`block rounded-[11px] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none ${peek && !disabled ? "bg-peek" : ""}`}
      >
        <FlipCard back={back} size="hand" delay={0.3 + i * 0.07}>
          <CardFace title={kicker} cat={cat} art={art} icon={icon} accent={TONE_ACCENT[tone]} corner={badges}>
            <span className="flex items-center gap-[0.4em]">
              {big !== "" && <span className="poster flex-none text-[2.3em] leading-none text-[#E10600] tabular-nums">{big}</span>}
              <span className="min-w-0 text-[1.15em] leading-tight font-semibold">{foot}</span>
            </span>
          </CardFace>
        </FlipCard>
      </button>
    </div>
  );
}

/** ไพ่ FLAT OUT ที่เปิดแล้ว: คว่ำก่อนแล้วพลิกมาหน้าไพ่ */
export function MoveCard3D({
  id, compound, playing, pit = true, size = "play",
}: { id: number; compound: Compound; playing: boolean; pit?: boolean; size?: CardSize }) {
  const c = MOVE_DECK[id];
  const rows: { k: Compound; label: string; v: number }[] = [
    { k: "red", label: COMPOUNDS.red.label, v: moveValue(c, "red") },
    { k: "yellow", label: COMPOUNDS.yellow.label, v: moveValue(c, "yellow") },
  ];
  return (
    <div className={`flex-none ${playing ? "bg-play" : ""}`}>
      <FlipCard
        back="back-flat-out"
        size={size}
        label={`ไพ่ FLAT OUT ยาง M ${c.y} ยาง S ${c.r}${c.tires ? " สึกยาง" : ""}${c.ers ? " ชาร์จ ERS" : ""}${c.action ? " เปิด ACTION" : ""}${c.pitwall && pit ? " จั่ว PITWALL" : ""}`}
      >
        <CardFace title="FLAT OUT" cat="drive" art="flat-out" corner={<MoveBadges c={c} pit={pit} />}>
          <span className="flex flex-col gap-[0.2em]">
            {rows.map((r) => (
              <span
                key={r.k}
                className={`flex items-center justify-between rounded-[0.4em] px-[0.4em] py-[0.1em] ${r.k === compound ? "bg-[#08080A] text-white" : "text-black/55"}`}
              >
                <span className="flex items-center gap-[0.3em] text-[1em] font-bold">
                  <TyreBadge compound={r.k} className="h-[1.5em] w-[1.5em]" />
                  {r.label}
                </span>
                <span className={`poster leading-none tabular-nums ${r.k === compound ? "text-[2em]" : "text-[1.4em]"}`}>{r.v}</span>
              </span>
            ))}
          </span>
        </CardFace>
      </FlipCard>
    </div>
  );
}

/** ป้ายไอคอนของไพ่ MOVE: สึกยาง · ชาร์จ ERS · เปิดเหตุการณ์ · จั่ว PITWALL */
export function MoveBadges({ c, pit = true }: { c: (typeof MOVE_DECK)[number]; pit?: boolean }) {
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
      {c.pitwall && pit && (
        <span className={`${chip} bg-[#fb923c] text-[#08080A]`} title="จั่ว PITWALL">
          <IconWrench />
        </span>
      )}
    </span>
  );
}

/** ไพ่ที่เลือกเล่น (SAVE / DRS / PUSH / PACE) — หน้าไพ่เดียวกับในมือ ขนาดใหญ่ขึ้น */
export function SimpleCard({
  kicker, value, playing, icon, art, size = "play",
}: { kicker: string; value: number; playing: boolean; icon?: ReactNode; art?: string; size?: CardSize }) {
  return (
    <div className={`flex-none ${CARD_BOX} ${CARD_SIZE[size]} ${playing ? "bg-play" : ""}`}>
      <CardFace title={kicker} cat="drive" art={art} icon={icon}>
        <span className="flex items-baseline gap-[0.3em]">
          <span className="poster text-[3em] leading-none text-[#E10600] tabular-nums">{value}</span>
          <span className="text-[1.1em] font-bold">ช่อง</span>
        </span>
      </CardFace>
    </div>
  );
}

/** ไพ่ ACTION คว่ำแล้วพลิกหน้า */
export function ActionCard3D({ kind, ok, text, size = "play" }: { kind: ActionKind; ok: boolean; text?: string; size?: CardSize }) {
  const info = { ...ACTION_INFO[kind], ...(text ? { text } : {}) };
  return (
    <FlipCard back="back-action" size={size} label={`ไพ่ ACTION ${info.title}: ${info.text}`}>
      <CardFace title={info.title} cat="action" art={ACTION_ART[kind]} icon={<ActionIcon kind={kind} />} accent="#CA8A04">
        <span className="block text-[0.95em] leading-snug">{info.text}</span>
        {!ok && <span className="mt-[0.2em] block text-[0.95em] font-bold text-black/55">ไม่มีผล</span>}
      </CardFace>
    </FlipCard>
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
