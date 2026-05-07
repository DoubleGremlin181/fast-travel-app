package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ImportExportTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    private fun navigateToImportExport() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
    }

    @Test
    fun urlImport_urlFieldAcceptsTypedInput() {
        navigateToImportExport()
        // The "Config URL" OutlinedTextField should accept typed text and display it.
        val testUrl = "https://example.com/config.json"
        composeTestRule.onNodeWithText("Config URL").performClick()
        composeTestRule.onNodeWithText("Config URL").performTextInput(testUrl)
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText(testUrl).assertIsDisplayed()
    }

    @Test
    fun urlImport_emptyUrl_fetchButtonStillDisplayed() {
        navigateToImportExport()
        // Click "Fetch & Import" with no URL in the field; the button is a no-op
        // when the URL is empty (returns early), so the screen should not crash.
        composeTestRule.onNodeWithText("Fetch & Import").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
    }

    @Test
    fun export_buttonTappable_doesNotCrash() {
        navigateToImportExport()
        // Tapping "Export config" fires the system file-picker intent via the
        // activity callback; the screen itself should remain visible afterwards.
        composeTestRule.onNodeWithText("Export config").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }

    // TODO: Add an instrumented test that verifies SettingsActivity is NOT finished
    // when the SAF file-picker is open (isLauncherPending == true guards onStop).
    // This requires intercepting the ActivityResultLauncher or using a custom
    // ActivityResultRegistry to simulate the launcher lifecycle without a real device
    // file picker. Unit tests cannot cover this because it depends on Activity
    // lifecycle callbacks fired by the Android framework.
}
