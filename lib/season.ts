/**
 * ฤดูกาลที่เว็บแสดง
 *
 * ปกติใช้ปีปัจจุบัน แต่ตั้ง NEXT_PUBLIC_SEASON ทับได้ — มีประโยชน์ตอน
 * ต้นปีที่ Jolpica ยังไม่ปล่อยปฏิทินปีใหม่ (จะได้ค้างที่ปีเก่าไว้ก่อน)
 * และใช้ทดสอบการข้ามปีได้ด้วย
 */
const override = Number(process.env.NEXT_PUBLIC_SEASON);

export const SEASON =
  Number.isFinite(override) && override > 2000
    ? override
    : new Date().getFullYear();
