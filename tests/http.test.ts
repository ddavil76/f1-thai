import { describe, expect, it, vi, afterEach } from "vitest";
import { createGate, fetchRetry, isRetryable } from "@/lib/http";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createGate", () => {
  it.each([1, 3, 4])("ไม่ปล่อยให้เกิน limit %i แม้งานทยอยเข้ามาระหว่างคิวกำลังปลด", async (limit) => {
    const gate = createGate(limit);
    let live = 0;
    let peak = 0;
    const job = () =>
      gate(async () => {
        live++;
        peak = Math.max(peak, live);
        await sleep(5);
        live--;
      });

    const jobs = Array.from({ length: 30 }, job);
    for (let t = 1; t < 20; t++) setTimeout(() => void jobs.push(job()), t);
    await sleep(250);
    await Promise.all(jobs);

    expect(peak).toBe(limit);
  });

  it("ปล่อยงานตามลำดับที่เข้าคิว", async () => {
    const gate = createGate(1);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        gate(async () => {
          await sleep(2);
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("คืนสล็อตแม้งานจะ throw (ไม่ทำคิวค้าง)", async () => {
    const gate = createGate(1);
    await expect(gate(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(gate(async () => "ผ่าน")).resolves.toBe("ผ่าน");
  });
});

describe("isRetryable", () => {
  it("ยิงซ้ำเฉพาะ 429 กับ 5xx", () => {
    expect([429, 500, 502, 503].map(isRetryable)).toEqual([true, true, true, true]);
    expect([200, 400, 403, 404, 410].map(isRetryable)).toEqual([false, false, false, false, false]);
  });
});

describe("fetchRetry", () => {
  const stub = (status: number) => {
    const spy = vi.fn(async () => new Response("x", { status }));
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  };

  it("เลิกทันทีเมื่อเจอ 4xx ถาวร — ยิงครั้งเดียวพอ", async () => {
    const spy = stub(404);
    await expect(
      fetchRetry("https://x.test/a", { source: "Test", attempts: 4, backoffMs: () => 1 }),
    ).rejects.toThrow("Test 404 on https://x.test/a");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ยิงซ้ำจนครบเมื่อเจอ 5xx", async () => {
    const spy = stub(503);
    await expect(
      fetchRetry("https://x.test/b", { source: "Test", attempts: 4, backoffMs: () => 1 }),
    ).rejects.toThrow("Test 503");
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("ยิงซ้ำเมื่อเน็ตล่ม แล้วโยน error ตัวจริงออกมา", async () => {
    const spy = vi.fn(async () => { throw new TypeError("network down"); });
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(
      fetchRetry("https://x.test/c", { source: "Test", attempts: 3, backoffMs: () => 1 }),
    ).rejects.toThrow("network down");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("สำเร็จหลังลองใหม่ ก็คืน Response นั้น", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      return new Response(n < 3 ? "err" : "ok", { status: n < 3 ? 500 : 200 });
    }) as unknown as typeof fetch;
    const res = await fetchRetry("https://x.test/d", { source: "Test", backoffMs: () => 1 });
    expect(await res.text()).toBe("ok");
    expect(n).toBe(3);
  });

  it("เลิกทันทีถ้าเลย deadline ไปแล้ว", async () => {
    const spy = stub(200);
    await expect(
      fetchRetry("https://x.test/e", { source: "Test", deadline: Date.now() - 1 }),
    ).rejects.toThrow("Test time budget spent");
    expect(spy).not.toHaveBeenCalled();
  });

  it("ใช้ gate ที่ส่งเข้ามาห่อทุกครั้งที่ยิง", async () => {
    stub(503);
    const calls: number[] = [];
    const gate = <T,>(fn: () => Promise<T>) => {
      calls.push(1);
      return fn();
    };
    await expect(
      fetchRetry("https://x.test/f", { source: "Test", attempts: 3, backoffMs: () => 1, gate }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });
});
