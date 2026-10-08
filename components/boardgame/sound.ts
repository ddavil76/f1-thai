/**
 * เสียงประกอบเกม — สังเคราะห์ด้วย Web Audio ทั้งหมด (ไม่มีไฟล์เสียง)
 * เบราว์เซอร์ยอมให้เล่นเสียงหลังผู้เล่นแตะจอแล้วเท่านั้น จึงสร้าง AudioContext ตอนเล่นเสียงครั้งแรก
 * ปิด/เปิดเสียงจำไว้ในเครื่อง (localStorage)
 */
const KEY = "bg-sound-off";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let off = false;
try {
  off = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
} catch {
  off = false;
}

export const soundOn = () => !off;
export function setSoundOn(on: boolean) {
  off = !on;
  try {
    window.localStorage.setItem(KEY, off ? "1" : "0");
  } catch {
    // เก็บค่าไม่ได้ก็ใช้แค่รอบนี้
  }
}

function audio(): AudioContext | null {
  if (off || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** เสียงโทนเดียว ไล่ความถี่ได้ */
function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, at = 0) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** เสียงซ่า (noise) ผ่านฟิลเตอร์ — ใช้ทำเสียงพลิกไพ่ ลม ชน */
function noise(dur: number, filter: BiquadFilterType, f0: number, f1: number, vol: number, at = 0) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bq = a.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  /** แจกไพ่เข้ามือ (พลิกทีละใบ) */
  deal(n = 3) {
    for (let i = 0; i < n; i++) noise(0.09, "bandpass", 1800, 5200, 0.35, 0.3 + i * 0.07);
  },
  /** พลิกไพ่ใบเดียว */
  flip() {
    noise(0.12, "bandpass", 1500, 6000, 0.4);
  },
  /** แตะเลือก */
  select() {
    tone(880, 1320, 0.07, "triangle", 0.25);
  },
  /** ยกเลิก / เปลี่ยนไพ่ */
  cancel() {
    tone(660, 330, 0.12, "triangle", 0.22);
  },
  /** เปิด/ปิดตัวเลือก (ERS ปิดไลน์) */
  toggle(on: boolean) {
    tone(on ? 520 : 400, on ? 780 : 300, 0.08, "square", 0.08);
  },
  /** ยืนยันเดิน: เสียงเครื่องเร่ง */
  go() {
    tone(70, 240, 0.55, "sawtooth", 0.16);
    tone(140, 480, 0.55, "square", 0.04);
    noise(0.5, "lowpass", 400, 2400, 0.12);
  },
  /** รถคันอื่นวิ่งผ่าน */
  whoosh() {
    noise(0.35, "bandpass", 300, 1400, 0.08);
  },
  overtake() {
    tone(660, 660, 0.12, "triangle", 0.25);
    tone(990, 990, 0.22, "triangle", 0.25, 0.1);
  },
  crash() {
    noise(0.6, "lowpass", 2400, 120, 0.7);
    tone(120, 40, 0.4, "sawtooth", 0.2);
  },
  /** เซฟตี้คาร์ / VSC */
  alert() {
    for (let i = 0; i < 3; i++) {
      tone(740, 740, 0.14, "square", 0.08, i * 0.32);
      tone(560, 560, 0.14, "square", 0.08, i * 0.32 + 0.16);
    }
  },
  /** ไฟแดงติดหนึ่งดวง */
  light() {
    tone(440, 440, 0.16, "sine", 0.25);
  },
  /** ไฟดับ ออกตัว */
  lightsOut() {
    tone(880, 880, 0.3, "sine", 0.3);
    noise(0.6, "lowpass", 600, 3000, 0.15, 0.05);
  },
  /** ควอลิฟาย: กดคันเร่ง */
  throttle() {
    tone(110, 330, 0.25, "sawtooth", 0.1);
  },
  /** ควอลิฟาย: กดเบรก (เสียงยางเสียดถนน) */
  brake() {
    noise(0.22, "bandpass", 3200, 1600, 0.25);
    tone(300, 120, 0.2, "sawtooth", 0.05);
  },
  /** ควอลิฟาย: กด DRS */
  drs() {
    tone(500, 1200, 0.2, "triangle", 0.15);
  },
  /** ควอลิฟาย: พลาดโน้ต / ออกนอกโค้ง */
  miss() {
    tone(180, 90, 0.15, "square", 0.08);
  },
  offTrack() {
    noise(0.45, "lowpass", 1800, 200, 0.4);
  },
  /** ผลดี / ผลร้าย */
  good() {
    tone(523, 523, 0.1, "triangle", 0.22);
    tone(784, 784, 0.18, "triangle", 0.22, 0.09);
  },
  bad() {
    tone(392, 262, 0.3, "triangle", 0.22);
  },
};
