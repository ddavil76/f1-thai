/**
 * เซิร์ฟเวอร์ห้องออนไลน์ของ Pit Wall
 * - POST /new            → สร้างห้องใหม่ ได้รหัส 4 ตัว
 * - GET  /room/:code/ws  → ต่อ WebSocket เข้าห้อง (?id=ผู้เล่น&name=ชื่อ)
 * แต่ละห้องคือ Durable Object หนึ่งตัว รันการจำลองเดียวกับที่เล่นคนเดียวในเบราว์เซอร์ (lib/pitwall/room.ts)
 */
import { Room, liveOnly, packJson, type Msg } from "../../../lib/pitwall/room";

type Env = { ROOMS: DurableObjectNamespace };

// ชนิดข้อมูลแบบย่อของ Cloudflare (ไม่ต้องลงแพ็กเกจ types เพิ่ม)
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
type DurableObjectNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request | string, init?: RequestInit): Promise<Response> } };
type DurableObjectState = unknown;
type CfWebSocket = WebSocket & { accept(): void };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json", ...CORS } });
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/") return json({ ok: true, service: "pitwall-room" });
    if (url.pathname === "/new" && req.method === "POST") {
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch("https://room/init", { method: "POST" });
        if (res.ok) return json({ code });
      }
      return json({ error: "สร้างห้องไม่สำเร็จ ลองใหม่" }, 503);
    }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4,6})\/ws$/);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return json({ error: "ไม่พบ" }, 404);
  },
};

/** ห้องหนึ่งห้อง: ถือสถานะเกมในหน่วยความจำ เดินนาฬิกาทุก 0.1 วิ ส่งภาพให้ทุกคนราว 4 ครั้ง/วิ */
export class PitRoom {
  room: Room | null = null;
  sockets = new Map<CfWebSocket, string>();
  timer: ReturnType<typeof setInterval> | null = null;
  lastTick = 0;
  lastLive = 0;
  lastFull = 0;
  lastVersion = -1;

  constructor(_state: DurableObjectState, _env: unknown) {
    void _state;
    void _env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/init") {
      if (this.room) return new Response("exists", { status: 409 });
      this.room = new Room({ online: true });
      return new Response("ok");
    }
    if (req.headers.get("Upgrade") !== "websocket") return new Response("ต้องต่อแบบ WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as CfWebSocket;
    server.accept();
    const id = (url.searchParams.get("id") ?? "").slice(0, 32) || `p${Math.random().toString(36).slice(2, 10)}`;
    const name = (url.searchParams.get("name") ?? "ผู้เล่น").slice(0, 20);
    const fail = (msg: string) => {
      server.send(JSON.stringify({ t: "err", msg }));
      server.close(1008, "rejected");
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    };
    if (!this.room) return fail("ไม่พบห้องนี้ (รหัสผิด หรือห้องหมดอายุแล้ว)");
    const err = this.room.join(id, name);
    if (err) return fail(err);
    this.sockets.set(server, id);
    server.addEventListener("message", (e: MessageEvent) => {
      if (!this.room) return;
      try {
        const msg = JSON.parse(String(e.data)) as Msg;
        const res = this.room.handle(id, msg);
        if (res) server.send(JSON.stringify({ t: "err", msg: res }));
      } catch {
        server.send(JSON.stringify({ t: "err", msg: "คำสั่งไม่ถูกต้อง" }));
      }
      this.broadcast(true);
    });
    const gone = () => {
      if (!this.sockets.has(server)) return;
      this.sockets.delete(server);
      if (![...this.sockets.values()].includes(id)) this.room?.leave(id);
      this.broadcast(true);
      if (this.sockets.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    this.start();
    this.broadcast(true);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  start() {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => {
      if (!this.room) return;
      const now = Date.now();
      this.room.tick(now - this.lastTick);
      this.lastTick = now;
      this.broadcast(false);
    }, 100);
  }

  /** ส่งชุดเต็มเมื่อเปลี่ยนช่วง/ทุก 2 วิ ที่เหลือส่งชุดเล็ก */
  broadcast(force: boolean) {
    if (!this.room) return;
    const now = Date.now();
    if (!force && now - this.lastLive < 250) return;
    this.lastLive = now;
    const snap = this.room.snapshot();
    const full = force || now - this.lastFull > 2000;
    if (full) this.lastFull = now;
    const text = packJson(full ? { t: "snap", s: snap } : { t: "live", s: liveOnly(snap) });
    for (const ws of this.sockets.keys()) {
      try {
        ws.send(text);
      } catch {
        // ส่งไม่ได้ เดี๋ยว close จะจัดการเอง
      }
    }
  }
}
