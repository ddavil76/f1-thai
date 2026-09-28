package app.f1weekrace.widget.model

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/*
 * ข้อมูลจาก /api/widget (lib/widget.ts บนเว็บ) — ชุดเดียวกับที่ widget ของ iPhone ใช้
 * แยกเป็น Kotlin ล้วน (ไม่แตะ Android) ให้ทดสอบบนเครื่องธรรมดาได้
 */

data class Session(val code: String, val label: String, val startsAt: Long, val endsAt: Long)

/** ผังสนามย่อ — จุด x,y สลับกันในกล่อง w×h */
class Track(val w: Float, val h: Float, val pts: FloatArray)

data class Race(
    val round: String,
    val name: String,
    /** ชื่อสั้นแบบแอป F1 — "Azerbaijan" */
    val short: String,
    val flag: String,
    val circuit: String,
    val locality: String,
    val startsAt: Long,
    val isSprint: Boolean,
    val track: Track?,
)

data class Weekend(val race: Race, val sessions: List<Session>)

data class Driver(val code: String, val name: String, val constructorId: String, val points: Int? = null)

data class LastRace(val round: String, val short: String, val flag: String, val startsAt: Long, val podium: List<Driver>)

/** upcoming/live มาจากเว็บ · done = จบทั้งสุดสัปดาห์แล้วแต่ยังไม่มีสนามถัดไป (คิดในเครื่อง) */
enum class State { UPCOMING, LIVE, DONE, SEASON_OVER, NO_CALENDAR }

data class Payload(
    val season: Int,
    val state: State,
    /** เวลาที่เว็บสร้างข้อมูลชุดนี้ */
    val generatedAt: Long?,
    val race: Race?,
    val session: Session?,
    val sessions: List<Session>,
    /** สนามถัดจาก race — สลับไปเองเมื่อสุดสัปดาห์นี้จบ */
    val after: Weekend?,
    val top3: List<Driver>,
    val lastRace: LastRace?,
    val showPodium: Boolean,
)

private fun iso(s: String?): Long? = try {
    if (s.isNullOrEmpty()) null else Instant.parse(s).toEpochMilli()
} catch (e: Exception) {
    null
}

private fun JSONObject.str(k: String) = if (isNull(k)) "" else optString(k, "")

private fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

private fun session(o: JSONObject?): Session? {
    if (o == null) return null
    val start = iso(o.str("startsAt")) ?: return null
    // ข้อมูลรุ่นเก่าไม่มี endsAt — ถือว่าจบตอนเริ่ม (ข้ามไปตัวถัดไปเลย ดีกว่านับขึ้น)
    return Session(o.str("code"), o.str("label"), start, iso(o.str("endsAt")) ?: start)
}

private fun track(o: JSONObject?): Track? {
    if (o == null) return null
    val a = o.optJSONArray("pts") ?: return null
    if (a.length() < 6) return null
    return Track(o.optDouble("w", 100.0).toFloat(), o.optDouble("h", 100.0).toFloat(),
        FloatArray(a.length()) { a.optDouble(it, 0.0).toFloat() })
}

private fun race(o: JSONObject?): Race? {
    if (o == null) return null
    return Race(
        round = o.str("round"),
        name = o.str("name"),
        short = o.str("short").ifEmpty { o.str("country") },
        flag = o.str("flag"),
        circuit = o.str("circuit"),
        locality = o.str("locality"),
        startsAt = iso(o.str("startsAt")) ?: return null,
        isSprint = o.optBoolean("isSprint", false),
        track = track(o.optJSONObject("track")),
    )
}

private fun driver(o: JSONObject) = Driver(
    code = o.str("code"),
    name = o.str("name"),
    constructorId = o.str("constructorId"),
    points = if (o.has("points") && !o.isNull("points")) o.optInt("points") else null,
)

private fun sessions(a: JSONArray?) = a.objects().mapNotNull { session(it) }

fun parsePayload(json: String): Payload {
    val o = JSONObject(json)
    val last = o.optJSONObject("lastRace")?.let { l ->
        val podium = l.optJSONArray("podium").objects().map { driver(it) }
        val start = iso(l.str("startsAt"))
        if (podium.size < 3 || start == null) null
        else LastRace(l.str("round"), l.str("short"), l.str("flag"), start, podium)
    }
    val after = o.optJSONObject("after")?.let { a ->
        race(a.optJSONObject("race"))?.let { Weekend(it, sessions(a.optJSONArray("sessions"))) }
    }
    return Payload(
        season = o.optInt("season"),
        state = when (o.str("state")) {
            "live" -> State.LIVE
            "season-over" -> State.SEASON_OVER
            "no-calendar" -> State.NO_CALENDAR
            else -> State.UPCOMING
        },
        generatedAt = iso(o.str("generatedAt")),
        race = race(o.optJSONObject("race")),
        session = session(o.optJSONObject("session")),
        sessions = sessions(o.optJSONArray("sessions")),
        after = after,
        top3 = o.optJSONArray("top3").objects().map { driver(it) },
        lastRace = last,
        showPodium = o.optBoolean("showPodium", false),
    )
}
