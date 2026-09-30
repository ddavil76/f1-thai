package app.f1weekrace.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * รูปการ์ดจากเว็บ — เก็บในเครื่องตาม URL (รูปเดิมไม่ต้องโหลดซ้ำทุกรอบรีเฟรช)
 * null = โหลดไม่ได้ → widget ใช้หน้าตาแบบเดิม
 */
object CardCache {
    private const val KEEP = 12

    fun get(ctx: Context, url: String): Bitmap? {
        val dir = File(ctx.cacheDir, "cards").apply { mkdirs() }
        val file = File(dir, "%08x.png".format(url.hashCode()))
        if (file.exists()) BitmapFactory.decodeFile(file.path)?.let { return it }
        val bytes = download(url) ?: return null
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        runCatching {
            file.writeBytes(bytes)
            dir.listFiles()?.sortedBy { it.lastModified() }?.dropLast(KEEP)?.forEach { it.delete() }
        }
        return bmp
    }

    private fun download(url: String): ByteArray? {
        var c: HttpURLConnection? = null
        return try {
            c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            if (c.responseCode != 200 || c.contentType?.startsWith("image/") != true) null
            else c.inputStream.use { it.readBytes() }
        } catch (e: Exception) {
            null
        } finally {
            c?.disconnect()
        }
    }
}
