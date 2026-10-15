"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, ChevronLeft, CircleDot, CloudRain, Cog, Crown, Flag, Gavel, Radio, Receipt, Siren, Truck, Tv, Wrench, X } from "lucide-react";
import { Btn, Card, Head } from "@/components/pitwall/ui";
import { NAMES_NOTE, TEAMS } from "@/lib/pitwall/teams";
import { BOARD, cellOf, circuitRent, GROUPS, isOwnable, JAIL_FINE, LEVEL_NAME, MAX_LEVEL, PASS_START, SIZE, START_CASH, bizRent } from "@/lib/pitwall/tycoon/board";
import { act, botAction, canBuild, cardText, holdings, money, newGame, ranking, rentOf, worth, type Game } from "@/lib/pitwall/tycoon/game";

const SAVE_KEY = "pitwall-tycoon";
const NAME_KEY = "pitwall-name";
const BOT_NAMES = ["บอท โรสเบิร์ก", "บอท ฮาคิเนน", "บอท ลาวด้า"];
const STEP_MS = 140;

function load(): Game | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Game;
    return g?.v === 1 ? g : null;
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
          kicker="BOARD GAME · เวอร์ชันแรก"
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

const ME = 0;

function Table({ game, onChange, onQuit, onNew }: { game: Game; onChange: (g: Game) => void; onQuit: () => void; onNew: () => void }) {
  const [shown, setShown] = useState<number[]>(() => game.players.map((p) => p.pos));
  const [rolling, setRolling] = useState<[number, number] | null>(null);
  const [info, setInfo] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const moving = shown.some((s, i) => s !== game.players[i].pos);
  const busy = moving || rolling !== null;
  const cur = game.players[game.turn];
  const mine = game.turn === ME && !cur.bot;
  const ph = game.phase;

  // เดินหมากทีละช่อง (ไกลเกิน 12 ช่อง/ถอยหลัง = วาร์ป)
  useEffect(() => {
    if (!moving || rolling) return;
    const t = setTimeout(
      () =>
        setShown((prev) =>
          prev.map((s, i) => {
            const to = gameRef.current.players[i].pos;
            if (s === to) return s;
            const d = (to - s + SIZE) % SIZE;
            return d > 12 ? to : (s + 1) % SIZE;
          }),
        ),
      fast ? STEP_MS / 2 : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [shown, moving, rolling, fast]);

  const run = (a: Parameters<typeof act>[1]) => {
    const g = gameRef.current;
    const next = act(g, a);
    if (next === g) return;
    if (a.t === "roll" && next.dice) {
      // ลูกเต๋าหมุนก่อน แล้วค่อยเดิน
      setRolling([1, 1]);
      let n = 0;
      const spin = setInterval(() => {
        n++;
        setRolling([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
        if (n >= (fast ? 3 : 7)) {
          clearInterval(spin);
          setRolling(null);
          onChange(next);
        }
      }, 70);
      return;
    }
    onChange(next);
  };

  // บอทเล่นเอง (รอหมากเดินเสร็จก่อน)
  useEffect(() => {
    if (busy || ph.k === "over" || !cur.bot) return;
    const wait = ph.k === "card" ? 1500 : ph.k === "buy" ? 900 : 650;
    const t = setTimeout(() => run(botAction(gameRef.current)), fast ? wait / 3 : wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, busy, fast]);

  const dice = rolling ?? game.dice;
  const order = useMemo(() => ranking(game), [game]);

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
          บอทเร็ว {fast ? "เปิด" : "ปิด"}
        </button>
      </div>

      <Players game={game} order={order} />

      {/* กระดาน */}
      <div className="relative mx-auto aspect-square w-full max-w-[640px] select-none">
        <div className="grid h-full w-full gap-[2px] rounded-2xl bg-[#08080A] p-[2px]" style={{ gridTemplateColumns: "repeat(9, minmax(0, 1fr))", gridTemplateRows: "repeat(9, minmax(0, 1fr))" }}>
          {BOARD.map((_, i) => (
            <Cell key={i} i={i} game={game} shown={shown} onClick={() => setInfo(i)} />
          ))}
          {/* กลางกระดาน */}
          <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#121216] p-2 text-center" style={{ gridColumn: "2 / 9", gridRow: "2 / 9" }}>
            <span className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-conic-gradient(#fff 0 25%, transparent 0 50%)", backgroundSize: "28px 28px" }} aria-hidden />
            <p className="poster text-lg leading-none text-white sm:text-3xl">
              เจ้าพ่อ<span className="text-(--color-f1)">พิทเลน</span>
            </p>
            <div className="flex gap-2" aria-live="polite" aria-label={dice ? `ลูกเต๋า ${dice[0]} และ ${dice[1]}` : "ยังไม่ทอย"}>
              <Die n={dice?.[0] ?? 0} spin={!!rolling} />
              <Die n={dice?.[1] ?? 0} spin={!!rolling} />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold sm:text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cur.color }} aria-hidden />
              {ph.k === "over" ? "จบฤดูกาล" : mine ? "ตาของคุณ" : `ตาของ ${cur.name}`}
            </p>
            <ul className="hidden w-full max-w-xs space-y-0.5 text-[11px] leading-snug text-white/70 sm:block">
              {game.log.slice(-3).map((l) => (
                <li key={l.id} className={l.tone === "good" ? "text-[#4ade80]" : l.tone === "bad" ? "text-[#fca5a5]" : ""}>
                  {l.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="text-center text-[12px] text-white/70 sm:hidden">{game.log[game.log.length - 1]?.text}</p>

      {/* แผงคำสั่ง */}
      <Actions game={game} busy={busy} mine={mine} run={run} onNew={onNew} order={order} />

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
    </div>
  );
}

function Players({ game, order }: { game: Game; order: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {game.players.map((p, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-xl border p-2 ${game.turn === i && game.phase.k !== "over" ? "border-white/70 bg-white/10" : "border-white/10 bg-[#121216]"} ${p.out ? "opacity-40" : ""}`}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-black" style={{ background: p.color, color: p.ink }} aria-hidden>
            {i === ME ? "★" : i}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold">
              {p.name}
              {p.jail > 0 && <Gavel className="ml-1 inline h-3 w-3 text-[#fca5a5]" aria-label="อยู่ห้องสจ๊วต" />}
            </span>
            <span className="block text-[12px] text-white/75 tabular-nums">{p.out ? "ล้มละลาย" : money(p.cash)}</span>
          </span>
          <span className="text-right text-[10px] leading-tight text-white/60 tabular-nums">
            อันดับ {order.indexOf(i) + 1}
            <br />
            รอบ {p.laps}
          </span>
        </div>
      ))}
    </div>
  );
}

const ICON: Record<string, ReactNode> = {
  start: <Flag className="h-5 w-5" />,
  jail: <Gavel className="h-5 w-5" />,
  pit: <Wrench className="h-5 w-5" />,
  gojail: <Siren className="h-5 w-5" />,
  radio: <Radio className="h-4 w-4" />,
  weather: <CloudRain className="h-4 w-4" />,
  tax: <Receipt className="h-4 w-4" />,
};
const BIZ_ICON: Record<string, ReactNode> = {
  ซัพพลายเออร์ยาง: <CircleDot className="h-4 w-4" />,
  ผู้ผลิตเครื่องยนต์: <Cog className="h-4 w-4" />,
  สถานีถ่ายทอดสด: <Tv className="h-4 w-4" />,
  ทีมโลจิสติกส์: <Truck className="h-4 w-4" />,
};

function Cell({ i, game, shown, onClick }: { i: number; game: Game; shown: number[]; onClick: () => void }) {
  const sq = BOARD[i];
  const { row, col } = cellOf(i);
  const owner = game.owner[i];
  const lv = game.level[i];
  const corner = i % 8 === 0;
  const here = game.players.map((p, k) => ({ p, k })).filter(({ p, k }) => !p.out && shown[k] === i);
  const active = game.players[game.turn] && shown[game.turn] === i && game.phase.k !== "over";
  const color = sq.kind === "circuit" ? GROUPS[sq.group].color : null;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ gridRow: row, gridColumn: col }}
      aria-label={`${sq.name}${owner !== null ? ` เจ้าของ ${game.players[owner].name}` : isOwnable(sq) ? ` ราคา ${money(sq.price)}` : ""}`}
      className={`relative flex min-w-0 flex-col items-center overflow-hidden rounded-[5px] text-center leading-none ${corner ? "justify-center bg-[#1F1F24]" : "bg-[#17171b]"} ${active ? "ring-2 ring-white" : ""}`}
    >
      {color && <span className="h-[18%] w-full flex-none" style={{ background: color }} aria-hidden />}
      <span className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 px-[1px] ${corner ? "text-white" : "text-white/85"}`}>
        {ICON[sq.kind] && <span className={sq.kind === "gojail" ? "text-(--color-f1-text)" : "text-white/70"}>{ICON[sq.kind]}</span>}
        {sq.kind === "biz" && <span className="text-white/70">{BIZ_ICON[sq.name] ?? <Building2 className="h-4 w-4" />}</span>}
        <span className={`line-clamp-2 break-words ${corner ? "text-[7px] font-bold sm:text-[10px]" : "text-[6.5px] sm:text-[9px]"}`}>{sq.name}</span>
        {isOwnable(sq) && owner === null && <span className="text-[6.5px] text-white/50 tabular-nums sm:text-[8px]">{money(sq.price)}</span>}
        {lv > 0 && (
          <span className="flex gap-[1px]" aria-label={LEVEL_NAME[lv]}>
            {lv === MAX_LEVEL ? <Crown className="h-2.5 w-2.5 text-[#facc15]" /> : Array.from({ length: lv }, (_, k) => <span key={k} className="h-1 w-1 rounded-[1px] bg-white" />)}
          </span>
        )}
      </span>
      {owner !== null && <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: game.players[owner].color }} aria-hidden />}
      {here.length > 0 && (
        <span className="absolute inset-x-0 bottom-[3px] flex items-end justify-center -space-x-1 px-[1px]">
          {here.map(({ p, k }) => (
            <span
              key={k}
              className={`flex aspect-square w-[34%] max-w-5 items-center justify-center rounded-full border border-black/70 text-[7px] font-black shadow sm:text-[9px] ${game.turn === k ? "z-10 -translate-y-0.5 ring-1 ring-white" : ""}`}
              style={{ background: p.color, color: p.ink }}
              aria-hidden
            >
              {k === ME ? "★" : k}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function Die({ n, spin }: { n: number; spin: boolean }) {
  return (
    <span className={`grid h-9 w-9 grid-cols-3 grid-rows-3 gap-[2px] rounded-lg bg-white p-1.5 shadow sm:h-12 sm:w-12 ${spin ? "rotate-12" : ""} ${n === 0 ? "opacity-30" : ""}`} aria-hidden>
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} className={`rounded-full ${PIPS[n]?.includes(k) ? (n === 1 ? "bg-(--color-f1)" : "bg-[#08080A]") : ""}`} />
      ))}
    </span>
  );
}

function Actions({ game, busy, mine, run, onNew, order }: { game: Game; busy: boolean; mine: boolean; run: (a: Parameters<typeof act>[1]) => void; onNew: () => void; order: number[] }) {
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
        {busy ? "กำลังเดิน…" : `${game.players[game.turn].name} กำลังคิด…`}
      </div>
    );

  if (ph.k === "buy") {
    const sq = BOARD[ph.sq];
    if (!isOwnable(sq)) return null;
    return (
      <Card className="bg-pop">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-10 w-2 flex-none rounded-full" style={{ background: sq.kind === "circuit" ? GROUPS[sq.group].color : "#9ca3af" }} aria-hidden />
          <div className="flex-1">
            <p className="text-xs text-white/60">{sq.kind === "circuit" ? `สนาม · กลุ่ม${GROUPS[sq.group].name}` : "ธุรกิจ"}</p>
            <p className="poster text-2xl">{sq.name}</p>
            <p className="text-sm text-white/75">
              ราคา <b className="text-white">{money(sq.price)}</b> · ค่าตั๋วเริ่มต้น {money(sq.kind === "circuit" ? circuitRent(sq.price, 0, false) : bizRent(1))} · เงินคุณเหลือ {money(me.cash - sq.price)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => run({ t: "buy" })}>ซื้อ {money(sq.price)}</Btn>
          <Btn tone="ghost" onClick={() => run({ t: "pass" })}>
            ไม่ซื้อ
          </Btn>
        </div>
      </Card>
    );
  }

  if (ph.k === "roll")
    return (
      <div className="space-y-2">
        {me.jail > 0 && (
          <p className="rounded-xl bg-[#fca5a5]/10 p-3 text-sm text-[#fecaca]">
            คุณอยู่ในห้องสจ๊วต (ตาที่ {me.jail}/3) — ทอยให้ได้คู่เพื่อออก หรือจ่ายค่าปรับ
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Btn className="min-h-14 flex-1 text-base" onClick={() => run({ t: "roll" })}>
            🎲 ทอยลูกเต๋า{game.doubles > 0 ? " อีกครั้ง" : ""}
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
      <Btn tone="white" className="min-h-14 w-full text-base" onClick={() => run({ t: "end" })}>
        จบตา
      </Btn>
    );
  return null;
}

function MyAssets({ game, mine, run, onInfo }: { game: Game; mine: boolean; run: (a: Parameters<typeof act>[1]) => void; onInfo: (i: number) => void }) {
  const list = holdings(game, ME);
  const buildable = list.filter((i) => canBuild(game, ME, i));
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">สนามของคุณ ({list.length})</p>
        <p className="text-xs text-white/60 tabular-nums">มูลค่ารวม {money(worth(game, ME))}</p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-white/60">ยังไม่มี — ตกสนามที่ว่างแล้วกดซื้อ</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {list.map((i) => {
            const sq = BOARD[i];
            const can = mine && buildable.includes(i) && (game.phase.k === "roll" || game.phase.k === "end");
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: sq.kind === "circuit" ? GROUPS[sq.group].color : "#9ca3af" }} aria-hidden />
                <button type="button" onClick={() => onInfo(i)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-bold">{sq.name}</span>
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
      {buildable.length === 0 && list.some((i) => BOARD[i].kind === "circuit") && <p className="text-[11px] text-white/55">ถือครบทั้งกลุ่มสีก่อน แล้วจะสร้างอัฒจันทร์ได้</p>}
    </Card>
  );
}

function SquareInfo({ i, game, canAct, run, onClose }: { i: number; game: Game; canAct: boolean; run: (a: Parameters<typeof act>[1]) => void; onClose: () => void }) {
  const sq = BOARD[i];
  const owner = game.owner[i];
  const DESC: Record<string, string> = {
    start: `ผ่านหรือหยุดที่นี่ รับเงินสปอนเซอร์ ${money(PASS_START)}`,
    jail: "ห้องสจ๊วต — ถ้าแค่ผ่านมาไม่มีอะไร ถ้าถูกส่งตัวมา ต้องทอยคู่ จ่ายค่าปรับ หรือใช้บัตรอุทธรณ์",
    pit: "พิทสต็อป — พักหายใจ ไม่มีอะไรเกิดขึ้น",
    gojail: "โดนโทษ! ไปห้องสจ๊วตทันที ไม่ผ่านเส้นสตาร์ท",
    radio: "จั่วการ์ดวิทยุทีม — ข่าวดีหรือร้ายจากทีม",
    weather: "จั่วการ์ดสภาพอากาศ — ฝน แดด ลม เซฟตี้คาร์",
    tax: sq.kind === "tax" && sq.tax === "freight" ? "จ่ายค่าขนส่งรถข้ามทวีป ฿100" : "เกินเพดานงบ — จ่าย 10% ของเงินสด (อย่างน้อย ฿50)",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-label={sq.name} onClick={onClose}>
      <div className="bg-pop w-full max-w-sm space-y-3 rounded-2xl bg-[#121216] p-4" onClick={(e) => e.stopPropagation()}>
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
            <p className="text-sm text-white/75">
              ราคา {money(sq.price)} · {owner === null ? "ยังไม่มีเจ้าของ" : `เจ้าของ: ${game.players[owner].name}`}
              {sq.kind === "circuit" && owner !== null ? ` · ${LEVEL_NAME[game.level[i]]}` : ""}
            </p>
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
