export const metadata = { title: "ออฟไลน์" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md py-16">
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-4xl">📡</span>
        <h1 className="text-lg font-bold">ออฟไลน์อยู่</h1>
        <p className="text-sm text-white/50">
          หน้านี้ยังไม่เคยเปิด เลยไม่มีข้อมูลเก็บไว้ ลองต่ออินเทอร์เน็ตแล้วเปิดใหม่อีกครั้ง
        </p>
      </div>
    </main>
  );
}
