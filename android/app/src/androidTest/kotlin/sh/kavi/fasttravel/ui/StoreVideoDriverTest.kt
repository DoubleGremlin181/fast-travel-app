package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * NOT an assertion test — this is a *driver* for android/tools/record-store-video.sh,
 * which runs `adb screenrecord` while this test plays out a fast-paced demo of the
 * search bar. It types each command char-by-char (so typing is visibly animated and
 * the live suggestions / matched-command chip update on screen), lingers, then fires
 * the search so the real destination opens in the system browser, and presses BACK to
 * return to a fresh search field for the next scenario.
 *
 * Char-by-char `performTextInput` is deliberate: `adb shell input text` silently drops
 * characters on some IMEs (see memory feedback_android_test_setup), and Compose input
 * keeps the on-screen dropdown in sync frame-by-frame.
 */
@RunWith(AndroidJUnit4::class)
class StoreVideoDriverTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<SearchActivity>()

    private val device: UiDevice
        get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private val pkg: String
        get() = InstrumentationRegistry.getInstrumentation().targetContext.packageName

    // Web-resolving commands only — a bare AVD has no YouTube/Spotify apps, and these
    // all open the system browser cleanly. The r/…search and qq… clips from the browser
    // montage can be appended here if the 180s screenrecord budget allows.
    private val scenarios = listOf(
        "g mechanical keyboards",
        "ddg mechanical keyboards",
        "r/mechanicalkeyboards",
        "gh facebook/react",
        "w machine learning",
        "\$TSLA",
    )

    @Test
    fun driveStoreVideo() {
        for (query in scenarios) {
            playScenario(query)
        }
        // Optional closing beat: surface the app's own "Did you mean?" typo card by
        // typing a near-miss of a known trigger, hold on it, then dismiss with BACK.
        playTypoBeat("gogle openai")
    }

    private fun playScenario(query: String) {
        val field = composeRule.onNode(hasSetTextAction())
        // Type one char at a time with a short pause so typing reads on camera and the
        // live dropdown / matched chip animate in.
        for (ch in query) {
            field.performTextInput(ch.toString())
            composeRule.waitForIdle()
            Thread.sleep(120)
        }
        // Hold on the suggestions / matched-command chip.
        Thread.sleep(800)

        // Fire the search (ImeAction.Go). The app navigates out to the browser.
        field.performImeAction()
        // Let the real destination settle on screen for the recording.
        Thread.sleep(2000)

        returnToApp()
    }

    private fun playTypoBeat(query: String) {
        val field = composeRule.onNode(hasSetTextAction())
        for (ch in query) {
            field.performTextInput(ch.toString())
            composeRule.waitForIdle()
            Thread.sleep(120)
        }
        // Hold on the "Did you mean?" card, then dismiss it (BACK -> dismissTypo()).
        Thread.sleep(1200)
        device.pressBack()
        composeRule.waitForIdle()
    }

    /**
     * Bring SearchActivity back to the foreground after a scenario navigated out to the
     * browser. SearchActivity is singleTask and clears the query on resume, so we land
     * on a fresh, focused, empty field. Retries BACK a couple of times in case a browser
     * "Open with" chooser sits in between.
     */
    private fun returnToApp() {
        val ours = androidx.test.uiautomator.By.pkg(pkg).depth(0)
        repeat(3) {
            if (device.hasObject(ours)) {
                composeRule.waitForIdle()
                return
            }
            device.pressBack()
            device.wait(Until.hasObject(ours), 2000)
        }
        composeRule.waitForIdle()
    }
}
