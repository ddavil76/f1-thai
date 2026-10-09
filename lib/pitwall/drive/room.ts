/**
 * ห้องแข่งออนไลน์ของโหมดนักขับ (รันบน Cloudflare Durable Object เดียวกับห้อง Pit Wall)
 * — ทุกคนจำลองรถของตัวเองในเครื่อง แล้วส่งสถานะมาที่ห้อง ห้องส่งต่อให้ทุกคน ~10 ครั้ง/วินาที
 * — ห้องคุมแค่: รายชื่อ/รถที่เลือก ตั้งค่า (สนาม รอบ) เวลาไฟดับ (เวลาเซิร์ฟเวอร์) และผลการแข่ง
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (ใช้ได้ทั้งเซิร์ฟเวอร์และเทสต์)
 */
import { CIRCUITS, TEAMS } from "../teams";
import type { NetState } from "./race";

export const DRIVE_MAX_PLAYERS = 8;
/** เวลาตั้งแต่กดเริ่มถึงไฟดับ (ms) — โหลดสนาม + ไฟสตาร์ท */
export const DRIVE_START_DELAY = 9000;
/** หลังคนแรกเข้าเส้นชัย รอคนอื่นกี่ ms ก่อนสรุปผล */
const FINISH_WAIT = 45000;

export type DrivePhase = "lobby" | "race" | "results";
export type DrivePlayer = { id: string; name: string; team: number; driver: number; host: boolean; online: boolean };
export type DriveConfig = { circuit: string; laps: number };
export type DriveResult = { id: string; time: number | null; pen: number };

export type DriveMsg =
  | { t: "pick"; team: number; driver: number }
  | { t: "name"; name: string }
  | { t: "config"; config: Partial<DriveConfig> }
  | { t: "start" }
  | { t: "state"; st: NetState }
  | { t: "lobby" };

export type DriveSnap = {
  kind: "drive";
  phase: DrivePhase;
  players: DrivePlayer[];
  config: DriveConfig;
  /** เวลาไฟดับ (ms ตามนาฬิกาเซิร์ฟเวอร์) · ลำดับกริด (id) */
  startAt: number;
  grid: string[];
  /** เวลาเซิร์ฟเวอร์ตอนส่ง (ไว้เทียบนาฬิกา) */
  now: number;
  states: Record<string, NetState>;
  results: DriveResult[] | null;
};

export class DriveRoom {
  phase: DrivePhase = "lobby";
  players: DrivePlayer[] = [];
  config: DriveConfig = { circuit: "monza", laps: 5 };
  startAt = 0;
  grid: string[] = [];
  states: Record<string, NetState> = {};
  results: DriveResult[] | null = null;
  private firstFinish = 0;

  join(id: string, name: string): string | null {
    const p = this.players.find((x) => x.id === id);
    if (p) {
      p.online = true;
      if (name) p.name = name.slice(0, 20);
      return null;
    }
    if (this.phase !== "lobby") return "ห้องนี้เริ่มแข่งไปแล้ว";
    if (this.players.length >= DRIVE_MAX_PLAYERS) return "ห้องเต็มแล้ว";
    // รถว่างคันแรก (ทีม/นักขับไม่ซ้ำกัน)
    let team = 0;
    let driver = 0;
    outer: for (let ti = 0; ti < TEAMS.length; ti++)
      for (let d = 0; d < TEAMS[ti].drivers.length; d++)
        if (!this.players.some((x) => x.team === ti && x.driver === d)) {
          team = ti;
          driver = d;
          break outer;
        }
    this.players.push({ id, name: (name || "ผู้เล่น").slice(0, 20), team, driver, host: this.players.length === 0, online: true });
    return null;
  }

  leave(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    if (this.phase === "lobby") this.players = this.players.filter((x) => x.id !== id);
    else p.online = false;
    if (p.host) {
      p.host = false;
      const next = this.players.find((x) => x.online);
      if (next) next.host = true;
    }
  }

  handle(id: string, msg: DriveMsg, now: number): string | null {
    const me = this.players.find((x) => x.id === id);
    if (!me) return "ไม่ได้อยู่ในห้อง";
    switch (msg.t) {
      case "pick": {
        if (this.phase !== "lobby") return null;
        const t = TEAMS[msg.team];
        if (!t || !t.drivers[msg.driver]) return "เลือกรถไม่ถูกต้อง";
        if (this.players.some((x) => x !== me && x.team === msg.team && x.driver === msg.driver)) return "รถคันนี้มีคนเลือกแล้ว";
        me.team = msg.team;
        me.driver = msg.driver;
        return null;
      }
      case "name":
        me.name = (msg.name || me.name).slice(0, 20);
        return null;
      case "config": {
        if (!me.host || this.phase !== "lobby") return null;
        const c = msg.config;
        if (c.circuit && CIRCUITS.some((x) => x.id === c.circuit)) this.config.circuit = c.circuit;
        if (c.laps && [3, 5, 10].includes(c.laps)) this.config.laps = c.laps;
        return null;
      }
      case "start": {
        if (!me.host) return "เฉพาะหัวห้องเริ่มได้";
        if (this.phase !== "lobby") return null;
        this.phase = "race";
        this.startAt = now + DRIVE_START_DELAY;
        // กริด: สุ่มลำดับ
        this.grid = this.players
          .filter((p) => p.online)
          .map((p) => p.id)
          .sort(() => Math.random() - 0.5);
        this.states = {};
        this.results = null;
        this.firstFinish = 0;
        return null;
      }
      case "state": {
        if (this.phase !== "race" || !this.grid.includes(id)) return null;
        const st = msg.st;
        if (!Array.isArray(st) || st.length !== 9 || st.some((x) => typeof x !== "number" || !Number.isFinite(x))) return null;
        this.states[id] = st;
        if (st[8] >= 0 && !this.firstFinish) this.firstFinish = now;
        return null;
      }
      case "lobby":
        if (!me.host) return null;
        this.phase = "lobby";
        this.states = {};
        return null;
    }
  }

  /** เดินนาฬิกา: สรุปผลเมื่อทุกคนจบ หรือรอเกินเวลาหลังคนแรกเข้าเส้นชัย */
  tick(now: number) {
    if (this.phase !== "race" || !this.firstFinish) return;
    const racers = this.grid.filter((id) => this.players.find((p) => p.id === id)?.online);
    const done = racers.every((id) => (this.states[id]?.[8] ?? -1) >= 0);
    if (done || now - this.firstFinish > FINISH_WAIT) {
      this.results = this.grid
        .map((id) => {
          const st = this.states[id];
          return { id, time: st && st[8] >= 0 ? st[8] + st[7] : null, pen: st?.[7] ?? 0 };
        })
        .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
      this.phase = "results";
    }
  }

  snapshot(now: number): DriveSnap {
    return {
      kind: "drive",
      phase: this.phase,
      players: this.players,
      config: this.config,
      startAt: this.startAt,
      grid: this.grid,
      now,
      states: this.states,
      results: this.results,
    };
  }
}
