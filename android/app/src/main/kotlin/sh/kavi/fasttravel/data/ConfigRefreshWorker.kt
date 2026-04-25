package sh.kavi.fasttravel.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class ConfigRefreshWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = ThemePreferences(applicationContext)
        if (prefs.configSourceDirty) return Result.success()
        val repo = ConfigRepository(applicationContext)
        return if (repo.fetchFromGitHub() != null) Result.success() else Result.retry()
    }
}

object ConfigRefreshScheduler {
    const val WORK_NAME = "fast-travel-config-refresh"

    fun schedule(context: Context, interval: ConfigRefreshInterval) {
        val wm = WorkManager.getInstance(context)
        val hours = interval.hours
        if (hours == null) {
            wm.cancelUniqueWork(WORK_NAME)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<ConfigRefreshWorker>(hours, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()
        wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}
