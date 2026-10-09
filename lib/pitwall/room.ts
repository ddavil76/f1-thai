/**
 * ห้องแข่ง: ลำดับช่วงของสุดสัปดาห์ ผู้เล่น คำสั่ง และนาฬิกา
 * ใช้ตัวเดียวกันทั้งเล่นคนเดียว (รันในเบราว์เซอร์) และห้องออนไลน์ (รันบน Cloudflare Durable Object)
 * ผู้ที่ถือห้องเรียก tick(ms) เป็นระยะ แล้วส่ง snapshot() ให้หน้าจอ
 */
import { classify, newRace, applyLaunches, stepRace, SIM_DT, type RaceCtx, type RaceState } from "./race";
import { callIn, driveResult, expireDrive, newQuali, planCar, sendOut, stepQuali, type QualiCtx, type QualiState, type Risk } from "./quali";
import { rand, type Seed } from "./rng";
import { CIRCUITS, TEAMS } from "./teams";
import { buildTrack, type TrackModel } from "./track";
import type { AiLevel, Car, Compound, DriveMode, ErsMode, Fight, LaunchKind, QualiFormat, Radio, TeamOrder, TyreSet } from "./types";

export type Phase = "lobby" | "prep" | "quali" | "grid" | "race" | "results" | "final";
export type RaceLength = "short" | "normal" | "long";
export type Config = { circuits: string[]; length: RaceLength; quali: QualiFormat; ai: AiLevel };
export type Player = { id: string; name: string; team: number | null; ready: boolean; online: boolean; host: boolean };

/** เกมเดินเร็วกว่าจริงกี่เท่า */
export const QUALI_SCALE = 5;
export const RACE_SCALE = 3.5;
/** ความยาวเรซ (วินาทีของเกม) → จำนวนรอบตามสนาม */
const RACE_SECONDS: Record<RaceLength, number> = { short: 700, normal: 1100, long: 1600 };
/** เวลาให้เลือก (วินาทีจริง) เฉพาะออนไลน์ */
const PREP_SECONDS = 75;
const GRID_SECONDS = 40;
const LIGHTS_SECONDS = 25;
const DRIVE_WAIT = 30;
export const MAX_PLAYERS = 6;

export type Msg =
  | { t: "team"; team: number | null }
  | { t: "name"; name: string }
  | { t: "config"; config: Partial<Config> }
  | { t: "start" }
  | { t: "ready"; v: boolean }
  | { t: "setup"; car: number; downforce: number }
  | { t: "qsend"; car: number; compound: Compound; laps: number; risk: Risk; tow: boolean; drive: boolean }
  | { t: "qin"; car: number }
  | { t: "tyre"; car: number; compound: Compound }
  | { t: "launch"; car: number; kind: LaunchKind }
  | { t: "mode"; car: number; mode: DriveMode }
  | { t: "ers"; car: number; ers: ErsMode }
  | { t: "fight"; car: number; fight: Fight }
  | { t: "pit"; car: number; compound: Compound | null }
  | { t: "order"; order: TeamOrder }
  | { t: "auto"; car: number; v: boolean }
  | { t: "drive"; car: number; delta: number }
  | { t: "speed"; x: number }
  | { t: "skip" }
  | { t: "next" }
  | { t: "lobby" };

export type Standing = { drivers: Record<number, number>; teams: Record<number, number> };

export const DEFAULT_CONFIG: Config = { circuits: ["spa"], length: "normal", quali: "knockout", ai: "normal" };

const ALLOCATION: Compound[] = ["soft", "soft", "soft", "soft", "medium", "medium", "medium", "hard", "hard"];

export class Room {
  online: boolean;
  seed: Seed;
  players: Player[] = [];
  config: Config = { ...DEFAULT_CONFIG };
  phase: Phase = "lobby";
  round = 0;
  track: TrackModel | null = null;
  cars: Car[] = [];
  quali: QualiState | null = null;
  race: RaceState | null = null;
  laps = 0;
  radio: Radio[] = [];
  private radioId = 0;
  timer = -1;
  launch: Record<number, LaunchKind> = {};
  startTyre: Record<number, Compound> = {};
  results: ReturnType<typeof classify> | null = null;
  standings: Standing = { drivers: {}, teams: {} };
  history: { circuit: string; results: ReturnType<typeof classify> }[] = [];
  speed = 1;
  private driveWait: Record<number, number> = {};
  private acc = 0;
  version = 0;

  constructor(opts: { online: boolean; seed?: number }) {
    this.online = opts.online;
    this.seed = { s: opts.seed ?? Math.floor(Math.random() * 2 ** 31) };
  }

  /* ---------- ผู้เล่น ---------- */

  join(id: string, name: string): string | null {
    const p = this.players.find((x) => x.id === id);
    if (p) {
      p.online = true;
      if (name) p.name = name.slice(0, 20);
      this.bump();
      return null;
    }
    if (this.phase !== "lobby") return "ห้องนี้เริ่มแข่งไปแล้ว";
    if (this.players.length >= MAX_PLAYERS) return "ห้องเต็มแล้ว";
    const free = TEAMS.map((_, i) => i).find((i) => !this.players.some((x) => x.team === i)) ?? null;
    this.players.push({ id, name: (name || "ผู้เล่น").slice(0, 20), team: free, ready: false, online: true, host: this.players.length === 0 });
    this.bump();
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
    this.syncAuto();
    this.bump();
  }

  /** ทีมนี้มีผู้เล่นถือไหม (ใช้กับความเร็ว AI) */
  private owned = (team: number) => this.players.some((p) => p.team === team);
  /** ผู้เล่นที่ถือทีมนี้ยังต่ออยู่ไหม */
  private ownerOnline = (team: number) => this.players.some((p) => p.team === team && p.online);
  human = (car: number) => !!this.cars[car] && this.owned(this.cars[car].team);
  private carOf(p: Player, car: number) {
    return p.team !== null && this.cars[car]?.team === p.team;
  }

  private syncAuto() {
    for (const c of this.race?.cars ?? []) {
      const team = this.cars[c.id].team;
      if (!this.ownerOnline(team)) c.auto = true;
    }
    for (const q of this.quali?.cars ?? []) {
      const team = this.cars[q.id].team;
      if (!this.ownerOnline(team)) q.auto = true;
    }
  }

  say = (team: number | null, car: number | null, text: string, tone: Radio["tone"] = "info") => {
    this.radio.push({ id: ++this.radioId, at: Date.now(), team, car, text, tone });
    if (this.radio.length > 60) this.radio.splice(0, this.radio.length - 60);
  };

  private bump() {
    this.version++;
  }

  /* ---------- สุดสัปดาห์ ---------- */

  private ctx(): RaceCtx & QualiCtx {
    return { track: this.track!, cars: this.cars, teams: TEAMS, ai: this.config.ai, human: this.human, seed: this.seed, say: this.say };
  }

  private setupWeekend() {
    const id = this.config.circuits[this.round] ?? "spa";
    this.track = buildTrack(id) ?? buildTrack("spa");
    const t = this.track!;
    this.laps = Math.max(4, Math.round(RACE_SECONDS[this.config.length] / t.baseLap));
    const sets = (): TyreSet[] => ALLOCATION.map((c) => ({ compound: c, wear: 0, used: false }));
    this.cars = TEAMS.flatMap((team, ti) =>
      team.drivers.map((d) => ({
        id: 0,
        num: d.num,
        name: d.name,
        team: ti,
        skill: d.skill,
        downforce: this.owned(ti) ? 0.5 : Math.min(1, Math.max(0, t.idealDownforce + (rand(this.seed) - 0.5) * 0.2)),
        sets: sets(),
      })),
    ).map((c, i) => ({ ...c, id: i }));
    this.quali = null;
    this.race = null;
    this.results = null;
    this.launch = {};
    this.startTyre = {};
    this.driveWait = {};
    for (const p of this.players) p.ready = false;
    this.phase = "prep";
    this.timer = this.online ? PREP_SECONDS : -1;
    this.say(null, null, `สนาม ${CIRCUITS.find((c) => c.id === id)?.name ?? id} · ${this.laps} รอบ — ตั้งค่ารถให้เหมาะกับสนาม`, "info");
  }

  private toQuali() {
    for (const p of this.players) p.ready = false;
    if (this.config.quali === "none") {
      const grid = this.cars.map((c) => c.id).sort(() => rand(this.seed) - 0.5);
      return this.toGrid(grid);
    }
    this.quali = newQuali(this.ctx(), this.config.quali);
    this.quali.pause = 3;
    this.phase = "quali";
    this.timer = -1;
    this.say(null, null, `เริ่ม${this.config.quali === "single" ? "ควอลิฟาย" : " Q1"} อีกสักครู่`, "info");
  }

  grid: number[] = [];
  private toGrid(grid: number[]) {
    this.grid = grid;
    for (const p of this.players) p.ready = false;
    // ยางออกสตาร์ทเริ่มต้น: ทีม AI เลือกตามแผน
    for (const c of this.cars) {
      const top = TEAMS[c.team].pace < 0.3;
      this.startTyre[c.id] = this.human(c.id) ? "medium" : top || rand(this.seed) < 0.4 ? "medium" : "soft";
    }
    this.phase = "grid";
    this.timer = this.online ? GRID_SECONDS : -1;
  }

  private toRace() {
    for (const p of this.players) p.ready = false;
    this.race = newRace(this.ctx(), this.grid, this.laps, this.startTyre);
    this.phase = "race";
    this.launch = {};
    // ไม่มีรถผู้เล่นต่ออยู่ = ออกตัวเลย
    this.timer = this.humanCars().length ? LIGHTS_SECONDS : 0;
  }

  private humanCars() {
    return this.cars.filter((c) => this.ownerOnline(c.team)).map((c) => c.id);
  }

  private startLights() {
    const r = this.race!;
    for (const c of this.cars) {
      if (this.launch[c.id]) continue;
      const x = rand(this.seed);
      this.launch[c.id] = this.human(c.id) ? "ok" : x < 0.1 ? "great" : x < 0.32 ? "good" : x < 0.8 ? "ok" : x < 0.97 ? "slow" : "jump";
    }
    applyLaunches(r, this.launch);
    r.started = true;
    this.timer = -1;
    this.say(null, null, "ไฟดับ! ออกตัว", "good");
  }

  private finishRace() {
    const r = this.race!;
    this.results = classify(r, this.track!.lapCells);
    for (const row of this.results) {
      const team = this.cars[row.id].team;
      this.standings.drivers[row.id] = (this.standings.drivers[row.id] ?? 0) + row.points;
      this.standings.teams[team] = (this.standings.teams[team] ?? 0) + row.points;
    }
    this.history.push({ circuit: this.track!.id, results: this.results });
    for (const p of this.players) p.ready = false;
    this.phase = "results";
    this.timer = -1;
  }

  /* ---------- คำสั่ง ---------- */

  handle(id: string, m: Msg): string | null {
    const p = this.players.find((x) => x.id === id);
    if (!p) return "ไม่ได้อยู่ในห้อง";
    const res = this.apply(p, m);
    this.bump();
    return res;
  }

  private allReady() {
    const on = this.players.filter((x) => x.online && x.team !== null);
    return on.length > 0 && on.every((x) => x.ready);
  }

  private apply(p: Player, m: Msg): string | null {
    const q = this.quali;
    const r = this.race;
    switch (m.t) {
      case "name":
        p.name = m.name.slice(0, 20) || p.name;
        return null;
      case "team":
        if (this.phase !== "lobby") return "เปลี่ยนทีมได้เฉพาะก่อนเริ่ม";
        if (m.team !== null && (m.team < 0 || m.team >= TEAMS.length || this.players.some((x) => x !== p && x.team === m.team))) return "ทีมนี้มีคนเลือกแล้ว";
        p.team = m.team;
        return null;
      case "config": {
        if (!p.host || this.phase !== "lobby") return "เฉพาะเจ้าของห้องก่อนเริ่ม";
        const c = { ...this.config, ...m.config };
        c.circuits = (c.circuits ?? []).filter((x) => CIRCUITS.some((k) => k.id === x)).slice(0, 8);
        if (!c.circuits.length) c.circuits = ["spa"];
        this.config = c;
        return null;
      }
      case "start":
        if (!p.host || this.phase !== "lobby") return "เฉพาะเจ้าของห้อง";
        if (!this.players.some((x) => x.team !== null)) return "ต้องมีผู้เล่นเลือกทีมอย่างน้อย 1 คน";
        this.round = 0;
        this.standings = { drivers: {}, teams: {} };
        this.history = [];
        this.setupWeekend();
        return null;
      case "ready":
        p.ready = m.v;
        if (this.allReady()) {
          if (this.phase === "prep") this.toQuali();
          else if (this.phase === "grid") this.toRace();
        }
        return null;
      case "setup":
        if (this.phase !== "prep" || !this.carOf(p, m.car)) return "ตั้งค่าได้เฉพาะรถของตัวเองตอนเตรียมรถ";
        this.cars[m.car].downforce = Math.min(1, Math.max(0, m.downforce));
        return null;
      case "qsend":
        if (!q || !this.carOf(p, m.car)) return "ไม่ใช่รถของคุณ";
        return sendOut(this.ctx(), q, m.car, { compound: m.compound, laps: m.laps === 2 ? 2 : 1, risk: m.risk, tow: m.tow, drive: m.drive });
      case "qin":
        if (!q || !this.carOf(p, m.car)) return "ไม่ใช่รถของคุณ";
        callIn(q, m.car);
        return null;
      case "drive":
        if (!q || !this.carOf(p, m.car)) return null;
        driveResult(q, m.car, m.delta);
        delete this.driveWait[m.car];
        return null;
      case "tyre":
        if (this.phase !== "grid" || !this.carOf(p, m.car)) return "เลือกยางออกสตาร์ทได้ตอนอยู่บนกริด";
        if (!this.cars[m.car].sets.some((s) => s.compound === m.compound)) return "ไม่มียางชนิดนี้";
        this.startTyre[m.car] = m.compound;
        return null;
      case "launch":
        if (!r || r.started || !this.carOf(p, m.car)) return null;
        this.launch[m.car] = m.kind;
        if (this.humanCars().every((id) => this.launch[id])) this.startLights();
        return null;
      case "auto":
        // ควอลิฟาย: ให้ AI ส่งรถออกแทน
        if (this.phase === "quali" && this.quali) {
          if (!this.carOf(p, m.car)) return "ไม่ใช่รถของคุณ";
          const q = this.quali.cars[m.car];
          q.auto = m.v;
          q.plan = [];
          if (m.v) planCar(this.ctx(), this.quali, q);
          return null;
        }
      // falls through
      case "mode":
      case "ers":
      case "fight":
      case "pit": {
        if (!r || !this.carOf(p, m.car)) return "ไม่ใช่รถของคุณ";
        const c = r.cars[m.car];
        if (m.t === "mode") c.mode = m.mode;
        else if (m.t === "ers") c.ersMode = m.ers;
        else if (m.t === "fight") c.fight = m.fight;
        else if (m.t === "pit") {
          if (m.compound && !this.cars[m.car].sets.some((s) => s.compound === m.compound)) return "ไม่มียางชนิดนี้";
          c.pitReq = m.compound;
        } else c.auto = m.v;
        return null;
      }
      case "order":
        if (!r || p.team === null) return null;
        r.orders[p.team] = m.order;
        return null;
      case "speed":
        if (this.online) return "ความเร็วปรับได้เฉพาะเล่นคนเดียว";
        this.speed = [1, 2, 4].includes(m.x) ? m.x : 1;
        return null;
      case "skip":
        if (this.online) return "ข้ามได้เฉพาะเล่นคนเดียว";
        this.skipToEnd();
        return null;
      case "next":
        if (!p.host) return "เฉพาะเจ้าของห้อง";
        if (this.phase === "results") {
          if (this.round + 1 < this.config.circuits.length) {
            this.round++;
            this.setupWeekend();
          } else this.phase = "final";
        } else if (this.phase === "prep" && !this.online) this.toQuali();
        return null;
      case "lobby":
        if (!p.host || (this.phase !== "final" && this.phase !== "results")) return null;
        this.phase = "lobby";
        this.race = null;
        this.quali = null;
        this.results = null;
        for (const x of this.players) x.ready = false;
        return null;
    }
  }

  /** เล่นคนเดียว: จำลองช่วงปัจจุบันจนจบทันที */
  private skipToEnd() {
    const ctx = this.ctx();
    if (this.phase === "quali" && this.quali) {
      for (const q of this.quali.cars) q.auto = true;
      for (let i = 0; i < 40000 && !this.quali.done; i++) {
        stepQuali(ctx, this.quali, 0.5, 1);
        for (const q of this.quali.cars) if (q.waitDrive) expireDrive(this.quali, q.id);
      }
      this.afterQuali();
    } else if (this.phase === "race" && this.race) {
      if (!this.race.started) this.startLights();
      for (const c of this.race.cars) c.auto = true;
      for (let i = 0; i < 200000 && !this.race.done; i++) stepRace(ctx, this.race, SIM_DT);
      this.finishRace();
    }
  }

  private afterQuali() {
    if (this.quali?.done) this.toGrid(this.quali.grid);
  }

  /* ---------- นาฬิกา ---------- */

  tick(ms: number) {
    const real = Math.min(0.5, ms / 1000);
    let changed = false;
    if (this.timer > 0) {
      this.timer = Math.max(0, this.timer - real);
      changed = true;
      if (this.timer === 0) {
        if (this.phase === "prep") this.toQuali();
        else if (this.phase === "grid") this.toRace();
        else if (this.phase === "race" && this.race && !this.race.started) this.startLights();
      }
    } else if (this.phase === "race" && this.race && !this.race.started && this.timer === 0) {
      this.startLights();
      changed = true;
    }
    const ctx = this.track ? this.ctx() : null;
    if (this.phase === "quali" && this.quali && ctx) {
      for (const [car, left] of Object.entries(this.driveWait)) {
        const l = left - real;
        if (l <= 0) {
          expireDrive(this.quali, Number(car));
          delete this.driveWait[Number(car)];
        } else this.driveWait[Number(car)] = l;
      }
      for (const q of this.quali.cars) if (q.waitDrive && this.driveWait[q.id] === undefined) this.driveWait[q.id] = DRIVE_WAIT;
      // มีคนกำลังขับเอง: เกมเดินความเร็วปกติ ให้รอบในเกมกับเกมจับจังหวะไปพร้อมกัน
      const speed = this.quali.cars.some((c) => c.waitDrive) ? 1 : this.speed;
      this.acc += real * QUALI_SCALE * speed;
      const steps = Math.floor(this.acc / 0.25);
      this.acc -= steps * 0.25;
      const realPer = steps ? real / steps : real;
      if (!steps) stepQuali(ctx, this.quali, 0, real);
      for (let i = 0; i < steps; i++) stepQuali(ctx, this.quali, 0.25, realPer);
      if (this.quali.done) this.afterQuali();
      changed = true;
    } else if (this.phase === "race" && this.race?.started && ctx) {
      this.acc += real * RACE_SCALE * this.speed;
      const steps = Math.floor(this.acc / SIM_DT);
      this.acc -= steps * SIM_DT;
      for (let i = 0; i < steps; i++) stepRace(ctx, this.race, SIM_DT);
      if (this.race.done) this.finishRace();
      changed = true;
    }
    if (changed) this.bump();
  }

  /* ---------- ภาพที่ส่งให้หน้าจอ ---------- */

  snapshot(): Snapshot {
    return {
      v: this.version,
      online: this.online,
      phase: this.phase,
      round: this.round,
      config: this.config,
      players: this.players,
      circuit: this.track?.id ?? this.config.circuits[0],
      laps: this.laps,
      timer: this.timer,
      speed: this.speed,
      cars: this.cars,
      quali: this.phase === "quali" ? this.quali : null,
      race: this.phase === "race" || this.phase === "results" ? this.race : null,
      grid: this.grid,
      startTyre: this.startTyre,
      launch: this.launch,
      results: this.results,
      standings: this.standings,
      history: this.history.map((h) => ({ circuit: h.circuit, winner: h.results[0]?.id ?? -1 })),
      radio: this.radio.slice(-25),
    };
  }
}

/** ตัดทศนิยมให้สั้นลงก่อนส่งข้ามเน็ต */
export const packJson = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));

/** ข้อมูลชุดเล็ก (ส่งถี่): ไม่มีข้อมูลรถที่ไม่ค่อยเปลี่ยน และวิทยุแค่ล่าสุด */
export const liveOnly = (s: Snapshot): Partial<Snapshot> => {
  const { cars, history, standings, ...rest } = s;
  void cars;
  void history;
  void standings;
  return { ...rest, radio: s.radio.slice(-6) };
};

/** รวมข้อมูลชุดเล็กเข้ากับชุดเต็มที่มีอยู่ */
export function mergeSnap(prev: Snapshot | null, next: Partial<Snapshot>): Snapshot | null {
  if (!prev) return next.cars ? (next as Snapshot) : null;
  const radio = [...prev.radio];
  for (const r of next.radio ?? []) if (!radio.some((x) => x.id === r.id)) radio.push(r);
  return { ...prev, ...next, radio: radio.slice(-25) } as Snapshot;
}

export type Snapshot = {
  v: number;
  online: boolean;
  phase: Phase;
  round: number;
  config: Config;
  players: Player[];
  circuit: string;
  laps: number;
  timer: number;
  speed: number;
  cars: Car[];
  quali: QualiState | null;
  race: RaceState | null;
  grid: number[];
  startTyre: Record<number, Compound>;
  launch: Record<number, LaunchKind>;
  results: ReturnType<typeof classify> | null;
  standings: Standing;
  history: { circuit: string; winner: number }[];
  radio: Radio[];
};
