import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.f1weekrace.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.f1weekrace.widget"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2"
    }

    // กุญแจเซ็นอยู่ในรีโป — APK ทุกรอบจาก CI เซ็นด้วยกุญแจเดียวกัน ติดตั้งทับของเดิมได้
    // (กุญแจ debug ที่ CI สร้างเองจะเปลี่ยนทุกรอบ ผู้ใช้ต้องลบแอปก่อนลงใหม่)
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // org.json ใน android.jar เป็นแค่ stub — เทสต์บนเครื่องธรรมดาต้องใช้ตัวจริง
    testImplementation("org.json:json:20240303")
}
