package app.f1weekrace.widget

import android.content.Context

/** ค่าที่เก็บในเครื่อง — ข้อมูลล่าสุดจากเว็บ (ใช้ต่อได้ตอนออฟไลน์) และการตั้งค่า */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("f1w", Context.MODE_PRIVATE)

    var payload: String?
        get() = sp.getString("payload", null)
        set(v) = sp.edit().putString("payload", v).apply()

    /** ดึงสำเร็จล่าสุดเมื่อไหร่ (0 = ไม่เคย) */
    var fetchedAt: Long
        get() = sp.getLong("fetchedAt", 0)
        set(v) = sp.edit().putLong("fetchedAt", v).apply()

    /** ดึงรอบล่าสุดพลาด (ไว้บอกผู้ใช้ตอนยังไม่เคยมีข้อมูลเลย) */
    var lastFetchFailed: Boolean
        get() = sp.getBoolean("lastFetchFailed", false)
        set(v) = sp.edit().putBoolean("lastFetchFailed", v).apply()

    /** นับถอยหลังเฉพาะเรซ */
    var raceOnly: Boolean
        get() = sp.getBoolean("raceOnly", false)
        set(v) = sp.edit().putBoolean("raceOnly", v).apply()

    /** แจ้งเตือนก่อนแข่ง (ค่าเริ่มต้นเปิด เหมือน iPhone) */
    var alerts: Boolean
        get() = sp.getBoolean("alerts", true)
        set(v) = sp.edit().putBoolean("alerts", v).apply()

    /** หน้าตาแบบเดิม (ไม่ใช้ธีมการ์ดที่โหลดรูปจากเว็บ) */
    var classic: Boolean
        get() = sp.getBoolean("classic", false)
        set(v) = sp.edit().putBoolean("classic", v).apply()

    /** id ของแจ้งเตือนที่ตั้งไว้ — รอบหน้าจะได้ยกเลิกตัวที่ไม่อยู่ในแผนใหม่ */
    var alertIds: Set<String>
        get() = sp.getStringSet("alertIds", emptySet()) ?: emptySet()
        set(v) = sp.edit().putStringSet("alertIds", v).apply()
}
