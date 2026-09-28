package app.f1weekrace.widget

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import app.f1weekrace.widget.model.Alert

/** แจ้งเตือนก่อนแข่ง — ตั้งเป็น alarm ในเครื่อง ไม่ต้องมีเซิร์ฟเวอร์ส่ง push */
object Alerts {
    const val CHANNEL = "race_alerts"

    // แยกแต่ละแจ้งเตือนด้วย data URI (extras ไม่นับตอนเทียบ PendingIntent)
    private fun intent(ctx: Context, id: String) =
        Intent(ctx, AlertReceiver::class.java).setData(Uri.parse("f1w://alert/$id"))

    /** ตั้งตามแผนล่าสุด — ตัวเดิมที่ไม่อยู่ในแผนแล้ว (ตารางเปลี่ยน/ปิดแจ้งเตือน) ยกเลิกทิ้ง */
    fun sync(ctx: Context, plan: List<Alert>) {
        val prefs = Prefs(ctx)
        val am = ctx.getSystemService(AlarmManager::class.java)
        val keep = plan.map { it.id }.toSet()
        for (id in prefs.alertIds - keep) {
            PendingIntent.getBroadcast(ctx, 0, intent(ctx, id), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE)
                ?.let { am.cancel(it); it.cancel() }
        }
        val exact = Scheduler.canExact(ctx)
        for (a in plan) {
            val i = intent(ctx, a.id)
                .putExtra("title", a.title)
                .putExtra("body", a.body)
                .putExtra("url", a.url)
                .putExtra("at", a.at)
            val pi = PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            // ปลุกเครื่องได้ (RTC_WAKEUP) — แจ้งเตือนต้องเด้งแม้จอดับ
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, pi)
        }
        prefs.alertIds = keep
    }

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "เตือนก่อนแข่ง", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "30 นาทีก่อนควอลิฟาย สปรินต์ และเรซ"
                },
            )
        }
    }

    fun permitted(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}
