package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.data.AutoIgnoreStore

class EffectiveIgnoreListTest {

    private fun c(count: Int, dni: Boolean = false) =
        AutoIgnoreStore.Candidate(count = count, doNotIgnore = dni)

    @Test
    fun `permanent entries are always included`() {
        assertEquals(
            listOf("cat"),
            effectiveIgnoreList(
                permanent = listOf("cat"),
                candidates = emptyMap(),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `candidate at or above threshold is included`() {
        assertEquals(
            listOf("fcb"),
            effectiveIgnoreList(
                permanent = emptyList(),
                candidates = mapOf("fcb" to c(count = 3)),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `candidate below threshold is excluded`() {
        assertEquals(
            emptyList<String>(),
            effectiveIgnoreList(
                permanent = emptyList(),
                candidates = mapOf("fcb" to c(count = 2)),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `do-not-ignore candidate is excluded regardless of count`() {
        assertEquals(
            emptyList<String>(),
            effectiveIgnoreList(
                permanent = emptyList(),
                candidates = mapOf("fcb" to c(count = 10, dni = true)),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `permanent wins even if also flagged DNI as candidate`() {
        assertEquals(
            listOf("fcb"),
            effectiveIgnoreList(
                permanent = listOf("fcb"),
                candidates = mapOf("fcb" to c(count = 10, dni = true)),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `result is lowercase and deduplicated`() {
        assertEquals(
            listOf("cat"),
            effectiveIgnoreList(
                permanent = listOf("CAT", "cat"),
                candidates = mapOf("cat" to c(count = 5, dni = false)),
                threshold = 3,
            ),
        )
    }

    @Test
    fun `empty inputs return empty list`() {
        assertEquals(
            emptyList<String>(),
            effectiveIgnoreList(
                permanent = emptyList(),
                candidates = emptyMap(),
                threshold = 3,
            ),
        )
    }
}
