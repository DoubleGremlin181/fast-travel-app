package sh.kavi.fasttravel.ui

import android.content.Intent
import android.net.Uri
import android.view.KeyEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Test
import org.junit.runner.RunWith

/**
 * NOT an assertion test — this is a *driver* for android/tools/record-store-video.sh,
 * which runs `adb screenrecord` while this test plays out a fast-paced demo of the
 * search bar for the Play Store listing.
 *
 * It shows real, end-to-end usage: type a command char-by-char (so typing animates and
 * the live suggestions / matched-command chip update on screen), then submit so the app
 * **navigates out to the real destination**, holds there, and returns for the next
 * command. Destinations (when the matching apps are installed + app-links pointed at
 * them — see android/tools/record-store-video.sh and the APP-SETUP notes there):
 *   yt -> YouTube app,  w -> Wikipedia app,  mp -> Google Maps app,
 *   g/ddg/r//gh/$ -> Chrome.
 * Closes on the in-app "Did you mean?" typo card. The scenario list matches the browser
 * recorder (extension/scripts/record-store-video.mjs) so both store videos show the same
 * searches.
 *
 * Driven entirely through UiAutomator (works across app boundaries; Compose test rules
 * throw "No compose hierarchies found" once we round-trip through another app). The search
 * field is a Compose BasicTextField, surfaced to the a11y tree as an EditText. Typing uses
 * Instrumentation.sendStringSync (key-event injection — not `adb shell input text`, which
 * drops characters; see memory feedback_android_test_setup); submit is a hardware ENTER,
 * which a single-line field maps to the IME "Go" action -> onSearch.
 *
 * Search history is cleared before every scenario so the focused-empty state never shows
 * "Recent" entries from earlier scenarios or a previous recording run.
 *
 * [prepareExternalApps] runs first and clicks through the one-time first-run promos of
 * Chrome / Maps / YouTube / Wikipedia. The capture script only starts screenrecord once
 * *our* app is foreground, so this warm-up happens off-camera.
 */
@RunWith(AndroidJUnit4::class)
class StoreVideoDriverTest {

    private val instr get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instr)
    private val pkg: String get() = instr.targetContext.packageName

    /** query + how long (pre-speed) to dwell on the destination it opens. */
    private data class Scn(val query: String, val dwellMs: Long = 3500)

    // Same lookup several ways (g → ddg → r/ → r/ search), then varied commands. yt/w/mp
    // open native apps; the rest open Chrome. Mirrors the browser recorder's list/order.
    private val scenarios = listOf(
        Scn("g mechanical keyboards"),
        Scn("ddg mechanical keyboards"),
        Scn("r/mechanicalkeyboards"),
        Scn("r/mechanicalkeyboards best keyboard under \$250"),
        Scn("yt lofi hip hop radio", dwellMs = 7000),   // -> YouTube app (slow first paint)
        Scn("w machine learning", dwellMs = 4500),      // -> Wikipedia app
        Scn("gh facebook/react"),                       // -> Chrome (GitHub app needs login)
        Scn("mp coffee near me", dwellMs = 8000),       // -> Maps app (software-GL tiles)
        Scn("\$TSLA", dwellMs = 4000),                   // -> Chrome (Yahoo Finance)
    )

    // Near-miss of the real "ddg" trigger (distance 1) — surfaces the "Did you mean ddg?"
    // card in-app, on-theme with the keyboards thread.
    private val typoQuery = "ddh mechanical keyboards"

    private val charDelayMs = 88L
    private val suggestionsHoldMs = 1100L
    private val typoHoldMs = 2800L
    private val initialSettleMs = 800L

    @Test
    fun driveStoreVideo() {
        prepareExternalApps()  // off-camera (the script records only once our app is up)

        for (s in scenarios) {
            launchApp()
            typeOut(s.query)
            Thread.sleep(suggestionsHoldMs)
            submit()                 // navigates out to the app / Chrome
            Thread.sleep(s.dwellMs)  // hold on the destination
        }

        // Closing beat: the in-app "Did you mean?" typo card (submit stays in-app here).
        launchApp()
        typeOut(typoQuery)
        submit()                     // onSearch -> TypoSuggestion (no navigation)
        Thread.sleep(typoHoldMs)
        clearField()                 // dismiss (onQueryChanged -> Idle)
        Thread.sleep(500)
    }

    /** Bring SearchActivity to the foreground (fresh, focused, empty field on resume). */
    private fun launchApp() {
        clearHistory()  // before resume, so the empty state shows no "Recent"
        instr.targetContext.startActivity(
            Intent()
                .setClassName(pkg, "$pkg.ui.SearchActivity")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
        device.wait(Until.hasObject(fieldSelector()), 5000)
        Thread.sleep(initialSettleMs)
    }

    private fun clearHistory() {
        // Same prefs the app's SearchHistory uses (fast_travel_history / search_history).
        instr.targetContext
            .getSharedPreferences("fast_travel_history", 0)
            .edit().remove("search_history").commit()
    }

    // The Compose search field exposes itself to the a11y tree as an EditText.
    private fun fieldSelector(): BySelector = By.clazz("android.widget.EditText").pkg(pkg)
    private fun fieldObj(): UiObject2? = device.wait(Until.findObject(fieldSelector()), 5000)

    private fun typeOut(query: String) {
        fieldObj()?.click()
        device.waitForIdle()
        for (ch in query) {
            instr.sendStringSync(ch.toString())  // key-event injection to the focused field
            Thread.sleep(charDelayMs)
        }
    }

    /** Hardware ENTER -> IME "Go" on the single-line field -> onSearch (navigate / typo card). */
    private fun submit() {
        instr.sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER)
    }

    private fun clearField() {
        fieldObj()?.text = ""
        device.waitForIdle()
    }

    /**
     * Click through the one-time first-run promos of Chrome / Maps / YouTube / Wikipedia
     * so the recorded navigations land on clean content. Best-effort: each label/icon is
     * dismissed if present. Opening youtube.com / wikipedia.org here also exercises their
     * app-links (so they open in-app, not Chrome) once during warm-up.
     */
    private fun prepareExternalApps() {
        // Use the SAME queries the demo will use, so an app that reopens to its last
        // search shows consistent content (not a stale "warmup" query) on camera.
        openUrl("https://www.google.com/search?q=mechanical+keyboards")  // Chrome
        repeat(3) { dismiss("No thanks", "NO THANKS", "Got it", "GOT IT", "Continue") }
        openUrl("https://maps.google.com/?q=coffee+near+me")            // Maps app
        repeat(3) { dismiss("SKIP", "Skip", "No thanks", "Got it") }
        openUrl("https://www.youtube.com/results?search_query=lofi+hip+hop+radio")  // YouTube
        repeat(3) { dismiss("Skip", "No thanks", "Not now", "NO THANKS", "Got it") }
        openUrl("https://en.wikipedia.org/wiki/Machine_learning")       // Wikipedia app
        repeat(2) { dismiss("Got it", "GOT IT", "No thanks") }
        dismissDesc("Close", "Dismiss", "Navigate up")  // close the "Wikipedia games" dialog
        device.pressHome()
        device.waitForIdle()
    }

    private fun openUrl(url: String) {
        instr.targetContext.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        Thread.sleep(4500)  // apps are slow to first paint on the headless emulator
        device.waitForIdle()
    }

    /** Click the first on-screen label from [labels]; quietly no-op otherwise. */
    private fun dismiss(vararg labels: String) {
        for (label in labels) {
            val obj = device.findObject(By.text(label)) ?: continue
            obj.click(); device.waitForIdle(); Thread.sleep(500); return
        }
    }

    /** Click the first on-screen element matching one of [descs] (content-description). */
    private fun dismissDesc(vararg descs: String) {
        for (d in descs) {
            val obj = device.findObject(By.desc(d)) ?: continue
            obj.click(); device.waitForIdle(); Thread.sleep(500); return
        }
    }
}
