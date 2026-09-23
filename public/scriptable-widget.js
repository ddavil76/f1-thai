// F1 Week Race — widget สำหรับแอป Scriptable บน iOS
//
// วิธีใช้
//   1. ติดตั้งแอป Scriptable (ฟรี) จาก App Store
//   2. เปิดแอป → ปุ่ม + มุมขวาบน → วางโค้ดนี้ทั้งหมด → ตั้งชื่อว่า "F1"
//   3. แก้ SITE ข้างล่างให้เป็นโดเมนของคุณ
//   4. กดค้างที่หน้าโฮม → ปุ่ม + → ค้นหา Scriptable → เลือกขนาด small หรือ medium
//      → แตะที่ widget → Script เลือก "F1"
//
// รองรับทั้งขนาด small และ medium · แตะแล้วเปิดเว็บ
// นับถอยหลังใช้ applyTimerStyle() ให้ iOS เดินเลขเอง เพราะระบบคุมรอบรีเฟรช
// ของ widget เอง (ราว 15 นาทีขึ้นไป) ถ้าวาดตัวเลขเองไว้เฉย ๆ มันจะค้าง

const SITE = "https://f1-thai.vercel.app"; // ← แก้เป็นโดเมนของคุณ

const BG = new Color("#08080a");
const RED = new Color("#e10600");
const DIM = new Color("#ffffff", 0.45);

// สีประจำทีม — ให้เลขนับถอยหลังเปลี่ยนสีตามทีมของผู้นำตารางคะแนน
const TEAM = {
  red_bull: "#1e3d9b", mclaren: "#ff8000", ferrari: "#e8002d",
  mercedes: "#00d7b6", williams: "#1868db", aston_martin: "#229971",
  alpine: "#00a1e8", haas: "#9c9fa2", rb: "#6692ff",
  audi: "#00e700", sauber: "#00e700", cadillac: "#b6a36d",
};

async function load() {
  const req = new Request(`${SITE}/api/widget`);
  req.timeoutInterval = 15;
  return await req.loadJSON();
}

function line(stack, text, { size = 12, color = Color.white(), bold = false } = {}) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

function build(data, medium) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.url = SITE;
  w.setPadding(14, 14, 14, 14);

  // ไม่มีสนามถัดไป — จบฤดูกาล ยังไม่ประกาศปฏิทิน หรือดึงข้อมูลไม่ได้
  if (!data || !data.race) {
    const msg =
      !data ? "ต่อเน็ตไม่ได้"
      : data.state === "season-over" ? "จบฤดูกาลแล้ว"
      : `ปฏิทิน ${data.season} ยังไม่ประกาศ`;
    line(w, "F1 WEEK RACE", { size: 10, color: RED, bold: true });
    w.addSpacer(6);
    line(w, msg, { size: 14, color: DIM });
    return w;
  }

  const { race, session, leader, state } = data;
  const accent = new Color(TEAM[leader?.constructorId] ?? "#e10600");

  // หัว: รอบ + ป้ายสถานะ
  const head = w.addStack();
  head.centerAlignContent();
  line(head, `ROUND ${race.round}`, { size: 10, color: RED, bold: true });
  if (race.isSprint) {
    head.addSpacer(5);
    line(head, "SPRINT", { size: 9, color: new Color("#ffd230"), bold: true });
  }
  if (state === "live") {
    head.addSpacer(5);
    line(head, "● LIVE", { size: 9, color: new Color("#4ade80"), bold: true });
  }

  w.addSpacer(3);
  line(w, race.name, { size: medium ? 17 : 14, bold: true });
  line(w, medium ? `${race.circuit} · ${race.locality}` : race.locality,
       { size: 10, color: DIM });

  w.addSpacer(medium ? 8 : 6);

  // นับถอยหลังไป session ถัดไป (ถ้าไม่มีก็ใช้เวลาออกสตาร์ท)
  const target = new Date(session ? session.startsAt : race.startsAt);
  line(w, state === "live"
        ? `${session ? session.label : "Race"} · กำลังแข่ง`
        : `${session ? session.label : "Race"} · เริ่มอีก`,
       { size: 10, color: DIM });

  const timer = w.addDate(target);
  timer.applyTimerStyle();
  timer.font = Font.boldSystemFont(medium ? 30 : 24);
  timer.textColor = accent;

  // แถวล่าง: ผู้นำตารางคะแนน (เฉพาะขนาด medium ที่มีที่พอ)
  if (medium && leader) {
    w.addSpacer(8);
    const foot = w.addStack();
    foot.centerAlignContent();
    line(foot, "ผู้นำ", { size: 10, color: DIM });
    foot.addSpacer(6);
    line(foot, leader.name, { size: 12, bold: true });
    foot.addSpacer();
    line(foot, `${leader.points} แต้ม`, { size: 12, color: accent, bold: true });
  }

  w.addSpacer();
  return w;
}

const data = await load().catch(() => null);
const widget = build(data, config.widgetFamily !== "small");

// รีเฟรชถี่ขึ้นตอนกำลังแข่ง (iOS ถือเป็นคำขอ ไม่ใช่คำสั่ง)
widget.refreshAfterDate = new Date(
  Date.now() + (data && data.state === "live" ? 5 : 30) * 60 * 1000,
);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium(); // กดรันในแอปเพื่อดูตัวอย่าง
Script.complete();
