package app.f1weekrace.widget.model

import java.time.Instant
import java.time.ZoneId

/*
 * ตรรกะเดียวกับ public/scriptable-widget.js (widget iPhone) — แก้ที่หนึ่งให้แก้อีกที่ด้วย
 */

const val SITE = "https://f1-thai.vercel.app"
const val MINUTE = 60_000L
const val HOUR = 60 * MINUTE
const val DAY = 24 * HOUR

/**
 * เลือก session ตาม "เวลาเครื่องตอนวาด" ไม่เชื่อ state ในข้อมูลอย่างเดียว — ข้อมูลอาจเก่าได้
 * · จบทั้งสุดสัปดาห์แล้วและมีสนามถัดไป (after) → ขึ้นสนามนั้นเลย ไม่ค้างสนามเดิม
 * · raceOnly = นับถอยหลังเฉพาะเรซ (ตารางทั้งสุดสัปดาห์ยังอยู่ครบใน sessions)
 */
fun normalize(p: Payload, now: Long, raceOnly: Boolean): Payload {
    if (p.race == null) return p
    val all = p.sessions.ifEmpty { listOfNotNull(p.session) }
    val races = if (raceOnly) all.filter { it.code == "RACE" } else emptyList()
    val list = races.ifEmpty { all }
    if (list.isEmpty()) return p
    val s = list.firstOrNull { it.endsAt > now }
    if (s == null) {
        val a = p.after
        if (a != null && a.sessions.isNotEmpty()) {
            // โพเดียมของสนามที่เพิ่งจบยังไม่มีในข้อมูลชุดนี้ ปิดไว้ก่อน รอบดึงหน้าได้ผลจริงมาเอง
            return normalize(
                p.copy(race = a.race, sessions = a.sessions, session = null, after = null, showPodium = false),
                now, raceOnly,
            )
        }
        return p.copy(session = null, state = State.DONE)
    }
    return p.copy(session = s, state = if (s.startsAt <= now) State.LIVE else State.UPCOMING)
}

/** รีเฟรชรอบหน้าตรงจังหวะที่หน้าตาต้องเปลี่ยน (เริ่ม/จบ session, เหลือ 1 วัน) ไม่งั้นตามรอบปกติ */
fun nextRefresh(p: Payload?, now: Long): Long {
    val busy = p != null && (p.state == State.LIVE || p.state == State.DONE)
    val soon = now + (if (busy) 5 else 30) * MINUTE
    val s = p?.session ?: return soon
    val turns = mutableListOf(s.startsAt + 5_000, s.endsAt + 5_000, s.startsAt - DAY)
    // เกินวันขึ้นเป็น "N วัน HH ชม." ที่ไม่เดินเอง — รีเฟรชตอนเลขชั่วโมงเปลี่ยน ไม่งั้นช้าไปได้เกือบชั่วโมง
    val left = s.startsAt - now
    if (left > DAY) turns += s.startsAt - (left - 1) / HOUR * HOUR + 1_000
    return turns.filter { it in (now + 1)..<soon }.minOrNull() ?: soon
}

/* ---------- แจ้งเตือนก่อนแข่ง ---------- */

const val ALERT_MIN = 30
val ALERT_CODES = setOf("Q", "SPRINT", "RACE")

data class Alert(val id: String, val title: String, val body: String, val url: String, val at: Long)

/** แจ้ง 30 นาทีก่อน Q / สปรินต์ / เรซ ของสนามนี้และสนามถัดไป (ซ้อมไม่แจ้ง — ถี่เกินจะรำคาญ) */
fun alertPlan(p: Payload?, now: Long, raceOnly: Boolean, zone: ZoneId): List<Alert> {
    val race = p?.race ?: return emptyList()
    val weekends = listOfNotNull(Weekend(race, p.sessions), p.after)
    val codes = if (raceOnly) setOf("RACE") else ALERT_CODES
    return weekends.flatMap { w ->
        w.sessions.filter { it.code in codes }.mapNotNull { s ->
            val at = s.startsAt - ALERT_MIN * MINUTE
            if (at <= now) return@mapNotNull null
            Alert(
                id = "${w.race.round}-${s.code}",
                title = "${w.race.flag} ${w.race.short.uppercase()} · ${s.code}",
                body = "เริ่มอีก $ALERT_MIN นาที (${hm(s.startsAt, zone)})",
                url = "$SITE/race/${w.race.round}",
                at = at,
            )
        }
    }
}

/* ---------- วันเวลาแบบไทย (เขตเวลาของเครื่อง) ---------- */

private val TH_DAY = listOf("อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.")
private val TH_MON = listOf("ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.")

private fun at(ms: Long, zone: ZoneId) = Instant.ofEpochMilli(ms).atZone(zone)

fun hm(ms: Long, zone: ZoneId): String = at(ms, zone).let { "%02d:%02d".format(it.hour, it.minute) }

/** "พฤ. 24 ก.ย. · 15:30" */
fun whenText(ms: Long, zone: ZoneId): String = at(ms, zone).let {
    "${TH_DAY[it.dayOfWeek.value % 7]} ${it.dayOfMonth} ${TH_MON[it.monthValue - 1]} · ${hm(ms, zone)}"
}

/** "พฤ. 15:30" — ที่แคบ */
fun whenShort(ms: Long, zone: ZoneId): String = at(ms, zone).let { "${TH_DAY[it.dayOfWeek.value % 7]} ${hm(ms, zone)}" }

/** เหลือเกิน 1 วัน → (วัน, ชั่วโมง) ไว้ขึ้น "4 วัน 07 ชม." · ไม่ถึงวัน → null (ใช้ตัวนับเดินเอง) */
fun daysLeft(target: Long, now: Long): Pair<Long, Long>? {
    val left = target - now
    if (left <= DAY) return null
    return left / DAY to (left / HOUR) % 24
}
