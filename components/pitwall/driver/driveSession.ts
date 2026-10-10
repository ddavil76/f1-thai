"use client";

import { useEffect, useRef, useState } from "react";
import type { DriveMsg, DriveSnap } from "@/lib/pitwall/drive/room";
import { SERVER, playerId } from "@/components/pitwall/session";

/** การเชื่อมต่อกับห้องแข่งออนไลน์ของโหมดนักขับ */
export type DriveLink = {
  snap: DriveSnap | null;
  me: string;
  send: (m: DriveMsg) => void;
  status: "connecting" | "open" | "closed" | "error";
  error: string | null;
  clearError: () => void;
  /** ข้อมูลล่าสุด + เวลาที่ได้รับ (performance.now) — ลูปเกมอ่านจาก ref นี้โดยไม่ต้อง render ใหม่ */
  latest: { current: { snap: DriveSnap | null; at: number } };
  /** นาฬิกาเซิร์ฟเวอร์ (ms) ตามที่ประมาณได้ */
  serverNow: () => number;
};

/** ต่อ WebSocket กับห้องบน Cloudflare (?kind=drive) · หลุดแล้วต่อใหม่เอง */
export function useDriveLink(code: string, name: string): DriveLink {
  const [me] = useState(playerId);
  const [snap, setSnap] = useState<DriveSnap | null>(null);
  const [status, setStatus] = useState<DriveLink["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const latest = useRef<{ snap: DriveSnap | null; at: number }>({ snap: null, at: 0 });
  // ส่วนต่างนาฬิกา (เซิร์ฟเวอร์ − เครื่องนี้) — เก็บค่าสูงสุด = ชุดที่เดินทางเร็วสุด ใกล้ค่าจริงที่สุด
  const offset = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = 0;
    const connect = () => {
      const url = `${SERVER.replace(/^http/, "ws")}/room/${encodeURIComponent(code)}/ws?kind=drive&id=${encodeURIComponent(me)}&name=${encodeURIComponent(name)}`;
      const s = new WebSocket(url);
      ws.current = s;
      setStatus("connecting");
      s.onopen = () => {
        tries = 0;
        setStatus("open");
      };
      s.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as { t: "snap"; s: DriveSnap } | { t: "err"; msg: string };
          if (m.t === "snap") {
            const o = m.s.now - Date.now();
            offset.current = offset.current === null ? o : Math.max(offset.current, o);
            latest.current = { snap: m.s, at: performance.now() };
            setSnap(m.s);
          } else setError(m.msg);
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
    clearError: () => setError(null),
    latest,
    serverNow: () => Date.now() + (offset.current ?? 0),
  };
}
