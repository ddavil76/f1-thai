package app.f1weekrace.widget

import app.f1weekrace.widget.model.SITE
import java.net.HttpURLConnection
import java.net.URL

object Api {
    /** ข้อมูลชุดเดียวกับ widget iPhone · null = ต่อไม่ได้/เว็บตอบ error */
    fun fetch(): String? {
        var c: HttpURLConnection? = null
        return try {
            c = URL("$SITE/api/widget").openConnection() as HttpURLConnection
            c.connectTimeout = 8_000
            c.readTimeout = 8_000
            c.setRequestProperty("Accept", "application/json")
            if (c.responseCode != 200) null else c.inputStream.bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            null
        } finally {
            c?.disconnect()
        }
    }
}
