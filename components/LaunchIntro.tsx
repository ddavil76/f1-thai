/**
 * intro ตอนเปิดแอป — ไฟสตาร์ท 5 ดวงติดทีละดวงแล้วดับพร้อมกัน (lights out) แล้วเผยหน้าเว็บ
 *
 * CSS ล้วน (ดู .launch-intro ใน globals.css) จึงเล่นได้ทันทีที่ HTML มาถึง ไม่ต้องรอ JS
 * เล่นแค่ครั้งแรกของ session — สคริปต์ด้านล่างรันก่อน overlay ถูก parse ถ้าเคยเห็นแล้วจะติด
 * data-intro="seen" ที่ <html> ให้ CSS ซ่อนไปเลย เปลี่ยนหน้าหรือรีเฟรชจึงไม่เล่นซ้ำ
 * แต่ปิดแอปแล้วเปิดใหม่ (session ใหม่) จะได้เห็นอีก · overlay ไม่รับการแตะ ไม่บังการใช้งาน
 */
const SEEN_SCRIPT = `try{var s=sessionStorage;if(s.getItem("f1-intro"))document.documentElement.dataset.intro="seen";else s.setItem("f1-intro","1")}catch(e){}`;

export default function LaunchIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
      <div className="launch-intro" aria-hidden="true">
        <div className="launch-lights">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ "--n": i } as React.CSSProperties} />
          ))}
        </div>
        <p className="launch-logo">
          F1 <span>Week Race</span>
        </p>
      </div>
    </>
  );
}
