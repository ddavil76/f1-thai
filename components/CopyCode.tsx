"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * ปุ่มก็อปโค้ดทีเดียว + กล่องโค้ดให้ดู
 * clipboard ใช้ไม่ได้ (เบราว์เซอร์เก่า / ไม่ใช่ https) → เลือกข้อความทั้งกล่องให้กดก็อปเอง
 */
export default function CopyCode({ code, label = "ก็อปโค้ด" }: { code: string; label?: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<"idle" | "done" | "manual">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      box.current?.focus();
      box.current?.select();
      setState("manual");
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-f1) px-4 py-3 text-base font-bold text-white transition hover:brightness-110 active:scale-[0.98] sm:w-auto"
      >
        {state === "done" ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        {state === "done" ? "ก็อปแล้ว" : label}
      </button>
      <p aria-live="polite" className="text-xs text-white/50">
        {state === "manual" && "ก็อปอัตโนมัติไม่ได้ — เลือกโค้ดในกล่องไว้ให้แล้ว กดค้างแล้วเลือก \"ก็อป\""}
      </p>
      <textarea
        ref={box}
        readOnly
        value={code}
        rows={6}
        spellCheck={false}
        aria-label="โค้ด widget"
        className="block w-full resize-y rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-white/60"
      />
    </div>
  );
}
