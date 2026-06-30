package sh.kavi.fasttravel.localsearch.index

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

// Permission string constants declared as literals so [requiredPermissions] has
// no android.* dependency at runtime (pure, JVM-testable).

private const val PERM_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
private const val PERM_MEDIA_VIDEO  = "android.permission.READ_MEDIA_VIDEO"
private const val PERM_MEDIA_AUDIO  = "android.permission.READ_MEDIA_AUDIO"
private const val PERM_STORAGE      = "android.permission.READ_EXTERNAL_STORAGE"

/**
 * Returns the permissions required for local-file search at the given [sdkInt].
 *
 * API 33+ (Android 13): scoped media permissions (READ_MEDIA_IMAGES / VIDEO / AUDIO).
 * API ≤ 32:            READ_EXTERNAL_STORAGE (with maxSdkVersion="32" in the manifest).
 *
 * MANAGE_EXTERNAL_STORAGE is intentionally excluded (violates Play Store policy).
 *
 * Pure — no android.* runtime calls; testable on the JVM.
 */
fun requiredPermissions(sdkInt: Int): List<String> =
    if (sdkInt >= 33) {
        listOf(PERM_MEDIA_IMAGES, PERM_MEDIA_VIDEO, PERM_MEDIA_AUDIO)
    } else {
        listOf(PERM_STORAGE)
    }

/**
 * Returns true when all permissions required for local-file search are granted
 * on the current device. Uses [Build.VERSION.SDK_INT] to select the correct set.
 *
 * Requires [Context] — not unit-tested (verified on-device).
 */
fun hasLocalSearchPermission(context: Context): Boolean =
    requiredPermissions(Build.VERSION.SDK_INT).all { perm ->
        ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
    }
