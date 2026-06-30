package sh.kavi.fasttravel.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshotFlow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowOutward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VideoCameraBack
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import android.view.WindowManager
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import coil.size.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Block
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.DeviceType
import sh.kavi.fasttravel.core.InstalledApp
import sh.kavi.fasttravel.core.InstalledAppResolver
import sh.kavi.fasttravel.core.Suggestion
import sh.kavi.fasttravel.core.resolveIconUrl
import sh.kavi.fasttravel.data.ThemePreferences
import sh.kavi.fasttravel.deeplink.DeepLinkResolver
import sh.kavi.fasttravel.localsearch.LocalFileIcon
import sh.kavi.fasttravel.localsearch.fileTypeIcon
import sh.kavi.fasttravel.localsearch.formatFileSize
import sh.kavi.fasttravel.localsearch.formatModifiedDate
import sh.kavi.fasttravel.localsearch.hasMore
import sh.kavi.fasttravel.localsearch.index.FileResult
import sh.kavi.fasttravel.ui.appearance.resolveFromPrefs
import sh.kavi.fasttravel.ui.theme.DividerDark
import sh.kavi.fasttravel.ui.theme.DividerLight
import sh.kavi.fasttravel.ui.theme.FastTravelTheme
import sh.kavi.fasttravel.ui.theme.LocalAppearance
import sh.kavi.fasttravel.ui.theme.GroupColorPalette
import sh.kavi.fasttravel.ui.theme.MatchedChipBgDark
import sh.kavi.fasttravel.ui.theme.MatchedChipBgLight
import sh.kavi.fasttravel.ui.theme.MatchedChipTextDark
import sh.kavi.fasttravel.ui.theme.MatchedChipTextLight
import sh.kavi.fasttravel.ui.theme.SearchBarFillDark
import sh.kavi.fasttravel.ui.theme.SearchBarFillLight
import sh.kavi.fasttravel.ui.theme.SurfaceDark
import sh.kavi.fasttravel.ui.theme.SurfaceLight

@Composable
internal fun ChevronMark(
    size: Dp,
    fg: Color,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val v = this.size.minDimension
        val scale = v / 200f
        val strokeW = 24f * scale
        val stroke = Stroke(width = strokeW, cap = StrokeCap.Butt, join = StrokeJoin.Miter)
        val back = Path().apply {
            moveTo(52f * scale, 60f * scale)
            lineTo(98f * scale, 100f * scale)
            lineTo(52f * scale, 140f * scale)
        }
        drawPath(back, color = fg, style = stroke)
        val front = Path().apply {
            moveTo(102f * scale, 60f * scale)
            lineTo(148f * scale, 100f * scale)
            lineTo(102f * scale, 140f * scale)
        }
        drawPath(front, color = accent, style = stroke)
    }
}

/**
 * Circular monogram fallback used when a command has no icon URL or when the URL fails
 * to load. Renders a colored circle (from [GroupColorPalette]) with the trigger's first
 * letter centered in white.
 */
@Composable
private fun MonogramIcon(
    trigger: String,
    groupColorHex: String?,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val isDark = isSystemInDarkTheme()
    val (_, textColor) = GroupColorPalette.resolve(groupColorHex, fallbackKey = trigger, isDark = isDark)
    val letter = trigger.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(textColor),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = letter,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.5f).sp,
            textAlign = TextAlign.Center,
            lineHeight = (size.value * 0.5f).sp,
            style = LocalTextStyle.current.copy(
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(
                    alignment = LineHeightStyle.Alignment.Center,
                    trim = LineHeightStyle.Trim.Both,
                ),
            ),
        )
    }
}

/**
 * Favicon loader that falls back to a [MonogramIcon] when the URL is blank/null or
 * fails to load. Wraps SubcomposeAsyncImage so we can render Compose content in the
 * loading/error slots.
 */
@Composable
private fun CommandFavicon(
    iconUrl: String?,
    trigger: String,
    groupColorHex: String?,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    if (iconUrl.isNullOrBlank()) {
        MonogramIcon(trigger, groupColorHex, size, modifier)
        return
    }
    val context = LocalContext.current
    val request = remember(iconUrl) {
        ImageRequest.Builder(context)
            .data(iconUrl)
            .size(256)
            .crossfade(false)
            .transformations(sh.kavi.fasttravel.image.FaviconPadTransformation())
            .build()
    }
    SubcomposeAsyncImage(
        model = request,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier.size(size).clip(RoundedCornerShape(size.value.dp * 0.2f)),
        loading = { MonogramIcon(trigger, groupColorHex, size) },
        error = { MonogramIcon(trigger, groupColorHex, size) },
    )
}

internal fun isNetworkAvailable(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

class SearchActivity : ComponentActivity() {
    // Ticks every time a fresh widget intent lands so Compose can re-fire its
    // focus + keyboard effect even though the activity is reused (singleTask).
    private val widgetIntentTick = kotlinx.coroutines.flow.MutableStateFlow(0)

    // Ticks on every resume so the UI can reset to focus-mode + keyboard
    // whenever the user returns to the app (launcher, recents, back from
    // another app). First increment fires the initial focus; subsequent
    // increments replay it on each foreground transition.
    private val resumeTick = kotlinx.coroutines.flow.MutableStateFlow(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val deepLinkQuery = extractDeepLinkQuery(intent)
        val fromWidget = intent?.getBooleanExtra("from_widget", false) == true
        if (fromWidget) widgetIntentTick.value++

        setContent {
            val context = LocalContext.current
            val themePrefs = remember { ThemePreferences(context) }
            val tick by widgetIntentTick.collectAsState()
            val resume by resumeTick.collectAsState()

            // Observe appearance prefs so settings changes propagate here
            // without requiring the activity to be recreated.
            var appearance by remember {
                mutableStateOf(resolveFromPrefs(applicationContext, themePrefs))
            }
            LaunchedEffect(resume) {
                appearance = resolveFromPrefs(applicationContext, themePrefs)
            }

            FastTravelTheme(appearance = appearance) {
                val skin = LocalAppearance.current
                SideEffect {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        if (skin.applyBlur) {
                            window.setBackgroundBlurRadius(80)
                            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER)
                            window.setBackgroundDrawable(
                                android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT)
                            )
                        } else {
                            window.setBackgroundBlurRadius(0)
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER)
                            window.setBackgroundDrawable(null)
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .then(
                            if (skin.surfaceBrush != null)
                                Modifier.background(skin.surfaceBrush)
                            else Modifier
                        )
                ) {
                    SearchScreen(
                        initialQuery = deepLinkQuery,
                        fromWidget = fromWidget,
                        focusTick = tick,
                        resumeTick = resume,
                        shortcutRows = themePrefs.shortcutRows,
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        resumeTick.value++
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("from_widget", false)) {
            widgetIntentTick.value++
        }
    }

    private fun extractDeepLinkQuery(intent: Intent?): String? {
        if (intent == null) return null
        if (intent.action in listOf(
                Intent.ACTION_SEARCH,
                Intent.ACTION_WEB_SEARCH,
                "android.search.action.GLOBAL_SEARCH",
            )
        ) {
            return intent.getStringExtra("query")
                ?: intent.getStringExtra(android.app.SearchManager.QUERY)
        }
        val uri = intent.data ?: return null
        if (uri.scheme == "fasttravel" && uri.host == "search") {
            return uri.getQueryParameter("q")
        }
        return null
    }
}

@Composable
fun SearchScreen(
    viewModel: SearchViewModel = viewModel(),
    initialQuery: String? = null,
    fromWidget: Boolean = false,
    focusTick: Int = 0,
    resumeTick: Int = 0,
    shortcutRows: Int = 2,
) {
    val query by viewModel.query.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val chipItems by viewModel.chipItems.collectAsState()
    val installedApps by viewModel.installedApps.collectAsState()
    val groupColorMap by viewModel.groupColorMap.collectAsState()
    val context = LocalContext.current
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    // Launch an installed app, recording the launch on success. A launched app stays in
    // history/chips even after it's uninstalled (it may be reinstalled); if it's still gone
    // when tapped, startActivity throws — show a toast instead of crashing. The entry is
    // kept, so it works again once the app is reinstalled.
    val launchApp: (InstalledApp) -> Unit = { app ->
        try {
            context.startActivity(InstalledAppResolver.launchIntent(app))
            viewModel.recordAppLaunch(app)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, "${app.label} is no longer installed", Toast.LENGTH_SHORT).show()
        }
    }

    var isSearchFocused by remember { mutableStateOf(false) }

    val isDark = isSystemInDarkTheme()
    val screenBg = MaterialTheme.colorScheme.background
    val dividerColor = MaterialTheme.colorScheme.outlineVariant

    var isOffline by remember { mutableStateOf(false) }
    LaunchedEffect(resumeTick) { isOffline = !isNetworkAvailable(context) }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboardController?.show()
    }

    LaunchedEffect(initialQuery) {
        if (initialQuery != null) {
            viewModel.onQueryChanged(initialQuery)
            viewModel.onSearch(initialQuery)
        }
    }

    LaunchedEffect(fromWidget, focusTick) {
        if (fromWidget) {
            viewModel.onQueryChanged("")
            focusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    // On every foreground resume (task #15): clear any in-flight query, put
    // the search field in focus mode, and ask the IME to show. If the user
    // was mid-search and switched apps, they return to a fresh focused state.
    LaunchedEffect(resumeTick) {
        if (resumeTick > 0 && initialQuery == null) {
            viewModel.onQueryChanged("")
            focusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    LaunchedEffect(searchState) {
        when (searchState) {
            is SearchState.Navigate -> {
                val url = (searchState as SearchState.Navigate).url
                val intent = DeepLinkResolver.resolve(context, url)
                if (intent != null) {
                    context.startActivity(intent)
                } else {
                    android.widget.Toast.makeText(
                        context,
                        "Blocked unsupported URL scheme",
                        android.widget.Toast.LENGTH_SHORT,
                    ).show()
                }
                keyboardController?.hide()
                viewModel.onNavigationHandled()
            }
            is SearchState.LocalSearchResults -> {
                // Hide keyboard when the results screen appears.
                // Focus is naturally cleared as the TextField loses it.
                keyboardController?.hide()
            }
            else -> Unit
        }
    }

    // Focused/unfocused UI follows the TextField's focus state (reliable on every
    // launcher/IME). A BackHandler below clears focus + hides the keyboard so BACK
    // transitions back to the unfocused header/chips layout.
    val imeVisible = isSearchFocused
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    androidx.activity.compose.BackHandler(enabled = isSearchFocused) {
        keyboardController?.hide()
        focusManager.clearFocus(force = true)
    }
    // Composed after the focus handler so it wins when both are enabled:
    // BACK dismisses the typo card first.
    androidx.activity.compose.BackHandler(
        enabled = searchState is SearchState.TypoSuggestion,
    ) {
        viewModel.dismissTypo()
    }
    // BACK from the local-search results screen returns to the launcher.
    androidx.activity.compose.BackHandler(
        enabled = searchState is SearchState.LocalSearchResults,
    ) {
        viewModel.dismissLocalSearch()
    }

    // When a variant provides a surfaceBrush (AMOLED, Glass, gradients), the
    // Box at the Compose root paints it. Using scheme.background here would
    // overdraw that brush — fall through as Transparent instead.
    val appearance = LocalAppearance.current
    val surfaceColor = if (appearance.surfaceBrush != null) Color.Transparent else screenBg
    androidx.compose.material3.Surface(
        modifier = Modifier.fillMaxSize(),
        color = surfaceColor,
    ) {
      Box(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            if (!imeVisible) {
                Spacer(modifier = Modifier.height(48.dp))
            }
            // Unfocused header: "Fast Travel" wordmark + settings gear on top-right.
            AnimatedVisibility(
                visible = !imeVisible,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Fast Travel",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = (-0.6).sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = {
                            context.startActivity(Intent(context, SettingsActivity::class.java))
                        },
                        modifier = Modifier.semantics { contentDescription = "Open settings" },
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Settings,
                            contentDescription = "Settings",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }

            if (imeVisible) {
                Spacer(modifier = Modifier.height(8.dp))
            }

            val leadingCommand = remember(query) { viewModel.matchCommandForQuery(query)?.first }
            SearchBarPill(
                value = query,
                onValueChange = { viewModel.onQueryChanged(it) },
                onSearch = { viewModel.onSearch(query) },
                focusRequester = focusRequester,
                onFocusChanged = { isSearchFocused = it },
                leadingCommand = leadingCommand,
                leadingCommandGroupColor = leadingCommand?.let { groupColorMap[it.id] },
                typoActive = searchState is SearchState.TypoSuggestion,
                onDeclineTypo = { viewModel.fallbackSearchAfterTypo() },
                modifier = Modifier.fillMaxWidth(),
            )

            AnimatedVisibility(
                visible = isOffline,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudOff,
                        contentDescription = "No internet connection",
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Offline",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            AnimatedVisibility(
                visible = searchState is SearchState.TypoSuggestion,
                enter = slideInVertically { -it / 2 } + fadeIn(),
                exit = slideOutVertically { -it / 2 } + fadeOut(),
            ) {
                if (searchState is SearchState.TypoSuggestion) {
                    val typo = (searchState as SearchState.TypoSuggestion).typo
                    TypoSuggestionCard(
                        typo = typo,
                        onAccept = { viewModel.acceptTypo() },
                        onFallbackSearch = { viewModel.fallbackSearchAfterTypo() },
                        onIgnore = { viewModel.ignoreTypo() },
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            when {
                searchState is SearchState.LocalSearchResults -> {
                    val toolbarState by viewModel.localSearchToolbarState.collectAsState()
                    LocalSearchResultsScreen(
                        state = searchState as SearchState.LocalSearchResults,
                        toolbarState = toolbarState,
                        onOpenFile = { file ->
                            openFileResult(context, file) { fileId ->
                                viewModel.recordFileOpen(fileId)
                            }
                        },
                        onRetry = { viewModel.retryLocalSearch() },
                        onOpenPermissionSettings = {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                    data = android.net.Uri.fromParts("package", context.packageName, null)
                                }
                            )
                        },
                        onQueryModeChange = { viewModel.setLocalSearchQueryMode(it) },
                        onSortFieldChange = { viewModel.setLocalSearchSortField(it) },
                        onSortDirToggle = { viewModel.toggleLocalSearchSortDir() },
                        onViewToggle = { viewModel.setLocalSearchView(it) },
                        onTypeToggle = { viewModel.toggleLocalSearchFilterType(it) },
                        onDatePresetChange = { viewModel.setLocalSearchFilterDatePreset(it) },
                        onPathPrefixChange = { viewModel.setLocalSearchFilterPathPrefix(it) },
                        onTitleOnlyChange = { viewModel.setLocalSearchFilterTitleOnly(it) },
                        onClearFilters = { viewModel.clearLocalSearchFilters() },
                        onLoadMore = { viewModel.loadMoreLocalSearch() },
                        onCaseSensitiveChange = { viewModel.setLocalSearchCaseSensitive(it) },
                        onExactPhraseChange = { viewModel.setLocalSearchExactPhrase(it) },
                    )
                }
                imeVisible -> {
                    FocusedContent(
                        viewModel = viewModel,
                        query = query,
                        suggestions = suggestions,
                        installedApps = installedApps,
                        groupColorMap = groupColorMap,
                        onSuggestionClick = { s ->
                            viewModel.onQueryChanged(s.text)
                            viewModel.onSearch(s.text)
                        },
                        onSuggestionPopulate = { s -> viewModel.onQueryChanged(s.text) },
                        onHistoryRemove = { q -> viewModel.removeHistoryEntry(q) },
                        onAppLaunch = launchApp,
                        onCommandAutocompletePick = { cmd ->
                            val trig = cmd.triggers.firstOrNull() ?: return@FocusedContent
                            if (cmd.type == CommandType.Redirect) {
                                viewModel.onSearch(trig)
                            } else {
                                viewModel.onQueryChanged("$trig ")
                            }
                        },
                    )
                }
                else -> {
                    UnfocusedContent(
                        chipItems = chipItems,
                        groupColorMap = groupColorMap,
                        shortcutRows = shortcutRows,
                        onCommandClick = { command ->
                            val trigger = command.triggers.firstOrNull() ?: return@UnfocusedContent
                            if (command.type == CommandType.Redirect) {
                                viewModel.onSearch(trigger)
                            } else {
                                viewModel.onQueryChanged("$trigger ")
                                focusRequester.requestFocus()
                                keyboardController?.show()
                            }
                        },
                        onAppClick = launchApp,
                    )
                }
            }
        }
    }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SearchBarPill(
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: () -> Unit,
    focusRequester: FocusRequester,
    onFocusChanged: (Boolean) -> Unit,
    leadingCommand: Command? = null,
    leadingCommandGroupColor: String? = null,
    typoActive: Boolean = false,
    onDeclineTypo: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val appearance = LocalAppearance.current
    val pillShape = RoundedCornerShape(appearance.shape.cornerRadiusDp.dp)
    val border = appearance.searchBarBorder
    Row(
        modifier = modifier
            .height(56.dp)
            .clip(pillShape)
            .background(appearance.searchBarBrush, pillShape)
            .then(if (border != null) Modifier.border(border, pillShape) else Modifier)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingCommand != null) {
            CommandFavicon(
                iconUrl = resolveIconUrl(leadingCommand, DeviceType.Android),
                trigger = leadingCommand.triggers.firstOrNull() ?: "?",
                groupColorHex = leadingCommandGroupColor,
                size = 28.dp,
            )
        } else {
            ChevronMark(
                size = 28.dp,
                fg = appearance.searchBarContentColor,
                accent = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty()) {
                Text(
                    text = "Search or type a command\u2026",
                    color = appearance.searchBarPlaceholderColor,
                    fontSize = 16.sp,
                )
            }
            // Use the newer TextFieldState-based BasicTextField API. It has
            // proper built-in horizontal auto-scroll on cursor-handle drag
            // with lineLimits = SingleLine — the older `value: String` API
            // does not scroll reliably when the cursor handle is dragged to
            // the edge.
            val state = rememberTextFieldState(initialText = value)
            val currentValue = rememberUpdatedState(value)
            val currentOnValueChange = rememberUpdatedState(onValueChange)
            LaunchedEffect(value) {
                if (value != state.text.toString()) {
                    state.setTextAndPlaceCursorAtEnd(value)
                }
            }
            LaunchedEffect(state) {
                snapshotFlow { state.text.toString() }.collect { text ->
                    if (text != currentValue.value) currentOnValueChange.value(text)
                }
            }

            BasicTextField(
                state = state,
                lineLimits = TextFieldLineLimits.SingleLine,
                textStyle = LocalTextStyle.current.copy(
                    color = appearance.searchBarContentColor,
                    fontSize = 16.sp,
                ),
                cursorBrush = SolidColor(appearance.searchBarContentColor),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                onKeyboardAction = { _ -> onSearch() },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    // Hardware-keyboard "n" ("no") declines a showing typo suggestion,
                    // mirroring the browser's hidden decline shortcut. Consumed here so
                    // the letter isn't also typed into the field. Not advertised in the UI.
                    .onPreviewKeyEvent { event ->
                        if (typoActive &&
                            event.type == KeyEventType.KeyDown &&
                            event.key == Key.N
                        ) {
                            onDeclineTypo()
                            true
                        } else {
                            false
                        }
                    }
                    .onFocusChanged { onFocusChanged(it.isFocused) },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FocusedContent(
    viewModel: SearchViewModel,
    query: String,
    suggestions: List<Suggestion>,
    installedApps: List<InstalledApp>,
    groupColorMap: Map<String, String>,
    onSuggestionClick: (Suggestion) -> Unit,
    onSuggestionPopulate: (Suggestion) -> Unit,
    onHistoryRemove: (String) -> Unit,
    onAppLaunch: (InstalledApp) -> Unit,
    onCommandAutocompletePick: (Command) -> Unit,
) {
    val isEmptyQuery = query.isBlank()
    val matchedCommandPair = remember(query) { viewModel.matchCommandForQuery(query) }
    val matchedCommand = matchedCommandPair?.first
    val matchedCommandTrigger = matchedCommandPair?.second
    val autocompleteCommands = remember(query) { viewModel.commandsMatchingPrefix(query) }
    val dividerColor = if (isSystemInDarkTheme()) DividerDark else DividerLight

    Column(modifier = Modifier.fillMaxWidth()) {
        if (isEmptyQuery) {
            if (suggestions.isNotEmpty()) {
                Text(
                    text = "Recent",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp, bottom = 6.dp, start = 4.dp),
                )
                HorizontalDivider(color = dividerColor)
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(suggestions) { suggestion ->
                        HistoryRow(
                            suggestion = suggestion,
                            viewModel = viewModel,
                            groupColorMap = groupColorMap,
                            onClick = {
                                val app = suggestion.installedApp
                                if (app != null) onAppLaunch(app) else onSuggestionClick(suggestion)
                            },
                            onRemoveConfirmed = { onHistoryRemove(suggestion.text) },
                            onPopulate = { onSuggestionPopulate(suggestion) },
                        )
                        HorizontalDivider(color = dividerColor)
                    }
                    item {
                        TextButton(
                            onClick = { viewModel.clearHistory() },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 4.dp, vertical = 4.dp),
                        ) {
                            Text(
                                text = "Clear history",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        } else {
            // #4 Commands autocomplete — above the matched chip.
            if (autocompleteCommands.isNotEmpty()) {
                Text(
                    text = "Commands",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp, bottom = 6.dp, start = 4.dp),
                )
                Column(modifier = Modifier.fillMaxWidth()) {
                    for (cmd in autocompleteCommands) {
                        CommandAutocompleteRow(
                            command = cmd,
                            groupColorHex = groupColorMap[cmd.id],
                            onClick = { onCommandAutocompletePick(cmd) },
                        )
                    }
                }
                HorizontalDivider(color = dividerColor)
            }

            if (matchedCommand != null && matchedCommandTrigger != null) {
                Spacer(modifier = Modifier.height(8.dp))
                MatchedCommandChip(
                    command = matchedCommand,
                    matchedTrigger = matchedCommandTrigger,
                    groupColorHex = groupColorMap[matchedCommand.id],
                    onClick = { onCommandAutocompletePick(matchedCommand) },
                )
                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = dividerColor)
            }

            if (installedApps.isNotEmpty()) {
                InstalledAppsRow(apps = installedApps, onAppLaunch = onAppLaunch)
                HorizontalDivider(color = dividerColor)
            }

            if (suggestions.isNotEmpty()) {
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(suggestions) { suggestion ->
                        SuggestionRow(
                            suggestion = suggestion,
                            viewModel = viewModel,
                            groupColorMap = groupColorMap,
                            onClick = { onSuggestionClick(suggestion) },
                            onPopulate = { onSuggestionPopulate(suggestion) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CommandAutocompleteRow(
    command: Command,
    groupColorHex: String?,
    onClick: () -> Unit,
) {
    val trigger = command.triggers.firstOrNull() ?: return
    val isDark = isSystemInDarkTheme()
    val (_, textColor) = GroupColorPalette.resolve(groupColorHex, fallbackKey = command.id, isDark = isDark)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp)
            .semantics {
                contentDescription = "Autocomplete command: $trigger, ${command.name}"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommandFavicon(
            iconUrl = resolveIconUrl(command, DeviceType.Android),
            trigger = trigger,
            groupColorHex = groupColorHex,
            size = 20.dp,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = trigger,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            color = textColor,
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = command.name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MatchedCommandChip(command: Command, matchedTrigger: String, groupColorHex: String?, onClick: () -> Unit) {
    val bg = MaterialTheme.colorScheme.secondaryContainer
    val fg = MaterialTheme.colorScheme.onSecondaryContainer
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .semantics { contentDescription = "Matched command: $matchedTrigger - ${command.name}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommandFavicon(
            iconUrl = resolveIconUrl(command, DeviceType.Android),
            trigger = matchedTrigger,
            groupColorHex = groupColorHex,
            size = 20.dp,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = matchedTrigger,
            color = fg,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
        )
    }
}

@Composable
private fun InstalledAppsRow(
    apps: List<InstalledApp>,
    onAppLaunch: (InstalledApp) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        for (app in apps) {
            Column(
                modifier = Modifier
                    .width(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onAppLaunch(app) }
                    .padding(vertical = 4.dp)
                    .semantics { contentDescription = "Open ${app.label}" },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AsyncImage(
                    model = app.icon,
                    contentDescription = "${app.label} icon",
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(14.dp)),
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = app.label,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryRow(
    suggestion: Suggestion,
    viewModel: SearchViewModel,
    groupColorMap: Map<String, String>,
    onClick: () -> Unit,
    onRemoveConfirmed: () -> Unit,
    onPopulate: () -> Unit,
) {
    // rememberSaveable so a config change (e.g. rotation) doesn't silently close the
    // dialog and drop the user's long-press intent on the floor (#6).
    var showRemoveDialog by androidx.compose.runtime.saveable.rememberSaveable {
        mutableStateOf(false)
    }
    val keyboardController = LocalSoftwareKeyboardController.current

    if (showRemoveDialog) {
        AlertDialog(
            onDismissRequest = { showRemoveDialog = false },
            title = { Text("Remove this search?") },
            text = {
                Text("\"${suggestion.displayText}\" will be removed from your recent searches.")
            },
            confirmButton = {
                TextButton(onClick = {
                    showRemoveDialog = false
                    onRemoveConfirmed()
                }) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveDialog = false }) { Text("Cancel") }
            },
            // Only dismiss via explicit button taps — stops the dialog "flashing" when
            // the keyboard pops back up or the user accidentally taps outside.
            properties = DialogProperties(
                dismissOnClickOutside = false,
                dismissOnBackPress = true,
            ),
        )
    }

    val launchableApp = suggestion.installedApp
    val matchedCommand = suggestion.commandTrigger?.let { viewModel.findCommandByTrigger(it) }
    // Default Google favicon for unmatched (search-only) history rows so we don't
    // fall back to a per-row letter monogram that looks random.
    val favicon = suggestion.commandIconUrl
        ?: matchedCommand?.let { resolveIconUrl(it, DeviceType.Android) }
        ?: "https://icons.duckduckgo.com/ip3/google.com.ico"
    val groupColorHex = matchedCommand?.let { groupColorMap[it.id] }
    val triggerForMonogram = suggestion.commandTrigger
        ?: suggestion.displayText.trim().ifEmpty { "?" }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onClick,
                onLongClick = {
                    // Dismiss the IME before showing the dialog so it doesn't pop
                    // straight back up and steal focus from the dialog (#6).
                    keyboardController?.hide()
                    showRemoveDialog = true
                },
            )
            .padding(horizontal = 8.dp, vertical = 12.dp)
            .semantics {
                contentDescription = if (launchableApp != null) {
                    "Recent app: ${suggestion.displayText}. Long press to remove."
                } else {
                    "Recent search: ${suggestion.displayText}. Long press to remove."
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (launchableApp != null) {
            AsyncImage(
                model = launchableApp.icon,
                contentDescription = "${launchableApp.label} icon",
                modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)),
            )
        } else {
            CommandFavicon(
                iconUrl = favicon,
                trigger = triggerForMonogram,
                groupColorHex = groupColorHex,
                size = 24.dp,
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = suggestion.displayText,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        // Apps launch directly on tap, so the "populate search bar" affordance only
        // applies to query rows.
        if (launchableApp == null) {
            IconButton(onClick = onPopulate, modifier = Modifier.size(32.dp)) {
                // ArrowOutward points NE; rotate -90° -> NW arrow ("↖") per spec.
                Icon(
                    imageVector = Icons.Default.ArrowOutward,
                    contentDescription = "Populate search bar",
                    modifier = Modifier.size(20.dp).rotate(-90f),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
internal fun TailText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
) {
    // Render the tail-with-leading-ellipsis explicitly. Compose's
    // LayoutDirection.Rtl + TextOverflow.Ellipsis trick that browsers do for
    // CSS direction:rtl doesn't work the same way here — Material3 Text
    // keeps the LTR-content ellipsis on the right regardless of paragraph
    // direction. So we measure with the same renderer that will display the
    // text, and if it doesn't fit we binary-search for the longest suffix
    // that fits with a leading "…".
    //
    // Accessibility: the displayed string is the truncated "…tail" form, but
    // SuggestionRow already sets a contentDescription on the parent Row with
    // the full text, so screen readers announce the original. We also expose
    // the original text via semantics so onNodeWithText() in tests still
    // matches.
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier = modifier) {
        val maxWidth = constraints.maxWidth
        val displayed = remember(text, style, maxWidth) {
            val full = measurer.measure(
                text = AnnotatedString(text),
                style = style,
                softWrap = false,
                maxLines = 1,
            ).size.width
            if (full <= maxWidth) {
                text
            } else {
                val ellipsis = "…"
                // Binary search: smallest `cut` such that "…" + text.substring(cut)
                // fits within maxWidth. text.substring(text.length) = "" always fits.
                var lo = 0
                var hi = text.length
                while (lo < hi) {
                    val mid = (lo + hi) / 2
                    val candidate = ellipsis + text.substring(mid)
                    val w = measurer.measure(
                        text = AnnotatedString(candidate),
                        style = style,
                        softWrap = false,
                        maxLines = 1,
                    ).size.width
                    if (w <= maxWidth) hi = mid else lo = mid + 1
                }
                ellipsis + text.substring(lo)
            }
        }
        Text(
            text = displayed,
            style = style,
            color = color,
            maxLines = 1,
            modifier = Modifier.semantics {
                contentDescription = text
            },
        )
    }
}

@Composable
private fun SuggestionRow(
    suggestion: Suggestion,
    viewModel: SearchViewModel,
    groupColorMap: Map<String, String>,
    onClick: () -> Unit,
    onPopulate: () -> Unit,
) {
    val matchedCommand = suggestion.commandTrigger?.let { viewModel.findCommandByTrigger(it) }
    val favicon = suggestion.commandIconUrl
        ?: matchedCommand?.let { resolveIconUrl(it, DeviceType.Android) }
        ?: "https://icons.duckduckgo.com/ip3/google.com.ico"
    val groupColorHex = matchedCommand?.let { groupColorMap[it.id] }
    val triggerForMonogram = suggestion.commandTrigger
        ?: suggestion.displayText.trim().ifEmpty { "?" }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp)
            .semantics { contentDescription = "Search for ${suggestion.displayText}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommandFavicon(
            iconUrl = favicon,
            trigger = triggerForMonogram,
            groupColorHex = groupColorHex,
            size = 24.dp,
        )
        Spacer(modifier = Modifier.width(12.dp))
        TailText(
            text = suggestion.displayText,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onPopulate, modifier = Modifier.size(32.dp)) {
            Icon(
                imageVector = Icons.Default.ArrowOutward,
                contentDescription = "Populate search bar",
                modifier = Modifier.size(20.dp).rotate(-90f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            )
        }
    }
}

/**
 * Unfocused state: wraps command chips naturally via [FlowRow], capped at
 * `shortcutRows` lines. Before this change we used `chunked(perRow)` which left the
 * first row empty-looking when the total chip count was small, and was also desync
 * with the slider setting (#7, #12).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UnfocusedContent(
    chipItems: List<ChipItem>,
    groupColorMap: Map<String, String>,
    shortcutRows: Int,
    onCommandClick: (Command) -> Unit,
    onAppClick: (InstalledApp) -> Unit,
) {
    if (chipItems.isEmpty()) return

    val rows = shortcutRows.coerceIn(1, 3)

    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        maxLines = rows,
    ) {
        for (item in chipItems) {
            when (item) {
                is ChipItem.Cmd -> CommandChip(
                    command = item.command,
                    groupColorHex = groupColorMap[item.command.id],
                    onClick = { onCommandClick(item.command) },
                )
                is ChipItem.App -> AppChip(
                    app = item.app,
                    onClick = { onAppClick(item.app) },
                )
            }
        }
    }
}

@Composable
private fun AppChip(
    app: InstalledApp,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics { contentDescription = "Open ${app.label}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = app.icon,
            contentDescription = "${app.label} icon",
            modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = app.label,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CommandChip(
    command: Command,
    groupColorHex: String?,
    onClick: () -> Unit,
) {
    val trigger = command.triggers.firstOrNull() ?: return
    val isDark = isSystemInDarkTheme()
    val (fill, textColor) = GroupColorPalette.resolve(groupColorHex, fallbackKey = command.id, isDark = isDark)

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(24.dp))
            .background(fill)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics { contentDescription = "Command: $trigger - ${command.name}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommandFavicon(
            iconUrl = resolveIconUrl(command, DeviceType.Android),
            trigger = trigger,
            groupColorHex = groupColorHex,
            size = 24.dp,
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = trigger,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = textColor,
        )
    }
}

// ── Local Search Results ──────────────────────────────────────────────────────

/**
 * Opens [file] via [Intent.ACTION_VIEW] using a [FileProvider] content URI so the
 * receiving app gets read permission without us needing MANAGE_EXTERNAL_STORAGE.
 * Catches all failure modes and shows a toast rather than crashing.
 * On success, [onRecordOpen] is called to record the file id for frecency scoring.
 */
private fun openFileResult(
    context: Context,
    file: FileResult,
    onRecordOpen: (String) -> Unit,
) {
    try {
        val f = File(file.path)
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.provider",
            f,
        )
        val mime = file.mime.ifEmpty { "*/*" }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        onRecordOpen(file.id)
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No app found to open this file", Toast.LENGTH_SHORT).show()
    } catch (e: IllegalArgumentException) {
        // FileProvider path not covered — fall back to a direct file:// URI.
        // Note: FLAG_GRANT_READ_URI_PERMISSION is a no-op for file:// URIs (only
        // applies to content:// URIs from FileProvider), so it is intentionally omitted.
        try {
            val fallbackUri = android.net.Uri.fromFile(File(file.path))
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(fallbackUri, file.mime.ifEmpty { "*/*" })
            }
            context.startActivity(intent)
            onRecordOpen(file.id)
        } catch (_: Exception) {
            Toast.makeText(context, "Cannot open: ${file.name}", Toast.LENGTH_SHORT).show()
        }
    } catch (_: Exception) {
        Toast.makeText(context, "Cannot open: ${file.name}", Toast.LENGTH_SHORT).show()
    }
}

/**
 * Resolves [LocalFileIcon] to the matching Material icon vector and a theme-aware color.
 * Colors are sourced from [MaterialTheme.colorScheme] so they adapt to light/dark/AMOLED/
 * Material You and custom theme variants — no hardcoded hex values.
 * Called in the Compose layer; [fileTypeIcon] provides the pure category enum.
 */
@Composable
private fun fileTypeIconVector(icon: LocalFileIcon): Pair<ImageVector, Color> {
    val cs = MaterialTheme.colorScheme
    return when (icon) {
        LocalFileIcon.FOLDER   -> Icons.Default.Folder                       to cs.secondary
        LocalFileIcon.IMAGE    -> Icons.Default.Image                         to cs.primary
        LocalFileIcon.VIDEO    -> Icons.Default.VideoCameraBack               to cs.error
        LocalFileIcon.AUDIO    -> Icons.Default.MusicNote                     to cs.onSurfaceVariant
        LocalFileIcon.ARCHIVE  -> Icons.Default.Archive                       to cs.outline
        LocalFileIcon.CODE     -> Icons.Default.Code                          to cs.secondary
        LocalFileIcon.DOCUMENT -> Icons.Default.Description                   to cs.primary
        LocalFileIcon.OTHER    -> Icons.AutoMirrored.Filled.InsertDriveFile   to cs.outline
    }
}

/**
 * Full-screen results screen with Drive-style toolbar (query mode, sort, filters),
 * list/grid toggle, paginated results, and all loading/empty/error/permission states.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LocalSearchResultsScreen(
    state: SearchState.LocalSearchResults,
    toolbarState: LocalSearchToolbarState,
    onOpenFile: (FileResult) -> Unit,
    onRetry: () -> Unit,
    onOpenPermissionSettings: () -> Unit,
    onQueryModeChange: (String) -> Unit,
    onSortFieldChange: (String) -> Unit,
    onSortDirToggle: () -> Unit,
    onViewToggle: (String) -> Unit,
    onTypeToggle: (String) -> Unit,
    onDatePresetChange: (String) -> Unit,
    onPathPrefixChange: (String) -> Unit,
    onTitleOnlyChange: (Boolean) -> Unit,
    onClearFilters: () -> Unit,
    onLoadMore: () -> Unit,
    onCaseSensitiveChange: (Boolean) -> Unit,
    onExactPhraseChange: (Boolean) -> Unit,
) {
    val dividerColor = MaterialTheme.colorScheme.outlineVariant

    Column(modifier = Modifier.fillMaxSize()) {
        // ── Toolbar (shown once we're past the gating states) ──────────────────
        if (!state.needsPermission && state.error == null && state.query.isNotBlank()) {
            LocalSearchToolbar(
                toolbarState = toolbarState,
                onQueryModeChange = onQueryModeChange,
                onSortFieldChange = onSortFieldChange,
                onSortDirToggle = onSortDirToggle,
                onViewToggle = onViewToggle,
                onTypeToggle = onTypeToggle,
                onDatePresetChange = onDatePresetChange,
                onPathPrefixChange = onPathPrefixChange,
                onTitleOnlyChange = onTitleOnlyChange,
                onClearFilters = onClearFilters,
                onCaseSensitiveChange = onCaseSensitiveChange,
                onExactPhraseChange = onExactPhraseChange,
            )
            HorizontalDivider(color = dividerColor)
        }

        // ── Count + source line ────────────────────────────────────────────────
        if (!state.isLoading && state.error == null && !state.needsPermission && state.query.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp, bottom = 2.dp, start = 4.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = when {
                        state.degraded && state.total == 1 -> "1+ file"
                        state.degraded -> "${state.total}+ files"
                        state.total == 1 -> "1 file"
                        else -> "${state.total} files"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "On-device",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }
            HorizontalDivider(color = dividerColor)
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.needsPermission -> {
                LocalSearchPermissionNeeded(onOpenSettings = onOpenPermissionSettings)
            }
            state.error != null -> {
                LocalSearchError(message = state.error, onRetry = onRetry)
            }
            state.query.isBlank() -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Type a search term after 's' to search your files",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            state.results.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No files match \"${state.query}\"",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            toolbarState.view == "grid" -> {
                // ── Grid view ──────────────────────────────────────────────────
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    gridItems(state.results) { file ->
                        FileResultGridCard(file = file, onClick = { onOpenFile(file) })
                    }
                    if (hasMore(state.results.size, state.total)) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            LoadMoreFooter(isLoadingMore = state.isLoadingMore, onLoadMore = onLoadMore)
                        }
                    }
                }
            }
            else -> {
                // ── List view ──────────────────────────────────────────────────
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.results) { file ->
                        FileResultRow(file = file, onClick = { onOpenFile(file) })
                        HorizontalDivider(color = dividerColor)
                    }
                    if (hasMore(state.results.size, state.total)) {
                        item {
                            LoadMoreFooter(isLoadingMore = state.isLoadingMore, onLoadMore = onLoadMore)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Drive-style toolbar: query-mode segmented control, sort (field + direction),
 * list/grid toggle, type-filter chips, date preset, title-only switch,
 * exact-phrase + match-case toggles, path field, and a clear affordance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LocalSearchToolbar(
    toolbarState: LocalSearchToolbarState,
    onQueryModeChange: (String) -> Unit,
    onSortFieldChange: (String) -> Unit,
    onSortDirToggle: () -> Unit,
    onViewToggle: (String) -> Unit,
    onTypeToggle: (String) -> Unit,
    onDatePresetChange: (String) -> Unit,
    onPathPrefixChange: (String) -> Unit,
    onTitleOnlyChange: (Boolean) -> Unit,
    onClearFilters: () -> Unit,
    onCaseSensitiveChange: (Boolean) -> Unit,
    onExactPhraseChange: (Boolean) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // ── Row 1: query mode | sort + dir | view toggle ───────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Query-mode segmented buttons
            val modes = listOf("simple" to "Simple", "wildcard" to "Wildcard", "regex" to "Regex*")
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                for ((value, label) in modes) {
                    val selected = toolbarState.queryMode == value
                    if (selected) {
                        Button(
                            onClick = {},
                            modifier = Modifier.weight(1f).height(32.dp),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                        ) {
                            Text(label, fontSize = 11.sp, maxLines = 1)
                        }
                    } else {
                        OutlinedButton(
                            onClick = { onQueryModeChange(value) },
                            modifier = Modifier.weight(1f).height(32.dp),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                        ) {
                            Text(label, fontSize = 11.sp, maxLines = 1)
                        }
                    }
                }
            }

            // Sort field dropdown
            var sortExpanded by remember { mutableStateOf(false) }
            // Bug B: "Date created" sort removed — unreliable via MediaStore on Android.
            val sortFieldOptions = listOf("" to "Relevance", "modified" to "Modified")
            val currentSortLabel = sortFieldOptions.firstOrNull { it.first == toolbarState.sortField }?.second ?: "Relevance"
            ExposedDropdownMenuBox(
                expanded = sortExpanded,
                onExpandedChange = { sortExpanded = it },
            ) {
                OutlinedButton(
                    onClick = { sortExpanded = true },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .height(32.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                ) {
                    Text(currentSortLabel, fontSize = 11.sp, maxLines = 1)
                    Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(14.dp))
                }
                ExposedDropdownMenu(expanded = sortExpanded, onDismissRequest = { sortExpanded = false }) {
                    sortFieldOptions.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { onSortFieldChange(value); sortExpanded = false },
                        )
                    }
                }
            }

            // Sort direction toggle
            val isAsc = toolbarState.sortDir == "asc"
            IconButton(
                onClick = onSortDirToggle,
                modifier = Modifier.size(32.dp),
            ) {
                Icon(
                    imageVector = if (isAsc) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                    contentDescription = if (isAsc) "Sort ascending" else "Sort descending",
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // List / Grid view toggle
            Row {
                IconButton(onClick = { onViewToggle("list") }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ViewList,
                        contentDescription = "List view",
                        modifier = Modifier.size(18.dp),
                        tint = if (toolbarState.view == "list") MaterialTheme.colorScheme.primary
                               else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { onViewToggle("grid") }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Default.GridView,
                        contentDescription = "Grid view",
                        modifier = Modifier.size(18.dp),
                        tint = if (toolbarState.view == "grid") MaterialTheme.colorScheme.primary
                               else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // ── Row 2: type chips + date preset + title-only + clear (scrollable) ──
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val fileTypeChips = listOf(
                "document" to "Doc",
                "image" to "Image",
                "video" to "Video",
                "audio" to "Audio",
                "archive" to "Archive",
                "code" to "Code",
                "folder" to "Folder",
                "other" to "Other",
            )
            for ((value, label) in fileTypeChips) {
                FilterChip(
                    selected = toolbarState.filterTypes.contains(value),
                    onClick = { onTypeToggle(value) },
                    label = { Text(label, fontSize = 11.sp) },
                    modifier = Modifier.height(28.dp),
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Date preset dropdown
            var dateExpanded by remember { mutableStateOf(false) }
            val dateOptions = listOf("any" to "Any time", "week" to "Past week", "month" to "Past month", "year" to "Past year")
            val currentDateLabel = dateOptions.firstOrNull { it.first == toolbarState.filterDatePreset }?.second ?: "Any time"
            ExposedDropdownMenuBox(
                expanded = dateExpanded,
                onExpandedChange = { dateExpanded = it },
            ) {
                FilterChip(
                    selected = toolbarState.filterDatePreset != "any",
                    onClick = { dateExpanded = true },
                    label = {
                        Text(currentDateLabel, fontSize = 11.sp)
                        Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(12.dp))
                    },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .height(28.dp),
                )
                ExposedDropdownMenu(expanded = dateExpanded, onDismissRequest = { dateExpanded = false }) {
                    dateOptions.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { onDatePresetChange(value); dateExpanded = false },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Title-only toggle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onTitleOnlyChange(!toolbarState.filterTitleOnly) },
            ) {
                Switch(
                    checked = toolbarState.filterTitleOnly,
                    onCheckedChange = onTitleOnlyChange,
                    modifier = Modifier.height(24.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Title only",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Match case toggle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onCaseSensitiveChange(!toolbarState.caseSensitive) },
            ) {
                Switch(
                    checked = toolbarState.caseSensitive,
                    onCheckedChange = onCaseSensitiveChange,
                    modifier = Modifier.height(24.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Match case",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Exact phrase toggle (disabled in regex mode — pattern already is the full query)
            val isRegexMode = toolbarState.queryMode == "regex"
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable(enabled = !isRegexMode) {
                    if (!isRegexMode) onExactPhraseChange(!toolbarState.exactPhrase)
                },
            ) {
                Switch(
                    checked = toolbarState.exactPhrase,
                    onCheckedChange = { if (!isRegexMode) onExactPhraseChange(it) },
                    enabled = !isRegexMode,
                    modifier = Modifier.height(24.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Exact phrase",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isRegexMode) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                            else MaterialTheme.colorScheme.onSurface,
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Clear filters
            val hasActiveFilters = toolbarState.filterTypes.isNotEmpty() ||
                toolbarState.filterDatePreset != "any" ||
                toolbarState.filterPathPrefix.isNotEmpty() ||
                toolbarState.filterTitleOnly ||
                toolbarState.caseSensitive ||
                toolbarState.exactPhrase
            if (hasActiveFilters) {
                TextButton(
                    onClick = onClearFilters,
                    modifier = Modifier.height(28.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                ) {
                    Text("Clear", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        // ── Row 3: path prefix (full-width, debounced) ──────────────────────────
        // Local mutable state for debouncing; syncs to toolbarState.filterPathPrefix externally.
        var localPath by remember { mutableStateOf(toolbarState.filterPathPrefix) }
        LaunchedEffect(toolbarState.filterPathPrefix) {
            if (localPath != toolbarState.filterPathPrefix) localPath = toolbarState.filterPathPrefix
        }
        LaunchedEffect(localPath) {
            if (localPath != toolbarState.filterPathPrefix) {
                kotlinx.coroutines.delay(400L)
                onPathPrefixChange(localPath)
            }
        }
        OutlinedTextFieldS(
            value = localPath,
            onValueChange = { localPath = it },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            placeholder = { Text("Path prefix…", style = MaterialTheme.typography.bodySmall) },
        )
    }
}

/**
 * Grid card for a single file result (used in grid view).
 */
@Composable
private fun FileResultGridCard(file: FileResult, onClick: () -> Unit) {
    val iconInfo = fileTypeIcon(file.type)
    val (iconVector, iconColor) = fileTypeIconVector(iconInfo)
    val meta = buildString {
        val date = formatModifiedDate(file.modifiedAt)
        if (date.isNotEmpty()) append(date)
        val size = formatFileSize(file.size)
        if (size.isNotEmpty()) { if (isNotEmpty()) append(" · "); append(size) }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = "File: ${file.name}" },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = iconVector,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = iconColor,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = file.name,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            if (meta.isNotEmpty()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = meta,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Load-more footer shown at the bottom of list/grid when more results are available.
 */
@Composable
private fun LoadMoreFooter(isLoadingMore: Boolean, onLoadMore: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (isLoadingMore) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp))
        } else {
            OutlinedButton(onClick = onLoadMore) {
                Text("Load more")
            }
        }
    }
}

@Composable
private fun LocalSearchPermissionNeeded(onOpenSettings: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Search,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Storage permission needed",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Grant media access in Settings → Local Search to search your files.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onOpenSettings) {
            Text("Open Settings")
        }
    }
}

@Composable
private fun LocalSearchError(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Search failed",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        OutlinedButton(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
private fun FileResultRow(file: FileResult, onClick: () -> Unit) {
    val iconInfo = fileTypeIcon(file.type)
    val (iconVector, iconColor) = fileTypeIconVector(iconInfo)
    val sizeText = formatFileSize(file.size)
    val dateText = formatModifiedDate(file.modifiedAt)
    val meta = listOfNotNull(dateText.takeIf { it.isNotEmpty() }, sizeText.takeIf { it.isNotEmpty() })
        .joinToString(" · ")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp)
            .semantics {
                contentDescription = "File: ${file.name}"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Per-type icon in a tinted circle, matching CommandFavicon visual weight.
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(iconColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = iconVector,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = iconColor,
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = file.name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (file.dir.isNotEmpty()) {
                TailText(
                    text = file.dir,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (meta.isNotEmpty()) {
                Text(
                    text = meta,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
fun TypoSuggestionCard(
    typo: sh.kavi.fasttravel.core.ParseOutput.TypoResult,
    onAccept: () -> Unit,
    onFallbackSearch: () -> Unit,
    onIgnore: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = "Did you mean?",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                text = "You typed \"${typo.originalQuery}\"",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = 2.dp),
            )
            Spacer(modifier = Modifier.height(14.dp))

            // Primary: accept the suggested command
            Button(
                onClick = onAccept,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "Accept typo correction to ${typo.suggestedTrigger}"
                    },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CommandFavicon(
                        iconUrl = resolveIconUrl(typo.suggestedCommand, DeviceType.Android),
                        trigger = typo.suggestedTrigger,
                        groupColorHex = null,
                        size = 20.dp,
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Use \"${typo.suggestedTrigger}\"",
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = typo.suggestedCommand.name,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))

            // Secondary: fall through to a plain search on the default engine
            OutlinedButton(
                onClick = onFallbackSearch,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Search instead"
                    },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.Language,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Use \"${typo.originalQuery}\" as search",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(modifier = Modifier.height(4.dp))

            // Tertiary: add this trigger to the ignore list
            TextButton(
                onClick = onIgnore,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Add to ignore list and search as typed"
                    },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.Block,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Add to ignore list",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
