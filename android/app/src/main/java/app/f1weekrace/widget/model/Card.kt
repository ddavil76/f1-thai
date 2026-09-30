package app.f1weekrace.widget.model

import java.net.URLEncoder

/*
 * ธีมการ์ด — รูปพื้นหลังจากเว็บ (/api/widget/card) + กล่องนับถอยหลังที่ widget วาดเอง
 * ตรงกับ public/scriptable-widget.js (iPhone) และ lib/widget-card.ts (เว็บ)
 */

/** ชื่อ session ภาษาไทยในกล่องนับถอยหลัง */
val TH_SESSION = mapOf(
    "FP1" to "ซ้อม 1", "FP2" to "ซ้อม 2", "FP3" to "ซ้อม 3",
    "SQ" to "สปรินต์ควอลิฟาย", "SPRINT" to "สปรินต์", "Q" to "ควอลิฟาย", "RACE" to "เรซ",
)

/** ไฟสตาร์ทติดเพิ่มเมื่อใกล้เวลา: เหลือ ≥5 วัน = 0 … ไม่ถึงวัน = 5 · เริ่มแล้ว = ดับหมด */
fun lightsLit(msLeft: Long): Int {
    if (msLeft <= 0) return 0
    return (5 - (msLeft / DAY).toInt()).coerceIn(0, 5)
}

/**
 * URL รูปการ์ดของ widget ขนาด wDp×hDp (สัดส่วนเดียวกับ widget พอดี)
 * size = small|medium|large · tzMin = เขตเวลาของเครื่อง (นาทีจาก UTC) · null = ไม่มีสนามให้วาด
 */
fun cardUrl(p: Payload?, size: String, wDp: Int, hDp: Int, scale: Float, dark: Boolean, tzMin: Int): String? {
    val race = p?.race ?: return null
    val q = mutableListOf(
        "round=${URLEncoder.encode(race.round, "UTF-8")}", "size=$size", "w=$wDp", "h=$hDp",
        "s=${"%.1f".format(java.util.Locale.US, scale.coerceIn(1f, 3f))}",
        "theme=${if (dark) "dark" else "light"}", "tz=$tzMin", "v=1",
    )
    p.session?.let { q += "next=${URLEncoder.encode(it.code, "UTF-8")}" }
    if (p.state == State.LIVE) q += "live=1"
    return "$SITE/api/widget/card?${q.joinToString("&")}"
}
