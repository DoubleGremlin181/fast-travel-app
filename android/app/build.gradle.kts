plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.github.triplet.play")
}

android {
    namespace = "sh.kavi.fasttravel"
    compileSdk = 36

    defaultConfig {
        applicationId = "sh.kavi.fasttravel"
        minSdk = 26
        targetSdk = 36
        versionCode = 15
        versionName = "2.1.8"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val signingStoreFile = System.getenv("SIGNING_STORE_FILE")
    if (signingStoreFile != null) {
        signingConfigs {
            create("release") {
                storeFile = file(signingStoreFile)
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")
                    ?: error("SIGNING_KEY_ALIAS must be set when SIGNING_STORE_FILE is set")
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
                    ?: error("SIGNING_KEY_PASSWORD must be set when SIGNING_STORE_FILE is set")
                storePassword = System.getenv("SIGNING_STORE_PASSWORD")
                    ?: error("SIGNING_STORE_PASSWORD must be set when SIGNING_STORE_FILE is set")
            }
        }
    }

    buildTypes {
        release {
            val releaseSigning = signingConfigs.findByName("release")
            if (releaseSigning != null) signingConfig = releaseSigning
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.07.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // ViewModel + Compose integration
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.9")

    // Image loading
    implementation("io.coil-kt:coil-compose:2.6.0")

    // Reorderable Lazy list (drag-to-reorder by long-press)
    implementation("sh.calvin.reorderable:reorderable:2.4.0")

    // WorkManager (scheduled config refresh)
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // org.json for config parsing (provided by Android SDK at runtime, needed for unit tests)
    testImplementation("org.json:json:20231013")

    // JUnit 5
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // JUnit 4 (required by Robolectric for AppearanceResolverTest)
    testImplementation("junit:junit:4.13.2")
    testRuntimeOnly("org.junit.vintage:junit-vintage-engine:5.11.0")

    // Robolectric (Android framework in JVM unit tests)
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.5.0")

    // Coroutines test (control the Main dispatcher / virtual time in ViewModel tests)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")

    // Instrumented tests (Compose UI testing)
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    // UiAutomator drives across app boundaries for the store-video recorder, which
    // navigates out to Chrome / Maps and returns. Only used by StoreVideoDriverTest.
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

play {
    serviceAccountCredentials.set(
        file(System.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") ?: "play-credentials.json")
    )
    // New Play accounts must complete closed testing (>=12 testers, 14 days)
    // before they can publish to `production`; use `internal` until eligible.
    track.set("internal")
    defaultToAppBundles.set(true)
}

tasks.withType<Test> {
    useJUnitPlatform()
}

// Sync the bundled assets from the canonical shared/config/ directory so the
// Android build can never drift from what the extension uses. Wired into
// preBuild so a stale local checkout won't compile against an older asset.
val sharedConfigDir = rootProject.file("../shared/config")
val bundledAssetsDir = layout.projectDirectory.dir("src/main/assets")

val syncSharedConfig = tasks.register<Copy>("syncSharedConfig") {
    description = "Copies shared/config/*.json into Android assets/."
    group = "build"
    from(sharedConfigDir) {
        include("default-config.json", "common-words.json")
    }
    into(bundledAssetsDir)
}

tasks.named("preBuild") {
    dependsOn(syncSharedConfig)
}
