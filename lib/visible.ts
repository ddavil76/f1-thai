/**
 * resolve เมื่อ element ปรากฏบนจอจริงครั้งแรก (อยู่ในหน้าจอและมีขนาด)
 *
 * ใช้เลื่อนการสร้างฉาก 3D ออกไปจนกว่าจะมีคนเห็น — แท็บที่ยังไม่เปิดถูก render ไว้แต่ซ่อน
 * (display:none) ถ้าไม่รอ จะโหลด three สร้าง WebGL context และยิง openf1 ทั้งที่ไม่มีใครดู
 * คืน cancel() ไว้เรียกตอน unmount — ยกเลิกแล้ว promise จะไม่ resolve
 */
export function whenVisible(el: Element): { ready: Promise<void>; cancel: () => void } {
  let io: IntersectionObserver | null = null;
  const ready = new Promise<void>((resolve) => {
    io = new IntersectionObserver((entries) => {
      const e = entries.find((x) => x.isIntersecting);
      if (!e || e.boundingClientRect.width === 0 || e.boundingClientRect.height === 0) return;
      io?.disconnect();
      resolve();
    });
    io.observe(el);
  });
  return { ready, cancel: () => io?.disconnect() };
}
