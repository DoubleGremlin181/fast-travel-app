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
class SettingsNavigationTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    @Test
    fun settingsHome_showsFlatFiveItems() {
        composeTestRule.onNodeWithText("Appearance").assertIsDisplayed()
        composeTestRule.onNodeWithText("Configuration").assertIsDisplayed()
        composeTestRule.onNodeWithText("Ignore list").assertIsDisplayed()
        composeTestRule.onNodeWithText("History").assertIsDisplayed()
        composeTestRule.onNodeWithText("About").assertIsDisplayed()
    }

    @Test
    fun configuration_showsExpectedItems() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Commands").assertIsDisplayed()
        composeTestRule.onNodeWithText("Groups").assertIsDisplayed()
        composeTestRule.onNodeWithText("Default Command").assertIsDisplayed()
        composeTestRule.onNodeWithText("Import / Export").assertIsDisplayed()
    }

    @Test
    fun importExport_screenLoads() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("Choose file…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }
}
