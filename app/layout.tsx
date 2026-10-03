import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Noto_Sans_Thai, Chakra_Petch } from "next/font/google";
import localFont from "next/font/local";
import BottomNav from "@/components/BottomNav";
import HeaderNav from "@/components/HeaderNav";
import PageTransition from "@/components/PageTransition";
import LaunchIntro from "@/components/LaunchIntro";
import TzToggle from "@/components/tz/TzToggle";
import { SITE_URL } from "@/lib/site";


const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  weight: ["400", "500", "700", "900"],
});

// ฟอนต์หัวข้อ/ตัวเลข — แนวเทคนิคแบบ F1 (มีทั้งไทยและละติน)
const chakra = Chakra_Petch({
  subsets: ["thai", "latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-display-src",
});

// ตัวเอียงหนาแบบโปสเตอร์ (ชุดเดียวกับการ์ด widget) — Archivo, OFL · ไม่ใช่ฟอนต์ของ F1
const poster = localFont({
  src: "../assets/fonts/Archivo-SemiCondensedBlackItalic.ttf",
  weight: "900",
  style: "italic",
  display: "swap",
  variable: "--font-poster-src",
});

const TITLE = "F1 Week Race";
const DESCRIPTION = "ตารางแข่ง F1 นับถอยหลัง และตารางคะแนน เวลาไทย (GMT+7)";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: TITLE,
  appleWebApp: { capable: true, title: TITLE, statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    locale: "th_TH",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
  // เปิดจากไอคอนหน้าจอโฮม iPhone (แถบสถานะโปร่ง) เนื้อหาเต็มจอ — หัว/เมนูล่างเว้นขอบ safe area เอง
  viewportFit: "cover",
};

// สีหลักของเว็บเป็นแดง F1 คงที่ (ตั้งใน globals.css) — สีทีมผู้ชนะไปอยู่เฉพาะส่วนที่เป็น
// เรื่องของการแข่งนั้น ๆ (การ์ดผลล่าสุด หัวหน้าสนาม แถบฤดูกาล) ไม่ใช่ทั้งเว็บ
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: สคริปต์ของ LaunchIntro ติด data-intro ที่ <html> ก่อน hydrate
    <html lang="th" className={`${notoThai.className} ${chakra.variable} ${poster.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <LaunchIntro />
        <div className="scroll-progress" aria-hidden="true" />
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center gap-3 py-3.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
            <Link href="/" className="poster text-xl leading-none">
              F1 <span className="text-(--color-f1)">WEEK RACE</span>
            </Link>
            <HeaderNav />
            <div className="ml-auto">
              <TzToggle />
            </div>
          </div>
        </header>

        <div className="mx-auto min-h-[60vh] max-w-5xl pb-28 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 md:pb-12">
          <PageTransition>{children}</PageTransition>
        </div>

        <BottomNav />
      </body>
    </html>
  );
}
