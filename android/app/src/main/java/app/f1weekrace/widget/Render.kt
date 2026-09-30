package app.f1weekrace.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import app.f1weekrace.widget.model.Driver
import app.f1weekrace.widget.model.LastRace
import app.f1weekrace.widget.model.Payload
import app.f1weekrace.widget.model.SITE
import app.f1weekrace.widget.model.State
import app.f1weekrace.widget.model.TH_SESSION
import app.f1weekrace.widget.model.Track
import app.f1weekrace.widget.model.daysLeft
import app.f1weekrace.widget.model.hm
import app.f1weekrace.widget.model.lightsLit
import app.f1weekrace.widget.model.whenShort
import app.f1weekrace.widget.model.whenText
import java.time.ZoneId
import kotlin.math.min
import kotlin.math.roundToInt

/** วาด widget — หน้าตาเดียวกับ public/scriptable-widget.js (iPhone) */
object Render {
    enum class Size { SMALL, MEDIUM, LARGE }

    private const val RED = 0xffe10600.toInt()
    private const val WHITE = Color.WHITE
    private const val DIM = 0x8cffffff.toInt()
    private const val FAINT = 0x52ffffff
    private const val GREEN = 0xff4ade80.toInt()

    // สีประจำทีม — แถบขอบซ้าย (ทีมผู้ชนะล่าสุด) และขีดสีหน้าชื่อนักขับ
    private val TEAM = mapOf(
        "red_bull" to "#3671c6", "mclaren" to "#ff8000", "ferrari" to "#e8002d",
        "mercedes" to "#27f4d2", "williams" to "#1868db", "aston_martin" to "#229971",
        "alpine" to "#00a1e8", "haas" to "#b6babd", "rb" to "#6692ff",
        "audi" to "#bb0a30", "sauber" to "#01c00e", "cadillac" to "#b3995d",
    )

    private fun team(id: String?) = Color.parseColor(TEAM[id] ?: "#888888")

    /** แคบ = เล็ก · กว้าง = กลาง · กว้างและสูง = ใหญ่ (หน่วย dp แนวตั้ง) */
    fun sizeOf(o: Bundle): Size {
        val w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
        return when {
            w == 0 -> Size.MEDIUM
            w < 200 -> Size.SMALL
            h >= 250 -> Size.LARGE
            else -> Size.MEDIUM
        }
    }

    private fun open(ctx: Context, url: String) = PendingIntent.getActivity(
        ctx, url.hashCode(),
        Intent(Intent.ACTION_VIEW, Uri.parse(url)),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun RemoteViews.show(id: Int, on: Boolean) = setViewVisibility(id, if (on) View.VISIBLE else View.GONE)

    private fun RemoteViews.sp(id: Int, size: Float) = setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, size)

    /** art = รูปการ์ดจากเว็บ (ธีมการ์ด) · null = โหลดไม่ได้/ปิดไว้ → หน้าตาแบบเดิม */
    fun build(
        ctx: Context, p: Payload?, size: Size, now: Long, offline: Boolean,
        art: Bitmap? = null, dark: Boolean = false,
    ): RemoteViews {
        val zone = ZoneId.systemDefault()
        val race = p?.race ?: return message(ctx, p, size, offline)
        if (art != null) return card(ctx, p, size, now, art, dark, zone)
        val v = RemoteViews(
            ctx.packageName,
            when (size) {
                Size.SMALL -> R.layout.widget_small
                Size.MEDIUM -> R.layout.widget_medium
                Size.LARGE -> R.layout.widget_large
            },
        )
        v.setOnClickPendingIntent(R.id.root, open(ctx, "$SITE/race/${race.round}"))
        stripe(v, p)
        header(v, p, size, zone)
        session(v, p, size, now, zone)

        when (size) {
            Size.SMALL -> {
                // หลังเรซไม่กี่วัน บอกผู้ชนะสนามที่แล้วบรรทัดเดียว (ที่แคบเกินจะใส่โพเดียม)
                val last = p.lastRace
                if (p.showPodium && last != null) {
                    val win = last.podium[0]
                    v.show(R.id.winner_row, true)
                    v.setInt(R.id.winner_tick, "setColorFilter", team(win.constructorId))
                    v.setTextViewText(R.id.winner, "${win.code} ชนะ ${last.flag}")
                    v.setOnClickPendingIntent(R.id.winner_row, open(ctx, "$SITE/race/${last.round}"))
                }
            }
            Size.MEDIUM -> {
                track(ctx, v, race.track, 100, 56)
                // หลังเรซไม่กี่วันเป็นโพเดียมสนามที่เพิ่งจบ ไม่งั้นตารางคะแนน
                val last = p.lastRace
                if (p.showPodium && last != null) podium(ctx, v, last, R.id.list_title, R.id.list, R.id.list_box)
                else standings(ctx, v, p.top3)
            }
            Size.LARGE -> {
                track(ctx, v, race.track, 110, 62)
                sessionTable(ctx, v, p, now, zone)
                standings(ctx, v, p.top3)
                p.lastRace?.let {
                    v.show(R.id.podium_box, true)
                    podium(ctx, v, it, R.id.podium_title, R.id.podium_list, R.id.podium_box)
                }
            }
        }
        return v
    }

    /* ---------- ธีมการ์ด ---------- */

    private const val PILL_RED = 0xffff3b2f.toInt()
    private const val PILL_TEXT = 0xfff3f1ec.toInt()

    /**
     * รูปการ์ดจากเว็บเต็ม widget (ชื่อสนาม ผังสนาม ตาราง) + กล่องนับถอยหลังมุมซ้ายล่างที่วาดเอง
     * ให้ตัวนับเดินตรงเวลา — ตรรกะเดียวกับ pill() ใน public/scriptable-widget.js
     */
    private fun card(
        ctx: Context, p: Payload, size: Size, now: Long, art: Bitmap, dark: Boolean, zone: ZoneId,
    ): RemoteViews {
        val race = p.race!!
        val v = RemoteViews(ctx.packageName, R.layout.widget_card)
        v.setOnClickPendingIntent(R.id.root, open(ctx, "$SITE/race/${race.round}"))
        v.setImageViewBitmap(R.id.art, art)
        v.setTextViewText(R.id.stamp, p.generatedAt?.let { "↻" + hm(it, zone) } ?: "")
        v.setTextColor(R.id.stamp, if (dark) 0x59ffffff else 0x591b1b22)
        v.setInt(R.id.pill, "setBackgroundResource", if (dark) R.drawable.pill_bg_dark else R.drawable.pill_bg)

        val s = p.session
        val target = s?.startsAt ?: race.startsAt
        val code = s?.code ?: "RACE"
        val left = target - now
        val name = if (size == Size.SMALL) code else TH_SESSION[code] ?: code
        v.setTextViewText(
            R.id.pill_label,
            when {
                p.state == State.LIVE -> "$name · กำลังแข่ง"
                p.state == State.DONE -> "จบสุดสัปดาห์"
                size == Size.MEDIUM -> "$name · ${whenShort(target, zone)}"
                else -> "$name เริ่มใน"
            },
        )
        val lit = if (p.state == State.UPCOMING) lightsLit(left) else 0
        listOf(R.id.l1, R.id.l2, R.id.l3, R.id.l4, R.id.l5).forEachIndexed { i, id ->
            v.setImageViewResource(id, if (i < lit) R.drawable.light_on else R.drawable.light_off)
        }

        val fs = when (size) { Size.SMALL -> 24f; Size.MEDIUM -> 25f; Size.LARGE -> 28f }
        v.show(R.id.timer, false)
        v.show(R.id.big, true)
        when (p.state) {
            State.LIVE -> big(v, "● LIVE", fs * 0.8f, PILL_RED)
            State.DONE -> big(v, "🏁 จบแล้ว", fs * 0.7f, PILL_TEXT)
            else -> {
                val d = daysLeft(target, now)
                if (d != null) {
                    // ตัวเลขแดงใหญ่ หน่วยขาวเล็ก: "4 วัน 07 ชม."
                    val text = "${d.first} วัน ${"%02d".format(d.second)} ชม."
                    val sp = SpannableString(text)
                    for (unit in listOf("วัน", "ชม.")) {
                        val i = text.indexOf(unit)
                        sp.setSpan(RelativeSizeSpan(0.42f), i, i + unit.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        sp.setSpan(ForegroundColorSpan(PILL_TEXT), i, i + unit.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    v.setTextViewText(R.id.big, sp)
                    v.sp(R.id.big, fs)
                    v.setTextColor(R.id.big, PILL_RED)
                } else {
                    v.show(R.id.big, false)
                    v.show(R.id.timer, true)
                    v.sp(R.id.timer, fs)
                    v.setChronometer(R.id.timer, SystemClock.elapsedRealtime() + left, null, true)
                    v.setChronometerCountDown(R.id.timer, true)
                }
            }
        }
        return v
    }

    /* ---------- ชิ้นส่วน ---------- */

    private fun stripe(v: RemoteViews, p: Payload?) {
        val winner = p?.lastRace?.podium?.firstOrNull()?.constructorId
        v.setInt(R.id.stripe, "setColorFilter", if (winner != null) team(winner) else RED)
    }

    private fun header(v: RemoteViews, p: Payload, size: Size, zone: ZoneId) {
        val race = p.race ?: return
        val small = size == Size.SMALL
        // เล็ก: แถวบนแคบ ย่อรอบเป็น R16 และไม่ซ้ำ LIVE (ตัวใหญ่ข้างล่างบอกอยู่แล้ว)
        v.setTextViewText(R.id.round, if (small) "R${race.round}" else "ROUND ${race.round}")
        v.show(R.id.sprint, race.isSprint)
        v.show(R.id.live_tag, p.state == State.LIVE && !small)
        // เวลาที่เว็บสร้างข้อมูลชุดนี้ — widget ดูค้างจะรู้ทันทีว่าข้อมูลเก่าหรือยังไม่รีเฟรช
        v.setTextViewText(R.id.stamp, p.generatedAt?.let { "↻" + hm(it, zone) } ?: "")
        v.setTextViewText(R.id.name, "${race.flag} ${race.short.uppercase()}")
        v.sp(R.id.name, when (size) { Size.SMALL -> 15f; Size.MEDIUM -> 17f; Size.LARGE -> 20f })
        if (size == Size.LARGE) {
            v.show(R.id.circuit, true)
            v.setTextViewText(R.id.circuit, "${race.circuit} · ${race.locality}")
        }
    }

    private fun session(v: RemoteViews, p: Payload, size: Size, now: Long, zone: ZoneId) {
        val race = p.race ?: return
        val s = p.session
        val target = s?.startsAt ?: race.startsAt
        val code = s?.code ?: "RACE"
        val timerSize = when (size) { Size.SMALL -> 26f; Size.MEDIUM -> 30f; Size.LARGE -> 34f }

        val (bg, fg) = when (code) {
            "RACE" -> R.drawable.badge_race to WHITE
            "Q" -> R.drawable.badge_q to 0xff08080a.toInt()
            "SQ", "SPRINT" -> R.drawable.badge_sprint to 0xff08080a.toInt()
            else -> R.drawable.badge_practice to WHITE
        }
        v.setTextViewText(R.id.badge, code)
        v.setInt(R.id.badge, "setBackgroundResource", bg)
        v.setTextColor(R.id.badge, fg)
        v.setTextViewText(
            R.id.label,
            when (p.state) { State.LIVE -> "กำลังแข่ง"; State.DONE -> "จบสุดสัปดาห์"; else -> "เริ่มอีก" },
        )

        v.show(R.id.timer, false)
        v.show(R.id.big, true)
        when (p.state) {
            // เลยเวลาเริ่มแล้วห้ามใช้ตัวนับ — จะนับติดลบต่อจาก 0
            State.LIVE -> big(v, "● LIVE", timerSize * 0.8f, GREEN)
            State.DONE -> big(v, "🏁 จบแล้ว", timerSize * 0.7f, WHITE)
            else -> {
                val d = daysLeft(target, now)
                if (d != null) {
                    // เกินวัน → "4 วัน 07 ชม." (ตัวนับของระบบนับชั่วโมงสะสม 100:30:00 อ่านไม่ออก)
                    val text = "${d.first} วัน ${"%02d".format(d.second)} ชม."
                    val sp = SpannableString(text)
                    for (unit in listOf("วัน", "ชม.")) {
                        val i = text.indexOf(unit)
                        sp.setSpan(RelativeSizeSpan(0.45f), i, i + unit.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        sp.setSpan(ForegroundColorSpan(DIM), i, i + unit.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    v.setTextViewText(R.id.big, sp)
                    v.sp(R.id.big, timerSize)
                    v.setTextColor(R.id.big, WHITE)
                } else {
                    // ไม่ถึงวัน → ตัวนับถอยหลังของระบบเดินเองทุกวินาที
                    v.show(R.id.big, false)
                    v.show(R.id.timer, true)
                    v.sp(R.id.timer, timerSize)
                    v.setChronometer(R.id.timer, SystemClock.elapsedRealtime() + (target - now), null, true)
                    v.setChronometerCountDown(R.id.timer, true)
                }
            }
        }
        v.setTextViewText(R.id.date, whenText(target, zone))
        v.sp(R.id.date, if (size == Size.LARGE) 12f else if (size == Size.MEDIUM) 11f else 10f)
    }

    private fun big(v: RemoteViews, text: String, size: Float, color: Int) {
        v.setTextViewText(R.id.big, text)
        v.sp(R.id.big, size)
        v.setTextColor(R.id.big, color)
    }

    private fun driverRow(ctx: Context, pos: Int, d: Driver, value: String?): RemoteViews =
        RemoteViews(ctx.packageName, R.layout.row_driver).apply {
            setTextViewText(R.id.pos, pos.toString())
            setInt(R.id.tick, "setColorFilter", team(d.constructorId))
            setTextViewText(R.id.code, d.code)
            setTextViewText(R.id.value, value ?: "")
        }

    private fun standings(ctx: Context, v: RemoteViews, top3: List<Driver>) {
        if (top3.isEmpty()) {
            v.show(R.id.list_box, false)
            return
        }
        v.setTextViewText(R.id.list_title, "ตารางคะแนน")
        v.removeAllViews(R.id.list)
        val leader = top3[0].points ?: 0
        top3.forEachIndexed { i, d ->
            val pts = d.points ?: 0
            v.addView(R.id.list, driverRow(ctx, i + 1, d, if (i == 0) "$pts" else "-${leader - pts}"))
        }
        v.setOnClickPendingIntent(R.id.list_box, open(ctx, "$SITE/standings"))
    }

    // หัวเล็ก ๆ มีแค่ธง — สนามที่แข่งจบแล้วต้องไม่ดูเป็นสนามหลักของ widget
    private fun podium(ctx: Context, v: RemoteViews, last: LastRace, title: Int, list: Int, box: Int) {
        v.setTextViewText(title, "ผลล่าสุด ${last.flag}")
        v.removeAllViews(list)
        last.podium.take(3).forEachIndexed { i, d -> v.addView(list, driverRow(ctx, i + 1, d, null)) }
        v.setOnClickPendingIntent(box, open(ctx, "$SITE/race/${last.round}"))
    }

    private fun sessionTable(ctx: Context, v: RemoteViews, p: Payload, now: Long, zone: ZoneId) {
        v.removeAllViews(R.id.sessions)
        val next = p.session?.startsAt
        for (s in p.sessions) {
            val done = s.endsAt <= now
            val isNext = s.startsAt == next
            v.addView(R.id.sessions, RemoteViews(ctx.packageName, R.layout.row_session).apply {
                setTextViewText(R.id.s_code, s.code)
                setTextColor(R.id.s_code, if (isNext) RED else if (done) FAINT else WHITE)
                setTextViewText(R.id.s_date, whenText(s.startsAt, zone))
                setTextColor(R.id.s_date, if (done) FAINT else if (isNext) WHITE else DIM)
                setTextViewText(R.id.s_check, if (done) "✓" else "")
            })
        }
    }

    /** ผังสนามเส้นแดง วาดเองจากจุด — ไม่ต้องโหลดรูป */
    private fun track(ctx: Context, v: RemoteViews, t: Track?, wDp: Int, hDp: Int) {
        if (t == null || t.pts.size < 6) {
            v.show(R.id.track, false)
            return
        }
        val d = ctx.resources.displayMetrics.density
        val w = (wDp * d).roundToInt()
        val h = (hDp * d).roundToInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val pad = 3 * d
        val k = min((w - pad * 2) / t.w, (h - pad * 2) / t.h)
        val ox = (w - t.w * k) / 2
        val oy = (h - t.h * k) / 2
        val path = Path()
        var i = 0
        while (i + 1 < t.pts.size) {
            val x = ox + t.pts[i] * k
            val y = oy + t.pts[i + 1] * k
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            i += 2
        }
        path.close()
        Canvas(bmp).drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = RED
            style = Paint.Style.STROKE
            strokeWidth = 2.5f * d
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
        })
        v.setImageViewBitmap(R.id.track, bmp)
    }

    /* ---------- ไม่มีสนามถัดไป / ยังไม่มีข้อมูล ---------- */

    private fun message(ctx: Context, p: Payload?, size: Size, offline: Boolean): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_message)
        v.setOnClickPendingIntent(R.id.root, open(ctx, SITE))
        stripe(v, p)
        v.setTextViewText(
            R.id.msg,
            when {
                p == null -> if (offline) "ต่อเน็ตไม่ได้ — จะลองใหม่เอง" else "กำลังโหลด…"
                p.state == State.SEASON_OVER -> "จบฤดูกาลแล้ว"
                else -> "ปฏิทิน ${p.season} ยังไม่ประกาศ"
            },
        )
        val last = p?.lastRace
        if (p != null && p.showPodium && last != null && size != Size.SMALL) {
            podium(ctx, v, last, R.id.list_title, R.id.list, R.id.list_box)
        } else {
            v.show(R.id.list_box, false)
        }
        return v
    }
}
