# เปิดโหมดออนไลน์ของ Pit Wall (Cloudflare แพ็กเกจฟรี)

โหมดเล่นคนเดียวใช้ได้ทันที ไม่ต้องตั้งค่าอะไร
โหมดออนไลน์ต้องมี **เซิร์ฟเวอร์ห้องแข่ง** ซึ่งเป็นโค้ดในโฟลเดอร์ `cloudflare/pitwall` ของโปรเจกต์นี้
ต้องเอาขึ้น Cloudflare Workers ครั้งเดียว แล้วบอกเว็บบน Vercel ว่าเซิร์ฟเวอร์อยู่ที่ไหน

- ไม่ต้องผูกบัตร
- ไม่พักโปรเจกต์เมื่อไม่มีคนใช้
- ใช้เกินโควตาฟรีรายวัน ระบบจะหยุดรับห้องใหม่จนรีเซ็ตรอบถัดไป ไม่มีการเก็บเงิน

> ชื่อปุ่มและเมนูในหน้า Cloudflare อาจต่างไปเล็กน้อยตามเวอร์ชันของหน้าเว็บ

## ขั้นที่ 1: สมัคร Cloudflare
1. ไปที่ https://dash.cloudflare.com/sign-up แล้วสมัครด้วยอีเมล
2. ยืนยันอีเมล
3. ถ้าหน้าไหนขอเลขบัตร ให้ถอยกลับ เพราะแปลว่าระบบพาไปแพ็กเกจเสียเงิน แพ็กเกจที่เราใช้คือ **Workers Free**

## ขั้นที่ 2: สร้าง Worker จาก GitHub
1. ในหน้า Cloudflare เลือก **Workers & Pages** → **Create** → **Import a repository** (หรือ "Connect to Git")
2. เชื่อมบัญชี GitHub แล้วเลือก repo **`ddavil76/f1-thai`**
3. ตั้งค่าตามนี้
   | ช่อง | ใส่ |
   |---|---|
   | Project name | `pitwall-room` |
   | Production branch | `main` |
   | Builds for non-production branches | ปิด (เซิร์ฟเวอร์ deploy จาก `main` อย่างเดียว) |
   | Root directory / Path | `cloudflare/pitwall` |
   | Build command | (เว้นว่าง) |
   | Deploy command | `npx wrangler deploy` |
4. กด **Deploy** รอสักครู่จนขึ้นว่าสำเร็จ
5. คัดลอก **ที่อยู่ของ Worker** หน้าตาประมาณ `https://pitwall-room.<ชื่อบัญชี>.workers.dev`
6. ทดสอบ: เปิดที่อยู่นั้นในเบราว์เซอร์ ต้องเห็น `{"ok":true,"service":"pitwall-room"}`

หลังจากนี้ทุกครั้งที่มีการ push ขึ้น branch ที่ตั้งไว้ Cloudflare จะ deploy ให้เอง

**สั่ง build ใหม่เอง:** เข้า Worker `pitwall-room` → แท็บ **Deployments** → ที่รายการ build ล่าสุดกด **View build** (หรือ "…") → **Retry build**
ถ้าไม่เจอปุ่ม ให้ push อะไรก็ได้ขึ้น branch นั้น ระบบจะ build ใหม่ให้เอง

## ขั้นที่ 3: บอก Vercel ว่าเซิร์ฟเวอร์อยู่ไหน
1. เข้า Vercel → โปรเจกต์ **f1-thai** → **Settings** → **Environment Variables**
2. เพิ่มตัวแปร
   - Name: `NEXT_PUBLIC_PITWALL_SERVER`
   - Value: ที่อยู่ Worker จากขั้นที่ 2 เช่น `https://pitwall-room.xxxx.workers.dev` (ไม่ต้องมี `/` ท้าย)
   - Environments: ติ๊กทั้ง **Production** และ **Preview**
3. ไปที่ **Deployments** → deploy ล่าสุด → **Redeploy** ต้อง deploy ใหม่ ค่านี้จึงจะมีผล

## ขั้นที่ 4: ลองเล่น
1. เปิด `/pitwall` แล้วกด **สร้างห้องใหม่** จะได้รหัสห้อง 4 ตัว
2. ส่งรหัสหรือลิงก์ให้เพื่อน เพื่อนกด **เข้าห้อง**
3. ทุกคนเลือกทีม แล้วเจ้าของห้องกดเริ่ม

## ถ้ามีปัญหา
| อาการ | ลองดู |
|---|---|
| หน้าเกมเขียนว่า "ยังไม่ได้เชื่อมเซิร์ฟเวอร์" | ยังไม่ได้ใส่ `NEXT_PUBLIC_PITWALL_SERVER` หรือยังไม่ได้ Redeploy |
| กดสร้างห้องแล้วขึ้นข้อผิดพลาด | เปิดที่อยู่ Worker ดูว่ายังทำงานอยู่ไหม (ขั้นที่ 2 ข้อ 6) |
| เข้าห้องไม่ได้ "ไม่พบห้องนี้" | รหัสผิด หรือทุกคนออกจากห้องนานจนห้องหายไป ให้สร้างห้องใหม่ |
| Deploy บน Cloudflare ล้มเหลว | ตรวจว่า Root directory เป็น `cloudflare/pitwall`, Build command ว่าง และ Deploy command เป็น `npx wrangler deploy` |
| log ขึ้น `next build` หรือ `wrangler preview` | Cloudflare กำลัง build เว็บแทนเซิร์ฟเวอร์ หรือ build branch อื่น: แก้ Root directory / Build command ตามตารางขั้นที่ 2 และปิด build ของ branch อื่น |

## สำหรับคนที่ใช้เครื่องตัวเอง (ไม่บังคับ)
```bash
cd cloudflare/pitwall
npm install
npx wrangler login     # เปิดเบราว์เซอร์ให้ล็อกอิน Cloudflare
npx wrangler deploy
```
ทดสอบบนเครื่อง: `npx wrangler dev` (เซิร์ฟเวอร์อยู่ที่ `http://localhost:8787`)
แล้วรันเว็บด้วย `NEXT_PUBLIC_PITWALL_SERVER=http://localhost:8787 npm run dev`

## เกี่ยวกับโควตาฟรี
- ห้องแข่งหนึ่งห้องใช้ Durable Object หนึ่งตัว ทำงานเฉพาะตอนมีคนอยู่ในห้อง
- เล่นกับกลุ่มเพื่อนวันละหลายเรซยังไม่เต็มโควตาฟรี
- เช็กการใช้งานได้ในหน้า Workers & Pages → `pitwall-room` → Metrics
