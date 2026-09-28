/**
 * หน้าตา widget แบบคร่าว ๆ (HTML ล้วน) ให้เห็นก่อนติดตั้ง — ตัวอย่าง ไม่ใช่ข้อมูลจริง
 * สี/ตัวอักษรเลียนแบบ public/scriptable-widget.js
 */

const TRACK = "M10,40 L20,14 L46,8 L70,16 L90,10 L96,30 L78,44 L56,40 L40,50 Z";

function Shell({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`relative flex overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#1c0707,#08080a)] py-3.5 pr-3.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10 ${className}`}
    >
      {/* แถบสีทีมผู้ชนะสนามล่าสุด */}
      <span className="ml-0 mr-2.5 w-1 shrink-0 rounded-full bg-[#e8002d]" />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function Top({ round }: { round: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-black">
      <span className="text-(--color-f1)">{round}</span>
      <span className="ml-auto font-normal text-white/30">↻14:05</span>
    </div>
  );
}

function Session() {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="rounded bg-white px-1.5 font-black text-[#08080a]">Q</span>
        <span className="text-white/55">เริ่มอีก</span>
      </div>
      <div className="font-mono text-[26px] font-bold leading-tight tabular-nums">05:42:10</div>
      <div className="text-[11px] text-white/55">ส. 3 ต.ค. · 14:00</div>
    </>
  );
}

export default function WidgetPreview() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-4" aria-label="ตัวอย่างหน้าตา widget" role="img">
      <Shell className="h-[155px] w-[155px]">
        <Top round="R16" />
        <div className="mt-0.5 truncate text-[15px] font-black">🇲🇾 MALAYSIA</div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-white/55">
          🏆 <span className="h-2.5 w-[3px] rounded-full bg-[#e8002d]" /> HAM ชนะ 🇦🇿
        </div>
        <div className="flex-1" />
        <Session />
      </Shell>

      <Shell className="h-[155px] w-[329px] max-w-full">
        <div className="flex h-full min-w-0 gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <Top round="ROUND 16" />
            <div className="mt-0.5 truncate text-[17px] font-black">🇲🇾 MALAYSIA</div>
            <div className="flex-1" />
            <Session />
          </div>
          <div className="flex w-[100px] shrink-0 flex-col">
            <svg viewBox="0 0 104 58" className="h-[58px] w-full" aria-hidden>
              <path d={TRACK} fill="none" stroke="#e10600" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
            <div className="flex-1" />
            <div className="text-[9px] font-bold text-white/30">ตารางคะแนน</div>
            {[
              ["1", "#3671c6", "VER", "310"],
              ["2", "#ff8000", "NOR", "-30"],
              ["3", "#e8002d", "LEC", "-59"],
            ].map(([p, c, code, pts]) => (
              <div key={code} className="flex items-center gap-1.5 text-[10px]">
                <span className="font-mono text-white/30">{p}</span>
                <span className="h-2.5 w-[3px] rounded-full" style={{ background: c }} />
                <span className="font-bold">{code}</span>
                <span className="ml-auto font-mono text-white/55">{pts}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    </div>
  );
}
