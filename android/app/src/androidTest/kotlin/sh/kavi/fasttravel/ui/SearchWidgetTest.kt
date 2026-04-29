package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SearchWidgetTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SearchActivity>()

    @Test
    fun searchActivity_loadsWithoutCrash() {
        composeTestRule.waitForIdle()
        // The search bar placeholder is visible whenever the text field is empty,
        // which is always the case on a fresh launch of SearchActivity.
        composeTestRule.onNodeWithText("Search or type a command…").assertIsDisplayed()
    }
}
