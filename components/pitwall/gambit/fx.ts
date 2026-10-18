/**
 * เอฟเฟกต์ 3D ของการ์ดอัปเกรดโหมดกลยุทธ์ (ตามต้นแบบ Pit Wall Gambit) — การ์ดที่อัปครบ 3 ขั้นปลดล็อกเอฟเฟกต์บนรถเรา
 * — ยางเรืองแสง · จานเบรกร้อนแดง · เปลวไฟท่อไอเสีย/เทอร์โบ/บูสต์ · ไฟใต้ท้องตามแบต · วงแสงเหนือหมวก · ลูกศรไล่ล่า · โล่ท้ายรถ
 * — เงาติดตา · สายลมปลายปีก · เส้นความเร็วรอบกล้อง · ประกาย/ฝุ่น/ไอร้อน/ประจุไฟ (อนุภาค) · คลื่นวงแหวน · พลุออกพิท · ป้าย "เต็ม!"
 * พิกัดรถของเกม: +z = หน้ารถ · +y = บน · ล้อหน้า z 1.7 ล้อหลัง z −1.7 (ต้นแบบใช้ +x = หน้า ล้อหน้า x 1.45 → z = x + 0.25)
 */
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;

/** สถานะรถเราที่เอฟเฟกต์ต้องรู้ในแต่ละเฟรม */
export type FxState = {
  /** การ์ดที่อัปครบ 3 ขั้น */
  maxed: Set<string>;
  /** ความเร็ว (ม./วิ) · กำลังใช้บูสต์ · แบต 0..1 */
  v: number;
  boost: boolean;
  energy: number;
  /** ความโค้งตรงนี้ 0..1 (0 = ทางตรง) */
  cf: number;
  /** มีรถข้างหน้าในระยะ 45 ม. · มีรถจี้ท้ายใน 16 ม. */
  ahead: boolean;
  behind: boolean;
  /** อยู่ในพิทเลน · จบแล้ว · มีการ์ดทองทำงาน · XP สะสมทั้งหมด · เซกเตอร์ (0–2) */
  pit: boolean;
  finished: boolean;
  gold: boolean;
  xp: number;
  sector: number;
  /** มุมกล้องตามรถ (เส้นความเร็ว/โล่โปร่งขึ้น) */
  chase: boolean;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOf = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
/** แปลงพิกัดต้นแบบ (x หน้า, y บน, z ข้าง) เป็นพิกัดรถของเกม */
const P = (x: number, y: number, z: number): [number, number, number] => [-z, y, x + 0.25];

export function createFx(THREE: Three, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, renderer: THREE_NS.WebGLRenderer) {
  const ADD = THREE.AdditiveBlending;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const glowMat = (color: string, op = 1) => keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: ADD, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const fxg = new THREE.Group();
  /** ล้อของรถเกม: x ข้าง · z หน้า/หลัง · R รัศมี · w กว้าง · s ฝั่ง */
  const WHEELS = [
    { x: 0.81, z: 1.7, R: 0.354, w: 0.28, s: 1 },
    { x: -0.81, z: 1.7, R: 0.354, w: 0.28, s: -1 },
    { x: 0.7625, z: -1.7, R: 0.36, w: 0.375, s: 1 },
    { x: -0.7625, z: -1.7, R: 0.36, w: 0.375, s: -1 },
  ];
  const REAR = WHEELS.filter((w) => w.z < 0);

  // ---- อนุภาค: จุดเรืองแสงชุดเดียวใช้ร่วมทุกเอฟเฟกต์
  const PMAX = 1200;
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  const pSize = new Float32Array(PMAX);
  const pAlpha = new Float32Array(PMAX);
  const pVel = new Float32Array(PMAX * 3);
  const pLife = new Float32Array(PMAX);
  const pMax = new Float32Array(PMAX);
  const pGrav = new Float32Array(PMAX);
  const pDrag = new Float32Array(PMAX);
  let pNext = 0;
  const pg = keep(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute("pcolor", new THREE.BufferAttribute(pCol, 3));
  pg.setAttribute("psize", new THREE.BufferAttribute(pSize, 1));
  pg.setAttribute("palpha", new THREE.BufferAttribute(pAlpha, 1));
  const pMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 pcolor;attribute float psize;attribute float palpha;uniform float uScale;varying vec3 vC;varying float vA;
        void main(){vC=pcolor;vA=palpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=psize*uScale/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vC;varying float vA;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;float a=pow(1.-r*2.,1.6)*vA;gl_FragColor=vec4(vC*a,a);}`,
      transparent: true,
      depthWrite: false,
      blending: ADD,
    }),
  );
  const points = new THREE.Points(pg, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const col = new THREE.Color();
  function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, size: number, life: number, grav = 0, drag = 0) {
    const i = pNext;
    pNext = (pNext + 1) % PMAX;
    col.set(color);
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx;
    pVel[i * 3 + 1] = vy;
    pVel[i * 3 + 2] = vz;
    pCol[i * 3] = col.r;
    pCol[i * 3 + 1] = col.g;
    pCol[i * 3 + 2] = col.b;
    pSize[i] = size;
    pLife[i] = pMax[i] = life;
    pGrav[i] = grav;
    pDrag[i] = drag;
    pAlpha[i] = 1;
  }
  function stepParticles(sdt: number) {
    if (sdt <= 0) return;
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) {
        pAlpha[i] = 0;
        continue;
      }
      pLife[i] -= sdt;
      const k = 1 - Math.min(1, pDrag[i] * sdt);
      pVel[i * 3] *= k;
      pVel[i * 3 + 1] = pVel[i * 3 + 1] * k - pGrav[i] * sdt;
      pVel[i * 3 + 2] *= k;
      pPos[i * 3] += pVel[i * 3] * sdt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * sdt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * sdt;
      pAlpha[i] = Math.max(0, pLife[i] / pMax[i]);
    }
    for (const a of ["position", "palpha", "pcolor", "psize"]) pg.attributes[a].needsUpdate = true;
  }

  // ---- กริปยาง: ยางเรืองแสง
  const tireGlow = new THREE.Group();
  const tgMat = glowMat("#5ff6ff", 0.9);
  const tgSoft = glowMat("#5ff6ff", 0.22);
  const torusA = keep(new THREE.TorusGeometry(0.34, 0.03, 8, 48));
  const torusB = keep(new THREE.TorusGeometry(0.34, 0.1, 8, 48));
  for (const wh of WHEELS)
    for (const side of [1, -1]) {
      const x = wh.x + side * wh.w * 0.5;
      for (const [g, m] of [[torusA, tgMat], [torusB, tgSoft]] as const) {
        const r = new THREE.Mesh(g, m);
        r.scale.setScalar(wh.R / 0.354);
        r.rotation.y = Math.PI / 2;
        r.position.set(x, wh.R, wh.z);
        tireGlow.add(r);
      }
    }
  fxg.add(tireGlow);
  // ---- เบรกช้า: จานเบรกร้อนแดง
  const brakeMat = glowMat("#ff4a12", 0);
  const brakes = new THREE.Group();
  const discGeo = keep(new THREE.CircleGeometry(0.19, 28));
  for (const wh of WHEELS) {
    const d = new THREE.Mesh(discGeo, brakeMat);
    d.rotation.y = Math.PI / 2;
    d.position.set(wh.x + wh.s * (wh.w * 0.5 + 0.012), wh.R, wh.z);
    brakes.add(d);
  }
  fxg.add(brakes);
  // ---- เครื่องยนต์ / เทอร์โบ / บูสต์แรง: เปลวไฟท่อไอเสีย (ชี้ไปท้ายรถ)
  const coneGeo = (r: number) => {
    const g = keep(new THREE.ConeGeometry(r, 1, 16, 1, true));
    g.translate(0, 0.5, 0);
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const flameO = new THREE.Mesh(coneGeo(0.1), glowMat("#ff8a2a", 0.85));
  const flameI = new THREE.Mesh(coneGeo(0.055), glowMat("#7fd4ff", 0.95));
  for (const f of [flameO, flameI]) {
    f.position.set(...P(-2.31, 0.44, 0));
    fxg.add(f);
  }
  // ---- ความจุแบต: ไฟใต้ท้องตามระดับแบต
  const ugTex = tex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(90,170,255,1)");
    gr.addColorStop(1, "rgba(90,170,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const under = new THREE.Mesh(keep(new THREE.PlaneGeometry(3, 6.2)), keep(new THREE.MeshBasicMaterial({ map: ugTex, transparent: true, blending: ADD, depthWrite: false, toneMapped: false, opacity: 0.8 })));
  under.rotation.x = -Math.PI / 2;
  under.position.set(...P(-0.3, 0.035, 0));
  fxg.add(under);
  // ---- สมาธินักแข่ง: วงแสงเหนือหมวก
  const halo = new THREE.Mesh(keep(new THREE.TorusGeometry(0.2, 0.016, 8, 40)), glowMat("#fff2b0", 0.95));
  halo.rotation.x = Math.PI / 2;
  halo.position.set(...P(0.15, 1.0, 0));
  fxg.add(halo);
  // ---- จังหวะแซง: ลูกศรไล่ล่าบนถนนข้างหน้า
  const chevTex = tex(128, 128, (g) => {
    g.strokeStyle = "#ff5a4f";
    g.lineWidth = 14;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const y of [28, 64]) {
      g.beginPath();
      g.moveTo(22, y + 34);
      g.lineTo(64, y);
      g.lineTo(106, y + 34);
      g.stroke();
    }
  });
  const chevGeo = keep(new THREE.PlaneGeometry(3, 3));
  chevGeo.rotateX(-Math.PI / 2);
  chevGeo.rotateY(Math.PI);
  const chev = new THREE.Mesh(chevGeo, keep(new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, blending: ADD, depthWrite: false, toneMapped: false })));
  chev.position.set(0, 0.06, 8.75);
  fxg.add(chev);
  // ---- ป้องกันอันดับ: โล่หกเหลี่ยมท้ายรถ
  const hexTex = tex(256, 128, (g, w, h) => {
    g.strokeStyle = "rgba(120,190,255,1)";
    g.lineWidth = 3;
    const r = 16;
    for (let y = 0; y < h + r; y += r * 1.5)
      for (let x = 0; x < w + r; x += r * 1.732) {
        const ox = x + ((y / (r * 1.5)) % 2 ? r * 0.866 : 0);
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          g.lineTo(ox + r * Math.cos(a), y + r * Math.sin(a));
        }
        g.closePath();
        g.stroke();
      }
  });
  const shield = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 1.2)), keep(new THREE.MeshBasicMaterial({ map: hexTex, transparent: true, blending: ADD, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })));
  shield.position.set(...P(-3.1, 0.7, 0));
  fxg.add(shield);
  // ---- ลดน้ำหนัก: เงาติดตาตามหลังรถ (โลก) — สร้างจากตัวรถจริงตอนผูกกับรถ
  const ghostMats = [glowMat("#a8dcff", 0.13), glowMat("#a8dcff", 0.06)];
  let ghosts: THREE_NS.Object3D[] = [];
  const hist: { t: number; p: THREE_NS.Vector3; q: THREE_NS.Quaternion }[] = [];
  // ---- ดาวน์ฟอร์ซ: สายลมปลายปีก (โลก)
  const TIPS = [P(-2.6, 1.0, 0.49), P(-2.6, 1.0, -0.49), P(2.55, 0.26, 0.87), P(2.55, 0.26, -0.87)];
  const TN = 36;
  const trails = TIPS.map(() => {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TN * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TN * 3), 3));
    const l = new THREE.Line(g, keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: ADD, depthWrite: false, toneMapped: false })));
    l.frustumCulled = false;
    scene.add(l);
    return { l, g, I: new Float32Array(TN), primed: false };
  });
  let trailAcc = 0;
  // ---- ชาร์จต่อเซกเตอร์ / ทีมพิท / อัปครบ: คลื่นวงแหวนบนพื้น (โลก)
  const ringGeo = keep(new THREE.RingGeometry(0.86, 1, 56));
  ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, glowMat("#ffffff", 0));
    m.visible = false;
    scene.add(m);
    return { m, life: 0, max: 1, size: 10 };
  });
  function ring(pos: THREE_NS.Vector3, color: string, size = 12, life = 0.9) {
    const r = rings.find((q) => q.life <= 0) ?? rings[0];
    (r.m.material as THREE_NS.MeshBasicMaterial).color.set(color);
    r.m.position.set(pos.x, pos.y + 0.08, pos.z);
    r.life = r.max = life;
    r.size = size;
    r.m.visible = true;
  }
  // ---- ลดแรงต้าน: เส้นความเร็วรอบกล้อง
  const SL = 110;
  const slPos = new Float32Array(SL * 6);
  const slAngle = () => rand(-0.45, Math.PI + 0.45); // ด้านข้างและบนเท่านั้น ไม่พาดผ่านตัวรถ
  const slSeed = Array.from({ length: SL }, () => ({ a: slAngle(), u: rand(0.62, 1.15), z: -rand(3, 34), len: rand(1.5, 4.5) }));
  const slGeo = keep(new THREE.BufferGeometry());
  slGeo.setAttribute("position", new THREE.BufferAttribute(slPos, 3));
  const slMat = keep(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: ADD, depthWrite: false, toneMapped: false }));
  const speedLines = new THREE.LineSegments(slGeo, slMat);
  speedLines.frustumCulled = false;
  camera.add(speedLines);
  if (!camera.parent) scene.add(camera);
  // ---- ป้าย "เต็ม!" ลอยเหนือรถ
  const maxCanvas = document.createElement("canvas");
  maxCanvas.width = 512;
  maxCanvas.height = 128;
  const maxTex = keep(new THREE.CanvasTexture(maxCanvas));
  maxTex.colorSpace = THREE.SRGBColorSpace;
  const maxSprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: maxTex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })));
  maxSprite.scale.set(6, 1.5, 1);
  maxSprite.visible = false;
  scene.add(maxSprite);
  let maxLife = 0;
  const maxQueue: { name: string; color: string }[] = [];
  function showMax(name: string, color: string) {
    const g = maxCanvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(8, 14, 496, 100, 18);
    g.fill();
    g.fillStyle = "#0a0f11";
    g.font = '700 46px "Noto Sans Thai", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`เต็ม! ${name}`, 256, 66);
    maxTex.needsUpdate = true;
    maxLife = 1.8;
    maxSprite.visible = true;
  }

  const acc: Record<string, number> = {};
  const emit = (key: string, rate: number, sdt: number, fn: () => void) => {
    acc[key] = (acc[key] ?? 0) + rate * sdt;
    let n = 0;
    while (acc[key] >= 1 && n < 40) {
      acc[key] -= 1;
      fn();
      n++;
    }
  };
  /** จุดในพิกัดรถ → โลก */
  const L2W = (grp: THREE_NS.Object3D, x: number, y: number, z: number, out = v) => out.set(x, y, z).applyMatrix4(grp.matrixWorld);
  const st = { prevV: 0, prevPit: false, prevSector: -1, xp: -1, clock: 0 };
  let bound: THREE_NS.Object3D | null = null;

  /** ผูกเอฟเฟกต์กับรถ (root ของรถเรา) · body = ตัวรถสำหรับทำเงาติดตา */
  function bind(root: THREE_NS.Object3D, body: THREE_NS.Object3D) {
    if (bound === root) return;
    bound = root;
    root.add(fxg);
    for (const g of ghosts) scene.remove(g);
    ghosts = ghostMats.map((m) => {
      const c = body.clone(true);
      c.traverse((o) => {
        if ((o as THREE_NS.Mesh).isMesh) {
          (o as THREE_NS.Mesh).material = m;
          o.castShadow = false;
        }
      });
      c.visible = false;
      scene.add(c);
      return c;
    });
    hist.length = 0;
    for (const t of trails) t.primed = false;
  }

  /** dt = เวลาจริง · sdt = เวลาในเกม (หยุด/สโลว์ตามเกม) */
  function update(dt: number, sdt: number, c: FxState) {
    const grp = bound;
    if (!grp) return;
    const has = (id: string) => c.maxed.has(id);
    grp.updateMatrixWorld();
    st.clock += sdt;
    const t = st.clock;
    fwd.set(0, 0, 1).transformDirection(grp.matrixWorld);
    const cvx = fwd.x * c.v;
    const cvz = fwd.z * c.v;
    const accel = sdt > 0 ? (c.v - st.prevV) / sdt : 0;
    if (sdt > 0) st.prevV = c.v;
    const braking = accel < -6;
    const throttle = accel > 0.8 || (c.boost && c.energy > 0);
    const cf = c.cf;
    const moving = c.v > 3 && !c.finished;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);

    tireGlow.visible = has("tgrip");
    if (tireGlow.visible) {
      tgMat.opacity = 0.55 + 0.35 * pulse + 0.1 * cf;
      tgSoft.opacity = 0.14 + 0.16 * cf + 0.08 * pulse;
    }
    brakes.visible = has("late");
    if (brakes.visible) brakeMat.opacity += ((braking && moving ? 0.95 : 0) - brakeMat.opacity) * Math.min(1, dt * (braking ? 14 : 3));
    const boosting = c.boost && c.energy > 0;
    const showO = moving && ((has("engine") && throttle) || (has("kick") && boosting));
    const showI = moving && ((has("turbo") && throttle && c.v < 45) || (has("kick") && boosting));
    flameO.visible = showO;
    flameI.visible = showI;
    if (showO) {
      const len = (has("kick") && boosting ? 1.5 : 0.55) * (0.8 + Math.random() * 0.4);
      flameO.scale.set(1, 1, len);
      (flameO.material as THREE_NS.MeshBasicMaterial).color.set(has("kick") && boosting ? "#ffd2a0" : "#ff8a2a");
    }
    if (showI) flameI.scale.set(1, 1, (has("kick") && boosting ? 1.9 : 0.7) * (0.8 + Math.random() * 0.4));
    under.visible = has("batt");
    if (under.visible) (under.material as THREE_NS.MeshBasicMaterial).opacity = 0.15 + 0.75 * c.energy;
    halo.visible = has("focus");
    if (halo.visible) {
      halo.rotation.z += dt * 1.5;
      halo.position.y = 1.0 + 0.03 * Math.sin(now / 400);
    }
    chev.visible = has("attack") && moving && c.ahead && cf < 0.25;
    if (chev.visible) {
      (chev.material as THREE_NS.MeshBasicMaterial).opacity = 0.5 + 0.5 * pulse;
      chev.position.z = 7.25 + ((now / 120) % 3);
    }
    shield.visible = has("defend") && moving && c.behind;
    if (shield.visible) (shield.material as THREE_NS.MeshBasicMaterial).opacity = (c.chase ? 0.12 : 0.3) + (c.chase ? 0.1 : 0.3) * pulse;
    // เงาติดตา
    if (has("weight") && moving && c.v > 35) {
      if (sdt > 0) hist.push({ t, p: grp.getWorldPosition(new THREE.Vector3()), q: grp.getWorldQuaternion(new THREE.Quaternion()) });
      while (hist.length && t - hist[0].t > 0.5) hist.shift();
      ghosts.forEach((m, i) => {
        const want = t - 0.06 * (i + 1);
        const h = hist.find((q) => q.t >= want);
        m.visible = !!h;
        if (h) {
          m.position.copy(h.p);
          m.quaternion.copy(h.q);
        }
      });
    } else for (const m of ghosts) m.visible = false;
    // สายลมปลายปีก
    const vortex = has("downforce");
    for (const tr of trails) tr.l.visible = vortex;
    if (vortex) {
      trailAcc += sdt;
      const I = moving ? Math.min(1, cf * 1.6) * (c.v > 25 ? 1 : 0) : 0;
      TIPS.forEach((tp, k) => {
        const tr = trails[k];
        const Pa = tr.g.attributes.position.array as Float32Array;
        const C = tr.g.attributes.color.array as Float32Array;
        L2W(grp, tp[0], tp[1], tp[2]);
        if (!tr.primed) {
          for (let q = 0; q < TN; q++) {
            Pa[q * 3] = v.x;
            Pa[q * 3 + 1] = v.y;
            Pa[q * 3 + 2] = v.z;
            tr.I[q] = 0;
          }
          tr.primed = true;
        }
        if (trailAcc >= 0.025) {
          Pa.copyWithin(3, 0, (TN - 1) * 3);
          tr.I.copyWithin(1, 0, TN - 1);
        }
        Pa[0] = v.x;
        Pa[1] = v.y;
        Pa[2] = v.z;
        tr.I[0] = I;
        for (let q = 0; q < TN; q++) {
          const a = tr.I[q] * (1 - q / TN) * 0.9;
          C[q * 3] = a * 0.85;
          C[q * 3 + 1] = a * 0.95;
          C[q * 3 + 2] = a;
        }
        tr.g.attributes.position.needsUpdate = true;
        tr.g.attributes.color.needsUpdate = true;
      });
      if (trailAcc >= 0.025) trailAcc = 0;
    }
    // เส้นความเร็วรอบกล้อง
    const lines = has("drag") && moving && c.chase;
    const target = lines ? Math.max(0, Math.min(1, (c.v - 38) / 30)) * 0.7 : 0;
    slMat.opacity += (target - slMat.opacity) * Math.min(1, dt * 5);
    speedLines.visible = slMat.opacity > 0.01;
    if (speedLines.visible) {
      const sp = c.v * 1.3 * Math.max(0, sdt);
      slSeed.forEach((q, i) => {
        q.z += sp;
        if (q.z > -2.5) {
          q.z = -rand(26, 36);
          q.a = slAngle();
          q.u = rand(0.62, 1.15);
        }
        const d = -q.z;
        const x = Math.cos(q.a) * q.u * d * 0.62 * camera.aspect * 0.85;
        const y = Math.sin(q.a) * q.u * d * 0.62;
        const j = i * 6;
        slPos[j] = x;
        slPos[j + 1] = y;
        slPos[j + 2] = q.z;
        slPos[j + 3] = (x * (d + q.len)) / d;
        slPos[j + 4] = (y * (d + q.len)) / d;
        slPos[j + 5] = q.z - q.len;
      });
      slGeo.attributes.position.needsUpdate = true;
    }

    // อนุภาค (เวลาในเกม จึงหยุดตามตอนสโลว์)
    if (sdt > 0 && moving) {
      if (has("tc") && throttle && cf > 0.12)
        emit("tc", 38, sdt, () => {
          const w = pickOf(REAR);
          L2W(grp, w.x, 0.08, w.z - 0.3);
          spawn(v.x, v.y, v.z, cvx * 0.25 + rand(-1.5, 1.5), rand(0.4, 1.6), cvz * 0.25 + rand(-1.5, 1.5), "#6dff9e", 0.55, rand(0.4, 0.8), -0.5, 2);
        });
      if (has("therm") && cf > 0.2 && c.v > 25)
        emit("therm", 26, sdt, () => {
          const w = pickOf(WHEELS);
          L2W(grp, w.x, w.R * 1.6, w.z);
          spawn(v.x, v.y, v.z, cvx * 0.6, rand(1, 2.5), cvz * 0.6, pickOf(["#ff9a3c", "#ff6a2a", "#ffcf6a"]), 0.22, rand(0.5, 1), -1.5, 1);
        });
      if (has("susp") && cf < 0.12 && c.v > 62)
        emit("susp", 45, sdt, () => {
          L2W(grp, ...P(rand(-1.2, 0.6), 0.04, rand(-0.4, 0.4)));
          spawn(v.x, v.y, v.z, cvx * 0.35 + rand(-2, 2), rand(1, 4), cvz * 0.35 + rand(-2, 2), pickOf(["#ffd36b", "#ffb03a", "#fff1b8"]), 0.16, rand(0.25, 0.5), 14, 0);
        });
      if (has("cool"))
        emit("cool", 18, sdt, () => {
          L2W(grp, ...P(0.7, 0.5, 0.62 * pickOf([1, -1])));
          spawn(v.x, v.y, v.z, cvx * 0.7 + rand(-0.3, 0.3), rand(0.2, 0.6), cvz * 0.7 + rand(-0.3, 0.3), "#bfe8ff", 0.7, rand(0.35, 0.6), -0.3, 3);
        });
      if (has("regen") && braking)
        emit("regen", 55, sdt, () => {
          const w = pickOf(WHEELS);
          L2W(grp, w.x, w.R, w.z);
          L2W(grp, ...P(-0.5, 0.6, 0), v2);
          spawn(v.x, v.y, v.z, cvx + (v2.x - v.x) * 3, (v2.y - v.y) * 3, cvz + (v2.z - v.z) * 3, "#62b8ff", 0.22, 0.3, 0, 0);
        });
      if (has("kick") && boosting)
        emit("kick", 60, sdt, () => {
          L2W(grp, ...P(-2.45, 0.44, 0));
          spawn(v.x, v.y, v.z, cvx * 0.4 + rand(-3, 3), rand(-1, 2), cvz * 0.4 + rand(-3, 3), pickOf(["#9fd8ff", "#ffffff", "#5aa8ff"]), 0.2, rand(0.15, 0.35), 0, 2);
        });
      if (has("tsave"))
        emit("tsave", 10, sdt, () => {
          const w = pickOf(WHEELS);
          L2W(grp, w.x + w.s * 0.2, w.R * rand(0.6, 1.8), w.z);
          spawn(v.x, v.y, v.z, cvx * 0.85, rand(0.3, 1), cvz * 0.85, "#7dffb0", 0.25, rand(0.5, 0.9), -0.4, 1);
        });
      if (has("turbo") && throttle && c.v < 45)
        emit("turbo", 20, sdt, () => {
          L2W(grp, ...P(-2.4, 0.44, rand(-0.05, 0.05)));
          spawn(v.x, v.y, v.z, cvx * 0.3 - fwd.x * 4, rand(0, 0.8), cvz * 0.3 - fwd.z * 4, "#7fd4ff", 0.3, rand(0.2, 0.4), -0.3, 3);
        });
      if (has("gdur") && c.gold)
        emit("gdur", 30, sdt, () => {
          L2W(grp, ...P(rand(-2.6, 2), rand(0.2, 1.1), rand(-0.9, 0.9)));
          spawn(v.x, v.y, v.z, cvx * 0.8, rand(0.2, 1), cvz * 0.8, pickOf(["#ffe27a", "#ffd23f", "#fff6c8"]), 0.22, rand(0.5, 0.9), -0.3, 1.5);
        });
    }
    // ละอองทองตอนได้ XP
    if (has("xpgain") && st.xp >= 0 && c.xp > st.xp && sdt > 0) {
      const n = Math.min(4, c.xp - st.xp);
      for (let q = 0; q < n; q++) {
        L2W(grp, ...P(rand(-2.5, 2.5), rand(1.2, 2.4), rand(-1.5, 1.5)));
        L2W(grp, ...P(-0.4, 0.6, 0), v2);
        spawn(v.x, v.y, v.z, cvx + (v2.x - v.x) * 2.2, (v2.y - v.y) * 2.2, cvz + (v2.z - v.z) * 2.2, "#ffd23f", 0.3, 0.45, 0, 0);
      }
    }
    st.xp = c.xp;
    const pos = grp.getWorldPosition(v2.clone());
    // คลื่นพลังทุกเซกเตอร์
    if (has("sector") && st.prevSector >= 0 && c.sector !== st.prevSector && !c.pit && moving) ring(pos, "#5a8dff", 16, 0.8);
    st.prevSector = c.sector;
    // พลุตอนออกจากพิท
    if (has("crew") && st.prevPit && !c.pit) {
      ring(pos, "#3fc6d6", 14, 0.9);
      for (let q = 0; q < 60; q++) {
        L2W(grp, 0, 0.8, 0);
        spawn(v.x, v.y, v.z, cvx * 0.5 + rand(-6, 6), rand(2, 8), cvz * 0.5 + rand(-6, 6), pickOf(["#3fc6d6", "#ffffff", "#ffd23f"]), 0.3, rand(0.6, 1.1), 9, 0.5);
      }
    }
    st.prevPit = c.pit;
    // อัปการ์ดครบ: คลื่น + ระเบิดประกาย + ป้ายเต็ม!
    while (maxQueue.length) {
      const m = maxQueue.shift()!;
      ring(pos, m.color, 12, 1);
      for (let q = 0; q < 70; q++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(3, 9);
        L2W(grp, 0, 0.7, 0.15);
        spawn(v.x, v.y, v.z, cvx + Math.cos(a) * sp, rand(1, 6), cvz + Math.sin(a) * sp, m.color, 0.35, rand(0.5, 1), 6, 1);
      }
      showMax(m.name, m.color);
    }
    if (maxLife > 0) {
      maxLife -= dt;
      L2W(grp, 0, 2.6 + (1.8 - maxLife) * 0.9, 0);
      maxSprite.position.copy(v);
      maxSprite.material.opacity = Math.min(1, maxLife * 1.5);
      if (maxLife <= 0) maxSprite.visible = false;
    }
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.5 + k * r.size);
      (r.m.material as THREE_NS.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.9;
      if (r.life <= 0) r.m.visible = false;
    }
    pMat.uniforms.uScale.value = renderer.domElement.height * 0.55;
    stepParticles(sdt);
  }

  return {
    bind,
    update,
    /** การ์ดใบนี้เพิ่งอัปครบ 3 ขั้น: ฉลองบนรถ */
    queueMax: (name: string, color: string) => maxQueue.push({ name, color }),
    dispose() {
      fxg.removeFromParent();
      for (const o of [points, speedLines, maxSprite, ...ghosts, ...trails.map((x) => x.l), ...rings.map((r) => r.m)]) o.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
