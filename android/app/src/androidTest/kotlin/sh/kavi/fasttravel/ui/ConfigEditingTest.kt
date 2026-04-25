package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import sh.kavi.fasttravel.data.ConfigRefreshInterval
import sh.kavi.fasttravel.data.ThemePreferences

@RunWith(AndroidJUnit4::class)
class ConfigEditingTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    private lateinit var themePrefs: ThemePreferences

    @Before
    fun setup() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        themePrefs = ThemePreferences(ctx)
        themePrefs.configSourceDirty = false
        themePrefs.configRefreshInterval = ConfigRefreshInterval.DAILY
    }

    @Test
    fun importExportStatus_showsPausedWhenDirty() {
        themePrefs.configSourceDirty = true
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("auto-refresh paused", substring = true).assertIsDisplayed()
    }

    @Test
    fun importExportStatus_showsSyncedWhenClean() {
        themePrefs.configSourceDirty = false
        themePrefs.configUrl = "https://example.com/config.json"
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("Synced from", substring = true).assertIsDisplayed()
    }

    @Test
    fun exportConfig_buttonPresent() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }

    @Test
    fun addIgnoreWord_setsDirtyFlag() {
        composeTestRule.onNodeWithText("Ignore list").performClick()
        composeTestRule.onNodeWithText("Add a term…").performTextInput("testword")
        composeTestRule.onNodeWithText("Add a term…").performClick()
        composeTestRule.waitForIdle()
        assert(themePrefs.configSourceDirty) { "Expected dirty flag to be true after adding ignore word" }
    }
}
