/**
 * เสียงของโหมดนักขับ (Web Audio ล้วน ไม่ใช้ไฟล์เสียง)
 * — เครื่องยนต์ (ฟันเลื่อยผ่าน low-pass) · เปลี่ยนเกียร์ (เครื่องสะดุด + คลิก) · ยางเอี๊ยดตอนไถล (noise ผ่าน band-pass)
 * — ล้อลงหญ้า (noise ทุ้ม) · รถคันอื่นวิ่งผ่านใกล้ ๆ (ฟิ้ว ซ้าย/ขวา) · ชนท้าย/หลุดโค้ง (ตุบ)
 * สร้างหลังผู้เล่นกดเริ่ม (เบราว์เซอร์จึงยอมให้เล่นเสียง)
 */
export type Sfx = {
  /** เรียกทุกเฟรม: rpm 0..1 · เกียร์ · on = เปิดเสียง (ปิดเสียง/หยุด/ไฟยังไม่ดับ = เงียบ) */
  frame(p: { rpm: number; gear: number; on: boolean; squeal: number; grass: boolean; boost?: boolean }): void;
  shift(): void;
  /** รถคันอื่นวิ่งผ่าน · pan −1 ซ้าย … 1 ขวา · แรง 0..1 */
  whoosh(pan: number, strength: number): void;
  thump(strength: number): void;
  close(): void;
};

export function createSfx(): Sfx | null {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);
  let enabled = false;
  const now = () => ctx.currentTime;

  // เครื่องยนต์
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const engine = ctx.createGain();
  engine.gain.value = 0;
  osc.connect(lp).connect(engine).connect(out);
  osc.start();

  // noise สำหรับยาง/หญ้า/ฟิ้ว
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const loop = (filterType: BiquadFilterType, freq: number, q: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(out);
    src.start();
    return g;
  };
  const squeal = loop("bandpass", 2300, 9);
  const grass = loop("lowpass", 260, 0.7);

  return {
    frame({ rpm, gear, on, squeal: sq, grass: onGrass, boost = false }) {
      // Overtake: เสียงเครื่องแหลมและดังขึ้น (มอเตอร์ไฟฟ้าช่วย)
      lp.frequency.setTargetAtTime(boost ? 2400 : 900, now(), 0.08);
      enabled = on;
      osc.frequency.setTargetAtTime(70 + rpm * 160 + gear * 6, now(), 0.05);
      engine.gain.setTargetAtTime(on ? (boost ? 0.05 : 0.035) : 0, now(), 0.1);
      squeal.gain.setTargetAtTime(on ? Math.min(0.05, sq * 0.06) : 0, now(), 0.06);
      grass.gain.setTargetAtTime(on && onGrass ? 0.12 : 0, now(), 0.08);
    },
    shift() {
      if (!enabled) return;
      // เครื่องสะดุดสั้น ๆ + คลิก
      engine.gain.cancelScheduledValues(now());
      engine.gain.setValueAtTime(0.012, now());
      engine.gain.linearRampToValueAtTime(0.035, now() + 0.09);
      const c = ctx.createBufferSource();
      c.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, now());
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.04);
      c.connect(f).connect(g).connect(out);
      c.start(now(), Math.random(), 0.05);
    },
    whoosh(pan, strength) {
      if (!enabled) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(500, now());
      f.frequency.exponentialRampToValueAtTime(1800, now() + 0.25);
      f.frequency.exponentialRampToValueAtTime(400, now() + 0.6);
      const g = ctx.createGain();
      const peak = 0.03 + 0.07 * Math.max(0, Math.min(1, strength));
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(peak, now() + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.65);
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(f).connect(g).connect(p).connect(out);
      src.start(now(), Math.random(), 0.7);
    },
    thump(strength) {
      if (!enabled) return;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(90, now());
      o.frequency.exponentialRampToValueAtTime(40, now() + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25 * Math.max(0.2, Math.min(1, strength)), now());
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.3);
      o.connect(g).connect(out);
      o.start();
      o.stop(now() + 0.32);
    },
    close() {
      ctx.close().catch(() => {});
    },
  };
}

/** สั่น (มือถือที่รองรับ) — iPhone ไม่รองรับ จะเงียบไปเอง */
export function buzz(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // บางเบราว์เซอร์ห้ามสั่นถ้ายังไม่ได้แตะจอ
  }
}
