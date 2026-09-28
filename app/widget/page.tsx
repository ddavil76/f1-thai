import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { AppWindow, BellRing, ClipboardPaste, Download, LockKeyhole, Play, SlidersHorizontal } from "lucide-react";
import CopyCode from "@/components/CopyCode";
import WidgetPreview from "@/components/WidgetPreview";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Widget บน iPhone",
  description: "ติดตั้ง widget นับถอยหลัง F1 บนหน้าจอโฮมและหน้าจอล็อก iPhone ผ่านแอป Scriptable (ฟรี)",
};

const SCRIPTABLE_URL = "https://apps.apple.com/app/scriptable/id1405459188";

// ตัวโหลดที่ผู้ใช้ก็อปไปวางครั้งเดียว — อ่านตอน build หน้านี้จึงเป็น static
const LOADER = readFileSync(path.join(process.cwd(), "public", "widget.js"), "utf8");

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="card flex gap-4 p-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-f1) font-display text-lg font-bold">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Icon className="h-4 w-4 shrink-0 text-white/40" />
          {title}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-white/65">{children}</div>
      </div>
    </li>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-semibold text-white/90">{children}</span>
);

const OPTIONS: [string, string][] = [
  ["race", "นับถอยหลังเฉพาะเรซ ข้ามซ้อมและควอลิฟาย (แจ้งเตือนเฉพาะเรซด้วย)"],
  ["noalert", "ไม่ต้องแจ้งเตือนก่อนแข่ง"],
  ["race noalert", "ใช้ทั้งสองอย่าง"],
];

const FAQ: [string, React.ReactNode][] = [
  [
    "เว็บอัปเดต widget ต้องก็อปโค้ดใหม่ไหม",
    "ไม่ต้อง — โค้ดที่วางเป็นตัวโหลด มันดึงหน้าตา widget ตัวล่าสุดจากเว็บเองทุกครั้งที่รีเฟรช",
  ],
  [
    "widget ดูค้าง ไม่เปลี่ยน",
    <>
      ดูเวลาหลัง <Key>↻</Key> มุมขวาบน นั่นคือเวลาของข้อมูล — iPhone เป็นคนเลือกว่าจะรีเฟรช widget เมื่อไหร่
      (ปกติราว 15–30 นาที) ถ้ารีบให้เปิดแอป Scriptable แล้วกดรันสคริปต์หนึ่งครั้ง
    </>,
  ],
  [
    "แจ้งเตือนไม่เด้ง",
    <>
      ต้องกดรันสคริปต์ในแอปครั้งแรกแล้วกด <Key>อนุญาต</Key> ถ้าเคยกดไม่อนุญาต ไปที่ การตั้งค่า → Scriptable →
      การแจ้งเตือน แล้วเปิด
    </>,
  ],
  [
    "กินแบตหรือเน็ตไหม",
    "น้อยมาก — ข้อมูลแต่ละครั้งราว 2–3 KB ตัวนับถอยหลังเดินเองโดย iOS ไม่ต้องรีเฟรชทุกวินาที",
  ],
  ["ใช้กับ Android ได้ไหม", "ยังไม่ได้ — Scriptable มีเฉพาะ iPhone / iPad"],
];

export default function WidgetPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          Widget บน <span className="text-(--color-f1)">iPhone</span>
        </h1>
        <p className="text-sm text-white/50">
          นับถอยหลังซ้อม ควอลิฟาย และเรซ เวลาไทย บนหน้าจอโฮมและหน้าจอล็อก พร้อมแจ้งเตือนก่อนแข่ง 30 นาที
        </p>
      </header>

      <section className="space-y-2">
        <WidgetPreview />
        <p className="text-center text-xs text-white/35">ตัวอย่างหน้าตา — มีขนาดเล็ก กลาง ใหญ่ และบนหน้าจอล็อก</p>
      </section>

      <ol className="space-y-4">
        <Step n={1} icon={Download} title="ติดตั้งแอป Scriptable (ฟรี)">
          <p>
            <a
              href={SCRIPTABLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline decoration-(--color-f1) underline-offset-4"
            >
              เปิด Scriptable ใน App Store
            </a>{" "}
            — แอปสำหรับรันสคริปต์ widget ไม่ต้องสมัครสมาชิก
          </p>
        </Step>

        <Step n={2} icon={ClipboardPaste} title="ก็อปโค้ด">
          <CopyCode code={LOADER} />
        </Step>

        <Step n={3} icon={Play} title="วางโค้ดใน Scriptable แล้วรันหนึ่งครั้ง">
          <p>
            เปิด Scriptable กด <Key>+</Key> มุมขวาบน → วางโค้ด → แตะชื่อด้านบนเปลี่ยนเป็น <Key>F1</Key> → กด <Key>▶</Key>{" "}
            ขวาล่าง
          </p>
          <p>จะเห็นตัวอย่าง widget และมีถามเรื่องแจ้งเตือน กด <Key>อนุญาต</Key> ถ้าอยากให้เตือนก่อนแข่ง</p>
        </Step>

        <Step n={4} icon={AppWindow} title="เพิ่ม widget บนหน้าจอโฮม">
          <p>
            กดค้างที่ที่ว่างบนหน้าจอโฮม → <Key>แก้ไข</Key> หรือ <Key>+</Key> มุมซ้ายบน → ค้นหา <Key>Scriptable</Key> →
            เลือกขนาด → <Key>เพิ่มวิดเจ็ต</Key>
          </p>
          <p>
            กดค้างที่ widget ที่เพิ่งเพิ่ม → <Key>แก้ไขวิดเจ็ต</Key> → ช่อง Script เลือก <Key>F1</Key> เสร็จแล้ว
          </p>
        </Step>
      </ol>

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <LockKeyhole className="h-4 w-4 text-white/40" />
          หน้าจอล็อก
        </h2>
        <p className="text-sm leading-relaxed text-white/65">
          กดค้างที่หน้าจอล็อก → <Key>ปรับแต่ง</Key> → <Key>หน้าจอล็อก</Key> → แตะช่องใต้นาฬิกา → เลือก Scriptable →
          แตะ widget แล้วเลือก Script <Key>F1</Key> — มีแบบแถบ วงกลม และบรรทัดเดียวเหนือนาฬิกา
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <SlidersHorizontal className="h-4 w-4 text-white/40" />
          ตั้งค่าเพิ่ม (ไม่บังคับ)
        </h2>
        <p className="text-sm leading-relaxed text-white/65">
          กดค้างที่ widget → <Key>แก้ไขวิดเจ็ต</Key> → ช่อง <Key>Parameter</Key> พิมพ์คำตามนี้
        </p>
        <dl className="divide-y divide-white/10 text-sm">
          {OPTIONS.map(([k, v]) => (
            <div key={k} className="flex gap-3 py-2">
              <dt className="w-28 shrink-0 font-mono font-semibold text-white">{k}</dt>
              <dd className="text-white/60">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="flex items-start gap-2 text-xs text-white/45">
          <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ค่าเริ่มต้นแจ้งเตือน 30 นาทีก่อนควอลิฟาย สปรินต์ และเรซ (ซ้อมไม่แจ้ง) แตะแจ้งเตือนแล้วเปิดหน้าสนามนั้น
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">คำถามที่พบบ่อย</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="card group p-4">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">
              <span className="mr-2 inline-block text-(--color-f1) transition group-open:rotate-90">›</span>
              {q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{a}</p>
          </details>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
