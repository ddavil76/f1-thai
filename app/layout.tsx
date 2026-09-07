import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 เวลาไทย",
  description: "ตารางแข่ง Formula 1 เวลาไทย พร้อมตารางคะแนน",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}