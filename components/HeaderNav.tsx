"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { useSlidingPill } from "./useSlidingPill";

export default function HeaderNav() {
  const pathname = usePathname();
  const { ref, style } = useSlidingPill<HTMLElement>(pathname);

  return (
    <nav ref={ref} className="relative hidden items-center gap-1 md:flex">
      {style && (
        <span
          className="absolute inset-y-1 rounded-full bg-(--color-f1) transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
          style={{ left: style.left, width: style.width }}
        />
      )}
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-pill={item.href}
          className={`relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            pathname === item.href
              ? "text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
