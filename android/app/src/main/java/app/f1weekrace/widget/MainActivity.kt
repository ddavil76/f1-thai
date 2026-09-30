package app.f1weekrace.widget

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.CompoundButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import app.f1weekrace.widget.model.SITE
import app.f1weekrace.widget.model.hm
import app.f1weekrace.widget.model.whenText
import java.time.ZoneId
import kotlin.math.roundToInt

/** หน้าตั้งค่า — เพิ่ม widget, เปิด/ปิดแจ้งเตือน, นับถอยหลังเฉพาะเรซ */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var exact: Button
    private val dp by lazy { resources.displayMetrics.density }
    private fun px(v: Int) = (v * dp).roundToInt()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        prefs = Prefs(this)

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(20), px(24), px(20), px(32))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(0xff08080a.toInt())
            addView(col)
        }
        // Android 15 วาดใต้แถบสถานะ/แถบนำทางเสมอ — เว้นระยะเอง
        scroll.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }

        val title = SpannableString("F1 Week Race").apply {
            setSpan(ForegroundColorSpan(0xffe10600.toInt()), 3, 12, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        col.addView(text(title, 30f, Color.WHITE, bold = true))
        col.addView(text("นับถอยหลังซ้อม ควอลิฟาย และเรซ เวลาไทย บนหน้าจอโฮม", 14f, DIM).gap(4))

        status = text("", 14f, Color.WHITE).apply {
            setBackgroundResource(R.drawable.card)
            setPadding(px(16), px(14), px(16), px(14))
            setLineSpacing(0f, 1.25f)
        }
        col.addView(status.gap(20))

        col.addView(button("เพิ่ม widget ลงหน้าจอ", primary = true) { pin() }.gap(16))
        col.addView(
            text("หรือกดค้างที่ที่ว่างบนหน้าจอโฮม → วิดเจ็ต → F1 Week Race แล้วลากไปวาง · ยืดหดได้ แคบเป็นแบบเล็ก กว้างเป็นแบบกลาง กว้างและสูงเป็นแบบใหญ่", 13f, FAINT)
                .gap(8),
        )

        col.addView(section("ตั้งค่า").gap(28))
        col.addView(toggle("แจ้งเตือน 30 นาทีก่อนควอลิฟาย สปรินต์ และเรซ", prefs.alerts) { on ->
            prefs.alerts = on
            if (on) askNotifications()
            Updater.async(this, fetch = false)
        }.gap(8))
        col.addView(toggle("นับถอยหลังเฉพาะเรซ (ข้ามซ้อมและควอลิฟาย)", prefs.raceOnly) { on ->
            prefs.raceOnly = on
            Updater.async(this, fetch = false) { runOnUiThread { showStatus() } }
        }.gap(4))
        col.addView(toggle("หน้าตาแบบเดิม (ไม่ใช้ธีมการ์ด)", prefs.classic) { on ->
            prefs.classic = on
            Updater.async(this, fetch = false)
        }.gap(4))

        exact = button("ให้แจ้งเตือน/เปลี่ยนเป็น LIVE ตรงเวลาเป๊ะ", primary = false) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }
        }
        col.addView(exact.gap(12))
        col.addView(text("ไม่เปิดก็ใช้ได้ แต่อาจช้าไปไม่กี่นาที", 12f, FAINT).gap(4).also { hint -> exactHint = hint })

        col.addView(section("อื่น ๆ").gap(28))
        col.addView(button("อัปเดตข้อมูลตอนนี้", primary = false) {
            Toast.makeText(this, "กำลังอัปเดต…", Toast.LENGTH_SHORT).show()
            Updater.async(this, fetch = true, force = true) { runOnUiThread { showStatus() } }
        }.gap(8))
        col.addView(button("เปิดเว็บ F1 Week Race", primary = false) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SITE)))
        }.gap(8))
        val version = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull()
        col.addView(text("เวอร์ชัน ${version ?: "-"} · ไม่เกี่ยวข้องกับ Formula 1 อย่างเป็นทางการ", 11f, FAINT).apply {
            gravity = Gravity.CENTER
        }.gap(28))

        setContentView(scroll)
        if (prefs.alerts) askNotifications()
        Updater.async(this, fetch = true) { runOnUiThread { showStatus() } }
    }

    private var exactHint: View? = null

    override fun onResume() {
        super.onResume()
        showStatus()
        val need = !Scheduler.canExact(this)
        exact.visibility = if (need) View.VISIBLE else View.GONE
        exactHint?.visibility = exact.visibility
    }

    private fun showStatus() {
        if (isFinishing) return
        val zone = ZoneId.systemDefault()
        val p = Updater.current(this)
        val race = p?.race
        status.text = when {
            p == null -> if (prefs.lastFetchFailed) "ต่อเน็ตไม่ได้ — ลองกด \"อัปเดตข้อมูลตอนนี้\"" else "กำลังโหลดข้อมูล…"
            race == null -> "ไม่มีสนามถัดไปตอนนี้"
            else -> {
                val s = p.session
                val next = if (s != null) "${s.code} · ${whenText(s.startsAt, zone)}" else "จบสุดสัปดาห์แล้ว"
                val stamp = p.generatedAt?.let { "\nข้อมูลล่าสุด ↻${hm(it, zone)}" } ?: ""
                "สนามถัดไป ${race.flag} ${race.short.uppercase()}\n$next$stamp"
            }
        }
    }

    private fun pin() {
        val mgr = AppWidgetManager.getInstance(this)
        if (mgr.isRequestPinAppWidgetSupported) {
            mgr.requestPinAppWidget(ComponentName(this, RaceWidget::class.java), null, null)
        } else {
            Toast.makeText(this, "หน้าจอโฮมนี้เพิ่มจากแอปไม่ได้ — กดค้างที่หน้าจอโฮม → วิดเจ็ต", Toast.LENGTH_LONG).show()
        }
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Alerts.permitted(this)) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    /* ---------- ชิ้นส่วนหน้าจอ (ไม่ใช้ไลบรารีเสริม ให้แอปเล็กที่สุด) ---------- */

    private fun <T : View> T.gap(top: Int): T {
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = px(top) }
        return this
    }

    private fun text(s: CharSequence, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = s
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun section(s: String) = text(s, 13f, FAINT, bold = true)

    private fun button(label: String, primary: Boolean, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 15f
        setTextColor(Color.WHITE)
        setBackgroundResource(if (primary) R.drawable.btn_primary else R.drawable.btn_secondary)
        stateListAnimator = null
        minHeight = px(52)
        setOnClickListener { onClick() }
    }

    private fun toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit) = Switch(this).apply {
        text = label
        textSize = 15f
        setTextColor(Color.WHITE)
        isChecked = on
        setPadding(0, px(10), 0, px(10))
        setOnCheckedChangeListener { _: CompoundButton, checked: Boolean -> onChange(checked) }
    }

    companion object {
        private const val DIM = 0x8cffffff.toInt()
        private const val FAINT = 0x52ffffff
    }
}
