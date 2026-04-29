package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
    fun importExport_allThreeSectionsVisible() {
        navigateToImportExport()
        composeTestRule.onNodeWithText("Choose file…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
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
}
