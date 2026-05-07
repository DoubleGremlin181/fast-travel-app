# WorkManager instantiates CoroutineWorker subclasses by class name via reflection.
# work-runtime ships its own consumer rules, but this is belt-and-suspenders.
-keep class sh.kavi.fasttravel.data.ConfigRefreshWorker { *; }

# org.json is part of the Android SDK at runtime (not bundled in the APK).
# Suppress R8 notes about these references.
-dontnote org.json.**
