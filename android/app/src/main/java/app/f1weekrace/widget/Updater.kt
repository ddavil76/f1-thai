package app.f1weekrace.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import app.f1weekrace.widget.model.Payload
import app.f1weekrace.widget.model.alertPlan
import app.f1weekrace.widget.model.nextRefresh
import app.f1weekrace.widget.model.normalize
import app.f1weekrace.widget.model.parsePayload
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
        for (id in mgr.getAppWidgetIds(ComponentName(ctx, RaceWidget::class.java))) {
            val size = Render.sizeOf(mgr.getAppWidgetOptions(id))
            mgr.updateAppWidget(id, Render.build(ctx, p, size, now, offline = prefs.lastFetchFailed))
        }
        Scheduler.scheduleRefresh(ctx, nextRefresh(p, now))
        Alerts.sync(ctx, if (prefs.alerts) alertPlan(p, now, prefs.raceOnly, ZoneId.systemDefault()) else emptyList())
    }
}
