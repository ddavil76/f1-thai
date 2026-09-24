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

const DAY = 24 * 60 * 60 * 1000;

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

function header(body, data, { nameSize, showCircuit }) {
  const { race, state } = data;
  const top = row(body);
  top.spacing = 5;
  text(top, `ROUND ${race.round}`, { size: 10, color: RED, heavy: true });
  if (race.isSprint) text(top, "SPRINT", { size: 9, color: YELLOW, heavy: true });
  if (state === "live") text(top, "● LIVE", { size: 9, color: GREEN, heavy: true });

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
  text(r, data.state === "live" ? "กำลังแข่ง" : "เริ่มอีก", { size: 10, color: DIM });
  body.addSpacer(2);
  countdown(body, target, timerSize);
  const d = text(body, when(new Date(target)), { size: dateSize, color: DIM });
  d.minimumScaleFactor = 0.8;
}

/* ---------- โพเดียมสนามล่าสุด ---------- */

function podiumBlock(body, last, { size = 12, title = true } = {}) {
  if (title) {
    text(body, `🏁 R${last.round} · ${last.flag} ${last.short.toUpperCase()}`, { size: 10, color: DIM, bold: true });
    body.addSpacer(3);
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

function small(data) {
  const { w, body } = newWidget(data, "small");
  if (data.showPodium && data.lastRace) {
    podiumBlock(body, data.lastRace, { size: 13 });
    body.addSpacer();
    const s = data.session;
    const next = text(body, `ถัดไป ${data.race.flag} ${s ? s.code : "RACE"} ${whenShort(new Date(s ? s.startsAt : data.race.startsAt))}`, { size: 10, color: DIM });
    next.minimumScaleFactor = 0.8;
    return w;
  }
  header(body, data, { nameSize: 15, showCircuit: false });
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

  if (data.showPodium && data.lastRace) {
    // ซ้าย: โพเดียมสนามที่เพิ่งจบ · ขวา: สนามถัดไป
    left.url = `${SITE}/race/${data.lastRace.round}`;
    podiumBlock(left, data.lastRace, { size: 14 });
    right.url = `${SITE}/race/${data.race.round}`;
    text(right, "ถัดไป", { size: 9, color: FAINT, bold: true });
    text(right, `${data.race.flag} ${data.race.short.toUpperCase()}`, { size: 13, heavy: true }).minimumScaleFactor = 0.7;
    right.addSpacer(4);
    sessionBlock(right, data, { timerSize: 18, dateSize: 10 });
    return w;
  }

  header(left, data, { nameSize: 17, showCircuit: false });
  left.addSpacer();
  sessionBlock(left, data, { timerSize: 30 });

  addTrack(right, data.race, 104, 58);
  right.addSpacer();
  if (data.top3 && data.top3.length) {
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
  if (data && data.state === "live") return new Date(now + 5 * 60 * 1000);
  const soon = now + 30 * 60 * 1000;
  const start = data && data.session ? Date.parse(data.session.startsAt) : NaN;
  // จังหวะที่หน้าตาต้องเปลี่ยน: session เริ่ม (ขึ้น LIVE) และเหลือ 1 วัน (เปลี่ยนเป็น timer)
  const turns = [start + 30 * 1000, start - DAY].filter((t) => t > now && t < soon);
  return new Date(turns.length ? Math.min(...turns) : soon);
}

const data = await load().catch(() => null);
const family = config.widgetFamily || "medium";
const widget = build(data, family);
widget.refreshAfterDate = nextRefresh(data);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium(); // กดรันในแอปเพื่อดูตัวอย่าง
Script.complete();
