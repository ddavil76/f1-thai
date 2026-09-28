package app.f1weekrace.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

class RaceWidget : AppWidgetProvider() {
    companion object {
        const val ACTION_TICK = "app.f1weekrace.widget.TICK"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == ACTION_TICK) {
            val done = goAsync()
            Updater.async(ctx, fetch = true) { done.finish() }
        } else {
            super.onReceive(ctx, intent)
        }
    }

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val done = goAsync()
        Updater.async(ctx, fetch = true) { done.finish() }
    }

    // ปรับขนาด → เปลี่ยนแบบเล็ก/กลาง/ใหญ่ ไม่ต้องดึงข้อมูลใหม่
    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) {
        val done = goAsync()
        Updater.async(ctx, fetch = false) { done.finish() }
    }
}
