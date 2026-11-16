/**
 * เสียงของโหมดนักขับ (Web Audio ล้วน ไม่ใช้ไฟล์เสียง — สังเคราะห์เองทั้งหมด)
 * — เครื่องยนต์: เสียงจุดระเบิดหลักกับฮาร์มอนิก + เสียงทุ้ม ผ่านตัวแต่งเสียงแตก · กดคันเร่ง = ดังและแหลมขึ้น · ยกคันเร่งที่รอบสูง = เสียงป๊อก
 * — ยาง: เอี๊ยดตามมุมลื่นจริง · ล้อฟรี (เสียงต่ำ) · ล้อล็อก (เสียงแหลม) · ล้อลงหญ้า (noise ทุ้ม)
 * — เปลี่ยนเกียร์ (เครื่องสะดุด + คลิก) · รถคันอื่นวิ่งผ่านใกล้ ๆ (ฟิ้ว ซ้าย/ขวา) · ชนท้าย/หลุดโค้ง (ตุบ)
 * สร้างหลังผู้เล่นกดเริ่ม (เบราว์เซอร์จึงยอมให้เล่นเสียง)
 */
export type Sfx = {
  /** เรียกทุกเฟรม: rpm 0..1 · เกียร์ · on = เปิดเสียง (ปิดเสียง/หยุด/ไฟยังไม่ดับ = เงียบ)
   *  load = คันเร่งที่กดจริง 0..1 · spin = ล้อหลังฟรี 0..1 · lock = ล้อล็อก 0..1 */
  frame(p: { rpm: number; gear: number; on: boolean; squeal: number; grass: boolean; boost?: boolean; load?: number; spin?: number; lock?: number }): void;
  shift(): void;
  /** รถคันอื่นวิ่งผ่าน · pan −1 ซ้าย … 1 ขวา · แรง 0..1 */
  whoosh(pan: number, strength: number): void;
  thump(strength: number): void;
  close(): void;
};

/** โค้งเสียงแตกนุ่ม ๆ (soft clip) ให้เสียงเครื่องมีเนื้อ */
function drive(ctx: AudioContext, amount: number) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  ws.curve = curve;
  ws.oversample = "2x";
  return ws;
}

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

  // เครื่องยนต์: ความถี่จุดระเบิด + ฮาร์มอนิกที่ 2 + เสียงทุ้มครึ่งความถี่ → แตกนุ่ม ๆ → low-pass ตามคันเร่ง
  const mix = ctx.createGain();
  const parts: { o: OscillatorNode; mul: number }[] = [];
  const voice = (type: OscillatorType, mul: number, level: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(mix);
    o.start();
    parts.push({ o, mul });
  };
  voice("sawtooth", 1, 0.5);
  voice("sawtooth", 1, 0.3, 9);
  voice("square", 2, 0.12);
  voice("triangle", 0.5, 0.45);
  const shaper = drive(ctx, 2.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  lp.Q.value = 1.2;
  const engine = ctx.createGain();
  engine.gain.value = 0;
  mix.connect(shaper).connect(lp).connect(engine).connect(out);

  // noise สำหรับยาง/หญ้า/ฟิ้ว/ป๊อก
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
  const spinNoise = loop("bandpass", 1300, 5);
  const lockNoise = loop("bandpass", 3400, 12);
  const grass = loop("lowpass", 260, 0.7);

  /** เสียงป๊อกตอนยกคันเร่งที่รอบสูง */
  const pop = (strength: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 180 + Math.random() * 220;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * strength, now());
    g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.07);
    src.connect(f).connect(g).connect(out);
    src.start(now(), Math.random(), 0.08);
  };
  let prevLoad = 0;
  let pops = 0;
  let popAt = 0;

  return {
    frame({ rpm, gear, on, squeal: sq, grass: onGrass, boost = false, load = 1, spin = 0, lock = 0 }) {
      enabled = on;
      const f0 = 95 + rpm * 330 + gear * 4;
      for (const p of parts) p.o.frequency.setTargetAtTime(f0 * p.mul, now(), 0.03);
      // กดคันเร่ง = เสียงเปิด แหลมและดังขึ้น · Overtake = มอเตอร์ไฟฟ้าช่วย แหลมขึ้นอีก
      lp.frequency.setTargetAtTime(500 + 1500 * load + 900 * rpm + (boost ? 1500 : 0), now(), 0.06);
      engine.gain.setTargetAtTime(on ? (0.018 + 0.022 * load) * (boost ? 1.3 : 1) : 0, now(), 0.08);
      squeal.gain.setTargetAtTime(on ? Math.min(0.05, sq * 0.06) : 0, now(), 0.06);
      spinNoise.gain.setTargetAtTime(on ? Math.min(0.06, spin * 0.07) : 0, now(), 0.05);
      lockNoise.gain.setTargetAtTime(on ? Math.min(0.05, lock * 0.06) : 0, now(), 0.04);
      grass.gain.setTargetAtTime(on && onGrass ? 0.12 : 0, now(), 0.08);
      // ยกคันเร่งเร็ว ๆ ที่รอบสูง → ป๊อก 2–4 ครั้ง
      if (on && prevLoad > 0.6 && load < 0.2 && rpm > 0.45) pops = 2 + Math.floor(Math.random() * 3);
      prevLoad = load;
      if (pops > 0 && now() >= popAt) {
        pop(0.5 + Math.random() * 0.5);
        pops--;
        popAt = now() + 0.05 + Math.random() * 0.08;
      }
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
