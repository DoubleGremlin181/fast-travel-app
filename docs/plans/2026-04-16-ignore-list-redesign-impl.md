# Ignore List Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the Ignore List feature around a clean two-store model (permanent entries + auto-ignore candidates with `{count, doNotIgnore}`), a read-time `effectiveIgnoreList` filter, and a two-section Settings screen with actions behind a gesture. Parity between Android and the browser extension.

**Architecture:** The parser's input keeps the same `ignoreList: string[]` shape — it's computed at read time from `config.ignoreList ∪ { trigger | candidates[trigger].count ≥ threshold AND !doNotIgnore }`. The typo card's three actions become the only writers to the candidate store (increment on "search as typed", decrement on "accept correction", demote to permanent on "add to ignore list"). Settings manages both stores independently. No snackbars; the list redraws itself as feedback.

**Tech Stack:** Kotlin + Jetpack Compose (Android), TypeScript + Chrome storage + vanilla DOM (extension), shared JSON test fixtures under `shared/test-fixtures/`.

**Design reference:** `docs/plans/2026-04-16-ignore-list-redesign-design.md`.

**Important operational notes:**
- **Do NOT commit.** The project isn't a git repo. Skip every `git add`/`git commit` step. "Commit" in the task list below is shorthand for "end of a TDD cycle; move on".
- The device under test is a physical phone reachable over wifi (`adb devices` already shows it). Android install target: `./gradlew :app:installDebug`.
- Extension tests: `cd extension && npm run test` (vitest, 119 existing tests must stay green).
- Android tests: `cd android && ./gradlew :app:testDebugUnitTest` (~82 existing tests must stay green).

---

## Phase A — Android storage + data model

### Task 1: Extend `AutoIgnoreStore` with `doNotIgnore` flag and candidate CRUD

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/AutoIgnoreStore.kt`
- Test: `android/app/src/test/kotlin/sh/kavi/fasttravel/data/AutoIgnoreStoreTest.kt` (create)

**Step 1: Write failing test**

Create `android/app/src/test/kotlin/sh/kavi/fasttravel/data/AutoIgnoreStoreTest.kt`:

```kotlin
package sh.kavi.fasttravel.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.robolectric.RobolectricExtension

@ExtendWith(RobolectricExtension::class)
class AutoIgnoreStoreTest {

    private lateinit var store: AutoIgnoreStore

    @BeforeEach
    fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        ctx.getSharedPreferences("fast_travel_auto_ignore", 0).edit().clear().commit()
        store = AutoIgnoreStore(ctx)
    }

    @Test fun `increment creates candidate with count 1 and default flag`() {
        store.increment("fcb")
        val all = store.all()
        assertEquals(1, all.size)
        assertEquals(1, all["fcb"]?.count)
        assertFalse(all["fcb"]!!.doNotIgnore)
    }

    @Test fun `increment increases existing count`() {
        store.increment("fcb"); store.increment("fcb"); store.increment("fcb")
        assertEquals(3, store.countOf("fcb"))
    }

    @Test fun `decrement decreases count`() {
        store.increment("fcb"); store.increment("fcb")
        store.decrement("fcb")
        assertEquals(1, store.countOf("fcb"))
    }

    @Test fun `decrement to zero removes the candidate`() {
        store.increment("fcb")
        store.decrement("fcb")
        assertEquals(0, store.countOf("fcb"))
        assertTrue(store.all().isEmpty())
    }

    @Test fun `decrement on missing trigger is a no-op`() {
        store.decrement("never-seen")
        assertTrue(store.all().isEmpty())
    }

    @Test fun `setDoNotIgnore persists the flag and preserves count`() {
        store.increment("fcb"); store.increment("fcb")
        store.setDoNotIgnore("fcb", true)
        assertEquals(2, store.countOf("fcb"))
        assertTrue(store.isDoNotIgnore("fcb"))
    }

    @Test fun `remove deletes both count and flag`() {
        store.increment("fcb"); store.setDoNotIgnore("fcb", true)
        store.remove("fcb")
        assertEquals(0, store.countOf("fcb"))
        assertFalse(store.isDoNotIgnore("fcb"))
    }

    @Test fun `clearAll wipes every candidate`() {
        store.increment("fcb"); store.increment("uk"); store.setDoNotIgnore("fcb", true)
        store.clearAll()
        assertTrue(store.all().isEmpty())
    }

    @Test fun `case is normalized to lowercase`() {
        store.increment("FcB")
        assertEquals(1, store.countOf("fcb"))
    }
}
```

**Step 2: Run test — expect FAIL**

```
cd android && ./gradlew :app:testDebugUnitTest --tests "sh.kavi.fasttravel.data.AutoIgnoreStoreTest"
```

Expected: FAIL on missing methods (`countOf`, `setDoNotIgnore`, `isDoNotIgnore`, `remove`, `decrement`, `clearAll`, and `all()` signature change).

**Step 3: Rewrite `AutoIgnoreStore.kt`**

```kotlin
package sh.kavi.fasttravel.data

import android.content.Context
import android.content.SharedPreferences

/** Per-device store of auto-ignore candidates and their DNI (do-not-ignore) flag.
 *  Independent of `config.ignoreList` (the permanent list). */
class AutoIgnoreStore(context: Context) {

    data class Candidate(val count: Int, val doNotIgnore: Boolean)

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, 0)

    fun increment(trigger: String): Int {
        val key = COUNT_PREFIX + trigger.lowercase()
        val next = prefs.getInt(key, 0) + 1
        prefs.edit().putInt(key, next).apply()
        return next
    }

    /** Decrements by 1; removes the candidate when count reaches 0. */
    fun decrement(trigger: String) {
        val t = trigger.lowercase()
        val countKey = COUNT_PREFIX + t
        val current = prefs.getInt(countKey, 0)
        if (current <= 0) return
        val next = current - 1
        if (next == 0) {
            prefs.edit()
                .remove(countKey)
                .remove(DNI_PREFIX + t)
                .apply()
        } else {
            prefs.edit().putInt(countKey, next).apply()
        }
    }

    fun countOf(trigger: String): Int =
        prefs.getInt(COUNT_PREFIX + trigger.lowercase(), 0)

    fun isDoNotIgnore(trigger: String): Boolean =
        prefs.getBoolean(DNI_PREFIX + trigger.lowercase(), false)

    fun setDoNotIgnore(trigger: String, value: Boolean) {
        val key = DNI_PREFIX + trigger.lowercase()
        prefs.edit().apply {
            if (value) putBoolean(key, true) else remove(key)
        }.apply()
    }

    /** Delete both count and DNI for this trigger. */
    fun remove(trigger: String) {
        val t = trigger.lowercase()
        prefs.edit()
            .remove(COUNT_PREFIX + t)
            .remove(DNI_PREFIX + t)
            .apply()
    }

    /** Wipe every candidate. Used by "Reset all counts". */
    fun clearAll() {
        val editor = prefs.edit()
        for (k in prefs.all.keys) {
            if (k.startsWith(COUNT_PREFIX) || k.startsWith(DNI_PREFIX)) {
                editor.remove(k)
            }
        }
        editor.apply()
    }

    /** Snapshot of all candidates, keyed by lowercase trigger. */
    fun all(): Map<String, Candidate> {
        val counts = mutableMapOf<String, Int>()
        val flags = mutableMapOf<String, Boolean>()
        for ((k, v) in prefs.all) {
            when {
                k.startsWith(COUNT_PREFIX) && v is Int -> counts[k.removePrefix(COUNT_PREFIX)] = v
                k.startsWith(DNI_PREFIX) && v is Boolean -> flags[k.removePrefix(DNI_PREFIX)] = v
            }
        }
        return counts.mapValues { (t, c) -> Candidate(count = c, doNotIgnore = flags[t] ?: false) }
    }

    private companion object {
        const val PREFS_NAME = "fast_travel_auto_ignore"
        const val COUNT_PREFIX = "ignore_count_"
        const val DNI_PREFIX = "ignore_dni_"
    }
}
```

**Step 4: Verify Robolectric is available**

Check `android/app/build.gradle.kts` for `testImplementation("org.robolectric:robolectric:...")`. If missing, add it to `dependencies {}`. Most Android projects have it; if not, check what the project uses for Android-context unit tests and adapt (`AutoIgnoreStoreTest` needs a working `Context`, so either Robolectric or a mock).

If Robolectric truly isn't present, replace the Robolectric-based test with one that wraps the store in a small interface and provides a fake `SharedPreferences`. Fine either way — the point is to cover the CRUD.

**Step 5: Run test — expect PASS**

```
cd android && ./gradlew :app:testDebugUnitTest --tests "sh.kavi.fasttravel.data.AutoIgnoreStoreTest"
```

Expected: all 9 tests pass.

**Step 6: Run full Android test suite to confirm no regressions**

```
./gradlew :app:testDebugUnitTest
```

Expected: all existing (~82) + 9 new tests pass.

---

### Task 2: Add `effectiveIgnoreList` helper

**Files:**
- Create: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/EffectiveIgnoreList.kt`
- Test: `android/app/src/test/kotlin/sh/kavi/fasttravel/core/EffectiveIgnoreListTest.kt` (create)

**Step 1: Write failing test**

```kotlin
package sh.kavi.fasttravel.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import sh.kavi.fasttravel.data.AutoIgnoreStore

class EffectiveIgnoreListTest {

    private fun c(count: Int, dni: Boolean = false) = AutoIgnoreStore.Candidate(count, dni)

    @Test fun `permanent entries are always included`() {
        val out = effectiveIgnoreList(
            permanent = listOf("cat"),
            candidates = emptyMap(),
            threshold = 3,
        )
        assertEquals(setOf("cat"), out.toSet())
    }

    @Test fun `candidate at or above threshold is included`() {
        val out = effectiveIgnoreList(
            permanent = emptyList(),
            candidates = mapOf("fcb" to c(3)),
            threshold = 3,
        )
        assertEquals(setOf("fcb"), out.toSet())
    }

    @Test fun `candidate below threshold is excluded`() {
        val out = effectiveIgnoreList(
            permanent = emptyList(),
            candidates = mapOf("fcb" to c(2)),
            threshold = 3,
        )
        assertEquals(emptySet<String>(), out.toSet())
    }

    @Test fun `do-not-ignore candidate is excluded regardless of count`() {
        val out = effectiveIgnoreList(
            permanent = emptyList(),
            candidates = mapOf("fcb" to c(99, dni = true)),
            threshold = 3,
        )
        assertEquals(emptySet<String>(), out.toSet())
    }

    @Test fun `permanent wins even if also flagged DNI as candidate`() {
        val out = effectiveIgnoreList(
            permanent = listOf("fcb"),
            candidates = mapOf("fcb" to c(5, dni = true)),
            threshold = 3,
        )
        assertEquals(setOf("fcb"), out.toSet())
    }

    @Test fun `result is lowercase and deduplicated`() {
        val out = effectiveIgnoreList(
            permanent = listOf("CAT", "cat"),
            candidates = mapOf("cat" to c(5)),
            threshold = 3,
        )
        assertEquals(setOf("cat"), out.toSet())
    }
}
```

**Step 2: Run — expect FAIL** (`effectiveIgnoreList` doesn't exist).

```
./gradlew :app:testDebugUnitTest --tests "*EffectiveIgnoreListTest*"
```

**Step 3: Implement**

Create `android/app/src/main/kotlin/sh/kavi/fasttravel/core/EffectiveIgnoreList.kt`:

```kotlin
package sh.kavi.fasttravel.core

import sh.kavi.fasttravel.data.AutoIgnoreStore

/** Compute the list of triggers that the typo parser should treat as ignored.
 *  Derived at read time — never stored. */
fun effectiveIgnoreList(
    permanent: List<String>,
    candidates: Map<String, AutoIgnoreStore.Candidate>,
    threshold: Int,
): List<String> {
    val out = LinkedHashSet<String>()
    for (p in permanent) out.add(p.lowercase())
    for ((trigger, cand) in candidates) {
        if (!cand.doNotIgnore && cand.count >= threshold) {
            out.add(trigger.lowercase())
        }
    }
    return out.toList()
}
```

**Step 4: Run — expect PASS.**

**Step 5: Sanity-run all Android unit tests.**

---

## Phase B — Extension storage + data model

### Task 3: Extension candidate store + threshold helpers (with migration)

**Files:**
- Modify: `extension/src/options/data.ts`
- Create: `extension/src/core/auto-ignore-store.ts`
- Test: `extension/tests/unit/auto-ignore-store.test.ts` (create)

**Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadCandidates, incrementCandidate, decrementCandidate, setDoNotIgnore, removeCandidate, clearAllCandidates, type AutoIgnoreStore } from "../../src/core/auto-ignore-store";

// Simple in-memory mock of chrome.storage.local
function mockStorage(initial: Record<string, unknown> = {}) {
  const backing = { ...initial };
  return {
    get: vi.fn(async (keys: string | string[]) => {
      const want = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in backing) out[k] = backing[k];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(backing, obj); }),
    remove: vi.fn(async (k: string) => { delete backing[k]; }),
    _backing: backing,
  };
}

describe("auto-ignore-store", () => {
  let chromeLocal: ReturnType<typeof mockStorage>;

  beforeEach(() => {
    chromeLocal = mockStorage();
    (globalThis as unknown as { chrome: { storage: { local: unknown } } }).chrome = {
      storage: { local: chromeLocal },
    };
  });

  it("starts empty", async () => {
    expect(await loadCandidates()).toEqual({});
  });

  it("increment creates a candidate with count 1", async () => {
    await incrementCandidate("fcb");
    expect(await loadCandidates()).toEqual({ fcb: { count: 1, doNotIgnore: false } });
  });

  it("increment bumps existing count", async () => {
    await incrementCandidate("fcb");
    await incrementCandidate("fcb");
    expect((await loadCandidates()).fcb.count).toBe(2);
  });

  it("decrement reduces count; deletes at 0", async () => {
    await incrementCandidate("fcb");
    await decrementCandidate("fcb");
    expect(await loadCandidates()).toEqual({});
  });

  it("setDoNotIgnore preserves count", async () => {
    await incrementCandidate("fcb");
    await incrementCandidate("fcb");
    await setDoNotIgnore("fcb", true);
    const all = await loadCandidates();
    expect(all.fcb).toEqual({ count: 2, doNotIgnore: true });
  });

  it("removeCandidate deletes entry", async () => {
    await incrementCandidate("fcb");
    await setDoNotIgnore("fcb", true);
    await removeCandidate("fcb");
    expect(await loadCandidates()).toEqual({});
  });

  it("clearAllCandidates wipes everything", async () => {
    await incrementCandidate("a");
    await incrementCandidate("b");
    await clearAllCandidates();
    expect(await loadCandidates()).toEqual({});
  });

  it("migrates legacy 'fast-travel-typo-rejections' on first read", async () => {
    chromeLocal = mockStorage({ "fast-travel-typo-rejections": { fcb: 2, uk: 1 } });
    (globalThis as unknown as { chrome: { storage: { local: unknown } } }).chrome = {
      storage: { local: chromeLocal },
    };
    const out = await loadCandidates();
    expect(out).toEqual({
      fcb: { count: 2, doNotIgnore: false },
      uk: { count: 1, doNotIgnore: false },
    });
    // After migration the new key is populated.
    expect(chromeLocal._backing["fast-travel-auto-ignore"]).toBeDefined();
  });

  it("lowercases trigger keys", async () => {
    await incrementCandidate("FcB");
    expect(await loadCandidates()).toEqual({ fcb: { count: 1, doNotIgnore: false } });
  });
});
```

**Step 2: Run — expect FAIL.**

```
cd extension && npx vitest run tests/unit/auto-ignore-store.test.ts
```

**Step 3: Implement `auto-ignore-store.ts`**

```ts
/** Per-browser store of auto-ignore candidates plus migration from the legacy
 *  `fast-travel-typo-rejections` key. */

export interface AutoIgnoreCandidate {
  count: number;
  doNotIgnore: boolean;
}

export type AutoIgnoreStore = Record<string, AutoIgnoreCandidate>;

const STORE_KEY = "fast-travel-auto-ignore";
const LEGACY_KEY = "fast-travel-typo-rejections";

async function readRaw(): Promise<AutoIgnoreStore> {
  const v = await chrome.storage.local.get([STORE_KEY, LEGACY_KEY]);
  const current = (v[STORE_KEY] as AutoIgnoreStore | undefined) ?? {};
  if (Object.keys(current).length > 0) return current;
  const legacy = v[LEGACY_KEY] as Record<string, number> | undefined;
  if (!legacy || Object.keys(legacy).length === 0) return {};
  // Migrate. Keep legacy key for safety; one successful write under the new key
  // signals the migration has happened.
  const migrated: AutoIgnoreStore = {};
  for (const [trig, count] of Object.entries(legacy)) {
    if (typeof count === "number" && count > 0) {
      migrated[trig.toLowerCase()] = { count, doNotIgnore: false };
    }
  }
  await chrome.storage.local.set({ [STORE_KEY]: migrated });
  return migrated;
}

async function writeRaw(store: AutoIgnoreStore): Promise<void> {
  await chrome.storage.local.set({ [STORE_KEY]: store });
}

export async function loadCandidates(): Promise<AutoIgnoreStore> {
  return await readRaw();
}

export async function incrementCandidate(trigger: String): Promise<number> {
  const t = String(trigger).toLowerCase();
  const store = await readRaw();
  const existing = store[t] ?? { count: 0, doNotIgnore: false };
  const next: AutoIgnoreCandidate = { count: existing.count + 1, doNotIgnore: existing.doNotIgnore };
  store[t] = next;
  await writeRaw(store);
  return next.count;
}

export async function decrementCandidate(trigger: String): Promise<void> {
  const t = String(trigger).toLowerCase();
  const store = await readRaw();
  const existing = store[t];
  if (!existing) return;
  if (existing.count <= 1) {
    delete store[t];
  } else {
    store[t] = { ...existing, count: existing.count - 1 };
  }
  await writeRaw(store);
}

export async function setDoNotIgnore(trigger: String, value: boolean): Promise<void> {
  const t = String(trigger).toLowerCase();
  const store = await readRaw();
  const existing = store[t];
  if (!existing) {
    // User flagged a trigger that has no count — create an entry with count 0.
    // Use count 1 so the candidate exists (we never store count 0).
    store[t] = { count: 1, doNotIgnore: value };
  } else {
    store[t] = { ...existing, doNotIgnore: value };
  }
  await writeRaw(store);
}

export async function removeCandidate(trigger: String): Promise<void> {
  const t = String(trigger).toLowerCase();
  const store = await readRaw();
  if (!(t in store)) return;
  delete store[t];
  await writeRaw(store);
}

export async function clearAllCandidates(): Promise<void> {
  await chrome.storage.local.set({ [STORE_KEY]: {} });
}
```

**Step 4: Run — expect PASS.**

**Step 5: Update `extension/src/options/data.ts`** — remove the old `getTypoRejections` / `clearTypoRejection` helpers (no longer used by UI; replaced by the new store). Re-export the new helpers through `data.ts` if the existing ignore-list screen imports from there, or have the UI import directly from `core/auto-ignore-store.ts`. Pick whichever matches the existing `data.ts` pattern — it's fine either way.

**Step 6: Verify full extension test suite**

```
cd extension && npm run test
```

Expected: 119 + 9 new tests pass.

---

### Task 4: Extension `effectiveIgnoreList` helper

**Files:**
- Create: `extension/src/core/effective-ignore-list.ts`
- Test: `extension/tests/unit/effective-ignore-list.test.ts` (create)

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { effectiveIgnoreList } from "../../src/core/effective-ignore-list";

const c = (count: number, doNotIgnore = false) => ({ count, doNotIgnore });

describe("effectiveIgnoreList", () => {
  it("includes permanent entries", () => {
    expect(effectiveIgnoreList(["cat"], {}, 3)).toEqual(["cat"]);
  });
  it("includes candidates at/above threshold", () => {
    expect(effectiveIgnoreList([], { fcb: c(3) }, 3)).toEqual(["fcb"]);
  });
  it("excludes candidates below threshold", () => {
    expect(effectiveIgnoreList([], { fcb: c(2) }, 3)).toEqual([]);
  });
  it("excludes do-not-ignore candidates regardless of count", () => {
    expect(effectiveIgnoreList([], { fcb: c(99, true) }, 3)).toEqual([]);
  });
  it("permanent wins even when flagged as candidate", () => {
    expect(effectiveIgnoreList(["fcb"], { fcb: c(5, true) }, 3)).toEqual(["fcb"]);
  });
  it("lowercases and deduplicates", () => {
    const r = effectiveIgnoreList(["CAT", "cat"], { cat: c(5) }, 3);
    expect(r).toEqual(["cat"]);
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
import type { AutoIgnoreStore } from "./auto-ignore-store.js";

export function effectiveIgnoreList(
  permanent: string[],
  candidates: AutoIgnoreStore,
  threshold: number,
): string[] {
  const out = new Set<string>();
  for (const p of permanent) out.add(p.toLowerCase());
  for (const [trigger, cand] of Object.entries(candidates)) {
    if (!cand.doNotIgnore && cand.count >= threshold) out.add(trigger.toLowerCase());
  }
  return [...out];
}
```

**Step 4: Run — expect PASS.**

---

## Phase C — Typo card handler rewiring

### Task 5: Android typo card handlers

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchViewModel.kt`

The current handlers use the old model (auto-add on threshold inside `trackTypoRejection`, clear-counter inside `persistIgnoreTrigger`). Rewrite them to the new model.

**Step 1: Locate the three handlers** (file-search for `fun acceptTypo`, `fun googleSearchTypo`, `fun ignoreTypo`).

**Step 2: Replace each handler**

```kotlin
fun acceptTypo() {
    val state = _searchState.value
    if (state is SearchState.TypoSuggestion) {
        val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
        // Negative signal — user confirms the typo was right. Wind the
        // dismissal counter back by one (removes candidate if it hits zero).
        autoIgnoreStore.decrement(trigger)

        searchHistory.addEntry(
            state.typo.originalQuery,
            state.typo.suggestedCommand.id,
        )
        updateChipCommands()
        _searchState.value = SearchState.Navigate(state.typo.correctedUrl)
    }
}

fun ignoreTypo() {
    val state = _searchState.value
    if (state is SearchState.TypoSuggestion) {
        val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
        // Promote to permanent. Delete any candidate entry (count + flag).
        viewModelScope.launch {
            val store = sh.kavi.fasttravel.data.EditableConfigStore(getApplication())
            val current = configRepository.getConfig()
            if (current.ignoreList.none { it.equals(trigger, ignoreCase = true) }) {
                val updated = current.withIgnoreAdded(trigger)
                store.saveLocalConfigAndAwait(updated)
                config = configRepository.getConfig()
                config?.let { _groupColorMap.value = buildGroupColorMap(it.groups) }
            }
            autoIgnoreStore.remove(trigger)
        }

        // Proceed with the search as if the trigger were just ignored.
        val cfg = config ?: return
        val input = ParseInput(
            rawQuery = state.typo.originalQuery,
            device = DeviceType.Android,
            config = cfg,
            ignoreList = listOf(trigger),
        )
        val result = CommandParser.parseCommand(input)
        if (result is ParseOutput.RedirectResult) {
            searchHistory.addEntry(state.typo.originalQuery, result.commandId)
            updateChipCommands()
            _searchState.value = SearchState.Navigate(result.url)
        }
    }
}

fun googleSearchTypo() {
    val state = _searchState.value
    if (state is SearchState.TypoSuggestion) {
        val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
        // Positive dismissal signal — bump the counter. Auto-add happens
        // implicitly via effectiveIgnoreList at the next parse.
        autoIgnoreStore.increment(trigger)

        val query = state.typo.originalQuery
        val encodedQuery = sh.kavi.fasttravel.core.UrlEncoding.component(query)
        searchHistory.addEntry(query, null)
        _searchState.value = SearchState.Navigate("https://www.google.com/search?q=$encodedQuery")
    }
}
```

**Step 3: Delete the private helpers that are no longer used**

Remove `persistIgnoreTrigger`, `trackTypoRejection`, `clearRejectionCount`, and the `AUTO_IGNORE_THRESHOLD` companion from this file (if any remain). Anything that was reading `themePrefs.autoIgnoreThreshold` inside these handlers also disappears — threshold is now only read by the filter (Task 6).

**Step 4: Build**

```
./gradlew :app:compileDebugKotlin
```

Expected: success. (Compose warnings for Coil are pre-existing — ignore.)

**Step 5: Run Android tests** — all existing tests must still pass.

---

### Task 6: Android — wire `effectiveIgnoreList` into the parser input

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchViewModel.kt`
  (and/or any other sites that build `ParseInput`).

**Step 1: Find every `ParseInput(` construction.** Grep for that string in `android/app/src/main/kotlin`.

**Step 2: At every parse site that does typo detection**, replace `ignoreList = listOf(...)` / `ignoreList = emptyList()` with the computed effective list:

```kotlin
val threshold = themePrefs.autoIgnoreThreshold
val effective = sh.kavi.fasttravel.core.effectiveIgnoreList(
    permanent = cfg.ignoreList,
    candidates = autoIgnoreStore.all(),
    threshold = threshold,
)
// Parser merges input.ignoreList with config.ignoreList, so we still need to
// pass both. Pass an empty override list and rely on cfg.ignoreList being the
// effective list view via mergedIgnoreList at the parse site. Simplest: build
// ParseInput with an empty override and temporarily swap cfg.ignoreList.
val effectiveCfg = cfg.copy(ignoreList = effective)
val input = ParseInput(
    rawQuery = ...,
    device = DeviceType.Android,
    config = effectiveCfg,
    ignoreList = emptyList(),
)
```

(The typo branch in `ignoreTypo` keeps its `listOf(trigger)` override because that's a deliberate one-shot "ignore just for this parse" — don't swap it to the effective list.)

**Step 3: Build + run tests.**

**Step 4: Smoke build + install on the connected device**

```
./gradlew :app:installDebug
```

Verify: type `fcb` twice, hit "Search as typed" 3 times. After the 3rd dismissal, the next time you type `fcb` the typo card should NOT appear (because the candidate now has count ≥ threshold → included in effectiveIgnoreList).

---

### Task 7: Extension typo card handlers

**Files:**
- Modify: `extension/src/newtab/newtab.ts`

**Step 1: Locate `acceptTypo`, `ignoreTypo`, `defaultSearch`** (around lines 290–335).

**Step 2: Rewrite**

```ts
async function acceptTypo(): Promise<void> {
  if (!currentTypo) return;
  const trigger = currentTypo.originalQuery.split(/\s+/)[0].toLowerCase();
  await decrementCandidate(trigger);
  chrome.runtime.sendMessage({
    type: "addHistory",
    value: {
      query: currentTypo.originalQuery,
      commandId: currentTypo.suggestedCommand.id,
      timestamp: Date.now(),
    },
  });
  const url = currentTypo.correctedUrl;
  hideTypo();
  window.location.href = url;
}

async function defaultSearch(): Promise<void> {
  if (!currentTypo || !config) return;
  const query = currentTypo.originalQuery;
  chrome.runtime.sendMessage({
    type: "addHistory",
    value: { query, commandId: null, timestamp: Date.now() },
  });
  const trigger = query.split(/\s+/)[0].toLowerCase();
  await incrementCandidate(trigger);
  const fallback = parseCommand({
    rawQuery: query,
    device,
    config,
    ignoreList: [...ignoreList, trigger],
  });
  const url = fallback.type === "redirect"
    ? fallback.url
    : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.location.href = url;
}

async function ignoreTypo(): Promise<void> {
  if (!currentTypo) return;
  const trigger = currentTypo.originalQuery.split(/\s+/)[0].toLowerCase();
  ignoreList = await chrome.runtime.sendMessage({ type: "addToIgnoreList", value: trigger });
  await removeCandidate(trigger);
  hideTypo();
  handleSearch();
}
```

Add imports at the top of `newtab.ts`:
```ts
import { decrementCandidate, incrementCandidate, removeCandidate } from "../core/auto-ignore-store.js";
```

**Step 3: Delete legacy state** — remove the `typoRejections` variable, `REJECTIONS_KEY`, `loadRejections`, `saveRejections`, `autoIgnoreTrigger`, `AUTO_IGNORE_THRESHOLD` / `autoIgnoreThreshold`, `loadAutoIgnoreThreshold`. None of these are needed anymore. Remove their calls from `loadIgnoreList` too.

**Step 4: Build + test**

```
cd extension && npm run test && npm run build
```

Expected: all tests pass, build produces `dist/`.

---

### Task 8: Extension — wire `effectiveIgnoreList` into the parse input

**Files:**
- Modify: `extension/src/newtab/newtab.ts`

**Step 1: Find the `ignoreList` variable and every `parseCommand({ … ignoreList: … })` site.**

**Step 2: Replace the module-level `ignoreList` with a function that derives the effective list when needed.**

```ts
import { getAutoIgnoreThreshold, loadCandidates } from "../core/auto-ignore-store.js";
import { effectiveIgnoreList } from "../core/effective-ignore-list.js";

// Module-level cache populated at startup and after any change.
let permanentIgnoreList: string[] = [];
let candidates: AutoIgnoreStore = {};
let threshold = 3;

async function refreshIgnoreState(): Promise<void> {
  permanentIgnoreList = (await chrome.runtime.sendMessage({ type: "getIgnoreList" })) ?? [];
  candidates = await loadCandidates();
  threshold = await getAutoIgnoreThreshold();
}

function currentEffectiveIgnoreList(): string[] {
  return effectiveIgnoreList(permanentIgnoreList, candidates, threshold);
}
```

Then at each `parseCommand` call, replace `ignoreList: [...ignoreList]` / `ignoreList` with `ignoreList: currentEffectiveIgnoreList()`.

Call `refreshIgnoreState()` during `loadIgnoreList` (or whatever the init is now called), and after each `incrementCandidate` / `decrementCandidate` / `removeCandidate` write. Simplest: always `await refreshIgnoreState()` after writes.

Move `getAutoIgnoreThreshold` and `setAutoIgnoreThreshold` into `core/auto-ignore-store.ts` (or keep in `options/data.ts` and import into `newtab.ts` via a shared module — whichever keeps the existing import graph simplest).

**Step 3: Build + manual smoke-test**

```
cd extension && npm run build && node test-icon-overrides.mjs
```

The icon-override script should still pass (it tests an unrelated feature but exercises the same `newtab.ts` init path).

Also add a new `test-typo-ignore.mjs`-style script or extend the existing one to verify: type "gg kittens", click "Ignore permanently", type again, expect no typo card — already covered by `test-typo-ignore.mjs`. Run it:

```
node test-typo-ignore.mjs
```

Expected: PASS as before.

---

## Phase D — Android Settings screen rewrite

### Task 9: New `IgnoreListScreen` layout

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` (`IgnoreListScreen` Composable and the `IgnoreEntry`/`IgnoreRow` helpers)

Replace the entire `IgnoreListScreen` block (currently around lines 1119+ after the previous iteration) with a fresh implementation. Delete the old `IgnoreRow` and `IgnoreEntry` data class.

**Top-level layout:**
- `Scaffold` with existing `SettingsTopBar("Ignore List")` and `snackbarHost` (keep the host wired but don't emit snackbars).
- `LazyColumn` with two expandable section blocks plus threshold + reset-all + add-row widgets. Use `item {}` blocks for headers, stepper, and buttons; use `items(...)` for each list.

**State:**
- `var permanentExpanded by remember { mutableStateOf(true) }` — default expanded, not persisted.
- `var autoExpanded by remember { mutableStateOf(true) }`.
- `var newItem by remember { mutableStateOf("") }` (permanent add field).
- `var threshold by remember { mutableStateOf(themePrefs.autoIgnoreThreshold) }`.
- `var refreshTick by remember { mutableStateOf(0) }` — bump after every mutation to re-read state.
- Derived: `entriesSnapshot` read inside `remember(refreshTick, config, threshold) { ... }` — returns `(permanentList sorted alphabetically, candidatesList sorted by count desc)`.

**Permanent section header:**
Clickable row with `ChevronRight` icon rotated 90° when expanded, label "Permanent" in `labelMedium` style (same pattern as "APPEARANCE" on main settings). Clicking toggles `permanentExpanded`.

**Permanent expanded body (wrapped in `AnimatedVisibility`):**
- Add row (same `OutlinedTextFieldS` + Button used today, with Enter submit).
- If list empty: text "No permanent entries. Add one above, or confirm an auto-tracked trigger below."
- Else: `items(permanentList, key = { it })` — each `ListItem(headlineContent = { Text(it, FontFamily.Monospace) })` with `Modifier.combinedClickable(onClick = {}, onLongClick = { showPermanentSheetFor = it })`.

**Divider** (`HorizontalDivider()`) between sections.

**Auto-ignore tracking section header:**
Same pattern as Permanent's header, label "Auto-ignore tracking".

**Auto section body:**
- **Threshold row**: label "Threshold" with subtitle "Dismissals before auto-adding a trigger", and a pill-shaped stepper on the right:
  ```kotlin
  Row(modifier = Modifier.border(1.dp, outline, RoundedCornerShape(20.dp)).padding(4.dp)) {
      IconButton(enabled = threshold > 1, onClick = { threshold--; themePrefs.autoIgnoreThreshold = threshold; refreshTick++ }) { Icon(Icons.Default.Remove, null) }
      Text(threshold.toString(), Modifier.widthIn(min = 32.dp), textAlign = Center)
      IconButton(enabled = threshold < 20, onClick = { threshold++; themePrefs.autoIgnoreThreshold = threshold; refreshTick++ }) { Icon(Icons.Default.Add, null) }
  }
  ```
- **Reset all counts** — full-width `OutlinedButton`, error color, Delete icon + "Reset all counts". Disabled when `candidates.isEmpty()`. Clicking shows an `AlertDialog` confirmation; on confirm, call `autoIgnoreStore.clearAll(); refreshTick++`.
- If candidate list empty: text "No tracked triggers yet. Dismiss a typo suggestion to start tracking."
- Else: `items(candidatesList, key = { it.trigger })` — each row:
  - `Row(verticalAlignment = CenterVertically, modifier = Modifier.combinedClickable(onClick = {}, onLongClick = { showCandidateSheetFor = it }).alpha(if (state == State.BELOW) 0.55f else 1f))`
  - Trigger text in `FontFamily.Monospace`, weight=1.
  - Count badge chip (`×N`) styled per state:
    - `State.ACTIVE` → `secondaryContainer`
    - `State.BELOW` → `surfaceVariant`
    - `State.RED` → `errorContainer` (and include a small `Block` icon prefix)
  - Right-side state pill (tiny text): "active" / "below threshold" / "never ignored"
- `State` is derived per row:
  ```kotlin
  enum class RowState { ACTIVE, BELOW, RED }
  fun stateOf(c: Candidate, threshold: Int) =
      when {
          c.doNotIgnore -> RowState.RED
          c.count >= threshold -> RowState.ACTIVE
          else -> RowState.BELOW
      }
  ```

**Long-press → bottom sheet**:
- `var showPermanentSheetFor by remember { mutableStateOf<String?>(null) }`
- `var showCandidateSheetFor by remember { mutableStateOf<String?>(null) }`
- Two separate `if (...) { ModalBottomSheet(...) }` blocks at the end of the composable.
- Permanent sheet contents: single full-width clickable row "Remove" (error color). On click, call `editableStore.saveLocalConfig(cfg.withIgnoreRemoved(t))`; dismiss sheet; `refreshTick++`.
- Candidate sheet contents: three full-width rows:
  - "Confirm as permanent" — moves to `config.ignoreList`, `autoIgnoreStore.remove(t)`, dismiss.
  - "Flag as 'Do not ignore'" (when `!dni`) or "Unflag 'Do not ignore'" (when `dni`) — calls `autoIgnoreStore.setDoNotIgnore(t, !dni)`; dismiss.
  - "Remove from tracking" — calls `autoIgnoreStore.remove(t)`; dismiss.

**Reset-all confirmation dialog**: standard `AlertDialog` with "Reset all counts?" title and "This clears every dismissal counter. Existing permanent entries are unaffected." body; confirm button calls `autoIgnoreStore.clearAll(); refreshTick++; showResetDialog = false`.

**Step 1: Do the rewrite as described above.** Paste the full implementation into `SettingsActivity.kt`, replacing the previous `IgnoreListScreen` + `IgnoreRow` block.

**Step 2: Build**

```
./gradlew :app:compileDebugKotlin
```

Expected: clean compile (Coil warning OK).

**Step 3: Install on device**

```
./gradlew :app:installDebug
```

**Step 4: Manual check** — open Settings → Ignore List. Confirm:
1. Both sections expanded by default.
2. Caret rotates when sections are collapsed.
3. Rows are visually clean (no inline buttons).
4. Long-press permanent row → sheet with "Remove".
5. Long-press auto row → sheet with three actions; pick each and watch the list react.
6. Threshold stepper: count pending entries move between active/below as threshold changes.
7. Reset all counts → confirmation → list clears auto-section only.
8. Add a new permanent via the text field; Enter submits. Confirm it appears alphabetically.

Take a screenshot of each state and drop into `docs/screenshots/2026-04-16-android-ignore-*.png`:
- `2026-04-16-android-ignore-main.png` (both sections with some data)
- `2026-04-16-android-ignore-sheet-candidate.png` (long-press sheet on a candidate)
- `2026-04-16-android-ignore-reset-dialog.png` (reset-all confirmation)

---

### Task 10: Android — action sheet polish (OK to merge into Task 9 if trivial)

Skip if Task 9 already included this. Otherwise: wire the three bottom-sheet actions, run the device-side manual test, capture screenshots, and ensure nothing regresses.

---

## Phase E — Extension Settings screen rewrite

### Task 11: New `ignore-list.ts` layout

**Files:**
- Modify: `extension/src/options/screens/ignore-list.ts` (complete rewrite)
- Modify: `extension/src/options/options.css` (new classes; reuse existing tokens)

**Structure mirrors Android:**
- Two collapsible sections ("Permanent", "Auto-ignore tracking"), both default-expanded, no persisted collapse state.
- Permanent section: add-row, then alphabetical list. Each row has a row-hover action cluster with a single `×` icon.
- Auto section: threshold stepper row, full-width "Reset all counts" button (red `.btn.danger`), then list sorted by count desc. Each row has hover actions: `✓` confirm, `⊘` toggle DNI (tooltip reflects current state), `×` remove.
- Row states via class:
  - `.ignore-row.active` (normal)
  - `.ignore-row.below` (`opacity: 0.55`)
  - `.ignore-row.red` (error text color + block icon prefix)
- Collapsible sections: clicking the header toggles `.expanded` on the section wrapper; CSS uses `.expanded` to show the body.

**Key HTML structure (sketch):**

```html
<section class="card ignore-section" data-section="permanent">
  <header class="section-header">
    <span class="caret">▸</span> PERMANENT
  </header>
  <div class="section-body">
    <div class="inline-form"><input ...><button>+</button></div>
    <div class="ignore-list"><!-- rows --></div>
  </div>
</section>
<section class="card ignore-section" data-section="auto">
  <header class="section-header"><span class="caret">▸</span> AUTO-IGNORE TRACKING</header>
  <div class="section-body">
    <div class="threshold-row">
      <div class="threshold-text">…</div>
      <div class="stepper">[−][N][+]</div>
    </div>
    <button class="btn danger full-width reset-all">🗑 Reset all counts</button>
    <div class="ignore-list"><!-- candidate rows --></div>
  </div>
</section>
```

**Row hover actions:**

```css
.ignore-row .ignore-actions { opacity: 0; transition: opacity 80ms; }
.ignore-row:hover .ignore-actions,
.ignore-row:focus-within .ignore-actions { opacity: 1; }
```

`.ignore-actions button` gets `aria-label` even when hidden so keyboard users can still act.

**Reset-all confirmation**: use the same small modal pattern already elsewhere in options (check `confirm-dialog` or similar), or fall back to `if (!confirm("Reset all counts?")) return;` — keep whatever exists in the codebase.

**State-computed classes:**

```ts
function rowClass(c: AutoIgnoreCandidate, threshold: number): string {
  if (c.doNotIgnore) return "ignore-row red";
  if (c.count >= threshold) return "ignore-row active";
  return "ignore-row below";
}
```

**Step 1: Replace `extension/src/options/screens/ignore-list.ts` with the new implementation.** Keep the existing import of `addToIgnoreList` / `getIgnoreList` / `removeFromIgnoreList` from `data.ts`. Add imports for `loadCandidates`, `setDoNotIgnore`, `removeCandidate`, `clearAllCandidates` from `../core/auto-ignore-store.js` (or re-export through `data.ts`).

**Step 2: Update `extension/src/options/options.css`** — add classes for `.ignore-section`, `.section-header`, `.caret`, `.section-body`, `.ignore-row`, `.ignore-row.active/.below/.red`, `.ignore-actions`, hover transitions, and `.btn.danger.full-width`. Use existing tokens (`var(--danger)`, `var(--accent)`, `var(--text-secondary)`, `var(--font-mono)`, `var(--border)`). Do not introduce new palette entries.

**Step 3: Build + test**

```
cd extension && npm run build && npm run test
```

Expected: 128 tests pass (119 existing + 9 new auto-ignore-store + some effective-ignore-list ones), build succeeds.

**Step 4: Load the `extension/dist` into `chrome://extensions` (unpacked) and manually verify**:
1. Open `options.html#/ignore-list`.
2. Sections collapse/expand on header click. Both start expanded.
3. Hover row → icons fade in on the right.
4. Add a term → appears in Permanent alphabetical.
5. Dismiss a typo a couple of times in the new tab → candidate appears in Auto with `×N`.
6. Threshold stepper is keyboard-focusable, +/− work, disabled at limits.
7. Reset all counts wipes the Auto list only.

Capture:
- `docs/screenshots/2026-04-16-ext-ignore-main.png` (both sections with data)
- `docs/screenshots/2026-04-16-ext-ignore-hover.png` (hover showing action icons)

---

### Task 12: Extension CSS polish — OK to merge into Task 11

Skip if Task 11 already covers the CSS. Otherwise: finalize the styles, validate light/dark themes by toggling `prefers-color-scheme` in devtools.

---

## Phase F — Verification

### Task 13: Full test + install + screenshot sweep

**Step 1:** Run parallel:
- `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`
- `cd extension && npm run build && npm run test`
- `node tools/validate-config.mjs`

Expected: all green.

**Step 2: Extension** — run `node test-typo-ignore.mjs` and `node test-icon-overrides.mjs`. Both must still pass.

**Step 3: Android** — `./gradlew :app:installDebug` (device connected over wifi at `$DEVICE_IP:$PORT`). Then manually:
- Type `fcb`, dismiss → candidate appears.
- Repeat until count reaches threshold → next time you type `fcb`, no typo card.
- Open Settings → Ignore List → long-press `fcb` → "Flag as 'Do not ignore'" → typo card comes back when typing `fcb`.
- Confirm state persists across app force-stop + relaunch.
- Capture full screenshots.

**Step 4:** Diff the captured screenshots against expectations. Iterate on styling if anything looks off.

---

## Done criteria

- Android `AutoIgnoreStoreTest` + `EffectiveIgnoreListTest` pass.
- Extension `auto-ignore-store` + `effective-ignore-list` tests pass.
- No regressions in the existing test suites (119 extension + 82 Android).
- Typo card handlers increment/decrement the candidate counter per the lifecycle table; auto-add happens implicitly via `effectiveIgnoreList`.
- Settings screen on both platforms has two collapsible sections, threshold stepper, reset-all button, clean rows with gesture-revealed actions.
- No snackbars.
- Data migration from the legacy `fast-travel-typo-rejections` key is seamless (any existing counts show up as candidates with `doNotIgnore = false`).
- Screenshots captured under `docs/screenshots/2026-04-16-android-ignore-*.png` and `docs/screenshots/2026-04-16-ext-ignore-*.png` confirm the design matches the spec.
