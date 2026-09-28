package app.f1weekrace.widget.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** สถานการณ์เดียวกับ tests/scriptable-widget.test.ts — บากู (R15) แล้วต่อด้วยมาเลเซีย (R16) */
class LogicTest {
    private val bkk = ZoneId.of("Asia/Bangkok")
    private fun t(s: String) = Instant.parse(s).toEpochMilli()

    private fun sessionJson(code: String, start: String, end: String) =
        """{"code":"$code","label":"$code","startsAt":"$start","endsAt":"$end"}"""

    private fun raceJson(round: String, short: String, flag: String, start: String) =
        """{"round":"$round","name":"$short GP","short":"$short","flag":"$flag","circuit":"C","circuitId":"c",
           "locality":"L","country":"$short","startsAt":"$start","isSprint":false,
           "track":{"w":100,"h":60,"pts":[0,0,10,0,10,10,0,10]}}"""

    private val baku = listOf(
        sessionJson("FP1", "2026-09-24T08:30:00.000Z", "2026-09-24T10:00:00.000Z"),
        sessionJson("Q", "2026-09-25T12:00:00.000Z", "2026-09-25T13:00:00.000Z"),
        sessionJson("RACE", "2026-09-26T11:00:00.000Z", "2026-09-26T13:00:00.000Z"),
    )
    private val malaysia = listOf(
        sessionJson("FP1", "2026-10-02T03:30:00.000Z", "2026-10-02T05:00:00.000Z"),
        sessionJson("Q", "2026-10-03T07:00:00.000Z", "2026-10-03T08:00:00.000Z"),
        sessionJson("RACE", "2026-10-04T07:00:00.000Z", "2026-10-04T09:00:00.000Z"),
    )

    private fun payload(withAfter: Boolean = true, generatedAt: String = "2026-09-20T00:00:00.000Z") = parsePayload(
        """{"season":2026,"state":"upcoming","generatedAt":"$generatedAt",
           "race":${raceJson("15", "Azerbaijan", "🇦🇿", "2026-09-26T11:00:00.000Z")},
           "session":${baku[0]},
           "sessions":[${baku.joinToString(",")}],
           "after":${if (withAfter) """{"race":${raceJson("16", "Malaysia", "🇲🇾", "2026-10-04T07:00:00.000Z")},"sessions":[${malaysia.joinToString(",")}]}""" else "null"},
           "leader":null,
           "top3":[{"code":"VER","name":"M. Verstappen","points":310,"constructorId":"red_bull"}],
           "lastRace":{"round":"14","short":"Spain","flag":"🇪🇸","startsAt":"2026-09-13T13:00:00.000Z",
             "podium":[{"code":"HAM","name":"L. Hamilton","constructorId":"ferrari"},
                       {"code":"LEC","name":"C. Leclerc","constructorId":"ferrari"},
                       {"code":"RUS","name":"G. Russell","constructorId":"mercedes"}]},
           "showPodium":true}""",
    )

    /* ---------- อ่านข้อมูล ---------- */

    @Test fun parsesEverythingTheWidgetUses() {
        val p = payload()
        assertEquals(State.UPCOMING, p.state)
        assertEquals("15", p.race!!.round)
        assertEquals("🇦🇿", p.race!!.flag)
        assertEquals(8, p.race!!.track!!.pts.size)
        assertEquals(listOf("FP1", "Q", "RACE"), p.sessions.map { it.code })
        assertEquals("16", p.after!!.race.round)
        assertEquals(3, p.after!!.sessions.size)
        assertEquals(310, p.top3[0].points)
        assertEquals("HAM", p.lastRace!!.podium[0].code)
        assertEquals(t("2026-09-20T00:00:00Z"), p.generatedAt)
    }

    @Test fun olderPayloadsWithoutNewFieldsStillParse() {
        val p = parsePayload(
            """{"season":2026,"state":"upcoming","race":${raceJson("15", "Azerbaijan", "🇦🇿", "2026-09-26T11:00:00Z")},
               "session":{"code":"RACE","label":"Race","startsAt":"2026-09-26T11:00:00Z"}}""",
        )
        assertNull(p.after)
        assertNull(p.generatedAt)
        assertTrue(p.sessions.isEmpty())
        // ไม่มี endsAt → ถือว่าจบตอนเริ่ม
        assertEquals(p.session!!.startsAt, p.session!!.endsAt)
    }

    @Test fun seasonOverAndNoCalendar() {
        assertEquals(State.SEASON_OVER, parsePayload("""{"season":2026,"state":"season-over","race":null}""").state)
        assertEquals(State.NO_CALENDAR, parsePayload("""{"season":2027,"state":"no-calendar"}""").state)
    }

    /* ---------- เลือก session ตามเวลาเครื่อง ---------- */

    @Test fun startedSessionIsLiveNotACountdown() {
        val p = normalize(payload(), t("2026-09-24T08:40:00Z"), false)
        assertEquals(State.LIVE, p.state)
        assertEquals("FP1", p.session!!.code)
    }

    @Test fun finishedSessionMovesToTheNextOne() {
        val p = normalize(payload(), t("2026-09-24T13:00:00Z"), false)
        assertEquals(State.UPCOMING, p.state)
        assertEquals("Q", p.session!!.code)
    }

    @Test fun afterTheRaceShowsTheNextRaceNotTheOldOne() {
        val p = normalize(payload(), t("2026-09-27T03:00:00Z"), false)
        assertEquals("16", p.race!!.round)
        assertEquals("FP1", p.session!!.code)
        assertEquals(State.UPCOMING, p.state)
        // โพเดียมที่มีเป็นของสนามก่อนหน้า — ปิดไว้จนกว่าจะได้ผลจริง
        assertFalse(p.showPodium)
    }

    @Test fun afterTheRaceWithoutNextRaceIsDone() {
        val p = normalize(payload(withAfter = false), t("2026-09-26T14:00:00Z"), false)
        assertEquals(State.DONE, p.state)
        assertNull(p.session)
    }

    @Test fun raceOnlySkipsPracticeAndQualifying() {
        val p = normalize(payload(), t("2026-09-24T09:00:00Z"), true)
        assertEquals("RACE", p.session!!.code)
        assertEquals(State.UPCOMING, p.state)
        // ตารางทั้งสุดสัปดาห์ยังครบ
        assertEquals(3, p.sessions.size)
    }

    /* ---------- รีเฟรช ---------- */

    @Test fun refreshesRightWhenASessionEnds() {
        val now = t("2026-09-24T09:57:00Z")
        assertEquals(t("2026-09-24T10:00:05Z"), nextRefresh(normalize(payload(), now, false), now))
    }

    @Test fun refreshesWhenOneDayIsLeftSoTheTimerTakesOver() {
        // ซ้อม 1 08:30Z วันที่ 24 → เหลือ 1 วันตอน 08:30Z วันที่ 23
        val now = t("2026-09-23T08:10:00Z")
        assertEquals(t("2026-09-23T08:30:00Z"), nextRefresh(normalize(payload(), now, false), now))
    }

    @Test fun refreshesWhenTheHourDigitChangesSoDaysHoursNeverLag() {
        // ซ้อม 1 08:30Z วันที่ 24 · ตอน 00:10Z วันที่ 20 เหลือ 4 วัน 08 ชม. 20 นาที → กลายเป็น 08 → 07 ตอน 00:30Z
        val now = t("2026-09-20T00:10:00Z")
        assertEquals(t("2026-09-20T00:30:01Z"), nextRefresh(normalize(payload(), now, false), now))
        // หลังรีเฟรช ชั่วโมงถัดไปเกินรอบปกติ 30 นาที → ใช้รอบปกติ
        val after = t("2026-09-20T00:30:01Z")
        assertEquals(after + 30 * MINUTE, nextRefresh(normalize(payload(), after, false), after))
        assertEquals(4L to 7L, daysLeft(t("2026-09-24T08:30:00Z"), after))
    }

    @Test fun refreshesOftenWhileLiveOrWaitingForNextRace() {
        val live = t("2026-09-24T08:40:00Z")
        assertEquals(live + 5 * MINUTE, nextRefresh(normalize(payload(), live, false), live))
        val done = t("2026-09-26T14:00:00Z")
        assertEquals(done + 5 * MINUTE, nextRefresh(normalize(payload(withAfter = false), done, false), done))
        val calm = t("2026-09-20T00:00:00Z")
        assertEquals(calm + 30 * MINUTE, nextRefresh(normalize(payload(), calm, false), calm))
    }

    /* ---------- แจ้งเตือน ---------- */

    @Test fun alertsBeforeQualifyingAndRaceOfBothWeekends() {
        val plan = alertPlan(normalize(payload(), t("2026-09-20T00:00:00Z"), false), t("2026-09-20T00:00:00Z"), false, bkk)
        assertEquals(listOf("15-Q", "15-RACE", "16-Q", "16-RACE"), plan.map { it.id })
        val q = plan[0]
        assertEquals(t("2026-09-25T11:30:00Z"), q.at)
        assertEquals("🇦🇿 AZERBAIJAN · Q", q.title)
        assertEquals("เริ่มอีก 30 นาที (19:00)", q.body)
        assertEquals("$SITE/race/15", q.url)
    }

    @Test fun noAlertsInThePastAndRaceOnlyMode() {
        val now = t("2026-09-25T11:45:00Z")
        assertEquals(listOf("15-RACE", "16-Q", "16-RACE"), alertPlan(payload(), now, false, bkk).map { it.id })
        assertEquals(listOf("15-RACE", "16-RACE"), alertPlan(payload(), now, true, bkk).map { it.id })
    }

    @Test fun afterSwitchingToNextRaceOnlyItsAlertsRemain() {
        val now = t("2026-09-27T03:00:00Z")
        val plan = alertPlan(normalize(payload(), now, false), now, false, bkk)
        assertEquals(listOf("16-Q", "16-RACE"), plan.map { it.id })
    }

    /* ---------- วันเวลาไทย ---------- */

    @Test fun thaiDates() {
        assertEquals("พฤ. 24 ก.ย. · 15:30", whenText(t("2026-09-24T08:30:00Z"), bkk))
        assertEquals("พฤ. 15:30", whenShort(t("2026-09-24T08:30:00Z"), bkk))
        // ข้ามวันตามเขตเวลา + เติมศูนย์
        assertEquals("อา. 4 ต.ค. · 00:05", whenText(t("2026-10-03T17:05:00Z"), bkk))
    }

    @Test fun daysLeftOnlyWhenMoreThanADay() {
        val now = t("2026-09-20T00:00:00Z")
        assertEquals(4L to 8L, daysLeft(t("2026-09-24T08:30:00Z"), now))
        assertNull(daysLeft(now + DAY, now))
        assertNotNull(daysLeft(now + DAY + 1, now))
    }
}
