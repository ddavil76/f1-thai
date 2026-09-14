/* ---------- ยิง HTTP ไปต้นทางที่ rate-limit และล่มบ่อย ---------- */
// ต้นทางทั้งหมดของเว็บนี้ (Jolpica, openf1, FIA) ไม่รับประกันอะไรเลย ทุกเจ้ามี
// rate limit และตอบ 5xx เป็นพัก ๆ ตรรกะ retry + จำกัดคิวเลยอยู่รวมกันที่นี่ที่เดียว
//
// ไฟล์นี้ห้าม import อะไรของ Next — lib/pu-parse.ts ใช้ไฟล์นี้ และต้องรันด้วย
// node ตรง ๆ ได้เพื่อสร้างสแนปช็อต

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * จำกัดจำนวนงานที่วิ่งพร้อมกัน — คืนฟังก์ชันสำหรับห่องานไว้
 * `limit: 1` = บังคับต่อคิวเรียงตัวเดียว
 *
 * ปลุก waiter ตัวแรกในคิวก่อน (FIFO) งานที่รอนานสุดเลยได้ไปก่อนเสมอ
 */
export function createGate(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function gate<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/**
 * ยิงซ้ำแล้วมีโอกาสได้ผลต่างจากเดิมไหม
 * 429 = โดน rate limit รอแล้วลองใหม่ได้ · 5xx = ฝั่งเซิร์ฟเวอร์สะดุด
 * ส่วน 4xx อื่น (404, 400, 403) ยิงอีกกี่ครั้งก็ได้คำตอบเดิม
 */
export const isRetryable = (status: number) => status === 429 || status >= 500;

export type FetchRetryOpts = {
  /** ชื่อต้นทาง ใช้ขึ้นต้นข้อความ error เช่น "Jolpica" */
  source: string;
  init?: RequestInit;
  attempts?: number;
  /** หน่วงก่อนลองครั้งที่ n (n เริ่มที่ 1 = การลองใหม่ครั้งแรก) */
  backoffMs?: (n: number) => number;
  /**
   * ห่อเฉพาะตอนยิง fetch ไม่รวมช่วง backoff — ผู้เรียกที่อยากให้ปล่อยสล็อต
   * คืนคิวระหว่างนอนรอส่งมาตรงนี้ ส่วนใครอยากกอดสล็อตไว้ทั้งชุดให้ห่อ
   * fetchRetry ทั้งก้อนด้วย gate ของตัวเองแทน
   */
  gate?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** เลิกถ้าเลยเวลานี้ (epoch ms) — กัน build ค้างเพราะต้นทางอืด */
  deadline?: number;
};

/**
 * fetch + retry ตามนโยบายเดียวกันทั้งรีโป
 * · 429/5xx และเน็ตล่ม = ลองใหม่จนครบ attempts
 * · 4xx อื่น = เลิกทันที
 * · ไม่สำเร็จสักครั้ง = โยน error ล่าสุดที่เจอ
 *
 * ระวัง: ห้ามใช้ `throw` เพื่อเลิกกลางลูป มันจะตกเข้า catch ของตัวเองแล้ววน
 * retry ต่อจนครบ (บั๊กเดิมของไฟล์นี้ตอนยังแยกกันอยู่ 3 ที่) ใช้ `break` เท่านั้น
 */
export async function fetchRetry(url: string, opts: FetchRetryOpts): Promise<Response> {
  const {
    source,
    init,
    attempts = 4,
    backoffMs = (n) => 500 * 2 ** (n - 1),
    gate,
    deadline,
  } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (deadline && Date.now() > deadline) {
      throw new Error(`${source} time budget spent before ${url}`);
    }
    if (attempt > 0) await sleep(backoffMs(attempt));
    try {
      const res = await (gate ? gate(() => fetch(url, init)) : fetch(url, init));
      if (res.ok) return res;
      lastErr = new Error(`${source} ${res.status} on ${url}`);
      if (!isRetryable(res.status)) break;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(`${source} failed on ${url}`);
}
