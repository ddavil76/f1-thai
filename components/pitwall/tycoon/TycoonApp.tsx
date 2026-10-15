"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, CloudRain, Flag, Gavel, Gem, Radio, Target, X } from "lucide-react";
import { Btn, Card, Head } from "@/components/pitwall/ui";
import { Board, ME, tokenLabel } from "@/components/pitwall/tycoon/Board";
import { NAMES_NOTE, TEAMS } from "@/lib/pitwall/teams";
import { BIZ_SQUARES, BOARD, bizRent, circuitRent, GROUPS, groupSquares, isOwnable, JAIL_FINE, LEVEL_NAME, MAX_LEVEL, PASS_START, SIZE, START_CASH } from "@/lib/pitwall/tycoon/board";
import {
  act, blocks, botAction, canBuild, cardText, GOAL_REWARD, goalText, helpsGoal, holdings, money, newGame, ranking, rentOf, TAKEOVER, takeoverPrice, worth,
  type Action, type Game,
} from "@/lib/pitwall/tycoon/game";

const SAVE_KEY = "pitwall-tycoon";
const NAME_KEY = "pitwall-name";
const BOT_NAMES = ["บอท โรสเบิร์ก", "บอท ฮาคิเนน", "บอท ลาวด้า"];
const STEP_MS = 190;

function load(): Game | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Game;
    return g?.v === 2 ? g : null;
  } catch {
    return null;
  }
}
function save(g: Game | null) {
  try {
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify(g));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* โหมดส่วนตัว: เล่นต่อได้แต่ไม่จำ */
  }
}

/** เกมเศรษฐีสายแข่งรถ "เจ้าพ่อพิทเลน" — เล่นคนเดียวกับบอท 1–3 ตัว */
export default function TycoonApp({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [saved, setSaved] = useState<Game | null>(null);
  useEffect(() => {
    // อ่านเซฟหลัง mount (ไม่ให้ HTML ฝั่งเซิร์ฟเวอร์ต่างจากเครื่อง)
    const g = load();
    queueMicrotask(() => setSaved(g));
  }, []);

  const update = (g: Game | null) => {
    setGame(g);
    save(g);
  };

  if (!game)
    return (
      <Setup
        saved={saved}
        onExit={onExit}
        onResume={() => saved && setGame(saved)}
        onStart={(g) => {
          setSaved(null);
          update(g);
        }}
      />
    );
  return (
    <Table
      game={game}
      onChange={update}
      onQuit={() => {
        setSaved(game.phase.k === "over" ? null : game);
        setGame(null);
      }}
      onNew={() => {
        save(null);
        setSaved(null);
        setGame(null);
      }}
    />
  );
}

/* ---------------- ตั้งค่า ---------------- */

function Setup({ saved, onExit, onResume, onStart }: { saved: Game | null; onExit: () => void; onResume: () => void; onStart: (g: Game) => void }) {
  const [team, setTeam] = useState(3);
  const [bots, setBots] = useState(3);
  const [laps, setLaps] = useState(6);

  const start = () => {
    let name = "คุณ";
    try {
      name = localStorage.getItem(NAME_KEY)?.trim() || name;
    } catch {
      /* ใช้ชื่อเริ่มต้น */
    }
    const others = TEAMS.map((_, i) => i).filter((i) => i !== team);
    const picks = [team, ...others.slice(0, bots)];
    onStart(
      newGame({
        seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0,
        names: [name, ...BOT_NAMES.slice(0, bots)],
        colors: picks.map((i) => ({ color: TEAMS[i].color, ink: TEAMS[i].ink })),
        bots: [false, ...Array(bots).fill(true)],
        laps,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onExit}>
        <ChevronLeft className="inline h-4 w-4" /> เลือกโหมด
      </Btn>
      <Card className="card-poster">
        <Head
          kicker="BOARD GAME"
          title="เจ้าพ่อพิทเลน"
          sub="เกมเศรษฐีสายแข่งรถ — ทอยเต๋าวนสนาม ซื้อสนามแข่ง เก็บค่าตั๋ว สร้างอัฒจันทร์และแพดด็อก VIP ใครรวยที่สุดตอนจบฤดูกาลชนะ"
        />
        {saved && saved.phase.k !== "over" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-3">
            <span className="flex-1 text-sm text-white/80">
              มีเกมค้างอยู่ · รอบที่ {saved.round} · เงินคุณ {money(saved.players[0].cash)}
            </span>
            <Btn tone="white" onClick={onResume}>
              เล่นต่อ
            </Btn>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs font-bold text-white/70">สีรถของคุณ</p>
          <div className="flex flex-wrap gap-2">
            {TEAMS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={team === i}
                aria-label={t.name}
                onClick={() => setTeam(i)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${team === i ? "border-white" : "border-transparent"}`}
              >
                <span className="h-7 w-7 rounded-full" style={{ background: t.color }} />
              </button>
            ))}
          </div>
        </div>
        <Choice label="คู่แข่ง (บอท)" value={bots} options={[1, 2, 3]} fmt={(n) => `${n} คน`} onChange={setBots} />
        <Choice label="ความยาวฤดูกาล" value={laps} options={[4, 6, 8]} fmt={(n) => `${n} รอบ`} onChange={setLaps} hint={laps === 4 ? "ราว 10 นาที" : laps === 6 ? "ราว 15–20 นาที" : "ราว 25 นาที"} />
        <Btn className="w-full" onClick={start}>
          <Flag className="inline h-4 w-4" /> เริ่มเกมใหม่
        </Btn>
      </Card>
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-bold">วิธีเล่น</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-white/75">
            <li>เริ่มด้วยเงิน {money(START_CASH)} · ผ่านเส้นสตาร์ทรับเงินสปอนเซอร์ {money(PASS_START)}</li>
            <li>ตกสนามที่ยังไม่มีเจ้าของ ซื้อได้ · ใครตกสนามของคุณต้องจ่ายค่าตั๋ว</li>
            <li>ถือครบทั้งกลุ่มสี (3 สนาม) ค่าตั๋ว ×2 และสร้างอัฒจันทร์ได้ 3 ชั้น แล้วอัปเป็นแพดด็อก VIP</li>
            <li>ธุรกิจ 4 แห่ง (ยาง เครื่องยนต์ ถ่ายทอดสด โลจิสติกส์) ยิ่งถือมาก ค่าบริการยิ่งแพง</li>
            <li>ทอยได้คู่ = ดูดสลิปสตรีม ทอยอีกครั้ง · คู่ 3 ครั้งติด = ขับเร็วในพิทเลน ไปห้องสจ๊วต</li>
            <li>ห้องสจ๊วต: ทอยคู่เพื่อออก หรือจ่าย {money(JAIL_FINE)} · การ์ดอุทธรณ์ออกฟรี</li>
            <li>
              <b>Race Week</b>: ทุกรอบจะมีกลุ่มสีหนึ่งเป็นเจ้าภาพ ค่าตั๋ว ×2 และเจ้าของได้ค่าลิขสิทธิ์ — เกมบอกกลุ่มรอบหน้าไว้ล่วงหน้า ซื้อดักไว้ได้
            </li>
            <li>
              <b>เป้าสปอนเซอร์</b>: คุณมี 2 เป้า (เช่น ถือ 2 สนามในกลุ่มเอเชีย) ทำได้รับโบนัสทันทีแล้วได้เป้าใหม่
            </li>
            <li>
              <b>เทคโอเวอร์</b>: ตกสนามคู่แข่งที่ยังไม่ครบกลุ่ม จ่ายค่าตั๋วแล้วซื้อต่อได้ {TAKEOVER} เท่า — ครบกลุ่มแล้วจะถูกล็อก ไม่มีใครแย่งได้
            </li>
            <li>
              <b>ประมูลยื่นซอง</b>: ถ้าไม่ซื้อ ทุกคนเสนอราคาพร้อมกันครั้งเดียว ใครเสนอสูงสุดได้ไป
            </li>
            <li>จบฤดูกาลเมื่อมีคนวิ่งครบจำนวนรอบ — มูลค่ารวม (เงิน + สนาม + สิ่งปลูกสร้าง) สูงสุดชนะ</li>
          </ul>
        </details>
      </Card>
      <p className="text-center text-[11px] text-white/50">{NAMES_NOTE}</p>
    </div>
  );
}

function Choice({ label, value, options, fmt, onChange, hint }: { label: string; value: number; options: number[]; fmt: (n: number) => string; onChange: (n: number) => void; hint?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-white/70">
        {label} {hint && <span className="font-normal text-white/55">· {hint}</span>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)} className={`min-h-11 rounded-xl border text-sm font-bold ${value === n ? "border-white bg-white text-[#08080A]" : "border-white/15 bg-white/5"}`}>
            {fmt(n)}
          </button>
        ))}
      </div>
    </div>
  );
}


/* ---------------- โต๊ะเกม ---------------- */

function Table({ game, onChange, onQuit, onNew }: { game: Game; onChange: (g: Game) => void; onQuit: () => void; onNew: () => void }) {
  const [shown, setShown] = useState<number[]>(() => game.players.map((p) => p.pos));
  const [roll, setRoll] = useState<{ n: number; dice: [number, number] | null }>({ n: 0, dice: game.dice });
  const [rolling, setRolling] = useState(false);
  const [flash, setFlash] = useState<{ sq: number; id: number } | null>(null);
  const [info, setInfo] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const [seenAuction, setSeenAuction] = useState(game.auction?.id ?? 0);
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const stepMs = fast ? 90 : STEP_MS;
  const moving = shown.some((s, i) => !game.players[i].out && s !== game.players[i].pos);
  const showAuction = game.auction !== null && game.auction.id !== seenAuction && !game.players[ME].out;
  const busy = moving || rolling || showAuction;
  const cur = game.players[game.turn];
  const mine = game.turn === ME && !cur.bot;
  const ph = game.phase;

  // เดินหมากทีละช่อง (ไกลเกิน 12 ช่อง/ถอยหลัง = วาร์ป) · หมากตาปัจจุบันถึงที่ = ช่องกะพริบ
  useEffect(() => {
    if (!moving || rolling) return;
    const t = setTimeout(() => {
      const g = gameRef.current;
      const next = shown.map((s, i) => {
        const to = g.players[i].pos;
        if (s === to) return s;
        const d = (to - s + SIZE) % SIZE;
        return d > 12 ? to : (s + 1) % SIZE;
      });
      setShown(next);
      if (shown[g.turn] !== g.players[g.turn].pos && next[g.turn] === g.players[g.turn].pos) setFlash({ sq: next[g.turn], id: Date.now() });
    }, stepMs);
    return () => clearTimeout(t);
  }, [shown, moving, rolling, stepMs]);

  const run = (a: Action) => {
    const g = gameRef.current;
    const next = act(g, a);
    if (next === g) return;
    if (a.t === "roll" && next.dice) {
      // ลูกเต๋าโยนและหมุนจนหยุดก่อน แล้วหมากค่อยเดิน
      setRolling(true);
      setRoll((r) => ({ n: r.n + 1, dice: next.dice }));
      setTimeout(() => {
        setRolling(false);
        onChange(next);
      }, fast ? 480 : 950);
      return;
    }
    onChange(next);
  };

  // บอทเล่นเอง (รอหมากเดิน/ลูกเต๋าหยุดก่อน · ประมูลรอคุณยื่นซอง)
  useEffect(() => {
    if (busy || ph.k === "over" || ph.k === "auction" || !cur.bot) return;
    const wait = ph.k === "card" ? 1600 : ph.k === "buy" || ph.k === "takeover" ? 1000 : 700;
    const t = setTimeout(() => run(botAction(gameRef.current)), fast ? wait / 3 : wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, busy, fast]);

  // ตาคุณไม่มีอะไรให้ทำต่อ (ไม่มีสนามให้สร้าง) → จบตาเอง
  const canBuildAny = holdings(game, ME).some((i) => canBuild(game, ME, i));
  useEffect(() => {
    if (busy || !mine || ph.k !== "end" || canBuildAny) return;
    const t = setTimeout(() => run({ t: "end" }), 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, busy]);

  const order = useMemo(() => ranking(game), [game]);

  // มีเรื่องให้ตัดสินใจ (ซื้อ / เทคโอเวอร์) → เลื่อนแผงคำสั่งขึ้นมาให้เห็น (จอมือถือกระดานกินพื้นที่)
  const panel = useRef<HTMLDivElement>(null);
  const decide = mine && !busy && (ph.k === "buy" || ph.k === "takeover" || ph.k === "over");
  useEffect(() => {
    if (decide) panel.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [decide]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Btn tone="ghost" onClick={onQuit}>
          <ChevronLeft className="inline h-4 w-4" /> พักเกม
        </Btn>
        <span className="poster flex-1 text-right text-sm text-white/80 tabular-nums">
          รอบที่ {Math.max(...game.players.map((p) => p.laps))}/{game.laps}
        </span>
        <button type="button" onClick={() => setFast((f) => !f)} aria-pressed={fast} className={`min-h-9 rounded-full px-3 text-xs font-bold ${fast ? "bg-white text-[#08080A]" : "bg-white/10"}`}>
          เร่งความเร็ว {fast ? "เปิด" : "ปิด"}
        </button>
      </div>

      <Players game={game} order={order} />

      <Board game={game} shown={shown} stepMs={stepMs} roll={roll} flash={flash} onCell={setInfo} />

      <div ref={panel} className="scroll-mb-4">
        <Actions game={game} busy={busy} mine={mine} run={run} onNew={onNew} order={order} canBuildAny={canBuildAny} />
      </div>

      <Goals game={game} />

      <MyAssets game={game} mine={mine && !busy} run={run} onInfo={setInfo} />

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-bold">บันทึกเกม</summary>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-[13px] text-white/75">
            {[...game.log].reverse().map((l) => (
              <li key={l.id} className={l.tone === "good" ? "text-[#4ade80]" : l.tone === "bad" ? "text-[#fca5a5]" : ""}>
                {l.text}
              </li>
            ))}
          </ul>
        </details>
      </Card>
      <p className="text-center text-[11px] text-white/50">{NAMES_NOTE}</p>

      {info !== null && <SquareInfo i={info} game={game} canAct={mine && !busy} run={run} onClose={() => setInfo(null)} />}
      {ph.k === "card" && !busy && <CardModal game={game} mine={mine} onOk={() => run({ t: "ok" })} />}
      {ph.k === "auction" && !busy && !game.players[ME].out && <AuctionModal game={game} sq={ph.sq} onBid={(n) => run({ t: "bid", amount: n })} />}
      {showAuction && !moving && !rolling && game.auction && <AuctionResult game={game} onOk={() => setSeenAuction(game.auction!.id)} />}
    </div>
  );
}

/* ---------------- ผู้เล่น + ตัวเลขเงินลอย ---------------- */

function Players({ game, order }: { game: Game; order: number[] }) {
  const prev = useRef(game.players.map((p) => p.cash));
  const [floats, setFloats] = useState<{ id: number; k: number; d: number }[]>([]);
  useEffect(() => {
    const diffs = game.players.map((p, k) => ({ k, d: p.cash - prev.current[k] })).filter((x) => x.d !== 0);
    prev.current = game.players.map((p) => p.cash);
    if (!diffs.length) return;
    const stamp = Date.now();
    const add = diffs.map((x, j) => ({ id: stamp + j, ...x }));
    const t0 = setTimeout(() => setFloats((f) => [...f, ...add]), 0);
    setTimeout(() => setFloats((f) => f.filter((x) => !add.some((a) => a.id === x.id))), 1500);
    return () => clearTimeout(t0);
  }, [game]);

  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${game.players.length}, minmax(0, 1fr))` }}>
      {game.players.map((p, i) => (
        <div
          key={i}
          className={`relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors sm:flex-row sm:gap-2 sm:p-2 ${game.turn === i && game.phase.k !== "over" ? "border-white/70 bg-white/10" : "border-white/10 bg-[#121216]"} ${p.out ? "opacity-40" : ""}`}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-black" style={{ background: p.color, color: p.ink }} aria-hidden>
            {tokenLabel(i)}
          </span>
          <span className="min-w-0 flex-1 text-center sm:text-left">
            <span className="hidden truncate text-[12px] font-bold sm:block">
              {p.name}
              {p.jail > 0 && <Gavel className="ml-1 inline h-3 w-3 text-[#fca5a5]" aria-label="อยู่ห้องสจ๊วต" />}
            </span>
            <span className="block text-[12px] font-bold text-white/85 tabular-nums sm:text-[13px]">
              {p.out ? "ล้มละลาย" : money(p.cash)}
              {p.jail > 0 && <Gavel className="ml-0.5 inline h-3 w-3 text-[#fca5a5] sm:hidden" aria-hidden />}
            </span>
          </span>
          <span className="hidden text-right text-[10px] leading-tight text-white/60 tabular-nums sm:block">
            อันดับ {order.indexOf(i) + 1}
            <br />
            รอบ {p.laps}
          </span>
          {floats
            .filter((f) => f.k === i)
            .map((f) => (
              <span key={f.id} className={`tc-float pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 sm:left-10 sm:translate-x-0 text-sm font-black tabular-nums ${f.d > 0 ? "text-[#4ade80]" : "text-[#f87171]"}`} aria-hidden>
                {f.d > 0 ? "+" : "−"}
                {money(Math.abs(f.d))}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- ตัวช่วยตัดสินใจซื้อ ---------------- */

type Hint = { t: string; tone: "good" | "warn" | "info" };

function hintsFor(g: Game, p: number, sq: number, cost: number): Hint[] {
  const s = BOARD[sq];
  const out: Hint[] = [];
  if (s.kind === "circuit") {
    const rest = groupSquares(s.group).filter((i) => i !== sq);
    const mine = rest.filter((i) => g.owner[i] === p).length;
    if (mine === 2) out.push({ t: "ครบกลุ่มทันที! ค่าตั๋ว ×2 · สร้างอัฒจันทร์ได้ · ล็อกไม่ให้ใครแย่ง", tone: "good" });
    else if (mine === 1 && rest.every((i) => g.owner[i] === p || g.owner[i] === null)) out.push({ t: "จะมี 2 ใน 3 ของกลุ่ม — อีกช่องเดียวครบ", tone: "info" });
    const b = blocks(g, p, sq);
    if (b !== null) out.push({ t: `กัน ${g.players[b].name} ไม่ให้ครบกลุ่ม`, tone: "good" });
    else
      for (const o of new Set(rest.map((i) => g.owner[i]).filter((o): o is number => o !== null && o !== p)))
        out.push({ t: `${g.players[o].name} ถือ ${rest.filter((i) => g.owner[i] === o).length} สนามในกลุ่มนี้`, tone: "info" });
    if (s.group === g.spot) out.push({ t: "กำลังเป็น Race Week — ค่าตั๋ว ×2 ตอนนี้", tone: "good" });
    else if (s.group === g.next) out.push({ t: "จะเป็น Race Week รอบหน้า (ได้ค่าลิขสิทธิ์ด้วย)", tone: "good" });
    if (mine < 2) out.push({ t: `ยังไม่ครบกลุ่ม — คู่แข่งตกช่องนี้ซื้อต่อได้ ${TAKEOVER} เท่า`, tone: "info" });
  } else if (s.kind === "biz") {
    const n = BIZ_SQUARES.filter((i) => g.owner[i] === p).length + 1;
    out.push({ t: `ธุรกิจแห่งที่ ${n} ของคุณ · ค่าบริการ ${money(bizRent(n))}`, tone: "info" });
  }
  const goal = helpsGoal(g, p, sq);
  if (goal) out.push({ t: `ช่วยเป้าสปอนเซอร์: ${goalText(goal)} (+${money(GOAL_REWARD[goal.k])})`, tone: "good" });
  if (g.players[p].cash - cost < 150) out.push({ t: "เงินจะเหลือน้อย ระวังจ่ายค่าตั๋วไม่ไหว", tone: "warn" });
  return out;
}

function Hints({ list }: { list: Hint[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-1">
      {list.map((h) => (
        <li key={h.t} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${h.tone === "good" ? "bg-[#22c55e]/12 text-[#86efac]" : h.tone === "warn" ? "bg-[#f59e0b]/12 text-[#fcd34d]" : "bg-white/5 text-white/75"}`}>
          {h.tone === "good" ? "✓ " : h.tone === "warn" ? "! " : "• "}
          {h.t}
        </li>
      ))}
    </ul>
  );
}

/** แถบเจ้าของสนามทั้งกลุ่ม */
function GroupDots({ game, sq }: { game: Game; sq: number }) {
  const s = BOARD[sq];
  if (s.kind !== "circuit") return null;
  return (
    <div className="flex items-center gap-1.5">
      {groupSquares(s.group).map((i) => {
        const o = game.owner[i];
        return (
          <span key={i} className={`flex h-7 min-w-0 flex-1 items-center justify-center truncate rounded-md border px-1 text-[10px] font-bold ${i === sq ? "border-white" : "border-white/15"}`} style={{ background: o !== null ? game.players[o].color : "transparent", color: o !== null ? game.players[o].ink : "rgb(255 255 255 / 0.7)" }}>
            {BOARD[i].name}
          </span>
        );
      })}
    </div>
  );
}

function SquareHead({ sq }: { sq: number }) {
  const s = BOARD[sq];
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 h-10 w-2 flex-none rounded-full" style={{ background: s.kind === "circuit" ? GROUPS[s.group].color : "#9ca3af" }} aria-hidden />
      <div className="flex-1">
        <p className="text-xs text-white/60">{s.kind === "circuit" ? `สนาม · กลุ่ม${GROUPS[s.group].name}` : "ธุรกิจ"}</p>
        <p className="poster text-2xl">{s.name}</p>
      </div>
    </div>
  );
}

/* ---------------- แผงคำสั่ง ---------------- */

function Actions({ game, busy, mine, run, onNew, order, canBuildAny }: { game: Game; busy: boolean; mine: boolean; run: (a: Action) => void; onNew: () => void; order: number[]; canBuildAny: boolean }) {
  const ph = game.phase;
  const me = game.players[ME];

  if (ph.k === "over")
    return (
      <Card className="bg-pop card-poster">
        <Head kicker="จบฤดูกาล" title={order[0] === ME ? "คุณคือเจ้าพ่อพิทเลน!" : `${game.players[order[0]].name} ชนะ`} />
        <ol className="space-y-1.5">
          {order.map((i, k) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span className="poster w-6 text-lg">{k + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: game.players[i].color }} aria-hidden />
              <span className="flex-1 font-bold">{game.players[i].name}</span>
              <span className="text-[11px] text-white/55">เป้า {game.players[i].done}</span>
              <span className="tabular-nums text-white/80">{game.players[i].out ? "ล้มละลาย" : money(worth(game, i))}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/60">มูลค่ารวม = เงินสด + ราคาสนาม/ธุรกิจ + ค่าสิ่งปลูกสร้าง</p>
        <Btn className="w-full" onClick={onNew}>
          เล่นอีกครั้ง
        </Btn>
      </Card>
    );

  if (!mine || busy)
    return (
      <div className="flex min-h-14 items-center justify-center rounded-2xl bg-[#121216] px-4 text-sm text-white/70">
        {busy ? "…" : ph.k === "auction" ? "รอยื่นซองประมูล" : `${game.players[game.turn].name} กำลังคิด…`}
      </div>
    );

  if (ph.k === "buy") {
    const sq = BOARD[ph.sq];
    if (!isOwnable(sq)) return null;
    return (
      <Card className="bg-pop">
        <SquareHead sq={ph.sq} />
        <GroupDots game={game} sq={ph.sq} />
        <p className="text-sm text-white/75">
          ราคา <b className="text-white">{money(sq.price)}</b> · ค่าตั๋วเริ่ม {money(sq.kind === "circuit" ? circuitRent(sq.price, 0, false) : bizRent(1))} · เงินคุณจะเหลือ {money(me.cash - sq.price)}
        </p>
        <Hints list={hintsFor(game, ME, ph.sq, sq.price)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => run({ t: "buy" })}>ซื้อ {money(sq.price)}</Btn>
          <Btn tone="ghost" onClick={() => run({ t: "pass" })}>
            ไม่ซื้อ → ประมูล
          </Btn>
        </div>
      </Card>
    );
  }

  if (ph.k === "takeover") {
    const o = game.owner[ph.sq];
    return (
      <Card className="bg-pop">
        <p className="poster text-sm text-(--color-f1-text)">💼 เทคโอเวอร์?</p>
        <SquareHead sq={ph.sq} />
        <GroupDots game={game} sq={ph.sq} />
        <p className="text-sm text-white/75">
          ซื้อต่อจาก <b className="text-white">{o !== null ? game.players[o].name : "-"}</b> ราคา <b className="text-white">{money(ph.price)}</b> ({TAKEOVER} เท่า · เงินไปที่เจ้าของเดิม) · เงินคุณจะเหลือ {money(me.cash - ph.price)}
        </p>
        <Hints list={hintsFor(game, ME, ph.sq, ph.price)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => run({ t: "takeover" })}>ซื้อต่อ {money(ph.price)}</Btn>
          <Btn tone="ghost" onClick={() => run({ t: "pass" })}>
            ไม่เอา
          </Btn>
        </div>
      </Card>
    );
  }

  if (ph.k === "roll")
    return (
      <div className="space-y-2">
        {me.jail > 0 && <p className="rounded-xl bg-[#fca5a5]/10 p-3 text-sm text-[#fecaca]">คุณอยู่ในห้องสจ๊วต (ตาที่ {me.jail}/3) — ทอยให้ได้คู่เพื่อออก หรือจ่ายค่าปรับ</p>}
        {canBuildAny && <p className="text-center text-xs text-[#86efac]">มีสนามที่สร้างอัฒจันทร์ได้ — ดูที่ &quot;สนามของคุณ&quot; ด้านล่าง</p>}
        <div className="flex flex-wrap gap-2">
          <Btn className="min-h-14 flex-1 text-base" onClick={() => run({ t: "roll" })}>
            🎲 ทอยลูกเต๋า{game.doubles > 0 ? " อีกครั้ง (ได้คู่!)" : ""}
          </Btn>
          {me.jail > 0 && me.cash >= JAIL_FINE && (
            <Btn tone="white" onClick={() => run({ t: "payJail" })}>
              จ่าย {money(JAIL_FINE)}
            </Btn>
          )}
          {me.jail > 0 && me.pardons > 0 && (
            <Btn tone="white" onClick={() => run({ t: "pardon" })}>
              ใช้บัตรอุทธรณ์
            </Btn>
          )}
        </div>
      </div>
    );

  if (ph.k === "end")
    return (
      <div className="space-y-2">
        {canBuildAny && <p className="text-center text-xs text-[#86efac]">สร้างอัฒจันทร์ก่อนจบตาได้ — ดูที่ &quot;สนามของคุณ&quot;</p>}
        <Btn tone="white" className="min-h-14 w-full text-base" onClick={() => run({ t: "end" })}>
          จบตา
        </Btn>
      </div>
    );
  return null;
}

/* ---------------- ประมูลยื่นซอง ---------------- */

function AuctionModal({ game, sq, onBid }: { game: Game; sq: number; onBid: (n: number) => void }) {
  const s = BOARD[sq];
  const price = isOwnable(s) ? s.price : 0;
  const cash = game.players[ME].cash;
  const [bid, setBid] = useState(() => Math.min(cash, Math.round((price * 0.6) / 10) * 10));
  const clamp = (n: number) => Math.max(0, Math.min(cash, n));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-label={`ประมูล ${s.name}`}>
      <div className="bg-pop max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-[#facc15]/40 bg-[#121216] p-4">
        <p className="poster text-sm text-[#facc15]">🔨 ประมูลแบบยื่นซอง</p>
        <SquareHead sq={sq} />
        <GroupDots game={game} sq={sq} />
        <p className="text-[13px] text-white/70">ทุกคนเสนอราคาพร้อมกันครั้งเดียว ใครเสนอสูงสุดได้ไป (ขั้นต่ำ ฿10 · เสนอ 0 = ไม่เอา) · ราคาปกติ {money(price)}</p>
        <Hints list={hintsFor(game, ME, sq, bid)} />
        <div className="flex items-center justify-between gap-2">
          {[-50, -10].map((d) => (
            <button key={d} type="button" onClick={() => setBid((b) => clamp(b + d))} className="min-h-11 min-w-12 rounded-xl bg-white/10 text-sm font-bold">
              {d}
            </button>
          ))}
          <span className="poster flex-1 text-center text-3xl tabular-nums">{money(bid)}</span>
          {[10, 50].map((d) => (
            <button key={d} type="button" onClick={() => setBid((b) => clamp(b + d))} className="min-h-11 min-w-12 rounded-xl bg-white/10 text-sm font-bold">
              +{d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "ครึ่งราคา", v: price / 2 },
            { l: "เต็มราคา", v: price },
            { l: "สู้สุด ×1.5", v: price * 1.5 },
          ].map((o) => (
            <button key={o.l} type="button" onClick={() => setBid(clamp(Math.round(o.v / 10) * 10))} className="min-h-10 rounded-xl border border-white/15 text-[12px] font-bold">
              {o.l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => onBid(bid)}>ยื่นซอง {money(bid)}</Btn>
          <Btn tone="ghost" onClick={() => onBid(0)}>
            ไม่เอา
          </Btn>
        </div>
        <p className="text-center text-[11px] text-white/55">เงินคุณ {money(cash)}</p>
      </div>
    </div>
  );
}

function AuctionResult({ game, onOk }: { game: Game; onOk: () => void }) {
  const a = game.auction!;
  const rows = game.players.map((p, i) => ({ p, i, b: a.bids[i] })).filter((r) => !r.p.out).sort((x, y) => y.b - x.b);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="ผลประมูล">
      <div className="bg-pop w-full max-w-xs space-y-3 rounded-2xl border border-[#facc15]/40 bg-[#121216] p-4 text-center">
        <p className="poster text-sm text-[#facc15]">🔨 เปิดซอง: {BOARD[a.sq].name}</p>
        <ol className="space-y-1.5 text-left">
          {rows.map((r) => (
            <li key={r.i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${a.winner === r.i ? "bg-[#facc15]/15 font-bold" : "bg-white/5"}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black" style={{ background: r.p.color, color: r.p.ink }} aria-hidden>
                {tokenLabel(r.i)}
              </span>
              <span className="flex-1 truncate">{r.p.name}</span>
              <span className="tabular-nums">{r.b > 0 ? money(r.b) : "ไม่เอา"}</span>
              {a.winner === r.i && <span aria-label="ชนะ">🏆</span>}
            </li>
          ))}
        </ol>
        <p className="text-sm text-white/80">{a.winner === null ? "ไม่มีใครได้ไป" : a.winner === ME ? "คุณชนะประมูล!" : `${game.players[a.winner].name} ได้ไป`}</p>
        <Btn tone="white" className="w-full" onClick={onOk}>
          ตกลง
        </Btn>
      </div>
    </div>
  );
}

/* ---------------- เป้าสปอนเซอร์ / สนามของคุณ ---------------- */

function Goals({ game }: { game: Game }) {
  const me = game.players[ME];
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Target className="h-4 w-4 text-(--color-f1-text)" aria-hidden /> เป้าสปอนเซอร์ของคุณ
        </p>
        <p className="text-xs text-white/60">สำเร็จแล้ว {me.done} เป้า</p>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {me.goals.map((g, k) => (
          <li key={k} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[13px]">
            <span className="flex-1">{goalText(g)}</span>
            <span className="font-bold text-[#4ade80] tabular-nums">+{money(GOAL_REWARD[g.k])}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-white/55">
        คู่แข่ง: {game.players.slice(1).map((p) => `${p.name} ${p.done} เป้า`).join(" · ")}
      </p>
    </Card>
  );
}

function MyAssets({ game, mine, run, onInfo }: { game: Game; mine: boolean; run: (a: Action) => void; onInfo: (i: number) => void }) {
  const list = holdings(game, ME);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Gem className="h-4 w-4 text-white/70" aria-hidden /> สนามของคุณ ({list.length})
        </p>
        <p className="text-xs text-white/60 tabular-nums">มูลค่ารวม {money(worth(game, ME))}</p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-white/60">ยังไม่มี — ตกสนามที่ว่างแล้วกดซื้อ หรือชนะประมูล</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {list.map((i) => {
            const sq = BOARD[i];
            const can = mine && canBuild(game, ME, i) && (game.phase.k === "roll" || game.phase.k === "end");
            const locked = sq.kind === "circuit" && takeoverPrice(game, i) === null;
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: sq.kind === "circuit" ? GROUPS[sq.group].color : "#9ca3af" }} aria-hidden />
                <button type="button" onClick={() => onInfo(i)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-bold">
                    {sq.name}
                    {locked && <span className="ml-1 text-[10px] font-normal text-[#86efac]">🔒 ล็อก</span>}
                  </span>
                  <span className="block text-[11px] text-white/60">
                    {game.level[i] > 0 ? `${LEVEL_NAME[game.level[i]]} · ` : ""}ค่าตั๋ว {money(rentOf(game, i))}
                  </span>
                </button>
                {can && (
                  <button type="button" onClick={() => run({ t: "build", sq: i })} className="min-h-9 rounded-full bg-(--color-f1) px-3 text-[12px] font-bold">
                    สร้าง {money(sq.kind === "circuit" ? GROUPS[sq.group].build : 0)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.some((i) => BOARD[i].kind === "circuit") && !list.some((i) => canBuild(game, ME, i)) && (
        <p className="text-[11px] text-white/55">ถือครบทั้งกลุ่มสีก่อน แล้วจะสร้างอัฒจันทร์ได้ (และสนามจะถูกล็อก ไม่มีใครเทคโอเวอร์ได้)</p>
      )}
    </Card>
  );
}

/* ---------------- รายละเอียดช่อง / การ์ด ---------------- */

function SquareInfo({ i, game, canAct, run, onClose }: { i: number; game: Game; canAct: boolean; run: (a: Action) => void; onClose: () => void }) {
  const sq = BOARD[i];
  const owner = game.owner[i];
  const tp = takeoverPrice(game, i);
  const DESC: Record<string, string> = {
    start: `ผ่านหรือหยุดที่นี่ รับเงินสปอนเซอร์ ${money(PASS_START)} · คนแรกที่ขึ้นรอบใหม่ทำให้ Race Week ย้ายกลุ่ม`,
    jail: "ห้องสจ๊วต — ถ้าแค่ผ่านมาไม่มีอะไร ถ้าถูกส่งตัวมา ต้องทอยคู่ จ่ายค่าปรับ หรือใช้บัตรอุทธรณ์",
    pit: "พิทสต็อป — พักหายใจ ไม่มีอะไรเกิดขึ้น",
    gojail: "โดนโทษ! ไปห้องสจ๊วตทันที ไม่ผ่านเส้นสตาร์ท",
    radio: "จั่วการ์ดวิทยุทีม — ข่าวดีหรือร้ายจากทีม",
    weather: "จั่วการ์ดสภาพอากาศ — ฝน แดด ลม เซฟตี้คาร์",
    tax: sq.kind === "tax" && sq.tax === "freight" ? "จ่ายค่าขนส่งรถข้ามทวีป ฿100" : "เกินเพดานงบ — จ่าย 10% ของเงินสด (อย่างน้อย ฿50)",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-label={sq.name} onClick={onClose}>
      <div className="bg-pop max-h-[92dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl bg-[#121216] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {sq.kind === "circuit" && <span className="mt-1 h-10 w-2 flex-none rounded-full" style={{ background: GROUPS[sq.group].color }} aria-hidden />}
          <div className="flex-1">
            <p className="text-xs text-white/60">{sq.kind === "circuit" ? `สนาม · กลุ่ม${GROUPS[sq.group].name}` : sq.kind === "biz" ? "ธุรกิจ" : "ช่องพิเศษ"}</p>
            <p className="poster text-2xl">{sq.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isOwnable(sq) ? (
          <>
            <GroupDots game={game} sq={i} />
            <p className="text-sm text-white/75">
              ราคา {money(sq.price)} · {owner === null ? "ยังไม่มีเจ้าของ" : `เจ้าของ: ${game.players[owner].name}`}
              {sq.kind === "circuit" && owner !== null ? ` · ${LEVEL_NAME[game.level[i]]}` : ""}
              {owner !== null && sq.kind === "circuit" ? (tp !== null ? ` · ซื้อต่อได้ ${money(tp)}` : " · 🔒 ล็อก") : ""}
            </p>
            {sq.kind === "circuit" && sq.group === game.spot && <p className="rounded-lg bg-(--color-f1)/15 px-3 py-1.5 text-[13px] text-[#fca5a5]">🏁 Race Week ตอนนี้ — ค่าตั๋วทุกแบบ ×2</p>}
            {sq.kind === "circuit" && sq.group === game.next && <p className="rounded-lg bg-white/5 px-3 py-1.5 text-[13px] text-white/75">🏁 จะเป็น Race Week รอบหน้า</p>}
            <table className="w-full text-sm">
              <tbody>
                {sq.kind === "circuit" ? (
                  <>
                    <RentRow label="ค่าตั๋วพื้นฐาน" v={circuitRent(sq.price, 0, false)} on={owner !== null && game.level[i] === 0} />
                    <RentRow label="ครบกลุ่ม (×2)" v={circuitRent(sq.price, 0, true)} />
                    {[1, 2, 3, 4].map((l) => (
                      <RentRow key={l} label={LEVEL_NAME[l]} v={circuitRent(sq.price, l, true)} on={owner !== null && game.level[i] === l} />
                    ))}
                    <tr>
                      <td className="pt-2 text-white/60">ค่าสร้างต่อชั้น</td>
                      <td className="pt-2 text-right tabular-nums">{money(GROUPS[sq.group].build)}</td>
                    </tr>
                  </>
                ) : (
                  [1, 2, 3, 4].map((n) => <RentRow key={n} label={`ถือ ${n} ธุรกิจ`} v={bizRent(n)} />)
                )}
              </tbody>
            </table>
            {canAct && canBuild(game, ME, i) && (game.phase.k === "roll" || game.phase.k === "end") && (
              <Btn className="w-full" onClick={() => run({ t: "build", sq: i })}>
                สร้าง{game.level[i] === MAX_LEVEL - 1 ? "แพดด็อก VIP" : "อัฒจันทร์"} ({money(sq.kind === "circuit" ? GROUPS[sq.group].build : 0)})
              </Btn>
            )}
          </>
        ) : (
          <p className="text-sm text-white/75">{DESC[sq.kind]}</p>
        )}
      </div>
    </div>
  );
}

function RentRow({ label, v, on }: { label: string; v: number; on?: boolean }) {
  return (
    <tr className={on ? "font-bold text-white" : "text-white/75"}>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right tabular-nums">{money(v)}</td>
    </tr>
  );
}

function CardModal({ game, mine, onOk }: { game: Game; mine: boolean; onOk: () => void }) {
  const ph = game.phase;
  if (ph.k !== "card") return null;
  const radio = ph.deck === "radio";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label={radio ? "การ์ดวิทยุทีม" : "การ์ดสภาพอากาศ"}>
      <div className={`bg-pop w-full max-w-xs space-y-4 rounded-2xl border-2 p-5 text-center ${radio ? "border-(--color-f1) bg-[#1a0d0d]" : "border-[#38bdf8] bg-[#0b1620]"}`}>
        <p className={`poster flex items-center justify-center gap-2 text-sm ${radio ? "text-(--color-f1-text)" : "text-[#7dd3fc]"}`}>
          {radio ? <Radio className="h-4 w-4" /> : <CloudRain className="h-4 w-4" />} {radio ? "วิทยุทีม" : "สภาพอากาศ"}
        </p>
        <p className="text-lg font-bold leading-snug">{cardText(ph.deck, ph.card)}</p>
        <p className="text-xs text-white/60">{mine ? "การ์ดของคุณ" : `${game.players[game.turn].name} จั่วได้`}</p>
        {mine && (
          <Btn tone="white" className="w-full" onClick={onOk}>
            ตกลง
          </Btn>
        )}
      </div>
    </div>
  );
}
