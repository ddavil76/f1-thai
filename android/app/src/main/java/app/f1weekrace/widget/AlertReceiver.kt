package app.f1weekrace.widget

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import app.f1weekrace.widget.model.MINUTE

class AlertReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (!Prefs(ctx).alerts || !Alerts.permitted(ctx)) return
        // เครื่องปิดอยู่ตอนถึงเวลาแล้วมาเด้งทีหลัง — ช้าเกิน 30 นาทีคือ session เริ่มไปแล้ว ไม่ต้องเตือน
        val at = intent.getLongExtra("at", 0)
        if (at > 0 && System.currentTimeMillis() - at > 30 * MINUTE) return

        Alerts.ensureChannel(ctx)
        val id = intent.data?.lastPathSegment ?: "alert"
        val url = intent.getStringExtra("url") ?: app.f1weekrace.widget.model.SITE
        val open = PendingIntent.getActivity(
            ctx, id.hashCode(),
            Intent(Intent.ACTION_VIEW, Uri.parse(url)),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(ctx, Alerts.CHANNEL)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(0xffe10600.toInt())
            .setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("body"))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(id.hashCode(), n)
    }
}
