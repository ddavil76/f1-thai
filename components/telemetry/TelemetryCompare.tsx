"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import StartLights from "../StartLights";
import {
  fastestLaps, findSessionKey, fmtLap, fracAtTime, getLapTrace, getSessionLaps, indexOfFrac,
  type SessionLaps, type TelemetryDriver, type TelemetryLap, type TelemetrySessionCode, type Trace,
} from "@/lib/telemetry";
import type { TelemetrySession } from "@/lib/telemetry-sessions";
import TrackDominance from "./TrackDominance";
import TraceCharts from "./TraceCharts";


type Pick = { num: number; lap: number | null /* null = รอบเร็วสุด */ };

const noSubscribe = () => () => {};

const DAY = 24 * 60 * 60 * 1000;

/** สีทีมใกล้กัน (เพื่อนร่วมทีม / น้ำเงินกับน้ำเงิน) → คนที่สองเป็นสีขาว */
function distinct(a: string, b: string): string {
  const rgb = (h: string) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  return d < 90 ? "#e8e8ec" : b;
}

/** อ่าน/เขียน URL (?s=Q&a=1&b=4&la=12&lb=9) — แชร์ลิงก์การเทียบได้ */
function parseUrl(search: string): { s?: string; a?: Pick; b?: Pick } {
  const q = new URLSearchParams(search);
  const pick = (d: string, l: string): Pick | undefined => {
    const num = Number(q.get(d));
    if (!num) return undefined;
    const lap = Number(q.get(l));
    return { num, lap: lap > 0 ? lap : null };
  };
  return { s: q.get("s") ?? undefined, a: pick("a", "la"), b: pick("b", "lb") };
}

function writeUrl(s: string, a: Pick, b: Pick) {
  const q = new URLSearchParams({ s, a: String(a.num), b: String(b.num) });
  if (a.lap) q.set("la", String(a.lap));
  if (b.lap) q.set("lb", String(b.lap));
  window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
}

type Load<T> = { s: "loading" } | { s: "ok"; v: T } | { s: "none" } | { s: "err" };

/**
 * โหลดข้อมูลตามคีย์ — ผลที่ได้ผูกกับคีย์ของมัน คีย์เปลี่ยนแล้วผลเก่าไม่ตรง = "loading" เอง
 * (ไม่ต้อง setState("loading") ใน effect) · คำตอบที่มาช้าของคีย์เก่าไม่ทับของใหม่
 */
function useLoad<T>(key: string | null, load: () => Promise<T | null>): Load<T> {
  const [res, setRes] = useState<{ key: string; v: Load<T> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    load()
      .then((v) => alive && setRes({ key, v: v ? { s: "ok", v } : { s: "none" } }))
      .catch(() => alive && setRes({ key, v: { s: "err" } }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key สรุปทุกอย่างที่ load ใช้
  }, [key]);
  return key && res?.key === key ? res.v : { s: "loading" };
}

export default function TelemetryCompare({
  season,
  sessions,
  circuitId,
  ground,
}: {
  season: number;
  /** session ที่แข่งไปแล้ว เรียงตามเวลา */
  sessions: TelemetrySession[];
  /** สนามไนต์เรซ → ฉาก 3D กลางคืน */
  circuitId?: string;
  /** ผังสนามที่ผูกกับแผนที่ — ฉากรอบสนามจริง (OSM) */
  ground?: [number, number][];
}) {
  // ค่าจาก URL — ฝั่งเซิร์ฟเวอร์/ตอน hydrate เป็นค่าว่าง แล้วค่อยอ่านจริงหลังขึ้นจอ (ไม่ให้ HTML ไม่ตรงกัน)
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const url = useMemo(() => parseUrl(search), [search]);

  // ค่าที่ผู้ใช้เลือกเอง (ทับค่าจาก URL และค่าเริ่มต้น)
  const [userCode, setUserCode] = useState<TelemetrySessionCode | null>(null);
  const [userA, setUserA] = useState<Pick | null>(null);
  const [userB, setUserB] = useState<Pick | null>(null);
  const [now] = useState(() => Date.now());

  const code =
    userCode ??
    sessions.find((s) => s.code === url.s)?.code ??
    (sessions.find((s) => s.code === "Q") ?? sessions[sessions.length - 1]).code;
  const session = sessions.find((s) => s.code === code)!;
  // ข้อมูลย้อนหลังเกินวันไม่เปลี่ยนแล้ว → ใช้แคชเบราว์เซอร์ได้ (เปิดซ้ำไม่ต้องยิง openf1)
  const cache: RequestCache = now - Date.parse(session.start) > DAY ? "force-cache" : "no-cache";



  // session → รายชื่อ + รอบ
  const laps = useLoad<SessionLaps>(`${season}:${code}:${session.start}`, () =>
    findSessionKey(season, code, session.start).then((sk) => (sk ? getSessionLaps(sk, cache) : null)),
  );

  const best = useMemo(() => (laps.s === "ok" ? fastestLaps(laps.v.laps) : []), [laps]);

  // คู่เริ่มต้น = เร็วสุดอันดับ 1 กับ 2 · คนที่ไม่มีใน session นี้ (สลับ session) ใช้ค่าเริ่มต้นแทน
  const valid = (p: Pick | null | undefined): p is Pick => !!p && best.some((l) => l.num === p.num);
  const pa: Pick | null = valid(userA) ? userA : valid(url.a) ? url.a : best[0] ? { num: best[0].num, lap: null } : null;
  const pbWanted = valid(userB) ? userB : valid(url.b) ? url.b : null;
  const pbFallback = best.find((l) => l.num !== pa?.num);
  const pb: Pick | null = pbWanted ?? (pbFallback ? { num: pbFallback.num, lap: null } : null);
  const setPa = setUserA;
  const setPb = setUserB;

  const lapOf = (p: Pick | null): TelemetryLap | null => {
    if (!p || laps.s !== "ok") return null;
    if (p.lap != null) {
      const l = laps.v.laps.find((x) => x.num === p.num && x.lap === p.lap);
      if (l) return l;
    }
    return best.find((l) => l.num === p.num) ?? null;
  };
  const lapA = lapOf(pa);
  const lapB = lapOf(pb);

  const sk = laps.s === "ok" ? laps.v.key : null;
  const ta = useLoad<Trace>(sk && lapA ? `${sk}:${lapA.num}:${lapA.lap}` : null, () => getLapTrace(sk!, lapA!, cache));
  const tb = useLoad<Trace>(sk && lapB ? `${sk}:${lapB.num}:${lapB.lap}` : null, () => getLapTrace(sk!, lapB!, cache));

  const urlKey = pa && pb ? `${code}|${pa.num}|${pa.lap}|${pb.num}|${pb.lap}` : "";
  useEffect(() => {
    if (pa && pb) writeUrl(code, pa, pb);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlKey สรุปทุกค่าแล้ว (pa/pb เป็น object ใหม่ทุก render)
  }, [urlKey]);

  const driver = (num: number): TelemetryDriver | undefined =>
    laps.s === "ok" ? laps.v.drivers.find((d) => d.num === num) : undefined;
  const dA = lapA ? driver(lapA.num) : undefined;
  const dB = lapB ? driver(lapB.num) : undefined;
  const colourA = dA?.colour ?? "#e10600";
  const colourB = distinct(colourA, dB?.colour ?? "#888888");

  return (
    <div className="space-y-4">
      {/* ---- เลือก session ---- */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="session">
        {sessions.map((s) => (
          <button
            key={s.code}
            type="button"
            role="tab"
            aria-selected={s.code === code}
            onClick={() => setUserCode(s.code)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              s.code === code ? "bg-(--color-f1) text-white" : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {laps.s === "loading" && <Loading text="กำลังโหลดรายชื่อและเวลาต่อรอบ…" />}
      {(laps.s === "none" || laps.s === "err") && (
        <p className="card p-6 text-sm text-white/60">
          {laps.s === "err"
            ? "โหลดข้อมูลจาก openf1 ไม่สำเร็จ — ลองใหม่อีกครั้งภายหลัง"
            : "ยังไม่มีเทเลเมทรีของ session นี้ — รองรับตั้งแต่ปี 2023 และ openf1 อาจใช้เวลาหลังจบ session สักพัก"}
        </p>
      )}

      {laps.s === "ok" && best.length >= 2 && pa && pb && (
        <>
          {/* ---- เลือกคน + รอบ ---- */}
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              [pa, setPa, lapA, colourA, "คนที่ 1"],
              [pb, setPb, lapB, colourB, "คนที่ 2"],
            ] as const).map(([p, set, lap, colour, label], idx) => (
              <div key={idx} className="card space-y-2 p-3" style={{ borderLeft: `4px solid ${colour}` }}>
                <div className="text-[11px] font-semibold text-white/40">
                  {label} {idx === 1 && <span className="font-normal">(เส้นประ)</span>}
                </div>
                <div className="flex gap-2">
                  <select
                    aria-label={`${label}: นักแข่ง`}
                    value={p.num}
                    onChange={(e) => set({ num: Number(e.target.value), lap: null })}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm font-semibold"
                  >
                    {best.map((l, i) => (
                      <option key={l.num} value={l.num}>
                        {i + 1}. {driver(l.num)?.code ?? l.num} · {fmtLap(l.time)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${label}: รอบ`}
                    value={p.lap ?? ""}
                    onChange={(e) => set({ num: p.num, lap: e.target.value ? Number(e.target.value) : null })}
                    className="w-32 rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm"
                  >
                    <option value="">รอบเร็วสุด</option>
                    {laps.v.laps
                      .filter((l) => l.num === p.num)
                      .sort((x, y) => x.lap - y.lap)
                      .map((l) => (
                        <option key={l.lap} value={l.lap}>
                          L{l.lap} · {fmtLap(l.time)}
                        </option>
                      ))}
                  </select>
                </div>
                {lap && <LapSummary lap={lap} other={idx === 0 ? lapB : lapA} trace={idx === 0 ? ta : tb} />}
              </div>
            ))}
          </div>

          {lapA && lapB && (
            <p className="text-center text-sm">
              {lapA.time === lapB.time ? (
                <span className="text-white/60">เวลาต่อรอบเท่ากัน</span>
              ) : (
                <>
                  <span className="font-bold">{(lapA.time < lapB.time ? dA : dB)?.code}</span>
                  <span className="text-white/60"> เร็วกว่า </span>
                  <span className="font-mono font-bold">{Math.abs(lapA.time - lapB.time).toFixed(3)} วิ</span>
                </>
              )}
            </p>
          )}

          {ta.s === "ok" && tb.s === "ok" && dA && dB ? (
            <LapBattle
              // เปลี่ยนรอบ/คน → เริ่มนับใหม่ (ตัวชี้และการเล่นไม่ค้างจากคู่เก่า)
              key={`${lapA?.num}:${lapA?.lap}|${lapB?.num}:${lapB?.lap}`}
              a={{ code: dA.code, colour: colourA, trace: ta.v }}
              b={{ code: dB.code, colour: colourB, trace: tb.v }}
              circuitId={circuitId}
              ground={ground}
            />
          ) : ta.s === "loading" || tb.s === "loading" ? (
            <Loading text="กำลังโหลดเทเลเมทรีของรอบที่เลือก…" />
          ) : (
            <p className="card p-6 text-sm text-white/60">
              openf1 ไม่มีเทเลเมทรีของรอบนี้ครบ — ลองเลือกรอบอื่น
            </p>
          )}
        </>
      )}
      {laps.s === "ok" && best.length < 2 && (
        <p className="card p-6 text-sm text-white/60">session นี้มีเวลาต่อรอบไม่พอให้เทียบ</p>
      )}
    </div>
  );
}

type Side = { code: string; colour: string; trace: Trace };

/** "0:34.2" */
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * ผังสนาม + กราฟ ใช้ "เวลาในรอบ" เป็นตัวชี้ร่วมกัน:
 * แตะกราฟ = เวลาที่คนแรกถึงจุดนั้น · เล่น = เวลาเดินไปเรื่อย ๆ
 * จุดของแต่ละคนบนผัง = ตำแหน่งของคนนั้น ณ เวลาเดียวกัน → เห็นว่าอีกคนห่างอยู่เท่าไหร่
 */
function LapBattle({ a, b, circuitId, ground }: { a: Side; b: Side; circuitId?: string; ground?: [number, number][] }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const cursorRef = useRef<number | null>(null);
  const end = Math.max(a.trace.t[a.trace.t.length - 1], b.trace.t[b.trace.t.length - 1]);

  const setCur = (v: number | null) => {
    cursorRef.current = v;
    setCursor(v);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = Math.min(end, (cursorRef.current ?? 0) + dt * speed);
      cursorRef.current = next;
      setCursor(next);
      if (next >= end) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const aFrac = cursor == null ? null : fracAtTime(a.trace, cursor);
  const bFrac = cursor == null ? null : fracAtTime(b.trace, cursor);
  const hover = aFrac == null ? null : indexOfFrac(a.trace, aFrac);

  let status: string | null = null;
  if (aFrac != null && bFrac != null && cursor != null) {
    const gap = (aFrac - bFrac) * a.trace.length;
    status =
      Math.abs(gap) < 1
        ? `${clock(cursor)} · ตีคู่กัน`
        : `${clock(cursor)} · ${gap > 0 ? b.code : a.code} ตามหลัง ${Math.round(Math.abs(gap))} ม.`;
  }

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (cursorRef.current == null || cursorRef.current >= end) setCur(0);
    setPlaying(true);
  };

  const controls = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--color-f1) px-4 text-sm font-bold text-white transition hover:brightness-110 active:scale-[0.97]"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "หยุด" : "เล่นแข่งกัน"}
        </button>
        <div className="flex rounded-full bg-white/5 p-0.5 text-xs" role="group" aria-label="ความเร็วการเล่น">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`rounded-full px-2.5 py-1 font-bold transition ${speed === s ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-white/55">
          {clock(cursor ?? 0)} / {fmtLap(end)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={end}
        step={0.05}
        value={cursor ?? 0}
        onChange={(e) => {
          setPlaying(false);
          setCur(Number(e.target.value));
        }}
        aria-label="เวลาในรอบ"
        className="w-full accent-(--color-f1)"
      />
    </div>
  );

  return (
    <>
      <TrackDominance a={a} b={b} aFrac={aFrac} bFrac={bFrac} status={status} controls={controls} circuitId={circuitId} ground={ground} />
      <TraceCharts
        a={a}
        b={b}
        hover={hover}
        onHover={(i) => {
          setPlaying(false);
          setCur(i == null ? null : a.trace.t[i]);
        }}
      />
    </>
  );
}

function LapSummary({ lap, other, trace }: { lap: TelemetryLap; other: TelemetryLap | null; trace: Load<Trace> }) {
  const better = (v: number | null, o: number | null | undefined) => v != null && o != null && v < o;
  const top = trace.s === "ok" ? Math.round(Math.max(...trace.v.speed)) : null;
  return (
    <div className="grid grid-cols-6 gap-1 text-center text-[11px]">
      <Stat label={`L${lap.lap}`} value={fmtLap(lap.time)} hi={better(lap.time, other?.time)} wide />
      {lap.sectors.map((s, i) => (
        <Stat key={i} label={`S${i + 1}`} value={s != null ? s.toFixed(3) : "–"} hi={better(s, other?.sectors[i])} />
      ))}
      <Stat label="สูงสุด" value={top != null ? `${top}` : "…"} />
    </div>
  );
}

function Stat({ label, value, hi, wide }: { label: string; value: string; hi?: boolean; wide?: boolean }) {
  return (
    <div className={`rounded-md bg-white/[0.04] px-1 py-1 ${wide ? "col-span-2" : ""}`}>
      <div className="text-white/35">{label}</div>
      <div className={`font-mono ${hi ? "font-bold text-white" : "text-white/65"}`}>{value}</div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="card p-6">
      <StartLights label={text} sub="ดึงจาก openf1 ทีละส่วน · ครั้งแรกอาจ ~10 วิ" />
    </div>
  );
}
