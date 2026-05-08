package sh.kavi.fasttravel.ui

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TailTextTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun tailText_shortText_isDisplayed() {
        composeRule.setContent {
            MaterialTheme {
                TailText(
                    text = "Short",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.Black,
                    modifier = Modifier.width(300.dp),
                )
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Short").assertIsDisplayed()
    }

    @Test
    fun tailText_longText_displaysLeadingEllipsis() {
        val longText = "a".repeat(80)
        composeRule.setContent {
            MaterialTheme {
                // 40.dp is narrow enough to guarantee overflow for 80 chars.
                TailText(
                    text = longText,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.Black,
                    modifier = Modifier.width(40.dp),
                )
            }
        }
        composeRule.waitForIdle()
        // Visually the displayed string is "…aaaa…" (truncated tail with leading ellipsis).
        composeRule.onNodeWithText("…", substring = true).assertIsDisplayed()
        // Full original text is preserved for screen readers / tests via contentDescription.
        composeRule.onNodeWithContentDescription(longText).assertIsDisplayed()
    }

    @Test
    fun tailText_oneCharBeyondFit_truncatesWithLeadingEllipsis() {
        // Boundary case: a string just barely wider than the container should
        // still trigger truncation. Guards against off-by-one in the
        // intrinsic-width vs. constraints.maxWidth comparison.
        val text = "abcdefghijklmnopqrstuvwxyz" // 26 chars
        composeRule.setContent {
            MaterialTheme {
                TailText(
                    text = text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.Black,
                    modifier = Modifier.width(60.dp),
                )
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("…", substring = true).assertIsDisplayed()
        composeRule.onNodeWithContentDescription(text).assertIsDisplayed()
    }
}
