package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import sh.kavi.fasttravel.core.ChipRanking
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandParser
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.DeviceType
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Frecency
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.core.InstalledApp
import sh.kavi.fasttravel.core.InstalledAppResolver
import sh.kavi.fasttravel.core.ParseInput
import sh.kavi.fasttravel.core.ParseOutput
import sh.kavi.fasttravel.core.Suggestion
import sh.kavi.fasttravel.core.SuggestionProvider
import sh.kavi.fasttravel.core.installedAppId
import sh.kavi.fasttravel.core.isInstalledAppId
import sh.kavi.fasttravel.core.parseInstalledAppId
import sh.kavi.fasttravel.core.resolveIconUrl
import sh.kavi.fasttravel.data.AutoIgnoreStore
import sh.kavi.fasttravel.data.ConfigRepository
import sh.kavi.fasttravel.data.LocalIgnoreStore
import sh.kavi.fasttravel.data.SearchHistory
import sh.kavi.fasttravel.data.ThemePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

sealed class SearchState {
    data object Idle : SearchState()
    data class TypoSuggestion(val typo: ParseOutput.TypoResult) : SearchState()
    data class Navigate(val url: String) : SearchState()
}

class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val configRepository = ConfigRepository(application)
    private val searchHistory = SearchHistory(application)
    private val themePrefs = ThemePreferences(application)

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _suggestions = MutableStateFlow<List<Suggestion>>(emptyList())
    val suggestions: StateFlow<List<Suggestion>> = _suggestions.asStateFlow()

    private val _searchState = MutableStateFlow<SearchState>(SearchState.Idle)
    val searchState: StateFlow<SearchState> = _searchState.asStateFlow()

    private var config: FastTravelConfig? = null
    private var suggestionJob: Job? = null
    private var installedAppsJob: Job? = null
    private var chipJob: Job? = null

    private val _chipItems = MutableStateFlow<List<ChipItem>>(emptyList())
    val chipItems: StateFlow<List<ChipItem>> = _chipItems.asStateFlow()

    private val _installedApps = MutableStateFlow<List<InstalledApp>>(emptyList())
    val installedApps: StateFlow<List<InstalledApp>> = _installedApps.asStateFlow()

    /** commandId -> group color hex. Built once from the loaded config. */
    private val _groupColorMap = MutableStateFlow<Map<String, String>>(emptyMap())
    val groupColorMap: StateFlow<Map<String, String>> = _groupColorMap.asStateFlow()

    val shortcutRows: Int
        get() = themePrefs.shortcutRows

    /**
     * Listens for shortcut-row changes coming from Settings and refreshes the chip
     * list so the grid resizes immediately without requiring an activity restart.
     */
    private val prefsListener =
        SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == "shortcut_rows" || key == ThemePreferences.KEY_INSTALLED_APPS_ENABLED) {
                updateChipCommands()
            }
            // Toggling installed apps changes whether app launches show under "Recent".
            if (key == ThemePreferences.KEY_INSTALLED_APPS_ENABLED && _query.value.isBlank()) {
                config?.let { _suggestions.value = getHistorySuggestions(it) }
            }
        }

    // Auto-ignore tracking for false positive typos
    private val autoIgnoreStore = AutoIgnoreStore(application)

    // User's device-local permanent ignore list (kept out of the config so it
    // never dirties it / pauses remote auto-refresh).
    private val localIgnoreStore = LocalIgnoreStore(application)

    init {
        loadCommonWords(application)
        loadTlds(application)
        themePrefs.registerListener(prefsListener)

        viewModelScope.launch {
            config = configRepository.getConfig()
            config?.let { cfg ->
                _groupColorMap.value = buildGroupColorMap(cfg.groups)
                // Populate history suggestions immediately so the focused-empty state
                // shows the "Recent" list on first open without requiring a keystroke.
                if (_query.value.isBlank()) {
                    _suggestions.value = getHistorySuggestions(cfg)
                }
            }
            updateChipCommands()
        }
    }

    override fun onCleared() {
        themePrefs.unregisterListener(prefsListener)
        super.onCleared()
    }

    private fun buildGroupColorMap(
        groups: List<Group>,
        inherited: String? = null,
    ): Map<String, String> {
        val result = mutableMapOf<String, String>()
        for (group in groups) {
            val effective = group.color ?: inherited
            for (cmd in group.commands) {
                if (effective != null) result[cmd.id] = effective
            }
        }
        return result
    }

    /** Build a view of [cfg] where ignoreList is the effective list (permanent
     *  entries + active non-DNI candidates at/above the threshold). */
    private fun effectiveConfig(cfg: FastTravelConfig): FastTravelConfig {
        val effective = sh.kavi.fasttravel.core.effectiveIgnoreList(
            permanent = cfg.ignoreList,
            local = localIgnoreStore.all(),
            candidates = autoIgnoreStore.all(),
            threshold = themePrefs.autoIgnoreThreshold,
        )
        return cfg.copy(ignoreList = effective)
    }

    private fun updateChipCommands() {
        val cfg = config ?: return
        val standardCommands = flattenCommands(cfg.groups).filter { it.type == CommandType.Standard }

        // ~4 chips per row fits the Figma spec's pill grid.
        val targetCount = (shortcutRows * 4).coerceAtLeast(4)

        // Rank commands and (when enabled) launched installed apps together by frecency;
        // empty history falls back to config order. Command frecency is shared with the
        // extension via shared/test-fixtures/frecency.fixtures.json.
        val rawHistory = searchHistory.getHistory()
        val history = rawHistory.map {
            Frecency.HistoryEntry(it.commandId, it.timestamp)
        }
        val appsEnabled = themePrefs.installedAppsEnabled
        val rankedIds = ChipRanking.rankedIds(
            commandIds = standardCommands.map { it.id },
            history = history,
            now = System.currentTimeMillis(),
            includeApps = appsEnabled,
            limit = targetCount,
        )
        val byId = standardCommands.associateBy { it.id }

        // Fast path: no app chips (cold start or toggle off) — resolve synchronously.
        chipJob?.cancel()
        if (rankedIds.none { isInstalledAppId(it) }) {
            _chipItems.value = rankedIds.mapNotNull { id -> byId[id]?.let { ChipItem.Cmd(it) } }
            return
        }

        // Most-recent stored label per app id, used as the chip label (and the placeholder
        // label while the app is uninstalled). rawHistory is newest-first.
        val appLabels = HashMap<String, String>()
        for (h in rawHistory) {
            val c = h.commandId
            if (isInstalledAppId(c) && c !in appLabels) appLabels[c!!] = h.query
        }

        // App chips need a PackageManager lookup + icon decode — resolve off the main thread.
        chipJob = viewModelScope.launch {
            val items = withContext(Dispatchers.Default) {
                rankedIds.mapNotNull { id ->
                    if (isInstalledAppId(id)) {
                        val (pkg, activity) = parseInstalledAppId(id) ?: return@mapNotNull null
                        // Keep ranking a launched app even while uninstalled (placeholder
                        // icon); the chip toasts if it's still gone when tapped.
                        val app = InstalledAppResolver.resolveForHistory(
                            getApplication(), pkg, activity, appLabels[id] ?: pkg,
                        )
                        ChipItem.App(app)
                    } else {
                        byId[id]?.let { ChipItem.Cmd(it) }
                    }
                }
            }
            _chipItems.value = items
        }
    }

    /**
     * Record an installed-app launch in history (under its [installedAppId]) so it surfaces
     * in "Recent" and ranks into the shortcut chips. The Activity performs the actual launch.
     */
    fun recordAppLaunch(app: InstalledApp) {
        searchHistory.addEntry(app.label, installedAppId(app.packageName, app.activityName))
        updateChipCommands()
    }

    /**
     * Reset transient search state back to a cold-open state, synchronously.
     *
     * The query + suggestions live in this retained (activity-scoped) ViewModel and,
     * with the launcher's `singleTask` mode, survive the app being backgrounded to
     * open another app. Without this reset, relaunching flashes the previous query +
     * its stale Google suggestions for ~1s before the post-resume effect clears them.
     * Called from the Activity's `onStop()` so the state is already clean on the next
     * resume's first frame (no flash). Suggestions are restored to the "Recent" list
     * immediately (no debounce) so the resumed empty state matches a cold open.
     */
    fun resetForFreshStart() {
        suggestionJob?.cancel()
        installedAppsJob?.cancel()
        _query.value = ""
        _searchState.value = SearchState.Idle
        _installedApps.value = emptyList()
        _suggestions.value = config?.let { getHistorySuggestions(it) } ?: emptyList()
    }

    private fun flattenCommands(groups: List<Group>): List<Command> = groups.flatMap { it.commands }

    /**
     * Return commands whose primary trigger starts with the first token of [query]
     * (case-insensitive) but whose trigger isn't an exact match (that case is already
     * represented by the matched-command chip). Limited to 5 results.
     *
     * Only fires when [query] has a single token, so typing "yt cats" returns an
     * empty list even though "yt" is a prefix of "yt".
     */
    fun commandsMatchingPrefix(query: String): List<Command> {
        val cfg = config ?: return emptyList()
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return emptyList()
        val tokens = trimmed.split(Regex("\\s+"))
        if (tokens.size != 1) return emptyList()
        val prefix = tokens[0].lowercase()
        return flattenCommands(cfg.groups).asSequence()
            .filter { it.type == CommandType.Standard }
            .mapNotNull { cmd ->
                val trig = cmd.triggers.firstOrNull()?.lowercase() ?: return@mapNotNull null
                if (trig == prefix) null
                else if (trig.startsWith(prefix)) cmd
                else null
            }
            .take(5)
            .toList()
    }

    /**
     * Look up a Command by its trigger string for favicon resolution.
     */
    fun findCommandByTrigger(trigger: String): Command? {
        val cfg = config ?: return null
        val triggerMap = CommandParser.buildTriggerMap(cfg)
        return triggerMap[trigger.lowercase()]
    }

    /**
     * Return the matched Command and the trigger the user typed (if any).
     * Used to render the matched-command chip row in the typing state.
     */
    fun matchCommandForQuery(rawQuery: String): Pair<Command, String>? {
        val cfg = config ?: return null
        val trimmed = rawQuery.trim()
        if (trimmed.isEmpty()) return null
        val tokens = trimmed.split(Regex("\\s+"))
        val firstToken = tokens.first().lowercase()
        val hasArgs = tokens.size > 1
        val triggerMap = CommandParser.buildTriggerMap(cfg)
        val command = triggerMap[firstToken] ?: return null
        // Redirect-type commands don't trigger when args follow — don't misleadingly
        // show the matched-command chip in that case.
        if (command.type == CommandType.Redirect && hasArgs) return null
        return Pair(command, firstToken)
    }

    private fun loadCommonWords(application: Application) {
        try {
            val json = application.assets.open("common-words.json")
                .bufferedReader()
                .use { it.readText() }
            val arr = JSONArray(json)
            val words = mutableSetOf<String>()
            for (i in 0 until arr.length()) {
                words.add(arr.getString(i))
            }
            CommandParser.setCommonWords(words)
        } catch (_: Exception) {
            // Common words file not available, continue without it
        }
    }

    private fun loadTlds(application: Application) {
        try {
            val json = application.assets.open("tlds.json")
                .bufferedReader()
                .use { it.readText() }
            val arr = JSONArray(json)
            val tlds = mutableSetOf<String>()
            for (i in 0 until arr.length()) {
                tlds.add(arr.getString(i))
            }
            CommandParser.setTlds(tlds)
        } catch (_: Exception) {
            // TLD list not available; URL detection falls back to search
        }
    }

    fun onQueryChanged(newQuery: String) {
        _query.value = newQuery
        _searchState.value = SearchState.Idle

        val cfg = config
        // When user commits to a command ("trigger "), stale Google suggestions from
        // the prefix-matching phase must clear immediately — otherwise the 200ms
        // debounce leaves results like "gdrive, gdc" on screen after "gd " is typed.
        if (cfg != null) {
            val trimmed = newQuery.trim()
            val tokens = if (trimmed.isEmpty()) emptyList() else trimmed.split(Regex("\\s+"))
            val firstToken = tokens.firstOrNull()?.lowercase()
            val matched = firstToken?.let { CommandParser.buildTriggerMap(cfg)[it] }
            val hasArgs = tokens.size > 1
            if (matched != null && newQuery.endsWith(" ") && !hasArgs) {
                _suggestions.value = emptyList()
            }
        }

        installedAppsJob?.cancel()
        if (newQuery.isBlank() || !themePrefs.installedAppsEnabled) {
            _installedApps.value = emptyList()
        } else {
            installedAppsJob = viewModelScope.launch {
                // Debounce + dedupe to stop the per-keystroke icon flicker when the
                // result set hasn't actually changed.
                delay(120)
                val results = withContext(Dispatchers.Default) {
                    InstalledAppResolver.query(getApplication(), newQuery)
                }
                val currentKey = _installedApps.value.map { it.packageName to it.activityName }
                val newKey = results.map { it.packageName to it.activityName }
                if (currentKey != newKey) {
                    _installedApps.value = results
                }
            }
        }

        suggestionJob?.cancel()
        suggestionJob = viewModelScope.launch {
            delay(200)
            val resolved = config ?: return@launch
            if (newQuery.isBlank()) {
                _suggestions.value = getHistorySuggestions(resolved)
                return@launch
            }
            val trimmed = newQuery.trim()
            val tokens = trimmed.split(Regex("\\s+"))
            val firstToken = tokens.first().lowercase()
            val matched = CommandParser.buildTriggerMap(resolved)[firstToken]
            val hasArgs = tokens.size > 1
            // "trigger " with no argument → nothing to suggest. Prevents the default
            // API from auto-completing the trigger itself (gdc, gdrive, …).
            if (matched != null && !hasArgs && newQuery.endsWith(" ")) {
                _suggestions.value = emptyList()
                return@launch
            }
            try {
                _suggestions.value = SuggestionProvider.fetchSuggestions(newQuery, resolved)
            } catch (_: Exception) {
                _suggestions.value = emptyList()
            }
        }
    }

    private fun getHistorySuggestions(config: FastTravelConfig): List<Suggestion> {
        val history = searchHistory.getHistory()
        if (history.isEmpty()) return emptyList()

        val appsEnabled = themePrefs.installedAppsEnabled
        val triggerMap = CommandParser.buildTriggerMap(config)
        return history.distinctBy { it.query }
            // Hide installed-app launches from "Recent" when the feature is off.
            .filter { appsEnabled || !isInstalledAppId(it.commandId) }
            .take(10)
            .mapNotNull { entry ->
                val cid = entry.commandId
                if (isInstalledAppId(cid)) {
                    val (pkg, activity) = parseInstalledAppId(cid!!) ?: return@mapNotNull null
                    // Keep showing a launched app even while it's uninstalled (it may be
                    // reinstalled). resolveForHistory falls back to a placeholder icon; the
                    // launch site toasts if it's still gone when tapped.
                    val app = InstalledAppResolver.resolveForHistory(getApplication(), pkg, activity, entry.query)
                    Suggestion(
                        text = entry.query,
                        displayText = app.label,
                        isHistory = true,
                        installedApp = app,
                    )
                } else {
                    val cmd = cid?.let { id -> triggerMap.values.find { it.id == id } }
                    Suggestion(
                        text = entry.query,
                        displayText = entry.query,
                        commandTrigger = cmd?.triggers?.firstOrNull(),
                        commandName = cmd?.name,
                        commandIconUrl = cmd?.let { resolveIconUrl(it, DeviceType.Android) },
                        isHistory = true,
                    )
                }
            }
    }

    fun onSearch(searchQuery: String) {
        val cfg = config ?: return
        _suggestions.value = emptyList()

        val input = ParseInput(
            rawQuery = searchQuery,
            device = DeviceType.Android,
            config = effectiveConfig(cfg),
            ignoreList = emptyList(),
        )

        when (val result = CommandParser.parseCommand(input)) {
            is ParseOutput.RedirectResult -> {
                searchHistory.addEntry(searchQuery, result.commandId)
                updateChipCommands()
                _searchState.value = SearchState.Navigate(result.url)
            }
            is ParseOutput.TypoResult -> {
                _searchState.value = SearchState.TypoSuggestion(result)
            }
        }
    }

    fun acceptTypo() {
        val state = _searchState.value
        if (state is SearchState.TypoSuggestion) {
            val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
            // Negative dismissal signal — user confirms the typo was right.
            // Wind the candidate counter back by one (auto-removes if it hits 0).
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

            // Add to the DEVICE-LOCAL ignore list — deliberately NOT the config, so
            // a permanent ignore never dirties the config or pauses remote
            // auto-refresh. It's merged back in by effectiveConfig/effectiveIgnoreList
            // at parse time. Drop any auto-ignore candidate so the manual add wins.
            localIgnoreStore.add(trigger)
            autoIgnoreStore.remove(trigger)

            // Execute the search as if the trigger were ignored (one-shot override).
            val cfg = config ?: return
            val input = ParseInput(
                rawQuery = state.typo.originalQuery,
                device = DeviceType.Android,
                config = effectiveConfig(cfg),
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

    fun fallbackSearchAfterTypo() {
        val state = _searchState.value
        if (state is SearchState.TypoSuggestion) {
            val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
            // Positive dismissal signal — bump the counter. Auto-add is handled
            // at parse time by effectiveIgnoreList (Task 6 wires it up).
            autoIgnoreStore.increment(trigger)

            // Force the typo'd trigger into the ignore list for this parse so the
            // query is searched verbatim on the user's default engine — never a
            // hard-coded one.
            val cfg = config ?: return
            val input = ParseInput(
                rawQuery = state.typo.originalQuery,
                device = DeviceType.Android,
                config = effectiveConfig(cfg),
                ignoreList = listOf(trigger),
            )
            val result = CommandParser.parseCommand(input)
            if (result is ParseOutput.RedirectResult) {
                searchHistory.addEntry(state.typo.originalQuery, null)
                _searchState.value = SearchState.Navigate(result.url)
            }
        }
    }


    fun onNavigationHandled() {
        _searchState.value = SearchState.Idle
    }

    /** Dismiss the typo suggestion card without taking any of its three actions.
     *  Invoked when the user presses the system back button while the card is showing. */
    fun dismissTypo() {
        if (_searchState.value is SearchState.TypoSuggestion) {
            _searchState.value = SearchState.Idle
        }
    }

    fun clearHistory() {
        searchHistory.clearHistory()
        if (_query.value.isBlank()) {
            _suggestions.value = emptyList()
        }
    }

    /**
     * R7.1 — remove a single history entry. If the bar is empty, refresh the
     * suggestions flow with the updated recent list.
     */
    fun removeHistoryEntry(query: String) {
        searchHistory.remove(query)
        if (_query.value.isBlank()) {
            val cfg = config ?: return
            _suggestions.value = getHistorySuggestions(cfg)
        }
    }
}
