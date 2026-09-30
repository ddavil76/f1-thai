package app.f1weekrace.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import app.f1weekrace.widget.model.Payload
import app.f1weekrace.widget.model.cardUrl
import app.f1weekrace.widget.model.alertPlan
import app.f1weekrace.widget.model.nextRefresh
import app.f1weekrace.widget.model.normalize
import app.f1weekrace.widget.model.parsePayload
import java.time.Instant
import java.time.ZoneId
import kotlin.concurrent.thread

/** จุดเดียวที่ดึงข้อมูล → วาดทุก widget → ตั้งรีเฟรชรอบหน้า → ตั้งแจ้งเตือน */
object Updater {
    private val lock = Any()

    /** ใช้ข้อมูลในเครื่องได้เลยถ้าเพิ่งดึงไม่ถึงนาที (onUpdate มาถี่ตอนวาง widget) */
    private const val FRESH_MS = 60_000L

    fun async(ctx: Context, fetch: Boolean, force: Boolean = false, done: () -> Unit = {}) {
        val app = ctx.applicationContext
        thread(name = "f1w-update") {
            try {
                run(app, fetch, force)
            } catch (e: Exception) {
                // widget ต้องไม่ทำให้แอปเด้ง — รอบหน้าค่อยลองใหม่
            } finally {
                done()
            }
        }
    }

    fun current(ctx: Context, now: Long = System.currentTimeMillis()): Payload? {
        val prefs = Prefs(ctx)
        val raw = prefs.payload?.let { runCatching { parsePayload(it) }.getOrNull() } ?: return null
        return normalize(raw, now, prefs.raceOnly)
    }

    private fun run(ctx: Context, fetch: Boolean, force: Boolean) = synchronized(lock) {
        val prefs = Prefs(ctx)
        if (fetch && (force || System.currentTimeMillis() - prefs.fetchedAt > FRESH_MS)) {
            val json = Api.fetch()
            // เช็คว่าอ่านได้ก่อนเก็บ — หน้า error ไม่ทับข้อมูลดีที่มีอยู่
            if (json != null && runCatching { parsePayload(json) }.isSuccess) {
                prefs.payload = json
                prefs.fetchedAt = System.currentTimeMillis()
                prefs.lastFetchFailed = false
            } else {
                prefs.lastFetchFailed = true
            }
        }

        val now = System.currentTimeMillis()
        val p = current(ctx, now)
        val mgr = AppWidgetManager.getInstance(ctx)
        val dark = ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        for (id in mgr.getAppWidgetIds(ComponentName(ctx, RaceWidget::class.java))) {
            val opts = mgr.getAppWidgetOptions(id)
            val size = Render.sizeOf(opts)
            val art = if (prefs.classic) null else art(ctx, p, size, opts, dark, now)
            mgr.updateAppWidget(id, Render.build(ctx, p, size, now, offline = prefs.lastFetchFailed, art = art, dark = dark))
        }
        Scheduler.scheduleRefresh(ctx, nextRefresh(p, now))
        Alerts.sync(ctx, if (prefs.alerts) alertPlan(p, now, prefs.raceOnly, ZoneId.systemDefault()) else emptyList())
    }

    /** รูปการ์ดสองชั้นของ widget นี้ — โหลดไม่ได้สักชั้น = null (ใช้หน้าตาแบบเดิม) */
    private fun art(ctx: Context, p: Payload?, size: Render.Size, o: Bundle, dark: Boolean, now: Long) = runCatching {
        // แนวตั้ง: กว้าง = MIN_WIDTH · สูง = MAX_HEIGHT (0 = launcher ไม่บอก ใช้ขนาดมาตรฐาน)
        val (dw, dh) = when (size) {
            Render.Size.SMALL -> 170 to 170
            Render.Size.MEDIUM -> 340 to 170
            Render.Size.LARGE -> 340 to 360
        }
        val w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH).takeIf { it > 0 } ?: dw
        val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT).takeIf { it > 0 } ?: dh
        val scale = minOf(ctx.resources.displayMetrics.density, 2.5f)
        val tz = ZoneId.systemDefault().rules.getOffset(Instant.ofEpochMilli(now)).totalSeconds / 60
        fun layer(name: String) =
            cardUrl(p, size.name.lowercase(), w, h, scale, dark, tz, name)?.let { CardCache.get(ctx, it) }
        val text = layer("text") ?: return@runCatching null
        val side = layer("side") ?: return@runCatching null
        Render.CardArt(text, side)
    }.getOrNull()
}
