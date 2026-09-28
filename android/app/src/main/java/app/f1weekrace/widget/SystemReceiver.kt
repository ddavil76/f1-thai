package app.f1weekrace.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** เปิดเครื่อง / อัปเดตแอป / เปลี่ยนเวลาหรือเขตเวลา → ตั้ง alarm และวาด widget ใหม่ */
class SystemReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val done = goAsync()
        Updater.async(ctx, fetch = true) { done.finish() }
    }
}
