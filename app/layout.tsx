import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Noto_Sans_Thai } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import HeaderNav from "@/components/HeaderNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import TzToggle from "@/components/tz/TzToggle";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  weight: ["400", "500", "700", "900"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.className}>
      <body className="antialiased">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-6 w-1.5 rounded-full bg-[--color-f1]" />
              <span className="text-lg font-black tracking-tight">
                F1 <span className="text-[--color-f1]">Week Race</span>
              </span>
            </Link>
            <HeaderNav />
            <div className="ml-auto">
              <TzToggle />
            </div>
          </div>
        </header>

        <div className="mx-auto min-h-[60vh] max-w-5xl px-4 pb-28 pt-6 md:pb-12">
          {children}
        </div>

        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
