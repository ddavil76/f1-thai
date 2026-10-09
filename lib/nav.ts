export const NAV_ITEMS = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/results", label: "ผล" },
  { href: "/standings", label: "คะแนน" },
  { href: "/calendar", label: "ปฏิทิน" },
  { href: "/power-units", label: "ชิ้นส่วน" },
  { href: "/pitwall", label: "เกม" },
] as const;

/**
 * แถบล่างบนมือถือใส่ได้แค่ 4 อัน — ที่จอ 320px ของเดิม 4 อันกว้าง 293px
 * ในพื้นที่ 288px คือเต็มพอดีอยู่แล้ว ยัดอันที่ 5 ลงไปจะล้นทันที
 * หน้าชิ้นส่วนเข้าได้จาก header บนจอใหญ่ และจากการ์ดในหน้าคะแนนบนมือถือ
 * หน้าเกมเข้าได้จาก header บนจอใหญ่ และจากการ์ดในหน้าแรกบนมือถือ
 */
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.slice(0, 4);

/** หน้าที่ไม่แสดงแถบล่าง — หน้าเกมมีปุ่มของตัวเองและแถบลอยจะทับเนื้อหา */
export const BOTTOM_NAV_HIDDEN = ["/pitwall"];
