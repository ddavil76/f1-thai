package app.f1weekrace.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object Scheduler {
    fun canExact(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ctx.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    private fun tick(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 1,
        Intent(ctx, RaceWidget::class.java).setAction(RaceWidget.ACTION_TICK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /**
     * รีเฟรชรอบหน้า — ใช้ RTC (ไม่ปลุกเครื่อง): จอดับอยู่ไม่มีใครดู widget
     * พอเปิดจอ alarm ที่เลยเวลามาแล้วจะทำงานทันที ประหยัดแบตกว่าปลุกทุกครึ่งชั่วโมง
     */
    fun scheduleRefresh(ctx: Context, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        if (canExact(ctx)) am.setExact(AlarmManager.RTC, at, tick(ctx)) else am.set(AlarmManager.RTC, at, tick(ctx))
    }
}
