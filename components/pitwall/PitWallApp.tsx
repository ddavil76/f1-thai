"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Gauge, Globe, LogIn, Radio, User } from "lucide-react";
import Live from "@/components/pitwall/Live";
import DriverMode from "@/components/pitwall/driver/DriverMode";
import { createRoom, onlineReady, useLocalSession, useOnlineSession, type Session } from "@/components/pitwall/session";
import { Btn, Card, Head } from "@/components/pitwall/ui";
import { Final, Grid, Lobby, Prep, Results } from "@/components/pitwall/Weekend";
import { NAMES_NOTE } from "@/lib/pitwall/teams";

/** หน้าในเกม: เลือกโหมด → manager (หัวหน้าทีม) / driver (ขับเอง) → เกม */
type View = "menu" | "manager" | "driver";
type Game = { kind: "solo" } | { kind: "online"; code: string } | null;

const NAME_KEY = "pitwall-name";
const VIEWS: View[] = ["menu", "manager", "driver"];

/** โหมดที่เลือกอยู่ใน URL (?mode=manager|driver) — ปุ่มย้อนกลับของเบราว์เซอร์/มือถือพากลับหน้าเลือกโหมด */
function viewFromUrl(): View {
  if (typeof window === "undefined") return "menu";
  const v = new URLSearchParams(window.location.search).get("mode");
  return VIEWS.includes(v as View) ? (v as View) : "menu";
}

export default function PitWallApp() {
  const [view, setView] = useState<View>("menu");
  const [game, setGame] = useState<Game>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านค่าที่จำไว้ในเครื่องหลังโหลดหน้า
      setName(window.localStorage.getItem(NAME_KEY) ?? "");
      const room = new URLSearchParams(window.location.search).get("room");
      // ลิงก์ชวนเข้าห้อง = โหมดหัวหน้าทีม
      if (room) {
        setCode(room.toUpperCase());
        setView("manager");
      } else setView(viewFromUrl());
    } catch {
      // อ่านไม่ได้ก็เริ่มที่หน้าเลือกโหมด
    }
    const onPop = () => {
      setGame(null);
      setView(viewFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const remember = () => {
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {
      // เก็บไม่ได้ก็ไม่เป็นไร
    }
  };
  const go = (v: View) => {
    remember();
    setErr(null);
    setView(v);
    const url = new URL(window.location.href);
    if (v === "menu") url.searchParams.delete("mode");
    else url.searchParams.set("mode", v);
    url.searchParams.delete("room");
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  };
  const nick = name.trim() || "ผู้เล่น";

  if (game?.kind === "solo") return <SoloGame name={nick} onExit={() => setGame(null)} />;
  if (game?.kind === "online") return <OnlineGame code={game.code} name={nick} onExit={() => setGame(null)} />;
  if (view === "driver") return <DriverMode name={nick} onExit={() => go("menu")} />;

  if (view === "manager")
    return (
      <div className="space-y-4">
        <BackToMenu onClick={() => go("menu")} />
        <Card>
          <Head kicker="โหมดหัวหน้าทีม · MANAGER" title="เล่นคนเดียว" sub="คุมรถ 2 คันจากกำแพงพิท แข่งกับทีม AI · ตั้งค่ารถ ส่งรถออกควอลิฟาย สั่งโหมดขับ สั่งแซง เข้าพิท เลือกยาง ดูการแข่งแบบ 3D" />
          <Btn
            className="w-full"
            onClick={() => {
              remember();
              setGame({ kind: "solo" });
            }}
          >
            <User className="inline h-4 w-4" /> เริ่มเล่นคนเดียว
          </Btn>
        </Card>

        <Card>
          <Head kicker="ออนไลน์" title="แข่งกับเพื่อน" sub="สูงสุด 6 คน คนละทีม ที่เหลือเป็นทีม AI · สร้างห้องแล้วส่งรหัสให้เพื่อน" />
          {!onlineReady() ? (
            <p className="rounded-xl bg-white/5 p-3 text-sm text-white/70">ยังไม่ได้เชื่อมเซิร์ฟเวอร์ห้องออนไลน์ — เจ้าของเว็บต้องตั้งค่า Cloudflare ก่อน (ดูคู่มือใน docs/pitwall-online.md)</p>
          ) : (
            <div className="space-y-2">
              <Btn
                tone="white"
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  remember();
                  setBusy(true);
                  setErr(null);
                  try {
                    const c = await createRoom();
                    setGame({ kind: "online", code: c });
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "สร้างห้องไม่สำเร็จ");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Globe className="inline h-4 w-4" /> สร้างห้องใหม่
              </Btn>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = code.trim().toUpperCase();
                  if (c.length < 4) return setErr("ใส่รหัสห้อง 4 ตัว");
                  remember();
                  setGame({ kind: "online", code: c });
                }}
              >
                <label className="sr-only" htmlFor="pw-code">
                  รหัสห้อง
                </label>
                <input
                  id="pw-code"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="รหัสห้อง"
                  className="poster min-h-11 w-32 rounded-xl border border-white/15 bg-[#08080A] px-3 text-center text-lg tracking-widest text-white"
                />
                <Btn type="submit" tone="ghost" className="flex-1">
                  <LogIn className="inline h-4 w-4" /> เข้าห้อง
                </Btn>
              </form>
              {err && <p className="text-sm text-(--color-f1-text)">{err}</p>}
            </div>
          )}
        </Card>
        <HowTo />
        <p className="text-center text-[11px] text-white/50">{NAMES_NOTE}</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <Card>
        <label className="block space-y-1" htmlFor="pw-name">
          <span className="text-xs font-bold text-white/70">ชื่อของคุณ (ใช้ในห้องออนไลน์และตารางผล)</span>
          <input
            id="pw-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onBlur={remember}
            placeholder="ชื่อเล่น"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-[#08080A] px-3 text-white"
          />
        </label>
      </Card>
      <h2 className="poster text-sm text-white/70">เลือกโหมด</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          kicker="MANAGER"
          title="หัวหน้าทีม"
          icon={<Radio className="h-6 w-6" aria-hidden />}
          sub="คุมรถ 2 คันจากกำแพงพิท ดูการแข่งแบบ 3D มุมถ่ายทอดสด"
          points={["ตั้งค่ารถ · ส่งรถออกควอลิฟาย", "สั่งโหมดขับ · ERS · แซงเลย!", "วางกลยุทธ์ยาง · เข้าพิท", "เล่นคนเดียว หรือออนไลน์ 6 คน"]}
          onClick={() => go("manager")}
        />
        <ModeCard
          kicker="DRIVER"
          title="นักขับ"
          icon={<Gauge className="h-6 w-6" aria-hidden />}
          sub="ขับเองแบบ 3D กดคันเร่ง/เบรกตามเส้นช่วยสามสี"
          points={["Time Trial ทำเวลาต่อรอบ", "แข่งกับ AI · ตามติดแล้วกดแซง", "ยาง · เข้าพิทตามจังหวะ", "แข่งกับเพื่อนออนไลน์ 8 คน"]}
          onClick={() => go("driver")}
        />
      </div>
      <p className="text-center text-[11px] text-white/50">{NAMES_NOTE}</p>
    </div>
  );
}

/** การ์ดเลือกโหมด: กดได้ทั้งใบ */
function ModeCard({ kicker, title, icon, sub, points, onClick }: { kicker: string; title: string; icon: ReactNode; sub: string; points: string[]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card card-poster group flex flex-col gap-3 p-4 text-left transition hover:border-white/30 focus-visible:outline-2 focus-visible:outline-white">
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-(--color-f1) text-white">{icon}</span>
        <span>
          <span className="poster block text-xs text-(--color-f1-text)">{kicker}</span>
          <span className="poster block text-2xl text-white">{title}</span>
        </span>
      </span>
      <span className="text-sm text-white/70">{sub}</span>
      <ul className="space-y-1 text-[13px] text-white/80">
        {points.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-(--color-f1)" aria-hidden />
            {x}
          </li>
        ))}
      </ul>
      <span className="mt-auto flex min-h-11 items-center justify-center gap-1 rounded-full bg-white text-sm font-bold text-[#08080A] group-hover:bg-white/90">
        เลือกโหมดนี้ <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}

export function BackToMenu({ onClick }: { onClick: () => void }) {
  return (
    <Btn tone="ghost" onClick={onClick}>
      <ChevronLeft className="inline h-4 w-4" /> เลือกโหมด
    </Btn>
  );
}

function HowTo() {
  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm font-bold text-white">วิธีเล่น</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-white/75">
          <li>
            <b>เตรียมรถ:</b> เลื่อนแรงกดอากาศให้เข้ากับสนาม (ทางตรงยาวใช้น้อย โค้งเยอะใช้มาก) ยางมีจำกัดทั้งสุดสัปดาห์
          </li>
          <li>
            <b>ควอลิฟาย:</b> ดูแบบ 3D ได้ (ป้ายบอกรอบอุ่นยาง/รอบเร่ง เวลาและเซกเตอร์) · เลือกจังหวะส่งรถออก ยาง จำนวนรอบเร่ง เสี่ยงหรือไม่ ลากท้ายเพื่อน สนามเร็วขึ้นตอนท้าย แต่ถ้าออกช้าไปอาจทำรอบไม่ทัน ติ๊ก “ขับเอง” แล้วเหยียบคันเร่ง/เบรกตามจังหวะเองได้
          </li>
          <li>
            <b>ออกตัว:</b> ไฟดับแล้วแตะจอให้ไว
          </li>
          <li>
            <b>เรซ:</b> ดูการแข่งแบบ 3D มุมกล้องถ่ายทอดสด (สลับเป็นแผนที่ได้) · ทุกคำสั่งบอกผลเป็นตัวเลข เช่น ดันสุด = เร็วขึ้น 0.4 วิ/รอบ แต่ยางหมดเร็วขึ้น · ดูช่องห่างคันหน้าว่ากำลังไล่ทันหรือห่างออก · ตามทันไม่เกิน 0.8 วิ กด <b>“แซงเลย!”</b> (บอกโอกาสผ่านก่อนกด ใช้แบต 20%) รถจะขึ้นเทียบแล้วแซงผ่านหรือถูกปิดไลน์ · ต้องเข้าพิทอย่างน้อย 1 ครั้ง · Safety Car ออกเมื่อไร เข้าพิทถูกลง · เกมเดินตามเวลาจริง เล่นคนเดียวเร่ง ×2 ×4 ได้
          </li>
          <li>
            <b>ลีก:</b> เลือกหลายสนามในห้องรอ สะสมคะแนนแชมป์นักขับและทีม
          </li>
        </ol>
      </details>
    </Card>
  );
}

function SoloGame({ name, onExit }: { name: string; onExit: () => void }) {
  const s = useLocalSession(name);
  return <Game session={s} onExit={onExit} />;
}

function OnlineGame({ code, name, onExit }: { code: string; name: string; onExit: () => void }) {
  const s = useOnlineSession(code, name);
  return <Game session={s} onExit={onExit} />;
}

function Game({ session, onExit }: { session: Session; onExit: () => void }) {
  const { snap, me, send, error, status, code } = session;
  const exit = () => {
    if (window.confirm("ออกจากเกม?")) onExit();
  };
  if (!snap)
    return (
      <Card>
        <p className="text-sm text-white/75">{status === "error" || status === "closed" ? "เชื่อมต่อห้องไม่ได้ กำลังลองใหม่…" : "กำลังเข้าห้อง…"}</p>
        <Btn tone="ghost" onClick={onExit}>
          กลับ
        </Btn>
      </Card>
    );
  const props = { snap, me, send };
  const live = snap.phase === "quali" || snap.phase === "race";
  return (
    <div className="space-y-3">
      {!live && (
        <div className="flex items-center justify-between gap-2">
          <Btn tone="ghost" onClick={exit}>
            ออกจากเกม
          </Btn>
          {snap.online && (
            <span className={`text-xs ${status === "open" ? "text-[#4ade80]" : "text-[#facc15]"}`}>
              {status === "open" ? `ออนไลน์ · ห้อง ${code}` : "กำลังเชื่อมต่อใหม่…"}
            </span>
          )}
        </div>
      )}
      {error && <p className="rounded-xl bg-(--color-f1)/15 px-3 py-2 text-sm text-(--color-f1-text)">{error}</p>}
      {snap.phase === "lobby" && <Lobby {...props} code={code} />}
      {snap.phase === "prep" && <Prep {...props} />}
      {snap.phase === "grid" && <Grid {...props} />}
      {snap.phase === "results" && <Results {...props} />}
      {snap.phase === "final" && <Final {...props} />}
      {live && <Live {...props} interval={session.interval} onExit={exit} />}
    </div>
  );
}
