"use client";

import { usePathname } from "next/navigation";

/** รีเมานต์เนื้อหาตอนเปลี่ยน path → เล่นอนิเมชัน page-in */
export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
