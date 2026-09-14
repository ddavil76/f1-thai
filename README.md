# F1 Week Race

เว็บตารางแข่ง Formula 1 ภาษาไทย — สนามถัดไป นับถอยหลังรายเซสชัน ผลการแข่ง
ตารางคะแนน และปฏิทินทั้งฤดูกาล แสดงเป็นเวลาไทย (GMT+7) หรือเวลาท้องถิ่นของสนามก็ได้

สร้างด้วย Next.js (App Router) + Tailwind CSS v4 · เป็น server component เกือบทั้งหมด
และ deploy เป็น static/ISR ไม่ต้องมีฐานข้อมูล

## เริ่มใช้งาน

ต้องใช้ Node 20.9 ขึ้นไป (`.nvmrc` ตั้งไว้ที่ 22 — `nvm use` ได้เลย)

```bash
npm install
npm run dev     # http://localhost:3000
```

> **เรื่อง lockfile:** `package-lock.json` ถูกสร้างด้วย npm 11+ ซึ่งเขียนฟิลด์
> `libc` ให้ optional dependency ที่เป็น native binary ถ้ารัน `npm install`
> ด้วย npm 10 มันจะตัดฟิลด์พวกนั้นทิ้ง (38 จุด) กลายเป็น diff ที่ไม่ได้ตั้งใจ
> เจอแบบนั้นให้ `git checkout package-lock.json` แล้วอัปเกรด npm ก่อน · CI ใช้
> `npm ci` ซึ่งไม่แตะ lockfile เลย จึงไม่มีปัญหานี้

| สคริปต์ | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | build โปรดักชัน (prerender หน้าส่วนใหญ่) |
| `npm start` | รันผลลัพธ์จาก `build` |
| `npm run lint` | ESLint |
| `npm test` | ยูนิตเทสต์ (Vitest) |
| `npm run test:watch` | เทสต์แบบ watch |

CI รัน `npm ci` → `tsc --noEmit` → `lint` → `test` → `build` ทุก PR
(`.github/workflows/ci.yml`) รันชุดเดียวกันในเครื่องได้ก่อน push

เทสต์อยู่ใน `tests/` ครอบเฉพาะตรรกะที่ pure — retry/คิวใน `lib/http.ts`,
การห่อบรรทัด ICS, ฟังก์ชันเวลาและหน้าต่างรอบการแข่งใน `lib/f1.ts`,
การคำนวณโควตา/โทษกริดใน `lib/power-units.ts` และตัวแยกตาราง PDF ของ FIA
ส่วนที่ต้องต่อเน็ตจริงไม่ได้เทสต์ (mock `fetch` เอาเฉพาะพฤติกรรม retry)

## ตัวแปรสภาพแวดล้อม

ทั้งสองตัวเป็น optional — ไม่ตั้งก็รันได้

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `metadataBase` สำหรับ OG image และ canonical URL — **ต้องตั้งตอน deploy** ไม่งั้นลิงก์พรีวิวจะชี้ localhost |
| `NEXT_PUBLIC_SEASON` | ปีปัจจุบัน | ล็อกฤดูกาลที่แสดง มีประโยชน์ช่วงต้นปีที่ Jolpica ยังไม่ปล่อยปฏิทินปีใหม่ (จะได้ค้างปีเก่าไว้ก่อน) และใช้ทดสอบการข้ามปี |

> `SEASON` ถูกคำนวณครั้งเดียวตอนโหลดโมดูล เซิร์ฟเวอร์ที่รันค้างข้ามปีจะยังเห็นปีเก่า
> จนกว่าจะ restart — ถ้าเจอเคสนี้ให้ตั้ง `NEXT_PUBLIC_SEASON` แล้ว redeploy

## แหล่งข้อมูล

เว็บนี้ไม่มี backend ของตัวเอง ดึงสดจาก 4 แหล่ง แล้วพึ่ง ISR cache ของ Next เป็นหลัก

| แหล่ง | ใช้ทำอะไร | อยู่ที่ |
| --- | --- | --- |
| [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (Ergast ตัวสืบทอด) | ปฏิทิน ผลการแข่ง ควอลิฟาย สปรินต์ ตารางคะแนน | `lib/f1.ts` |
| [openf1.org](https://openf1.org) | ไทม์มิ่งรายรอบสำหรับหน้ารีเพลย์ + รูป headshot ทางการ | `lib/replay.ts`, `lib/drivers.ts` |
| Wikipedia REST API | ผังสนาม และรูปนักแข่ง (fallback) | `lib/f1.ts`, `lib/drivers.ts` |
| เอกสาร PDF ของ FIA | ยอดใช้ชิ้นส่วน power unit และคำตัดสินโทษกริด | `lib/pu-parse.ts` |

ทุกตัวมี rate limit และล่มได้ ฟังก์ชันดึงข้อมูลเลย **ไม่ throw หลุดขึ้นไปถึงหน้าเว็บ** —
คืนค่าว่างหรือสแนปช็อตแทน แล้วให้หน้าเว็บตัดสินใจว่าจะแสดงอะไร

### สแนปช็อตสำรอง

`lib/schedule-fallback.ts` และ `lib/pu-fallback.ts` เป็นข้อมูลนิ่งที่ commit ไว้ในรีโป
ใช้เมื่อต้นทางล่ม (ปฏิทินทั้งฤดูกาล และยอดใช้ชิ้นส่วนล่าสุด) หน้า power units จะขึ้นป้าย
บอกผู้ใช้เองเมื่อกำลังอ่านจากสแนปช็อตแทนของสด

สแนปช็อต PU สร้างจาก `fetchPuData()` ใน `lib/pu-parse.ts` — ไฟล์นั้นจงใจไม่ import อะไร
ของ Next เพื่อให้รันด้วย node ตรง ๆ ได้ อย่าเพิ่มการพึ่งพา Next เข้าไป

### หมายเหตุเรื่องรีเพลย์

openf1 บล็อก IP ของ serverless (Vercel) แต่เปิด CORS ให้ ข้อมูลรีเพลย์เลยดึง
**จากฝั่งเบราว์เซอร์** ไม่ใช่ฝั่งเซิร์ฟเวอร์ และคำขอทุกตัวต่อคิวกันเส้นเดียวเว้นระยะ ~750ms
เพราะ openf1 แบบไม่มี API key จำกัดราว 1 req/วินาที รองรับเฉพาะฤดูกาล 2023 ขึ้นไป

## โครงสร้าง

```
app/                  หน้าเว็บ (App Router) — ทุกไฟล์เป็น server component ถ้าไม่เขียน "use client"
  page.tsx              สนามถัดไป + นับถอยหลัง + ผลล่าสุด
  results/              ผลการแข่งทั้งฤดูกาล
  standings/            ตารางคะแนน + กราฟแต้มสะสม + เครื่องคำนวณลุ้นแชมป์
  calendar/             ปฏิทินทั้งฤดูกาล
  calendar.ics/         ฟีด .ics ทุก session (route handler)
  race/[round]/         รายละเอียดสนาม (ตาราง ผัง ผล ควอลิฟาย)
  race/[round]/replay/  รีเพลย์ไทม์มิ่งรอบต่อรอบ
  driver/[id]/          โปรไฟล์นักแข่ง + เทียบเพื่อนร่วมทีม
  constructor/[id]/     โปรไฟล์ทีม
  power-units/          ยอดใช้ชิ้นส่วนเครื่องยนต์และโทษกริด
  reaction/             เกมวัดรีแอคชันตอนไฟดับ
components/           UI ที่ใช้ซ้ำ (client component ส่วนใหญ่อยู่ที่นี่)
lib/                  ดึงข้อมูล แปลงข้อมูล และตารางค่าคงที่
tests/                ยูนิตเทสต์ (Vitest)
```

### ข้อตกลงที่ควรรู้ก่อนแก้โค้ด

- **เวลา** — ฟอร์แมตด้วย `formatInTz()` ใน `lib/f1.ts` เท่านั้น (ล็อก `ca-gregory` กันเลขปี
  กลายเป็น พ.ศ.) ถ้าต้องแสดงเวลาที่สลับโซนตามที่ผู้ใช้เลือกได้ ให้ใช้ `<LocalTime>`
  ซึ่ง SSR เป็นเวลาไทยเสมอแล้วค่อยสลับฝั่ง client — กัน hydration mismatch
- **ค่า ISR** — แต่ละหน้าตั้ง `export const revalidate` ของตัวเอง และแต่ละ fetch
  ตั้ง `revalidate` ของตัวเองอีกชั้น ข้อมูลที่นิ่งแล้ว (แต้มสะสมย้อนหลัง) แคชยาวได้เป็นสัปดาห์
- **retry** — ทุกการยิง API ผ่าน `fetchRetry()` ใน `lib/http.ts` ที่เดียว
  retry เฉพาะ 429/5xx ส่วน 4xx อื่นเลิกทันที ผู้เรียกแค่ปรับจำนวนครั้งกับ backoff
  ของตัวเอง **อย่าเขียน retry loop ใหม่** — เคยมี 3 ก๊อปแล้วสองตัวมีบั๊กเดียวกัน
- **วันเวลาภาษาไทย** — ชื่อวันมาจากตารางใน `lib/f1.ts` ไม่ใช่ `weekday` ของ `Intl`
  เพราะ ICU ของ Node กับเบราว์เซอร์ให้คนละคำ (`อาทิตย์` vs `อา.`) แล้ว hydration พัง
- **แอนิเมชัน** — ทุกอันต้องมีคู่ใน `@media (prefers-reduced-motion: reduce)`
  ที่ท้าย `app/globals.css`

## เครดิต

ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ · F1 และ Formula 1 เป็นเครื่องหมายการค้าของ
Formula One Licensing B.V.
