plugins {
    id("com.android.application")
}

val twaHost: String = (project.findProperty("twaHost") as String?) ?: "ailingo-ecru.vercel.app"

android {
    namespace = "hr.ailingo.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "hr.ailingo.app"
        minSdk = 24
        targetSdk = 36
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "1.0.0"

        manifestPlaceholders["hostName"] = twaHost
        manifestPlaceholders["defaultUrl"] = "https://$twaHost/learn"
        resValue("string", "host_name", twaHost)
        resValue(
            "string", "asset_statements",
            "[{\\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"https://$twaHost\\\"}}]",
        )
    }

    // Upload key for Google Play. Provide via environment variables; never commit the keystore.
    signingConfigs {
        create("release") {
            val ks = System.getenv("AILINGO_KEYSTORE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("AILINGO_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("AILINGO_KEY_ALIAS") ?: "upload"
                keyPassword = System.getenv("AILINGO_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (System.getenv("AILINGO_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    implementation("com.google.androidbrowserhelper:billing:1.2.0")
}
