"use client";

import { useState, type ReactNode } from "react";
import { Timer } from "lucide-react";
import Car from "@/components/boardgame/Car";
import { look } from "@/components/boardgame/look";
import { lapTime, type CarSpec } from "@/lib/boardgame/engine";
import {
  HALF_WEAR, byTime, canExtra, extraLap, finishQuali, newQuali, runQ1, startWear, toQ2, type Quali,
} from "@/lib/boardgame/quali";

/** ควอลิฟาย Q1 → Q2 แล้วส่งกริดกับยางสึกตั้งต้นกลับไป */
export default function Qualifying({
  cars, onDone,
}: {
  cars: CarSpec[];
  onDone: (grid: number[], wear: number[]) => void;
}) {
  const [q, setQ] = useState<Quali>(() => newQuali(cars, Math.random));
  const [picks, setPicks] = useState<Record<number, 0 | 1>>({});
  const humans = cars.map((c, id) => ({ c, id })).filter((x) => !x.c.ai);

  if (q.stage === "pick") {
    return (
      <section className="card space-y-4 p-4" aria-label="เลือกไพ่ควอลิฟาย">
        <Head title="ควอลิฟาย" sub="แต่ละคันได้ไพ่ 2 ใบ เลขน้อย = รอบเร็ว · แตะใบที่จะใช้ใน Q1 อีกใบเก็บไว้ Q2" />
        {humans.map(({ c, id }) => (
          <div key={id} className="flex items-center gap-3">
            <span className="flex w-24 flex-none items-center gap-1.5 text-sm font-bold">
              <Car {...look(c)} num={c.num} width={36} />
              {c.name}
            </span>
            {q.hands[id].map((card, k) => {
              const on = (picks[id] ?? 0) === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicks((p) => ({ ...p, [id]: k as 0 | 1 }))}
                  className={`bg-deal flex h-20 flex-1 flex-col items-center justify-center rounded-xl border-2 ${
                    on ? "border-white bg-[#15803d] text-white" : "border-[#15803d]/60 bg-[#0f1f15] text-white/75"
                  }`}
                  style={{ animationDelay: `${k * 0.08}s` }}
                >
                  <span className="poster text-[10px] opacity-80">{on ? "Q1" : "Q2"}</span>
                  <span className="poster text-3xl leading-none tabular-nums">{card}</span>
                  <span className="text-[10px] tabular-nums opacity-80">{lapTime(card)}</span>
                </button>
              );
            })}
          </div>
        ))}
        <Cta onClick={() => setQ(runQ1(q, cars, picks))}>ปล่อยรถลง Q1</Cta>
      </section>
    );
  }

  const order = byTime(q);
  const cut = q.stage === "q1" ? Math.ceil(order.length / 2) : order.length;
  const extraRow = (id: number) =>
    canExtra(q, cars, id) ? (
      <button
        type="button"
        onClick={() => setQ(extraLap(q, cars, id))}
        className="flex-none rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-bold text-white hover:border-white/60"
      >
        รอบพิเศษ
      </button>
    ) : q.extra[id] ? (
      <span className="flex-none text-[10px] text-yellow-400">ยางสึก {HALF_WEAR} ขั้น</span>
    ) : null;

  const row = (id: number, rank: number, out = false) => {
    const c = cars[id];
    const t = q.times[id];
    const flash = q.last?.id === id;
    return (
      <li
        key={id}
        className={`flex min-h-10 items-center gap-2 rounded-lg px-2 ${out ? "opacity-55" : ""} ${c.ai ? "" : "bg-[#1a1a20]"} ${flash ? "bg-live" : ""}`}
      >
        <span className="poster w-7 text-xs text-white/60 tabular-nums">P{rank}</span>
        <Car {...look(c)} num={c.num} width={30} />
        <span className={`min-w-0 flex-1 truncate text-sm ${c.ai ? "text-white/70" : "font-bold text-white"}`}>{c.name}</span>
        {!out && !c.ai && extraRow(id)}
        <span className="poster w-20 text-right text-sm tabular-nums">{t !== null ? lapTime(t) : "—"}</span>
      </li>
    );
  };

  return (
    <section className="card space-y-3 p-4" aria-label={`ผล ${q.stage === "q1" ? "Q1" : "Q2"}`}>
      <Head
        title={q.stage === "q1" ? "ผล Q1" : q.stage === "q2" ? "ผล Q2 — ชิงโพล" : "กริดออกสตาร์ท"}
        sub={
          q.stage === "q1"
            ? `ครึ่งหลังตกรอบ · รอบพิเศษได้คันละครั้ง (จั่วเพิ่ม เร็วกว่าถึงนับ แต่ยางออกสตาร์ทสึก ${HALF_WEAR} ขั้น)`
            : q.stage === "q2"
              ? "6 คันวิ่งด้วยไพ่ที่เก็บไว้ · ใครยังไม่ใช้รอบพิเศษ ใช้ได้ตอนนี้"
              : "เรียงตามผลควอลิฟาย"
        }
      />
      {q.last && (
        <p className="rounded-lg bg-[#0f1f15] px-3 py-2 text-xs text-white" role="status">
          #{cars[q.last.id].num} รอบพิเศษได้ {lapTime(q.last.card)} — {q.last.better ? "เร็วขึ้น!" : "ช้ากว่าเดิม ใช้เวลาเดิม"}
        </p>
      )}
      {q.stage === "done" ? (
        <ol className="grid grid-cols-2 gap-1.5">
          {q.grid.map((id, i) => (
            <li key={id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${cars[id].ai ? "bg-[#141418] text-white/70" : "bg-[#1a1a20] font-bold"}`}>
              <span className="poster w-6 text-white/60 tabular-nums">P{i + 1}</span>
              <Car {...look(cars[id])} num={cars[id].num} width={26} />
              <span className="truncate">{cars[id].name}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-1">
          {order.flatMap((id, i) => [
            ...(i === cut && q.stage === "q1"
              ? [
                  <li key="cut" className="mt-1 border-t border-dashed border-(--color-f1) pt-1 text-[10px] font-bold text-(--color-f1-text)">
                    ตกรอบ Q1
                  </li>,
                ]
              : []),
            row(id, i + 1, i >= cut),
          ])}
          {q.stage === "q2" && q.locked.map((id, i) => row(id, order.length + i + 1, true))}
        </ol>
      )}
      {q.stage === "q1" && <Cta onClick={() => setQ(toQ2(q, cars))}>ไป Q2</Cta>}
      {q.stage === "q2" && <Cta onClick={() => setQ(finishQuali(q))}>สรุปกริด</Cta>}
      {q.stage === "done" && <Cta onClick={() => onDone(q.grid, cars.map((_, id) => startWear(q, id)))}>เข้ากริด ออกสตาร์ท</Cta>}
    </section>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2">
      <Timer className="mt-0.5 h-5 w-5 flex-none text-[#22c55e]" aria-hidden />
      <div>
        <h2 className="poster text-lg text-white">{title}</h2>
        <p className="text-xs text-white/60">{sub}</p>
      </div>
    </div>
  );
}

function Cta({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-12 w-full rounded-full bg-(--color-f1) px-5 text-base font-bold text-white">
      {children}
    </button>
  );
}
