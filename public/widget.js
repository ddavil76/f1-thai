// F1 Week Race — ตัวโหลด widget สำหรับแอป Scriptable (iOS)
//
// ก็อปไฟล์นี้ไปวางใน Scriptable ครั้งเดียวพอ ทุกครั้งที่ widget รีเฟรช มันจะดึงโค้ด
// widget ตัวล่าสุดจากเว็บมารันเอง — เว็บแก้อะไร widget ก็ได้ของใหม่โดยไม่ต้องก็อปซ้ำ
// ต่อเน็ตไม่ได้ก็ใช้โค้ดชุดล่าสุดที่เคยโหลดเก็บไว้ในเครื่อง

const SITE = "https://f1-thai.vercel.app"; // ← แก้เป็นโดเมนของคุณ

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "f1-widget-cache.js");

async function fetchCode() {
  const req = new Request(`${SITE}/scriptable-widget.js`);
  req.timeoutInterval = 10;
  const code = await req.loadString();
  // กันเอาหน้า error (HTML) มารันเป็นโค้ด
  if (req.response.statusCode !== 200 || !code.includes("Script.setWidget")) {
    throw new Error(`โหลดโค้ด widget ไม่ได้ (${req.response.statusCode})`);
  }
  fm.writeString(CACHE, code);
  return code;
}

const code = await fetchCode().catch(() =>
  fm.fileExists(CACHE) ? fm.readString(CACHE) : null,
);

if (code) {
  // โค้ด widget ใช้ await ระดับบนสุด เลยห่อด้วย async function ก่อนรัน
  await new Function(`return (async () => {\n${code}\n})()`)();
} else {
  // ครั้งแรกสุดแล้วต่อเน็ตไม่ได้ ยังไม่มีโค้ดสำรอง
  const w = new ListWidget();
  w.backgroundColor = new Color("#08080a");
  const t = w.addText("ต่อเน็ตไม่ได้ ลองใหม่อีกครั้ง");
  t.textColor = Color.white();
  t.font = Font.systemFont(13);
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentSmall();
  Script.complete();
}
