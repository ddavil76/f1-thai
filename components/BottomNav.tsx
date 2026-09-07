"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 md:hidden">
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-neutral-950/80 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-md">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                active
                  ? "bg-[--color-f1] text-white shadow-lg shadow-[--color-f1]/30"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
