"use client";

import { useEffect, useState } from "react";
import { Globe, LogIn, User } from "lucide-react";
import Live from "@/components/pitwall/Live";
import { createRoom, onlineReady, useLocalSession, useOnlineSession, type Session } from "@/components/pitwall/session";
import { Btn, Card, Head } from "@/components/pitwall/ui";
import { Final, Grid, Lobby, Prep, Results } from "@/components/pitwall/Weekend";
import { NAMES_NOTE } from "@/lib/pitwall/teams";

type Mode = { kind: "solo" } | { kind: "online"; code: string } | null;

const NAME_KEY = "pitwall-name";

export default function PitWallApp() {
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านค่าที่จำไว้ในเครื่องหลังโหลดหน้า
      setName(window.localStorage.getItem(NAME_KEY) ?? "");
      const room = new URLSearchParams(window.location.search).get("room");
      if (room) setCode(room.toUpperCase());
    } catch {
      // อ่านไม่ได้ก็เริ่มว่าง
    }
  }, []);
  const remember = () => {
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {
      // เก็บไม่ได้ก็ไม่เป็นไร
    }
  };
  const nick = name.trim() || "ผู้เล่น";

  if (mode?.kind === "solo") return <SoloGame name={nick} onExit={() => setMode(null)} />;
  if (mode?.kind === "online") return <OnlineGame code={mode.code} name={nick} onExit={() => setMode(null)} />;

  return (
    <div className="space-y-4">
      <Card>
        <Head kicker="หัวหน้าทีม" title="เข้าสู่กำแพงพิท" sub="คุมรถ 2 คันจากกำแพงพิท: ตั้งค่ารถ ส่งรถออกควอลิฟาย สั่งเข้าพิท เลือกยาง แข่งกับทีม AI หรือเพื่อน" />
        <label className="block space-y-1" htmlFor="pw-name">
          <span className="text-xs font-bold text-white/70">ชื่อของคุณ</span>
          <input
            id="pw-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อเล่น"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-[#08080A] px-3 text-white"
          />
        </label>
        <Btn
          className="w-full"
          onClick={() => {
            remember();
            setMode({ kind: "solo" });
          }}
        >
          <User className="inline h-4 w-4" /> เล่นคนเดียว (แข่งกับทีม AI)
        </Btn>
      </Card>

      <Card>
        <Head kicker="ออนไลน์" title="แข่งกับเพื่อน" sub="สูงสุด 6 คน คนละทีม ที่เหลือเป็นทีม AI" />
        {!onlineReady() ? (
          <p className="rounded-xl bg-white/5 p-3 text-sm text-white/70">ยังไม่ได้เชื่อมเซิร์ฟเวอร์ห้องออนไลน์ — เจ้าของเว็บต้องตั้งค่า Cloudflare ก่อน (ดูคู่มือใน docs/pitwall-online.md)</p>
        ) : (
          <div className="space-y-2">
            <Btn
              className="w-full"
              disabled={busy}
              onClick={async () => {
                remember();
                setBusy(true);
                setErr(null);
                try {
                  const c = await createRoom();
                  setMode({ kind: "online", code: c });
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
                setMode({ kind: "online", code: c });
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
              <Btn type="submit" tone="white" className="flex-1">
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
            <b>ควอลิฟาย:</b> เลือกจังหวะส่งรถออก ยาง จำนวนรอบเร่ง เสี่ยงหรือไม่ ลากท้ายเพื่อน สนามเร็วขึ้นตอนท้าย แต่ถ้าออกช้าไปอาจทำรอบไม่ทัน ติ๊ก “ขับเอง” แล้วเหยียบคันเร่ง/เบรกตามจังหวะเองได้
          </li>
          <li>
            <b>ออกตัว:</b> ไฟดับแล้วแตะจอให้ไว
          </li>
          <li>
            <b>เรซ:</b> สั่งโหมดขับ (ถนอม/ปกติ/ดันสุด) ใช้แบต ERS บุกหรือป้องกัน ต้องเข้าพิทอย่างน้อย 1 ครั้ง (ใส่ยางชนิดไหนก็ได้ ชนิดเดิมก็ได้) เรซสั้นยางสึกเร็วกว่า · Safety Car ออกเมื่อไร เข้าพิทถูกลง
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
