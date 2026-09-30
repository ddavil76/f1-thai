// F1 Week Race — widget สำหรับแอป Scriptable บน iOS
//
// ปกติไม่ต้องก็อปไฟล์นี้ — ก็อป /widget.js (ตัวโหลด) ไปวางใน Scriptable แทน
// มันจะดึงไฟล์นี้ตัวล่าสุดจากเว็บมารันเองทุกครั้งที่ widget รีเฟรช
// (วางไฟล์นี้ตรง ๆ ก็ยังใช้ได้ แต่จะไม่อัปเดตตามเว็บ)
//
// รองรับ small · medium · large และบนหน้าจอล็อก (แถบ · วงกลม · บรรทัดเดียว)
// นับถอยหลังใช้ applyTimerStyle() ให้ iOS เดินเลขเอง เพราะระบบคุมรอบรีเฟรช
// ของ widget เอง (ราว 15 นาทีขึ้นไป) ถ้าวาดตัวเลขเองไว้เฉย ๆ มันจะค้าง

const SITE = "https://f1-thai.vercel.app"; // ← แก้เป็นโดเมนของคุณ

// ตั้งค่าผ่านช่อง Parameter ของ widget (กดค้างที่ widget → แก้ไขวิดเจ็ต) — พิมพ์ได้หลายคำ คั่นด้วยเว้นวรรค
// · race    = นับถอยหลังเฉพาะเรซ ข้ามซ้อมและควอลิฟาย
// · noalert = ไม่ต้องแจ้งเตือนก่อนแข่ง
// · dark / light = บังคับธีม (ปกติตามโหมดมืด/สว่างของเครื่อง)
// · classic = หน้าตาแบบเดิม (พื้นดำ ไม่โหลดรูปการ์ด)
const PARAM = String((typeof args !== "undefined" && args && args.widgetParameter) || "")
  .toLowerCase().split(/[\s,]+/).filter(Boolean);
const RACE_ONLY = PARAM.includes("race");
const NO_ALERT = PARAM.includes("noalert");
const CLASSIC = PARAM.includes("classic");

const RED = new Color("#e10600");
const WHITE = Color.white();
const DIM = new Color("#ffffff", 0.55);
const FAINT = new Color("#ffffff", 0.32);
const GREEN = new Color("#4ade80");
const YELLOW = new Color("#ffd230");

// สีประจำทีม — แถบขอบซ้าย (ทีมผู้ชนะล่าสุด) และจุดสีหน้าชื่อนักขับ
const TEAM = {
  red_bull: "#3671c6", mclaren: "#ff8000", ferrari: "#e8002d",
  mercedes: "#27f4d2", williams: "#1868db", aston_martin: "#229971",
  alpine: "#00a1e8", haas: "#b6babd", rb: "#6692ff",
  audi: "#bb0a30", sauber: "#01c00e", cadillac: "#b3995d",
};
const teamColor = (id) => new Color(TEAM[id] ?? "#888888");

// ป้าย session แบบ F1 — [พื้น, ตัวอักษร]
const BADGE = {
  RACE: ["#e10600", "#ffffff"],
  Q: ["#ffffff", "#08080a"],
  SQ: ["#ffd230", "#08080a"],
  SPRINT: ["#ffd230", "#08080a"],
};
const BADGE_PRACTICE = ["#3a3a44", "#ffffff"];

// วัน/เดือนแบบย่อภาษาไทย — จัดรูปเองแทน DateFormatter เพื่อไม่ขึ้นกับภาษาเครื่อง
// (ตั้งเครื่องเป็นอังกฤษก็ยังได้ภาษาไทย) · เวลาเป็นเขตเวลาของเครื่องผู้ใช้
const TH_DAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const hm = (d) => [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");

/** "พฤ. 24 ก.ย. · 15:30" */
function when(d) {
  return `${TH_DAY[d.getDay()]} ${d.getDate()} ${TH_MON[d.getMonth()]} · ${hm(d)}`;
}

/** "พฤ. 15:30" — ที่แคบ */
const whenShort = (d) => `${TH_DAY[d.getDay()]} ${hm(d)}`;

async function load() {
  const req = new Request(`${SITE}/api/widget`);
  req.timeoutInterval = 15;
  return await req.loadJSON();
}

/* ---------- สถานะ ณ ตอนวาด ---------- */

/**
 * เลือก session ตาม "เวลาเครื่องตอนวาด" ไม่เชื่อ state ในข้อมูลอย่างเดียว
 * ข้อมูลอาจเก่าได้ราวครึ่งชั่วโมง (iOS คุมรอบรีเฟรช + แคชฝั่งเว็บ) ถ้า session เริ่ม/จบ
 * ในช่วงนั้น widget จะนับถอยหลังไปเวลาที่ผ่านไปแล้ว — timer ของ iOS เลยนับขึ้นต่อ
 * มีตารางทั้งสุดสัปดาห์ (sessions) อยู่แล้ว จึงเลื่อนไป session ถัดไปเองได้
 * · state "live" = อยู่ระหว่างเวลาเริ่มถึงเวลาจบ · "done" = จบทั้งสุดสัปดาห์แล้ว (รอข้อมูลสนามถัดไป)
 */
function normalize(data) {
  if (!data || !data.race) return data;
  const now = Date.now();
  const all = data.sessions && data.sessions.length ? data.sessions : data.session ? [data.session] : [];
  // โหมด race: เป้าหมายเหลือแค่เรซ (ตารางทั้งสุดสัปดาห์ใน large ยังโชว์ครบ)
  const races = RACE_ONLY ? all.filter((x) => x.code === "RACE") : [];
  const list = races.length ? races : all;
  if (list.length === 0) return data;
  // ข้อมูลรุ่นเก่าไม่มี endsAt — ถือว่าจบตอนเริ่ม (ข้ามไปตัวถัดไปเลย ดีกว่านับขึ้น)
  const s = list.find((x) => Date.parse(x.endsAt || x.startsAt) > now);
  if (!s) {
    // จบทั้งสุดสัปดาห์ → ขึ้นสนามถัดไปเลย ไม่ค้างสนามเดิมรอข้อมูลใหม่
    // (โพเดียมของสนามที่เพิ่งจบยังไม่มีในข้อมูลชุดนี้ ปิดไว้ก่อน รอบรีเฟรชหน้าได้ผลจริงมาเอง)
    const a = data.after;
    if (a && a.race && a.sessions && a.sessions.length) {
      return normalize(Object.assign({}, data, {
        race: a.race, sessions: a.sessions, session: null, after: null, showPodium: false,
      }));
    }
    return Object.assign({}, data, { session: null, state: "done" });
  }
  return Object.assign({}, data, { session: s, state: Date.parse(s.startsAt) <= now ? "live" : "upcoming" });
}

/* ---------- ชิ้นส่วน ---------- */

// ตัวเลขกว้างเท่ากันทุกตัว ไม่กระตุกตอนเดิน — Scriptable รุ่นเก่าไม่มี ใช้ตัวหนาธรรมดาแทน
function monoFont(size) {
  return typeof Font.boldMonospacedSystemFont === "function"
    ? Font.boldMonospacedSystemFont(size)
    : Font.boldSystemFont(size);
}

function text(stack, s, { size = 12, color = WHITE, bold = false, heavy = false, mono = false } = {}) {
  const t = stack.addText(s);
  t.font = mono ? monoFont(size)
    : heavy ? Font.heavySystemFont(size)
    : bold ? Font.boldSystemFont(size)
    : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

function badge(stack, code, size = 10) {
  const [bg, fg] = BADGE[code] ?? BADGE_PRACTICE;
  const b = stack.addStack();
  b.backgroundColor = new Color(bg);
  b.cornerRadius = 4;
  b.setPadding(1, 5, 1, 5);
  text(b, code, { size, color: new Color(fg), heavy: true });
  return b;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * นับถอยหลัง — ไม่ถึงวันใช้ timer ของ iOS (เดินทุกวินาที) · เกินวันเป็น "4 วัน 07 ชม."
 * เพราะ timer ของ iOS นับชั่วโมงสะสม เหลือ 9 วันจะขึ้น 223:30:00 อ่านไม่ออก
 * (ข้อความวัน/ชม. ไม่เดินเอง แต่ widget รีเฟรชทุกราวครึ่งชั่วโมงก็พอ)
 */
function countdown(stack, iso, size) {
  const left = Date.parse(iso) - Date.now();
  if (left > DAY) {
    const r = stack.addStack();
    r.layoutHorizontally();
    r.bottomAlignContent();
    r.spacing = 3;
    const unit = Math.round(size * 0.45);
    text(r, String(Math.floor(left / DAY)), { size, mono: true });
    text(r, "วัน", { size: unit, color: DIM, bold: true });
    r.addSpacer(Math.round(size * 0.15));
    text(r, String(Math.floor(left / 3600000) % 24).padStart(2, "0"), { size, mono: true });
    text(r, "ชม.", { size: unit, color: DIM, bold: true });
    return r;
  }
  const t = stack.addDate(new Date(iso));
  t.applyTimerStyle();
  t.font = monoFont(size);
  t.textColor = WHITE;
  t.lineLimit = 1;
  return t;
}

function row(parent) {
  const r = parent.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  return r;
}

function col(parent) {
  const c = parent.addStack();
  c.layoutVertically();
  return c;
}

/** แถบสีทีมเล็ก ๆ หน้าชื่อนักขับ */
function teamTick(stack, id, h = 11) {
  const s = stack.addStack();
  s.size = new Size(3, h);
  s.cornerRadius = 1.5;
  s.backgroundColor = teamColor(id);
  return s;
}

/** "1 ▌VER  400" */
function driverLine(parent, pos, d, { size = 11, right } = {}) {
  const r = row(parent);
  r.spacing = 5;
  text(r, String(pos), { size, color: FAINT, mono: true });
  teamTick(r, d.constructorId, size);
  text(r, d.code, { size, bold: true });
  if (right != null) {
    r.addSpacer();
    text(r, right, { size, color: DIM, mono: true });
  }
  return r;
}

/** วาดผังสนามเป็นเส้นแดงด้วย DrawContext — ไม่ต้องโหลดรูป */
function trackImage(t, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const pad = 3;
  const k = Math.min((w - pad * 2) / t.w, (h - pad * 2) / t.h);
  const ox = (w - t.w * k) / 2;
  const oy = (h - t.h * k) / 2;
  const pts = [];
  for (let i = 0; i + 1 < t.pts.length; i += 2) {
    pts.push(new Point(ox + t.pts[i] * k, oy + t.pts[i + 1] * k));
  }
  const p = new Path();
  p.addLines(pts);
  p.closeSubpath();
  ctx.addPath(p);
  ctx.setStrokeColor(RED);
  ctx.setLineWidth(2.5);
  ctx.strokePath();
  return ctx.getImage();
}

function addTrack(stack, race, w, h) {
  if (!race.track) return;
  const img = stack.addImage(trackImage(race.track, w, h));
  img.imageSize = new Size(w, h);
}

/* ---------- พื้นหลัง + แถบสีผู้ชนะ ---------- */

function newWidget(data, family) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#1c0707"), new Color("#08080a")];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  w.url = data && data.race ? `${SITE}/race/${data.race.round}` : SITE;

  // แถบสีทีมผู้ชนะสนามล่าสุดชิดขอบซ้าย แล้ววางเนื้อหาข้าง ๆ
  const pad = family === "large" ? 16 : 13;
  w.setPadding(pad, 0, pad, pad);
  const root = w.addStack();
  root.layoutHorizontally();
  const stripe = root.addStack();
  stripe.size = new Size(4, 0);
  stripe.cornerRadius = 2;
  const winner = data && data.lastRace ? data.lastRace.podium[0].constructorId : null;
  stripe.backgroundColor = winner ? teamColor(winner) : RED;
  stripe.layoutVertically();
  stripe.addSpacer();
  root.addSpacer(pad - 4);
  const body = col(root);
  return { w, body };
}

/* ---------- หัว: รอบ ป้าย ชื่อสนาม ---------- */

// compact (small): แถวบนแคบ ย่อรอบเป็น R16 และไม่ซ้ำ LIVE (ตัวใหญ่ข้างล่างบอกอยู่แล้ว) ให้เวลาอัปเดตพอดีแถว
function header(body, data, { nameSize, showCircuit, compact = false }) {
  const { race, state } = data;
  const top = row(body);
  top.spacing = 5;
  text(top, compact ? `R${race.round}` : `ROUND ${race.round}`, { size: 10, color: RED, heavy: true });
  if (race.isSprint) text(top, "SPRINT", { size: 9, color: YELLOW, heavy: true });
  if (state === "live" && !compact) text(top, "● LIVE", { size: 9, color: GREEN, heavy: true });
  // เวลาที่เว็บสร้างข้อมูลชุดนี้ — widget ดูค้างเมื่อไหร่จะรู้ทันทีว่าข้อมูลเก่าหรือยังไม่รีเฟรช
  const at = data.generatedAt ? new Date(data.generatedAt) : null;
  if (at && !isNaN(at)) {
    top.addSpacer();
    text(top, `↻${hm(at)}`, { size: 8, color: FAINT });
  }

  body.addSpacer(2);
  const name = text(body, `${race.flag} ${race.short.toUpperCase()}`, { size: nameSize, heavy: true });
  name.minimumScaleFactor = 0.7;
  if (showCircuit) text(body, `${race.circuit} · ${race.locality}`, { size: 10, color: FAINT });
}

/* ---------- บล็อกนับถอยหลังไป session ถัดไป ---------- */

function sessionBlock(body, data, { timerSize, dateSize = 11 }) {
  const s = data.session;
  const target = s ? s.startsAt : data.race.startsAt;
  const code = s ? s.code : "RACE";
  const r = row(body);
  r.spacing = 6;
  badge(r, code);
  const label = data.state === "live" ? "กำลังแข่ง" : data.state === "done" ? "จบสุดสัปดาห์" : "เริ่มอีก";
  text(r, label, { size: 10, color: DIM });
  body.addSpacer(2);
  // เลยเวลาเริ่มแล้วห้ามใช้ timer — iOS จะนับขึ้นต่อจาก 0 เหมือนนับไม่หยุด
  if (data.state === "live") text(body, "● LIVE", { size: Math.round(timerSize * 0.8), color: GREEN, heavy: true });
  else if (data.state === "done") text(body, "🏁 จบแล้ว", { size: Math.round(timerSize * 0.7), heavy: true });
  else countdown(body, target, timerSize);
  const d = text(body, when(new Date(target)), { size: dateSize, color: DIM });
  d.minimumScaleFactor = 0.8;
}

/* ---------- โพเดียมสนามล่าสุด ---------- */

// หัวเล็ก ๆ ไม่มีชื่อสนามตัวใหญ่ — สนามที่แข่งจบแล้วต้องไม่ดูเป็นสนามหลักของ widget
function podiumBlock(body, last, { size = 12, title = true } = {}) {
  if (title) {
    text(body, `ผลล่าสุด ${last.flag}`, { size: 9, color: FAINT, bold: true });
    body.addSpacer(2);
  }
  last.podium.forEach((d, i) => {
    driverLine(body, i + 1, d, { size });
    if (i < 2) body.addSpacer(2);
  });
}

function standingsBlock(body, top3, { size = 11 } = {}) {
  text(body, "ตารางคะแนน", { size: 9, color: FAINT, bold: true });
  body.addSpacer(2);
  const leader = top3[0] ? top3[0].points : 0;
  top3.forEach((d, i) => {
    driverLine(body, i + 1, d, { size, right: i === 0 ? String(d.points) : `-${leader - d.points}` });
    if (i < top3.length - 1) body.addSpacer(1);
  });
}

/* ---------- ไม่มีสนามถัดไป / ต่อเน็ตไม่ได้ ---------- */

function message(data, family) {
  const { w, body } = newWidget(data, family);
  text(body, "F1 WEEK RACE", { size: 10, color: RED, heavy: true });
  body.addSpacer(6);
  const msg =
    !data ? "ต่อเน็ตไม่ได้"
    : data.state === "season-over" ? "จบฤดูกาลแล้ว"
    : `ปฏิทิน ${data.season} ยังไม่ประกาศ`;
  text(body, msg, { size: 14, color: DIM });
  if (data && data.showPodium && data.lastRace && family !== "small") {
    body.addSpacer(8);
    podiumBlock(body, data.lastRace);
  }
  body.addSpacer();
  return w;
}

/* ---------- small ---------- */

// สนามถัดไปเป็นหลักเสมอ — ที่แคบเกินจะใส่โพเดียม ผลสนามที่แล้วเหลือแค่ชื่อผู้ชนะ
function small(data) {
  const { w, body } = newWidget(data, "small");
  header(body, data, { nameSize: 15, showCircuit: false, compact: true });
  // หลังเรซไม่กี่วัน บอกผู้ชนะสนามที่แล้วบรรทัดเดียว (สีแถบซ้ายอย่างเดียวคนอาจไม่รู้ว่าหมายถึงอะไร)
  if (data.showPodium && data.lastRace) {
    const win = data.lastRace.podium[0];
    const r = row(body);
    r.spacing = 4;
    r.url = `${SITE}/race/${data.lastRace.round}`;
    text(r, "🏆", { size: 10 });
    teamTick(r, win.constructorId, 10);
    text(r, `${win.code} ชนะ ${data.lastRace.flag}`, { size: 10, color: DIM, bold: true });
  }
  body.addSpacer();
  sessionBlock(body, data, { timerSize: 26 });
  return w;
}

/* ---------- medium ---------- */

function medium(data) {
  const { w, body } = newWidget(data, "medium");
  const r = body.addStack();
  r.layoutHorizontally();
  const left = col(r);
  r.addSpacer();
  const right = col(r);

  // ซ้าย: สนามถัดไปเสมอ · ขวา: ผังสนาม + ตารางคะแนน (หลังเรซไม่กี่วันเป็นโพเดียมสนามที่เพิ่งจบแทน)
  header(left, data, { nameSize: 17, showCircuit: false });
  left.addSpacer();
  sessionBlock(left, data, { timerSize: 30 });

  addTrack(right, data.race, 104, 58);
  right.addSpacer();
  if (data.showPodium && data.lastRace) {
    const pd = col(right);
    pd.url = `${SITE}/race/${data.lastRace.round}`;
    pd.size = new Size(100, 0);
    podiumBlock(pd, data.lastRace, { size: 10 });
  } else if (data.top3 && data.top3.length) {
    const st = col(right);
    st.url = `${SITE}/standings`;
    st.size = new Size(100, 0);
    standingsBlock(st, data.top3, { size: 10 });
  }
  return w;
}

/* ---------- large ---------- */

function large(data) {
  const { w, body } = newWidget(data, "large");

  const top = body.addStack();
  top.layoutHorizontally();
  const head = col(top);
  head.url = `${SITE}/race/${data.race.round}`;
  header(head, data, { nameSize: 20, showCircuit: true });
  top.addSpacer();
  addTrack(top, data.race, 110, 62);

  body.addSpacer(8);
  sessionBlock(body, data, { timerSize: 34, dateSize: 12 });

  // ตารางทั้งสุดสัปดาห์ — จบแล้วติ๊ก ✓ ตัวถัดไปเป็นสีแดง
  body.addSpacer(8);
  const now = Date.now();
  const nextIso = data.session ? data.session.startsAt : null;
  for (const s of data.sessions || []) {
    const done = Date.parse(s.endsAt) <= now;
    const isNext = s.startsAt === nextIso;
    const r = row(body);
    r.spacing = 6;
    const code = text(r, s.code, { size: 11, heavy: true, color: isNext ? RED : done ? FAINT : WHITE });
    code.minimumScaleFactor = 0.8;
    r.addSpacer();
    text(r, when(new Date(s.startsAt)), { size: 11, color: done ? FAINT : isNext ? WHITE : DIM, mono: false });
    text(r, done ? "✓" : " ", { size: 11, color: GREEN });
    body.addSpacer(2);
  }

  body.addSpacer();
  const bottom = body.addStack();
  bottom.layoutHorizontally();
  if (data.top3 && data.top3.length) {
    const st = col(bottom);
    st.url = `${SITE}/standings`;
    standingsBlock(st, data.top3);
  }
  bottom.addSpacer();
  if (data.lastRace) {
    const pd = col(bottom);
    pd.url = `${SITE}/race/${data.lastRace.round}`;
    podiumBlock(pd, data.lastRace, { size: 11 });
  }
  return w;
}

/* ---------- หน้าจอล็อก (iOS ย้อมสีเอง ใช้แค่ตัวอักษร) ---------- */

function lockTarget(data) {
  const s = data && data.session;
  if (s) return { code: s.code, iso: s.startsAt };
  if (data && data.race) return { code: "RACE", iso: data.race.startsAt };
  return null;
}

function lockRect(data) {
  const w = new ListWidget();
  const t = lockTarget(data);
  if (!t) {
    text(w, "F1 WEEK RACE", { size: 12, heavy: true });
    text(w, data ? "ไม่มีสนามถัดไป" : "ต่อเน็ตไม่ได้", { size: 12 });
    return w;
  }
  text(w, `${data.race.flag} ${data.race.short.toUpperCase()}`, { size: 13, heavy: true });
  text(w, `${t.code} · ${when(new Date(t.iso))}`, { size: 11 });
  if (data.state === "live") text(w, "● กำลังแข่ง", { size: 13, bold: true });
  else if (data.state === "done") text(w, "🏁 จบแล้ว", { size: 13, bold: true });
  else countdown(w, t.iso, 16);
  return w;
}

function lockCircle(data) {
  const w = new ListWidget();
  const t = lockTarget(data);
  if (!t) {
    text(w, "F1", { size: 14, heavy: true }).centerAlignText();
    return w;
  }
  const c = text(w, t.code, { size: 12, heavy: true });
  c.centerAlignText();
  c.minimumScaleFactor = 0.6;
  const d = new Date(t.iso);
  if (data.state === "live" || data.state === "done") {
    text(w, data.state === "live" ? "LIVE" : "🏁", { size: 12, heavy: true }).centerAlignText();
    return w;
  }
  // เกิน 1 วันบอกวัน+เวลา ไม่งั้นนับถอยหลัง (วงกลมแคบ ตัวเลขยาวไม่พอดี)
  if (d.getTime() - Date.now() > DAY) {
    text(w, TH_DAY[d.getDay()], { size: 11 }).centerAlignText();
    text(w, hm(d), { size: 13, mono: true }).centerAlignText();
  } else {
    const cd = countdown(w, t.iso, 12);
    cd.centerAlignText();
    cd.minimumScaleFactor = 0.6;
  }
  return w;
}

function lockInline(data) {
  const w = new ListWidget();
  const t = lockTarget(data);
  text(w, t ? `${data.race.flag} ${t.code} · ${whenShort(new Date(t.iso))}` : "🏁 F1 Week Race");
  return w;
}

/* ---------- แจ้งเตือนก่อนแข่ง ---------- */

// แจ้งก่อนเริ่มกี่นาที และแจ้ง session ไหนบ้าง (ซ้อมไม่แจ้ง — ถี่เกินจะกลายเป็นรำคาญ)
const ALERT_MIN = 30;
const ALERT_CODES = ["Q", "SPRINT", "RACE"];
const ALERT_PREFIX = "f1wr-";

/**
 * ตั้งแจ้งเตือนในเครื่องล่วงหน้า (ไม่ต้องมีเซิร์ฟเวอร์ ไม่ต้องให้ widget ตื่นตรงเวลา)
 * ทุกรอบรีเฟรชลบของเดิมที่เราตั้งไว้แล้วตั้งใหม่ตามตารางล่าสุด — ตารางเลื่อน/เปลี่ยนโหมดก็ไม่ค้างของเก่า
 * ยังไม่เคยกดอนุญาตแจ้งเตือน (ต้องกดรันในแอปครั้งแรก) → iOS ไม่แสดงเอง ไม่พัง
 */
async function scheduleAlerts(data) {
  if (typeof Notification === "undefined") return;
  try {
    const pending = await Notification.allPending();
    const ours = pending.map((n) => n.identifier).filter((id) => id && id.startsWith(ALERT_PREFIX));
    if (ours.length) await Notification.removePending(ours);
    if (NO_ALERT || !data || !data.race) return;

    const weekends = [{ race: data.race, sessions: data.sessions || [] }];
    if (data.after && data.after.race) weekends.push({ race: data.after.race, sessions: data.after.sessions || [] });
    const codes = RACE_ONLY ? ["RACE"] : ALERT_CODES;
    const now = Date.now();
    for (const { race, sessions } of weekends) {
      for (const s of sessions) {
        const start = Date.parse(s.startsAt);
        const fire = start - ALERT_MIN * 60 * 1000;
        if (!codes.includes(s.code) || !(fire > now)) continue;
        const n = new Notification();
        n.identifier = `${ALERT_PREFIX}${race.round}-${s.code}`;
        n.threadIdentifier = "f1-week-race";
        n.title = `${race.flag} ${race.short.toUpperCase()} · ${s.code}`;
        n.body = `เริ่มอีก ${ALERT_MIN} นาที (${hm(new Date(start))})`;
        n.openURL = `${SITE}/race/${race.round}`;
        n.setTriggerDate(new Date(fire));
        await n.schedule();
      }
    }
  } catch {
    // แจ้งเตือนเป็นของเสริม — พังก็ยังต้องวาด widget ได้
  }
}


/* ---------- ธีมการ์ด: รูปพื้นหลังจากเว็บ + กล่องนับถอยหลังวาดเอง ---------- */
// เว็บวาดชื่อสนาม ผังสนาม สถิติ ตาราง ด้วยฟอนต์ที่ออกแบบไว้ (/api/widget/card) โดยเว้นมุมซ้ายล่างไว้
// widget วางกล่องนับถอยหลัง + ไฟสตาร์ททับตรงนั้นเอง ตัวเลขจึงเดินได้ตรงเวลา
// โหลดรูปไม่ได้ → กลับไปใช้หน้าตาแบบเดิม (build) ไม่ให้ widget ว่าง

/** ขนาด widget (point) ตามรุ่นเครื่อง — รูปการ์ดสั่งทำสัดส่วนนี้พอดี ไม่ถูกครอป */
const WIDGET_SIZES = {
  "430x932": [170, 364, 382], "428x926": [170, 364, 382], "414x896": [169, 360, 379],
  "414x736": [159, 348, 357], "393x852": [158, 338, 354], "390x844": [158, 338, 354],
  "375x812": [155, 329, 345], "360x780": [155, 329, 345], "375x667": [148, 321, 324],
  "320x568": [141, 292, 311],
};

function widgetSize(family) {
  const sc = Device.screenSize();
  const sw = Math.round(Math.min(sc.width, sc.height));
  const sh = Math.round(Math.max(sc.width, sc.height));
  // รุ่นที่ไม่มีในตาราง: ประมาณจากความกว้างจอ (สัดส่วนใกล้เคียงรุ่นที่รู้จัก)
  const [small, wide, tall] = WIDGET_SIZES[`${sw}x${sh}`] ||
    [Math.round(sw * 0.395), Math.round(sw * 0.847), Math.round(sw * 0.888)];
  if (family === "small") return [small, small];
  if (family === "large") return [wide, tall];
  return [wide, small];
}

const DARK = PARAM.includes("dark") ? true : PARAM.includes("light") ? false
  : typeof Device !== "undefined" && Device.isUsingDarkAppearance();

// ชื่อ session ภาษาไทยในกล่องนับถอยหลัง
const TH_SESSION = { FP1: "ซ้อม 1", FP2: "ซ้อม 2", FP3: "ซ้อม 3", SQ: "สปรินต์ควอลิฟาย", SPRINT: "สปรินต์", Q: "ควอลิฟาย", RACE: "เรซ" };

// รุ่นหน้าตาการ์ด — เพิ่มเมื่อแก้วิธีวาดที่เว็บ รูปที่แคชไว้ในเครื่อง (ตาม URL) จะได้โหลดใหม่
const CARD_V = 2;

function cardUrl(data, family) {
  const [w, h] = widgetSize(family);
  const s = data.session;
  const q = [
    `round=${encodeURIComponent(data.race.round)}`, `size=${family}`, `w=${w}`, `h=${h}`,
    `s=${Math.min(3, Device.screenScale())}`, `theme=${DARK ? "dark" : "light"}`,
    `tz=${-new Date().getTimezoneOffset()}`, `v=${CARD_V}`,
  ];
  if (s) q.push(`next=${encodeURIComponent(s.code)}`);
  if (data.state === "live") q.push("live=1");
  return `${SITE}/api/widget/card?${q.join("&")}`;
}

/** โหลดรูปการ์ด — เก็บในเครื่อง รูปเดิม (URL เดิม) ไม่ต้องโหลดซ้ำทุกรอบรีเฟรช */
async function loadCard(url) {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.cacheDirectory(), "f1wr-cards");
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  let hash = 5381;
  for (let i = 0; i < url.length; i++) hash = ((hash * 33) ^ url.charCodeAt(i)) >>> 0;
  const file = fm.joinPath(dir, `${hash.toString(16)}.png`);
  if (fm.fileExists(file)) {
    const img = fm.readImage(file);
    if (img) return img;
  }
  const req = new Request(url);
  req.timeoutInterval = 15;
  const img = await req.loadImage();
  if (req.response && req.response.statusCode && req.response.statusCode !== 200) throw new Error("card " + req.response.statusCode);
  fm.writeImage(file, img);
  // เก็บไว้ไม่เกิน 12 รูปล่าสุด
  const files = fm.listContents(dir).map((n) => fm.joinPath(dir, n));
  if (files.length > 12) {
    files.sort((a, b) => fm.modificationDate(a) - fm.modificationDate(b))
      .slice(0, files.length - 12).forEach((f) => fm.remove(f));
  }
  return img;
}

const PILL_BG = () => new Color(DARK ? "#1d1d24" : "#1b1b22");
const PILL_TEXT = new Color("#f3f1ec");
const PILL_RED = new Color("#ff3b2f");

/** ไฟสตาร์ทติดเพิ่มเมื่อใกล้เวลา: เหลือ ≥5 วัน = 0 … ไม่ถึงวัน = 5 · เริ่มแล้ว = ดับหมด (ตรงกับ lib/widget-card.ts) */
function lightsLit(msLeft) {
  if (!(msLeft > 0)) return 0;
  return Math.max(0, Math.min(5, 5 - Math.floor(msLeft / DAY)));
}

function pill(parent, data, family) {
  const s = data.session;
  const target = s ? s.startsAt : data.race.startsAt;
  const code = s ? s.code : "RACE";
  const left = Date.parse(target) - Date.now();
  const p = parent.addStack();
  p.layoutVertically();
  p.backgroundColor = PILL_BG();
  p.cornerRadius = 12;
  p.setPadding(5, 10, 6, 10);

  const head = p.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const name = family === "small" ? code : (TH_SESSION[code] || code);
  const label =
    data.state === "live" ? `${name} · กำลังแข่ง`
    : data.state === "done" ? "จบสุดสัปดาห์"
    : family === "medium" ? `${name} · ${whenShort(new Date(target))}`
    : `${name} เริ่มใน`;
  const l = text(head, label, { size: 9.5, color: new Color("#f3f1ec", 0.72), bold: true });
  l.minimumScaleFactor = 0.8;
  head.addSpacer(8);
  const lit = data.state === "upcoming" ? lightsLit(left) : 0;
  for (let i = 0; i < 5; i++) {
    const dot = head.addStack();
    dot.size = new Size(7, 7);
    dot.cornerRadius = 3.5;
    dot.backgroundColor = i < lit ? new Color("#ff2a1a") : new Color("#3a0d0b");
    if (i < 4) head.addSpacer(3);
  }

  p.addSpacer(2);
  const size = family === "large" ? 28 : family === "medium" ? 25 : 24;
  if (data.state === "live") {
    text(p, "● LIVE", { size: Math.round(size * 0.8), color: PILL_RED, heavy: true });
  } else if (data.state === "done") {
    text(p, "🏁 จบแล้ว", { size: Math.round(size * 0.7), color: PILL_TEXT, heavy: true });
  } else if (left > DAY) {
    const r = p.addStack();
    r.layoutHorizontally();
    r.bottomAlignContent();
    r.spacing = 3;
    text(r, String(Math.floor(left / DAY)), { size, color: PILL_RED, mono: true });
    text(r, "วัน", { size: 10.5, color: PILL_TEXT, bold: true });
    r.addSpacer(3);
    text(r, String(Math.floor(left / HOUR) % 24).padStart(2, "0"), { size, color: PILL_RED, mono: true });
    text(r, "ชม.", { size: 10.5, color: PILL_TEXT, bold: true });
  } else {
    const t = p.addDate(new Date(target));
    t.applyTimerStyle();
    t.font = monoFont(size);
    t.textColor = PILL_RED;
    t.lineLimit = 1;
  }
  return p;
}

function cardWidget(data, family, img) {
  const w = new ListWidget();
  w.backgroundImage = img;
  w.url = `${SITE}/race/${data.race.round}`;
  const pad = family === "large" ? 14 : 12;
  w.setPadding(8, family === "large" ? 16 : 15, pad, 10);

  // เวลาที่เว็บสร้างข้อมูล (มุมขวาบน ตัวเล็ก) — widget ดูค้างจะรู้ว่าข้อมูลเก่า
  const top = w.addStack();
  top.layoutHorizontally();
  top.addSpacer();
  const at = data.generatedAt ? new Date(data.generatedAt) : null;
  if (at && !isNaN(at)) text(top, `↻${hm(at)}`, { size: 7, color: DARK ? new Color("#ffffff", 0.35) : new Color("#1b1b22", 0.35) });

  w.addSpacer();
  const row = w.addStack();
  row.layoutHorizontally();
  pill(row, data, family);
  row.addSpacer();
  return w;
}

/* ---------- ประกอบ ---------- */

function build(data, family) {
  if (family === "accessoryRectangular") return lockRect(data);
  if (family === "accessoryCircular") return lockCircle(data);
  if (family === "accessoryInline") return lockInline(data);
  if (!data || !data.race) return message(data, family);
  if (family === "small") return small(data);
  if (family === "large") return large(data);
  return medium(data);
}

/** ขอรีเฟรชตรงจังหวะที่ widget ต้องเปลี่ยนหน้าตา (iOS ถือเป็นคำขอ ไม่ใช่คำสั่ง) */
function nextRefresh(data) {
  const now = Date.now();
  // live = ป้าย/ตารางเปลี่ยนบ่อย · done = รอข้อมูลสนามถัดไปจากเว็บ → ถามถี่หน่อย
  const busy = data && (data.state === "live" || data.state === "done");
  const soon = now + (busy ? 5 : 30) * 60 * 1000;
  const s = data && data.session;
  const start = s ? Date.parse(s.startsAt) : NaN;
  const end = s && s.endsAt ? Date.parse(s.endsAt) : NaN;
  // จังหวะที่หน้าตาต้องเปลี่ยน: session เริ่ม (ขึ้น LIVE), จบ (ไปตัวถัดไป), เหลือ 1 วัน (เปลี่ยนเป็น timer)
  const turns = [start + 5 * 1000, end + 5 * 1000, start - DAY];
  // เกินวันขึ้นเป็น "N วัน HH ชม." ที่ไม่เดินเอง — รีเฟรชตอนเลขชั่วโมงเปลี่ยน ไม่งั้นช้าไปได้เกือบชั่วโมง
  const left = start - now;
  if (left > DAY) turns.push(start - Math.floor((left - 1) / HOUR) * HOUR + 1000);
  const next = turns.filter((t) => t > now && t < soon);
  return new Date(next.length ? Math.min(...next) : soon);
}

const raw = await load().catch(() => null);
const data = normalize(raw);
// ต่อเน็ตไม่ได้ (raw = null) ไม่แตะแจ้งเตือนเดิม — ของที่ตั้งไว้รอบก่อนยังถูกอยู่
if (raw) await scheduleAlerts(data);
const family = config.widgetFamily || "medium";
let widget = null;
if (!CLASSIC && data && data.race && ["small", "medium", "large"].includes(family)) {
  // ทุกขั้น (คำนวณขนาด/โหลด/อ่านไฟล์) พังได้ → ตกไปใช้หน้าตาแบบเดิม
  const img = await Promise.resolve().then(() => loadCard(cardUrl(data, family))).catch(() => null);
  if (img) widget = cardWidget(data, family, img);
}
if (!widget) widget = build(data, family);
widget.refreshAfterDate = nextRefresh(data);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium(); // กดรันในแอปเพื่อดูตัวอย่าง
Script.complete();
