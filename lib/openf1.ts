/* ---------- openf1.org — เรียกจากฝั่ง client เท่านั้น ---------- */
// openf1 บล็อก IP ของ serverless/Vercel แต่รองรับ CORS → ยิงจากเบราว์เซอร์ผู้ใช้
// (CSP connect-src อนุญาต api.openf1.org ไว้แล้วใน next.config.ts)

import { createGate, fetchRetry, sleep } from "./http";

const OF1 = "https://api.openf1.org/v1";

// openf1 (ไม่มี API key) จำกัด ~1 req ต่อ 1-2 วิ → ยิงทีละคำขอ เว้นระยะกว้าง ๆ
// ใช้คิวเดียวกันทั้งเว็บ (รีเพลย์ + เนินสนาม) ไม่ให้แย่งกันยิงจนโดนบล็อก
const ATTEMPTS = 5;
const gate = createGate(1);

export async function of1<T>(path: string): Promise<T> {
  // กอดคิวไว้ทั้งชุด (รวม backoff) — ยิงแทรกระหว่างที่ openf1 กำลังบ่นมีแต่ทำให้แย่ลง
  return gate(async () => {
    const res = await fetchRetry(`${OF1}/${path}`, {
      source: "openf1",
      init: { cache: "force-cache" },
      attempts: ATTEMPTS,
      backoffMs: (n) => Math.min(8000, 1200 * 2 ** (n - 1)),
    });
    const json = (await res.json()) as T;
    await sleep(750); // เว้นก่อนคำขอถัดไป
    return json;
  });
}
