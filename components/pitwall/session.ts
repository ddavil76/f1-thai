"use client";

import { useEffect, useRef, useState } from "react";
import { Room, mergeSnap, type Msg, type Snapshot } from "@/lib/pitwall/room";

/** การเชื่อมต่อกับห้องแข่ง — เล่นคนเดียว (ห้องอยู่ในเบราว์เซอร์) หรือออนไลน์ (ห้องอยู่บนเซิร์ฟเวอร์) */
export type Session = {
  snap: Snapshot | null;
  me: string;
  send: (m: Msg) => void;
  status: "connecting" | "open" | "closed" | "error";
  error: string | null;
  code: string | null;
  /** ระยะห่างของข้อมูลแต่ละชุด (ms) ไว้ให้แผนที่เกลี่ยตำแหน่ง */
  interval: number;
};

const SOLO_TICK = 100;

/** เล่นคนเดียว: สร้างห้องในเบราว์เซอร์ แล้วเดินนาฬิกาเอง */
export function useLocalSession(name: string): Session {
  const [r] = useState(() => {
    const x = new Room({ online: false });
    x.join("me", name);
    return x;
  });
  const room = useRef<Room>(r);
  const [snap, setSnap] = useState<Snapshot | null>(() => r.snapshot());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let last = performance.now();
    const iv = window.setInterval(() => {
      const now = performance.now();
      r.tick(now - last);
      last = now;
      setSnap(r.snapshot());
    }, SOLO_TICK);
    return () => window.clearInterval(iv);
  }, [r]);
  return {
    snap,
    me: "me",
    send: (m) => {
      const r = room.current;
      if (!r) return;
      const err = r.handle("me", m);
      setError(err);
      setSnap(r.snapshot());
    },
    status: "open",
    error,
    code: null,
    interval: SOLO_TICK,
  };
}

/** ที่อยู่เซิร์ฟเวอร์ห้องออนไลน์ (ตั้งใน Vercel: NEXT_PUBLIC_PITWALL_SERVER) */
export const SERVER = (process.env.NEXT_PUBLIC_PITWALL_SERVER ?? "").replace(/\/+$/, "");
export const onlineReady = () => SERVER.length > 0;

export async function createRoom(): Promise<string> {
  const res = await fetch(`${SERVER}/new`, { method: "POST" });
  if (!res.ok) throw new Error(`สร้างห้องไม่สำเร็จ (${res.status})`);
  const j = (await res.json()) as { code: string };
  return j.code;
}

/** รหัสผู้เล่นของเครื่องนี้ (จำไว้ เผื่อหลุดแล้วต่อกลับเข้าห้องเดิม) */
function playerId(): string {
  try {
    const k = "pitwall-id";
    const v = window.localStorage.getItem(k);
    if (v) return v;
    const n = `p${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(k, n);
    return n;
  } catch {
    return `p${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** ออนไลน์: ต่อ WebSocket กับห้องบน Cloudflare · หลุดแล้วต่อใหม่เอง */
export function useOnlineSession(code: string, name: string): Session {
  const [me] = useState(playerId);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Session["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = 0;
    const connect = () => {
      const url = `${SERVER.replace(/^http/, "ws")}/room/${encodeURIComponent(code)}/ws?id=${encodeURIComponent(me)}&name=${encodeURIComponent(name)}`;
      const s = new WebSocket(url);
      ws.current = s;
      setStatus("connecting");
      s.onopen = () => {
        tries = 0;
        setStatus("open");
      };
      s.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as { t: "snap"; s: Snapshot } | { t: "live"; s: Partial<Snapshot> } | { t: "err"; msg: string };
          if (m.t === "snap") setSnap(m.s);
          else if (m.t === "live") setSnap((p) => mergeSnap(p, m.s));
          else setError(m.msg);
        } catch {
          // ข้อความเสีย ข้ามไป
        }
      };
      s.onclose = () => {
        if (!alive) return;
        setStatus("closed");
        tries++;
        timer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** tries));
      };
      s.onerror = () => setStatus("error");
    };
    connect();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ws.current?.close();
    };
  }, [code, me, name]);
  return {
    snap,
    me,
    send: (m) => {
      if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
    },
    status,
    error,
    code,
    interval: 250,
  };
}
