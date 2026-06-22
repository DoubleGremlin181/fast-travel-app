package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
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
import sh.kavi.fasttravel.core.resolveIconUrl
import sh.kavi.fasttravel.data.AutoIgnoreStore
import sh.kavi.fasttravel.data.ConfigRepository
import sh.kavi.fasttravel.data.SearchHistory
import sh.kavi.fasttravel.data.ThemePreferences
import sh.kavi.fasttravel.data.withIgnoreAdded
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

    private val _chipCommands = MutableStateFlow<List<Command>>(emptyList())
    val chipCommands: StateFlow<List<Command>> = _chipCommands.asStateFlow()

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
            if (key == "shortcut_rows") updateChipCommands()
        }

    // Auto-ignore tracking for false positive typos
    private val autoIgnoreStore = AutoIgnoreStore(application)

    init {
        loadCommonWords(application)
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

        // Rank by frecency (usage frequency + recency); empty history falls back
        // to config order. Shared with the extension via
        // shared/test-fixtures/frecency.fixtures.json.
        val history = searchHistory.getHistory().map {
            Frecency.HistoryEntry(it.commandId, it.timestamp)
        }
        val byId = standardCommands.associateBy { it.id }
        _chipCommands.value = Frecency
            .rank(standardCommands.map { it.id }, history, System.currentTimeMillis())
            .mapNotNull { byId[it] }
            .take(targetCount)
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
        if (newQuery.isBlank()) {
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

        val triggerMap = CommandParser.buildTriggerMap(config)
        return history.distinctBy { it.query }.take(10).map { entry ->
            val cmd = entry.commandId?.let { id ->
                triggerMap.values.find { it.id == id }
            }
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

            // Promote to permanent list + delete the candidate record (count + DNI).
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

    fun googleSearchTypo() {
        val state = _searchState.value
        if (state is SearchState.TypoSuggestion) {
            val trigger = state.typo.originalQuery.split(Regex("\\s+"))[0]
            // Positive dismissal signal — bump the counter. Auto-add is handled
            // at parse time by effectiveIgnoreList (Task 6 wires it up).
            autoIgnoreStore.increment(trigger)

            val query = state.typo.originalQuery
            val encodedQuery = sh.kavi.fasttravel.core.UrlEncoding.component(query)
            searchHistory.addEntry(query, null)
            _searchState.value = SearchState.Navigate("https://www.google.com/search?q=$encodedQuery")
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
