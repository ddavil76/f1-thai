/**
 * เซิร์ฟเวอร์ห้องออนไลน์ของ Pit Wall
 * - POST /new            → สร้างห้องใหม่ ได้รหัส 4 ตัว
 * - GET  /room/:code/ws  → ต่อ WebSocket เข้าห้อง (?id=ผู้เล่น&name=ชื่อ)
 * - POST /new?kind=drive → ห้องแข่งโหมดนักขับ (lib/pitwall/drive/room.ts)
 * แต่ละห้องคือ Durable Object หนึ่งตัว รันการจำลองเดียวกับที่เล่นคนเดียวในเบราว์เซอร์ (lib/pitwall/room.ts)
 */
import { Room, liveOnly, packJson, type Msg } from "../../../lib/pitwall/room";
import { DriveRoom, type DriveMsg } from "../../../lib/pitwall/drive/room";

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
        const kind = url.searchParams.get("kind") === "drive" ? "?kind=drive" : "";
        const res = await stub.fetch(`https://room/init${kind}`, { method: "POST" });
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
  /** ห้องโหมดนักขับ (ใช้แทน room) */
  drive: DriveRoom | null = null;
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
      if (this.room || this.drive) return new Response("exists", { status: 409 });
      if (url.searchParams.get("kind") === "drive") this.drive = new DriveRoom();
      else this.room = new Room({ online: true });
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
    const want = url.searchParams.get("kind") === "drive";
    if ((want ? !this.drive : !this.room)) return fail("ไม่พบห้องนี้ (รหัสผิด หรือห้องหมดอายุแล้ว)");
    const err = this.drive ? this.drive.join(id, name) : this.room!.join(id, name);
    if (err) return fail(err);
    this.sockets.set(server, id);
    server.addEventListener("message", (e: MessageEvent) => {
      if (this.drive) {
        try {
          const msg = JSON.parse(String(e.data)) as DriveMsg;
          const res = this.drive.handle(id, msg, Date.now());
          if (res) server.send(JSON.stringify({ t: "err", msg: res }));
          // สถานะรถส่งถี่ — ไม่ต้องกระจายทันที รอรอบ tick
          if (msg.t !== "state") this.broadcast(true);
        } catch {
          server.send(JSON.stringify({ t: "err", msg: "คำสั่งไม่ถูกต้อง" }));
        }
        return;
      }
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
      if (![...this.sockets.values()].includes(id)) {
        this.room?.leave(id);
        this.drive?.leave(id);
      }
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
      const now = Date.now();
      if (this.drive) {
        this.drive.tick(now);
        // ระหว่างแข่งส่ง 10 ครั้ง/วิ · ในล็อบบี้ 1 ครั้ง/วิ พอ
        if (this.drive.phase === "race" || now - this.lastLive >= 1000) {
          this.lastLive = now;
          this.broadcast(true);
        }
        return;
      }
      if (!this.room) return;
      this.room.tick(now - this.lastTick);
      this.lastTick = now;
      this.broadcast(false);
    }, 100);
  }

  /** ส่งชุดเต็มเมื่อเปลี่ยนช่วง/ทุก 2 วิ ที่เหลือส่งชุดเล็ก */
  broadcast(force: boolean) {
    const now = Date.now();
    if (this.drive) {
      // ห้องนักขับ: ส่งทุกรอบ tick (10 ครั้ง/วิ) ข้อมูลเล็ก
      this.send(JSON.stringify({ t: "snap", s: this.drive.snapshot(now) }));
      return;
    }
    if (!this.room) return;
    if (!force && now - this.lastLive < 250) return;
    this.lastLive = now;
    const snap = this.room.snapshot();
    const full = force || now - this.lastFull > 2000;
    if (full) this.lastFull = now;
    this.send(packJson(full ? { t: "snap", s: snap } : { t: "live", s: liveOnly(snap) }));
  }

  send(text: string) {
    for (const ws of this.sockets.keys()) {
      try {
        ws.send(text);
      } catch {
        // ส่งไม่ได้ เดี๋ยว close จะจัดการเอง
      }
    }
  }
}
