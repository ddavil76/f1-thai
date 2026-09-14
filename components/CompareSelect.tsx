"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

/** เลือกนักขับสองฝั่ง — เปลี่ยนแล้วอัปเดต ?a=&b= ให้หน้า render ใหม่ (แชร์ลิงก์ต่อได้) */
export default function CompareSelect({
  drivers,
  a,
  b,
}: {
  drivers: Option[];
  a: string;
  b: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (nextA: string, nextB: string) =>
    startTransition(() =>
      router.replace(
        `/compare?a=${encodeURIComponent(nextA)}&b=${encodeURIComponent(nextB)}`,
        { scroll: false },
      ),
    );

  // key = ค่าปัจจุบัน → หน้าส่งค่าใหม่มาเมื่อไหร่ select รีเซ็ตตาม (เลือกซ้ำฝั่งตรงข้ามจะสลับกัน)
  const select = (value: string, label: string, onPick: (id: string) => void) => (
    <select
      key={value}
      defaultValue={value}
      aria-label={label}
      onChange={(e) => onPick(e.target.value)}
      className="w-full min-w-0 appearance-none truncate rounded-full bg-white/5 px-4 py-2.5 text-center text-sm font-semibold ring-1 ring-inset ring-white/10 transition [color-scheme:dark] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-f1)"
    >
      {drivers.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );

  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      {select(a, "นักขับคนที่ 1", (id) => go(id, id === b ? a : b))}
      <span className="text-xs font-black text-white/40">VS</span>
      {select(b, "นักขับคนที่ 2", (id) => go(id === a ? b : a, id))}
    </div>
  );
}
