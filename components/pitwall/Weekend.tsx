"use client";

import { useState } from "react";
import { Check, Copy, Crown, Flag, Trophy, Users } from "lucide-react";
import Car from "@/components/pitwall/Car";
import { Btn, Card, Head, Seg, TyreDot, fmtLap, teamOf } from "@/components/pitwall/ui";
import { raceWear, setupPenalty, tyreLife } from "@/lib/pitwall/model";
import type { Config, Msg, Snapshot } from "@/lib/pitwall/room";
import { CIRCUITS, TEAMS, circuitName } from "@/lib/pitwall/teams";
import { buildTrack } from "@/lib/pitwall/track";
import { COMPOUNDS, COMPOUND_INFO, type AiLevel, type Compound, type QualiFormat } from "@/lib/pitwall/types";

type Props = { snap: Snapshot; me: string; send: (m: Msg) => void };

const myPlayer = (snap: Snapshot, me: string) => snap.players.find((p) => p.id === me);
export const myCars = (snap: Snapshot, me: string) => {
  const p = myPlayer(snap, me);
  return p?.team === null || p?.team === undefined ? [] : snap.cars.filter((c) => c.team === p.team);
};

function Timer({ s }: { s: number }) {
  if (s < 0) return null;
  return <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white/80">เหลือ {Math.ceil(s)} วิ</span>;
}

/* ---------- ห้องรอ ---------- */

export function Lobby({ snap, me, send, code }: Props & { code: string | null }) {
  const p = myPlayer(snap, me);
  const host = !!p?.host;
  const cfg = snap.config;
  const set = (c: Partial<Config>) => send({ t: "config", config: c });
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      {snap.online && (
        <Card>
          <Head kicker="ห้องออนไลน์" title="ชวนเพื่อนเข้าห้อง" sub="ส่งรหัสหรือลิงก์นี้ให้เพื่อน แล้วรอทุกคนเลือกทีม" />
          {code && (
            <div className="flex items-center gap-2">
              <span className="poster rounded-xl bg-[#08080A] px-4 py-2 text-3xl tracking-widest">{code}</span>
              <Btn
                tone="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/pitwall?room=${code}`);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <Check className="inline h-4 w-4" /> : <Copy className="inline h-4 w-4" />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </Btn>
            </div>
          )}
        </Card>
      )}

      <Card>
        <Head kicker="ทีม" title="เลือกทีมของคุณ" sub="คุมรถ 2 คันของทีม ทีมที่ไม่มีคนเลือกเป็นทีม AI" />
        <div className="grid gap-2 sm:grid-cols-2">
          {TEAMS.map((t, i) => {
            const owner = snap.players.find((x) => x.team === i);
            const mine = owner?.id === me;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!!owner && !mine}
                aria-pressed={mine}
                onClick={() => send({ t: "team", team: mine ? null : i })}
                className={`flex items-center gap-3 rounded-xl border-2 p-2.5 text-left disabled:opacity-60 ${mine ? "border-white bg-white/10" : "border-white/10 hover:border-white/30"}`}
              >
                <span className="h-9 w-2 flex-none rounded-full" style={{ background: t.color }} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-white">{t.name}</b>
                  <span className="block truncate text-[11px] text-white/60">{t.drivers.map((d) => d.name).join(" · ")}</span>
                </span>
                <span className="flex-none text-right text-[10px] text-white/60">
                  {owner ? (mine ? "ทีมคุณ" : owner.name) : `รถ ${"★".repeat(Math.max(1, 4 - Math.round(t.pace * 3)))}`}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Head kicker="ตั้งค่า" title={host ? "ตั้งค่าการแข่ง" : "ตั้งค่าการแข่ง (เจ้าของห้องเป็นคนเลือก)"} />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-white/70">สนาม (แตะเรียงลำดับ · เลือกหลายสนาม = ลีก)</p>
            <div className="flex flex-wrap gap-1.5">
              {CIRCUITS.map((c) => {
                const idx = cfg.circuits.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!host}
                    aria-pressed={idx >= 0}
                    onClick={() => set({ circuits: idx >= 0 ? cfg.circuits.filter((x) => x !== c.id) : [...cfg.circuits, c.id] })}
                    className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold disabled:opacity-70 ${idx >= 0 ? "border-white bg-white text-[#08080A]" : "border-white/20 text-white/75"}`}
                  >
                    {idx >= 0 && <span className="tabular-nums">{idx + 1}.</span>}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <Row label="ความยาวเรซ">
            <Seg
              value={cfg.length}
              disabled={!host}
              onChange={(v) => set({ length: v })}
              options={[
                { v: "short", label: "สั้น ~3 นาที" },
                { v: "normal", label: "กลาง ~5 นาที" },
                { v: "long", label: "ยาว ~8 นาที" },
              ]}
            />
          </Row>
          <Row label="ควอลิฟาย">
            <Seg<QualiFormat>
              value={cfg.quali}
              disabled={!host}
              onChange={(v) => set({ quali: v })}
              options={[
                { v: "knockout", label: "Q1·Q2·Q3" },
                { v: "single", label: "ช่วงเดียว" },
                { v: "none", label: "สุ่มกริด" },
              ]}
            />
          </Row>
          <Row label="ทีม AI">
            <Seg<AiLevel>
              value={cfg.ai}
              disabled={!host}
              onChange={(v) => set({ ai: v })}
              options={[
                { v: "easy", label: "ง่าย" },
                { v: "normal", label: "ปกติ" },
                { v: "hard", label: "ยาก" },
              ]}
            />
          </Row>
        </div>
      </Card>

      {snap.online && (
        <Card>
          <Head kicker="ผู้เล่น" title={`ในห้อง ${snap.players.length} คน`} />
          <ul className="space-y-1.5 text-sm">
            {snap.players.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <Users className="h-4 w-4 text-white/50" />
                <span className="font-bold text-white">{x.name}</span>
                {x.host && <Crown className="h-3.5 w-3.5 text-yellow-400" aria-label="เจ้าของห้อง" />}
                <span className="text-white/60">{x.team === null ? "ยังไม่เลือกทีม" : TEAMS[x.team].name}</span>
                {!x.online && <span className="text-xs text-white/50">(หลุด)</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {host ? (
        <Btn className="w-full" disabled={!snap.players.some((x) => x.team !== null)} onClick={() => send({ t: "start" })}>
          เริ่มสุดสัปดาห์แข่ง ({cfg.circuits.length} สนาม)
        </Btn>
      ) : (
        <p className="text-center text-sm text-white/60">รอเจ้าของห้องกดเริ่ม…</p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-white/70">{label}</p>
      {children}
    </div>
  );
}

/* ---------- เตรียมรถ ---------- */

export function Prep({ snap, me, send }: Props) {
  const track = buildTrack(snap.circuit);
  const mine = myCars(snap, me);
  const p = myPlayer(snap, me);
  const ideal = track?.idealDownforce ?? 0.5;
  const kind = ideal < 0.35 ? "แรงกดต่ำ (ทางตรงยาว)" : ideal > 0.65 ? "แรงกดสูง (โค้งเยอะ)" : "แรงกดกลาง ๆ";
  const others = snap.players.filter((x) => x.team !== null && x.online);
  return (
    <div className="space-y-4">
      <Card>
        <Head
          kicker={`สนามที่ ${snap.round + 1}/${snap.config.circuits.length}`}
          title={circuitName(snap.circuit)}
          sub={`${snap.laps} รอบ · เวลาต่อรอบราว ${fmtLap(track?.baseLap ?? 0)} · สนามนี้เหมาะกับ${kind}`}
        />
        <Timer s={snap.timer} />
      </Card>
      {mine.map((c) => {
        const t = teamOf(c);
        const pen = setupPenalty(c.downforce, ideal);
        return (
          <Card key={c.id}>
            <div className="flex items-center gap-2">
              <Car color={t.color} ink={t.ink} num={c.num} width={44} />
              <b className="text-white">{c.name}</b>
            </div>
            <label className="block space-y-1.5" htmlFor={`df-${c.id}`}>
              <span className="flex justify-between text-[11px] text-white/65">
                <span>← ทางตรงเร็ว แซงง่าย</span>
                <span>เข้าโค้งเร็ว ยางสึกช้า →</span>
              </span>
              <input
                id={`df-${c.id}`}
                type="range"
                min={0}
                max={100}
                value={Math.round(c.downforce * 100)}
                onChange={(e) => send({ t: "setup", car: c.id, downforce: Number(e.target.value) / 100 })}
                className="w-full accent-[#E10600]"
              />
            </label>
            <p className="text-xs text-white/70">
              แรงกด {Math.round(c.downforce * 100)}% · {pen < 0.05 ? "เข้ากับสนามมาก" : `เสียเวลาราว ${pen.toFixed(2)} วิ/รอบ`}
            </p>
          </Card>
        );
      })}
      <Card>
        <Head kicker="ยาง" title="ยางของสุดสัปดาห์" sub={`ใช้ได้ทั้งควอลิฟายและเรซ ยางที่ใช้แล้วจะสึกติดไปด้วย · เรซ ${snap.laps} รอบ ต้องเข้าพิทอย่างน้อย 1 ครั้ง`} />
        <div className="grid grid-cols-3 gap-2 text-xs">
          {COMPOUNDS.map((k) => (
            <div key={k} className="flex flex-col items-center gap-1 rounded-xl bg-[#08080A] p-2">
              <TyreDot c={k} size={28} />
              <b className="text-white">{COMPOUND_INFO[k].label} ×{mine[0]?.sets.filter((s) => s.compound === k).length ?? 0}</b>
              <span className="text-white/60">ทนราว {Math.round(tyreLife(k, "normal", raceWear(snap.laps)))} รอบ</span>
            </div>
          ))}
        </div>
      </Card>
      <Btn className="w-full" tone={p?.ready ? "ghost" : "red"} onClick={() => send({ t: "ready", v: !p?.ready })}>
        {p?.ready ? `พร้อมแล้ว (รออีก ${others.filter((x) => !x.ready).length} คน) — แตะเพื่อยกเลิก` : snap.config.quali === "none" ? "พร้อม · ไปกริด" : "พร้อม · ไปควอลิฟาย"}
      </Btn>
    </div>
  );
}

/* ---------- กริด: เลือกยางออกสตาร์ท ---------- */

export function Grid({ snap, me, send }: Props) {
  const mine = myCars(snap, me);
  const p = myPlayer(snap, me);
  return (
    <div className="space-y-4">
      <Card>
        <Head kicker="กริดออกสตาร์ท" title={circuitName(snap.circuit)} sub={`${snap.laps} รอบ · ต้องเข้าพิทอย่างน้อย 1 ครั้ง ไม่งั้นบวก 20 วิ`} />
        <Timer s={snap.timer} />
        <ol className="grid grid-cols-2 gap-1 text-xs">
          {snap.grid.map((id, i) => {
            const c = snap.cars[id];
            const t = teamOf(c);
            const isMine = mine.some((m) => m.id === id);
            return (
              <li key={id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${isMine ? "bg-(--color-f1)/20" : "bg-white/[0.03]"}`}>
                <span className="poster w-6 tabular-nums">P{i + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: t.color }} />
                <span className="truncate font-bold text-white">#{c.num}</span>
                <span className="truncate text-white/60">{c.name.split(" ")[0]}</span>
              </li>
            );
          })}
        </ol>
      </Card>
      {mine.map((c) => {
        const chosen = snap.startTyre[c.id] ?? "medium";
        return (
          <Card key={c.id}>
            <p className="text-sm font-bold text-white">
              #{c.num} {c.name} · ออกสตาร์ท P{snap.grid.indexOf(c.id) + 1}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {COMPOUNDS.map((k) => {
                const sets = c.sets.filter((s) => s.compound === k);
                const best = sets.reduce((a, s) => Math.min(a, s.wear), 1);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={chosen === k}
                    disabled={!sets.length}
                    onClick={() => send({ t: "tyre", car: c.id, compound: k })}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs disabled:opacity-40 ${chosen === k ? "border-white bg-white/10" : "border-white/10"}`}
                  >
                    <TyreDot c={k} size={26} />
                    <b className="text-white">{COMPOUND_INFO[k].label}</b>
                    <span className="text-white/60">{best > 0.01 ? `ดีสุดสึก ${Math.round(best * 100)}%` : "มีชุดใหม่"}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
      <Btn className="w-full" tone={p?.ready ? "ghost" : "red"} onClick={() => send({ t: "ready", v: !p?.ready })}>
        {p?.ready ? "พร้อมแล้ว — แตะเพื่อยกเลิก" : "พร้อมออกสตาร์ท"}
      </Btn>
    </div>
  );
}

/* ---------- ผลการแข่ง / ตารางคะแนน ---------- */

export function Results({ snap, me, send }: Props) {
  const p = myPlayer(snap, me);
  const mine = new Set(myCars(snap, me).map((c) => c.id));
  const fastest = snap.race?.fastest;
  const last = snap.round + 1 >= snap.config.circuits.length;
  return (
    <div className="space-y-4">
      <Card>
        <Head kicker="ผลการแข่ง" title={circuitName(snap.circuit)} sub={fastest ? `รอบเร็วสุด #${snap.cars[fastest.car].num} ${fmtLap(fastest.time)}` : undefined} />
        <ol className="space-y-1">
          {snap.results?.map((r) => {
            const c = snap.cars[r.id];
            const t = teamOf(c);
            return (
              <li key={r.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${mine.has(r.id) ? "bg-(--color-f1)/20" : "bg-white/[0.03]"}`}>
                <span className="poster w-7 flex-none tabular-nums">{r.out ? "DNF" : `P${r.pos}`}</span>
                <Car color={t.color} ink={t.ink} num={c.num} width={26} />
                <span className="min-w-0 flex-1 truncate font-bold text-white">{c.name}</span>
                <span className="flex flex-none items-center gap-0.5" aria-label={`${r.stops} สต็อป`} title={`${r.stops} สต็อป`}>
                  {r.stints.map((k, i) => (
                    <TyreDot key={i} c={k} size={12} />
                  ))}
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-white/80">
                  {r.gap}
                  {r.penalty ? " *" : ""}
                </span>
                <span className="w-8 text-right font-bold tabular-nums text-white">{r.points || ""}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-white/60">วงกลมคือยางแต่ละช่วงตามลำดับ{snap.results?.some((r) => r.penalty) ? " · * โดนบวก 20 วิ เพราะไม่เข้าพิท" : ""}</p>
      </Card>
      <Standings snap={snap} me={me} />
      {p?.host ? (
        <Btn className="w-full" onClick={() => send({ t: "next" })}>
          {last ? "ดูตารางแชมป์" : `ไปสนามถัดไป: ${circuitName(snap.config.circuits[snap.round + 1])}`}
        </Btn>
      ) : (
        <p className="text-center text-sm text-white/60">รอเจ้าของห้องไปต่อ…</p>
      )}
    </div>
  );
}

export function Standings({ snap, me }: { snap: Snapshot; me: string }) {
  const mine = new Set(myCars(snap, me).map((c) => c.id));
  const drivers = Object.entries(snap.standings.drivers)
    .map(([id, pts]) => ({ id: Number(id), pts }))
    .sort((a, b) => b.pts - a.pts);
  const teams = Object.entries(snap.standings.teams)
    .map(([id, pts]) => ({ id: Number(id), pts }))
    .sort((a, b) => b.pts - a.pts);
  return (
    <Card>
      <Head kicker="ตารางแชมป์" title={`หลัง ${snap.history.length} สนาม`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ol className="space-y-1 text-sm">
          <li className="text-xs font-bold text-white/60">นักขับ</li>
          {drivers.slice(0, 10).map((d, i) => {
            const c = snap.cars[d.id];
            return (
              <li key={d.id} className={`flex items-center gap-2 ${mine.has(d.id) ? "text-white" : "text-white/75"}`}>
                <span className="w-5 tabular-nums">{i + 1}</span>
                <span className="h-3 w-1 rounded-full" style={{ background: teamOf(c).color }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <b className="tabular-nums">{d.pts}</b>
              </li>
            );
          })}
        </ol>
        <ol className="space-y-1 text-sm">
          <li className="text-xs font-bold text-white/60">ทีม</li>
          {teams.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 text-white/80">
              <span className="w-5 tabular-nums">{i + 1}</span>
              <span className="h-3 w-1 rounded-full" style={{ background: TEAMS[t.id].color }} />
              <span className="min-w-0 flex-1 truncate">{TEAMS[t.id].name}</span>
              <b className="tabular-nums">{t.pts}</b>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

export function Final({ snap, me, send }: Props) {
  const p = myPlayer(snap, me);
  const top = Object.entries(snap.standings.drivers).sort((a, b) => b[1] - a[1])[0];
  const champ = top ? snap.cars[Number(top[0])] : null;
  return (
    <div className="space-y-4">
      <Card className="text-center">
        <Trophy className="mx-auto h-10 w-10 text-yellow-400" aria-hidden />
        <Head kicker="จบฤดูกาล" title={champ ? `${champ.name} แชมป์!` : "จบฤดูกาล"} sub={champ ? `${teamOf(champ).name} · ${top![1]} คะแนน` : undefined} />
      </Card>
      <Standings snap={snap} me={me} />
      {p?.host && (
        <Btn className="w-full" onClick={() => send({ t: "lobby" })}>
          <Flag className="inline h-4 w-4" /> เล่นใหม่
        </Btn>
      )}
    </div>
  );
}

export const compoundLabel = (c: Compound) => COMPOUND_INFO[c].label;
