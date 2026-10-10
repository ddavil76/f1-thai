/**
 * รีเพลย์ของโหมดแข่ง: บันทึกตำแหน่งรถทุกคัน 30 ครั้ง/วินาที (เก็บย้อนหลัง 15 วินาที)
 * — ไฮไลต์การแซง: ตอนผู้เล่นแซงได้ เก็บคลิป 6 วินาทีก่อน + 2.5 วินาทีหลัง (สูงสุด 6 คลิป)
 * — รีเพลย์เส้นชัย: 8 วินาทีก่อนเข้าเส้นชัย + 3 วินาทีหลัง
 * ไม่มีโค้ดเฉพาะเบราว์เซอร์ (ทดสอบได้)
 */
export type RecCar = { s: number; lateral: number; v: number; aero: number };
export type RFrame = { t: number; me: RecCar; rivals: RecCar[] };

const HZ = 30;
const KEEP = 15;
const CLIP_BEFORE = 6;
const CLIP_AFTER = 2.5;
const MAX_CLIPS = 6;
const FINISH_BEFORE = 8;
const FINISH_AFTER = 3;

export class Recorder {
  ring: RFrame[] = [];
  clips: RFrame[][] = [];
  finish: RFrame[] | null = null;
  private pending: number[] = [];
  private finishAt: number | null = null;

  push(f: RFrame) {
    const last = this.ring[this.ring.length - 1];
    if (last && f.t - last.t < 1 / HZ - 1e-9) return;
    this.ring.push(f);
    while (this.ring.length && this.ring[0].t < f.t - KEEP) this.ring.shift();
    // คลิปแซงที่ครบเวลาหลังแซงแล้ว
    this.pending = this.pending.filter((end) => {
      if (f.t < end) return true;
      this.clips.push(this.since(end - CLIP_AFTER - CLIP_BEFORE));
      return false;
    });
    if (this.finishAt !== null && !this.finish && f.t >= this.finishAt + FINISH_AFTER) this.finish = this.since(this.finishAt - FINISH_BEFORE);
  }

  /** ผู้เล่นเพิ่งแซง (เวลา t) — แซงติด ๆ กันภายใน 4 วิ นับเป็นคลิปเดียว */
  markOvertake(t: number) {
    if (this.clips.length + this.pending.length >= MAX_CLIPS) return;
    if (this.pending.some((end) => t < end + 1.5)) return;
    this.pending.push(t + CLIP_AFTER);
  }

  markFinish(t: number) {
    if (this.finishAt === null) this.finishAt = t;
  }

  private since(t: number) {
    return this.ring.filter((f) => f.t >= t);
  }
}

const lerpCar = (a: RecCar, b: RecCar, f: number): RecCar => ({
  s: a.s + (b.s - a.s) * f,
  lateral: a.lateral + (b.lateral - a.lateral) * f,
  v: a.v + (b.v - a.v) * f,
  aero: f < 0.5 ? a.aero : b.aero,
});

/** ภาพ ณ เวลา t ในคลิป (เกลี่ยระหว่างเฟรม) */
export function frameAt(frames: RFrame[], t: number): RFrame {
  if (t <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (frames[m].t <= t) lo = m;
    else hi = m;
  }
  const a = frames[lo];
  const b = frames[hi];
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { t, me: lerpCar(a.me, b.me, f), rivals: a.rivals.map((r, k) => lerpCar(r, b.rivals[k] ?? r, f)) };
}
