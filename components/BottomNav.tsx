"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { useSlidingPill } from "./useSlidingPill";

export default function BottomNav() {
  const pathname = usePathname();
  const { ref, style } = useSlidingPill<HTMLDivElement>(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 md:hidden">
      <div
        ref={ref}
        className="relative flex items-center gap-0.5 rounded-full border border-white/10 bg-neutral-950/80 p-1 shadow-2xl shadow-black/50 backdrop-blur-md"
      >
        {style && (
          <span
            className="absolute inset-y-1 rounded-full bg-(--color-f1) shadow-lg shadow-(--color-f1)/30 transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
            style={{ left: style.left, width: style.width }}
          />
        )}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-pill={item.href}
            className={`relative z-10 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium transition-colors ${
              pathname === item.href
                ? "text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
