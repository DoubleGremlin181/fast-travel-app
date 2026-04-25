package sh.kavi.fasttravel.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DragIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.data.AutoIgnoreStore
import sh.kavi.fasttravel.data.ConfigRefreshInterval
import sh.kavi.fasttravel.data.ConfigRefreshScheduler
import sh.kavi.fasttravel.data.ConfigRepository
import sh.kavi.fasttravel.data.ConfigValidator
import sh.kavi.fasttravel.data.EditableConfigStore
import sh.kavi.fasttravel.data.SearchHistory
import sh.kavi.fasttravel.data.ThemePreferences
import sh.kavi.fasttravel.data.allGroupIds
import sh.kavi.fasttravel.data.findGroupById
import sh.kavi.fasttravel.data.withDefaultCommand
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import sh.kavi.fasttravel.data.withGroupAdded
import sh.kavi.fasttravel.data.withGroupDeleted
import sh.kavi.fasttravel.data.withGroupMoved
import sh.kavi.fasttravel.data.withGroupUpdated
import sh.kavi.fasttravel.data.withIgnoreAdded
import sh.kavi.fasttravel.data.withIgnoreRemoved
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.graphicsLayer
import sh.kavi.fasttravel.ui.appearance.AppearanceMode
import sh.kavi.fasttravel.ui.appearance.AppearanceShape
import sh.kavi.fasttravel.ui.appearance.AppearanceVariant
import sh.kavi.fasttravel.ui.appearance.ResolvedAppearance
import sh.kavi.fasttravel.ui.appearance.resolveAppearance
import sh.kavi.fasttravel.ui.appearance.resolveFromPrefs
import sh.kavi.fasttravel.ui.theme.FastTravelTheme
import sh.kavi.fasttravel.ui.theme.LocalAppearance
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ==================== Navigation Routes ====================

sealed class SettingsRoute(val route: String) {
    data object Home : SettingsRoute("settings_home")
    data object Appearance : SettingsRoute("appearance")
    data object ConfigSource : SettingsRoute("config_source")
    data object CommandsHome : SettingsRoute("config/commands")
    data object GroupsHome : SettingsRoute("config/groups")
    data object GroupNew : SettingsRoute("config/groups/new")
    data object GroupEdit : SettingsRoute("config/groups/edit/{groupId}") {
        fun build(groupId: String) = "config/groups/edit/$groupId"
    }
    data object IgnoreList : SettingsRoute("config/ignoreList")
    data object SearchHistoryScreen : SettingsRoute("search_history")
    data object About : SettingsRoute("about")
    data object Configuration : SettingsRoute("configuration")
    data object ImportExport : SettingsRoute("import_export")

    // Nested editor routes (consumed by ConfigEditorScreens)
    data object CommandNew : SettingsRoute("config/commands/new?groupId={groupId}") {
        fun build(groupId: String) = "config/commands/new?groupId=$groupId"
    }
    data object CommandEdit : SettingsRoute("config/commands/edit/{commandId}") {
        fun build(commandId: String) = "config/commands/edit/$commandId"
    }
    data object RouteEdit : SettingsRoute(
        "config/commands/route?commandId={commandId}&routeIndex={routeIndex}",
    ) {
        fun build(commandId: String, routeIndex: Int) =
            "config/commands/route?commandId=$commandId&routeIndex=$routeIndex"
    }
    data object PatternEdit : SettingsRoute(
        "config/commands/pattern?commandId={commandId}&routeIndex={routeIndex}&patternIndex={patternIndex}",
    ) {
        fun build(commandId: String, routeIndex: Int, patternIndex: Int) =
            "config/commands/pattern?commandId=$commandId&routeIndex=$routeIndex&patternIndex=$patternIndex"
    }
}

// ==================== Activity ====================

class SettingsActivity : ComponentActivity() {

    /**
     * Settings isn't meant to outlive a task switch. If the user backgrounds
     * the app while here (home, recents, another app), finish so the next
     * resume lands on SearchActivity in focus mode. Guarded against
     * configuration changes and multi-window scenarios so we only tear down
     * when the activity is really fully obscured.
     */
    override fun onStop() {
        super.onStop()
        if (!isFinishing && !isChangingConfigurations) {
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val context = LocalContext.current
            val themePrefs = remember { ThemePreferences(context) }
            var appearance by remember { mutableStateOf(resolveFromPrefs(applicationContext, themePrefs)) }

            FastTravelTheme(appearance = appearance) {
                val skin = LocalAppearance.current
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .then(
                            if (skin.surfaceBrush != null)
                                Modifier.background(skin.surfaceBrush)
                            else Modifier
                        )
                        .then(
                            if (skin.applyBlur && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                                Modifier.graphicsLayer { renderEffect = BlurEffect(20f, 20f) }
                            else Modifier
                        )
                ) {
                    SettingsNavHost(
                        onFinish = { finish() },
                        themePrefs = themePrefs,
                        onAppearanceChanged = { appearance = it },
                    )
                }
            }
        }
    }
}

// ==================== Nav Host ====================

@Composable
fun SettingsNavHost(
    onFinish: () -> Unit,
    themePrefs: ThemePreferences,
    onAppearanceChanged: (ResolvedAppearance) -> Unit = {},
) {
    val navController = rememberNavController()
    val context = LocalContext.current
    val editableStore = remember { EditableConfigStore(context) }
    val configRepository = remember { ConfigRepository(context) }
    val searchHistory = remember { SearchHistory(context) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var config by remember { mutableStateOf<FastTravelConfig?>(null) }

    LaunchedEffect(Unit) {
        config = configRepository.getConfig()
    }

    val refreshConfig: () -> Unit = {
        scope.launch { config = configRepository.getConfig() }
    }

    NavHost(
        navController = navController,
        startDestination = SettingsRoute.Home.route,
    ) {
        composable(SettingsRoute.Home.route) {
            SettingsHomeScreen(
                navController = navController,
                onBack = onFinish,
                config = config,
            )
        }
        composable(SettingsRoute.Appearance.route) {
            AppearanceScreen(
                onBack = { navController.popBackStack() },
                onAppearanceChanged = onAppearanceChanged,
            )
        }
        composable(SettingsRoute.Configuration.route) {
            ConfigurationScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                themePrefs = themePrefs,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.ConfigSource.route) {
            ConfigSourceScreen(
                navController = navController,
                themePrefs = themePrefs,
                configRepository = configRepository,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.CommandsHome.route) {
            CommandsHomeScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.CommandNew.route) { backStackEntry ->
            val groupId = backStackEntry.arguments?.getString("groupId").orEmpty()
            CommandEditScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                commandId = null,
                initialGroupId = groupId,
                refreshConfig = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.CommandEdit.route) { backStackEntry ->
            val commandId = backStackEntry.arguments?.getString("commandId").orEmpty()
            CommandEditScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                commandId = commandId,
                initialGroupId = null,
                refreshConfig = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.RouteEdit.route) { backStackEntry ->
            val commandId = backStackEntry.arguments?.getString("commandId").orEmpty()
            val routeIndex = backStackEntry.arguments?.getString("routeIndex")?.toIntOrNull() ?: -1
            RouteEditScreen(
                navController = navController,
                commandId = commandId,
                routeIndex = routeIndex,
            )
        }
        composable(SettingsRoute.PatternEdit.route) { backStackEntry ->
            val commandId = backStackEntry.arguments?.getString("commandId").orEmpty()
            val routeIndex = backStackEntry.arguments?.getString("routeIndex")?.toIntOrNull() ?: -1
            val patternIndex = backStackEntry.arguments?.getString("patternIndex")?.toIntOrNull() ?: -1
            PatternEditScreen(
                navController = navController,
                commandId = commandId,
                routeIndex = routeIndex,
                patternIndex = patternIndex,
            )
        }
        composable(SettingsRoute.GroupsHome.route) {
            GroupsHomeScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.GroupNew.route) {
            GroupEditScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                groupId = null,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.GroupEdit.route) { backStackEntry ->
            val groupId = backStackEntry.arguments?.getString("groupId").orEmpty()
            GroupEditScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                groupId = groupId,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.IgnoreList.route) {
            IgnoreListScreen(
                navController = navController,
                config = config,
                editableStore = editableStore,
                onConfigChanged = refreshConfig,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.SearchHistoryScreen.route) {
            SearchHistoryScreen(
                navController = navController,
                searchHistory = searchHistory,
                snackbarHostState = snackbarHostState,
            )
        }
        composable(SettingsRoute.About.route) {
            AboutScreen(navController = navController)
        }
    }
}

// ==================== Shared Components ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsTopBar(
    title: String,
    onBack: () -> Unit,
) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Navigate back",
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            titleContentColor = MaterialTheme.colorScheme.onSurface,
            navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
        ),
    )
}

@Composable
fun SettingsCategoryHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, top = 24.dp, bottom = 8.dp, end = 16.dp),
    )
}

@Composable
fun SettingsCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        content()
    }
}

@Composable
fun NavigableListItem(
    headlineText: String,
    supportingText: String? = null,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(
                text = headlineText,
                style = MaterialTheme.typography.bodyLarge,
            )
        },
        supportingContent = if (supportingText != null) {
            {
                Text(
                    text = supportingText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else null,
        trailingContent = {
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

// ==================== Settings Home Screen ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsHomeScreen(
    navController: NavHostController,
    onBack: () -> Unit,
    config: FastTravelConfig?,
) {
    Scaffold(
        topBar = { SettingsTopBar(title = "Settings", onBack = onBack) },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(modifier = Modifier.height(16.dp))
            SettingsCard {
                NavigableListItem(
                    headlineText = "Appearance",
                    supportingText = "Theme, variant, shape",
                    onClick = { navController.navigate(SettingsRoute.Appearance.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "Configuration",
                    supportingText = "Commands, groups, import/export",
                    onClick = { navController.navigate(SettingsRoute.Configuration.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "Ignore list",
                    supportingText = pluralize(config?.ignoreList?.size ?: 0, "item"),
                    onClick = { navController.navigate(SettingsRoute.IgnoreList.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "History",
                    onClick = { navController.navigate(SettingsRoute.SearchHistoryScreen.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "About",
                    supportingText = "v2.0.0",
                    onClick = { navController.navigate(SettingsRoute.About.route) },
                )
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ==================== Configuration Screen ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigurationScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    themePrefs: ThemePreferences,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    val scope = rememberCoroutineScope()
    Scaffold(
        topBar = { SettingsTopBar(title = "Configuration", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(modifier = Modifier.height(16.dp))
            SettingsCard {
                val commandCount = if (config != null) getAllCommands(config).size else 0
                NavigableListItem(
                    headlineText = "Commands",
                    supportingText = if (config != null) pluralize(commandCount, "command") else "Loading...",
                    onClick = { navController.navigate(SettingsRoute.CommandsHome.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                val groupCount = config?.groups?.size ?: 0
                NavigableListItem(
                    headlineText = "Groups",
                    supportingText = if (config != null) pluralize(groupCount, "group") else "Loading...",
                    onClick = { navController.navigate(SettingsRoute.GroupsHome.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                DefaultCommandPicker(
                    config = config,
                    editableStore = editableStore,
                    themePrefs = themePrefs,
                    onConfigChanged = onConfigChanged,
                    snackbarHostState = snackbarHostState,
                    scope = scope,
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "Import / Export",
                    supportingText = if (themePrefs.configSourceDirty) "Local config · auto-refresh paused" else "Synced from remote",
                    onClick = { navController.navigate(SettingsRoute.ImportExport.route) },
                )
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ==================== Appearance Screen ====================

private data class AppearanceDraft(
    val mode: AppearanceMode,
    val variant: AppearanceVariant,
    val shape: AppearanceShape,
    val opacity: Int,
    val rows: Int,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppearanceScreen(
    onBack: () -> Unit,
    onAppearanceChanged: (ResolvedAppearance) -> Unit = {},
) {
    val context = LocalContext.current
    val prefs = remember { ThemePreferences(context) }
    var draft by remember {
        mutableStateOf(
            AppearanceDraft(
                mode = prefs.mode,
                variant = prefs.variant,
                shape = prefs.shape,
                opacity = prefs.widgetOpacity,
                rows = prefs.shortcutRows,
            )
        )
    }
    val appearance = remember(draft) {
        resolveAppearance(context, draft.mode, draft.variant, draft.shape)
    }

    LaunchedEffect(appearance) {
        onAppearanceChanged(appearance)
    }

    LaunchedEffect(draft) {
        kotlinx.coroutines.delay(150)
        prefs.mode = draft.mode
        prefs.variant = draft.variant
        prefs.shape = draft.shape
        prefs.widgetOpacity = draft.opacity
        prefs.shortcutRows = draft.rows
        SearchWidgetProvider.refreshAll(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Appearance") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            // 1. Live preview
            CompositionLocalProvider(LocalAppearance provides appearance) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .height(120.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    WidgetPreview(opacityPercent = draft.opacity)
                }
            }
            // 2. Mode segmented control
            AppearanceModePicker(draft.mode) { draft = draft.copy(mode = it) }
            // 3. Variant picker — LazyRow of 9 thumbnails
            AppearanceVariantPicker(
                current = draft.variant,
                mode = draft.mode,
                shape = draft.shape,
                onSelect = { draft = draft.copy(variant = it) },
            )
            // 4. Shape picker — LazyRow of 4 thumbnails
            AppearanceShapePicker(
                current = draft.shape,
                mode = draft.mode,
                variant = draft.variant,
                onSelect = { draft = draft.copy(shape = it) },
            )
            // 5. Opacity slider
            AppearanceOpacitySlider(
                value = draft.opacity,
                onChange = { draft = draft.copy(opacity = it) },
            )
            // 6. Shortcut rows slider
            AppearanceRowsSlider(
                value = draft.rows,
                onChange = { draft = draft.copy(rows = it) },
            )
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceModePicker(
    selected: AppearanceMode,
    onSelect: (AppearanceMode) -> Unit,
) {
    SingleChoiceSegmentedButtonRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        AppearanceMode.entries.forEachIndexed { index, m ->
            SegmentedButton(
                selected = selected == m,
                onClick = { onSelect(m) },
                shape = SegmentedButtonDefaults.itemShape(
                    index = index,
                    count = AppearanceMode.entries.size,
                ),
            ) {
                Text(
                    when (m) {
                        AppearanceMode.LIGHT -> "Light"
                        AppearanceMode.DARK -> "Dark"
                        AppearanceMode.SYSTEM -> "System"
                    }
                )
            }
        }
    }
}

@Composable
private fun AppearanceVariantPicker(
    current: AppearanceVariant,
    mode: AppearanceMode,
    shape: AppearanceShape,
    onSelect: (AppearanceVariant) -> Unit,
) {
    val context = LocalContext.current
    SettingsCategoryHeader(title = "Style")
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(AppearanceVariant.entries.toList()) { entry ->
            val resolved = remember(entry, mode, shape) {
                resolveAppearance(context, mode, entry, shape)
            }
            val selected = entry == current
            val cardShape = RoundedCornerShape(12.dp)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .width(96.dp)
                    .clip(cardShape)
                    .then(
                        if (selected) {
                            Modifier.border(
                                androidx.compose.foundation.BorderStroke(
                                    2.dp,
                                    MaterialTheme.colorScheme.primary,
                                ),
                                shape = cardShape,
                            )
                        } else Modifier,
                    )
                    .clickable { onSelect(entry) }
                    .padding(8.dp),
            ) {
                val pillShape = RoundedCornerShape(resolved.shape.cornerRadiusDp.dp)
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .height(32.dp)
                        .clip(pillShape)
                        .background(resolved.searchBarBrush, pillShape)
                        .then(
                            if (resolved.searchBarBorder != null) {
                                Modifier.border(resolved.searchBarBorder!!, pillShape)
                            } else Modifier,
                        ),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = entry.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
        }
    }
}

@Composable
private fun AppearanceShapePicker(
    current: AppearanceShape,
    mode: AppearanceMode,
    variant: AppearanceVariant,
    onSelect: (AppearanceShape) -> Unit,
) {
    val context = LocalContext.current
    SettingsCategoryHeader(title = "Shape")
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(AppearanceShape.entries.toList()) { entry ->
            val resolved = remember(entry, mode, variant) {
                resolveAppearance(context, mode, variant, entry)
            }
            val selected = entry == current
            val cardShape = RoundedCornerShape(12.dp)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .width(96.dp)
                    .clip(cardShape)
                    .then(
                        if (selected) {
                            Modifier.border(
                                androidx.compose.foundation.BorderStroke(
                                    2.dp,
                                    MaterialTheme.colorScheme.primary,
                                ),
                                shape = cardShape,
                            )
                        } else Modifier,
                    )
                    .clickable { onSelect(entry) }
                    .padding(8.dp),
            ) {
                val pillShape = RoundedCornerShape(resolved.shape.cornerRadiusDp.dp)
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .height(32.dp)
                        .clip(pillShape)
                        .background(resolved.searchBarBrush, pillShape)
                        .then(
                            if (resolved.searchBarBorder != null) {
                                Modifier.border(resolved.searchBarBorder!!, pillShape)
                            } else Modifier,
                        ),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = entry.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AppearanceOpacitySlider(
    value: Int,
    onChange: (Int) -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            "Widget opacity: ${value}%",
            style = MaterialTheme.typography.labelLarge,
        )
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.toInt()) },
            valueRange = 0f..100f,
        )
        Text(
            "Applies to the home-screen widget only.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AppearanceRowsSlider(
    value: Int,
    onChange: (Int) -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            "Shortcut rows on widget: ${value}",
            style = MaterialTheme.typography.labelLarge,
        )
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.toInt()) },
            valueRange = 1f..3f,
            steps = 1,
        )
    }
}


// ==================== Config Source Screen ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigSourceScreen(
    navController: NavHostController,
    themePrefs: ThemePreferences,
    configRepository: ConfigRepository,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    var configUrl by remember { mutableStateOf(themePrefs.configUrl) }
    var refreshInterval by remember { mutableStateOf(themePrefs.configRefreshInterval) }
    var dropdownExpanded by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val syncOptions = ConfigRefreshInterval.entries

    var lastSyncedTimestamp by remember {
        val prefs = navController.context.getSharedPreferences("fast_travel_config", 0)
        mutableStateOf(prefs.getLong("cache_timestamp", 0L))
    }
    val lastSynced = if (lastSyncedTimestamp > 0) {
        SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(lastSyncedTimestamp))
    } else {
        "Never"
    }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "Config Source",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Config URL
            SettingsCategoryHeader(title = "Source")
            SettingsCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextFieldS(
                        value = configUrl,
                        onValueChange = {
                            configUrl = it
                            themePrefs.configUrl = it
                        },
                        label = { Text("Config URL") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Sync interval
            SettingsCategoryHeader(title = "Sync")
            SettingsCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    ExposedDropdownMenuBox(
                        expanded = dropdownExpanded,
                        onExpandedChange = { dropdownExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = refreshInterval.displayName,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Auto-refresh") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                            shape = RoundedCornerShape(8.dp),
                        )
                        ExposedDropdownMenu(
                            expanded = dropdownExpanded,
                            onDismissRequest = { dropdownExpanded = false },
                        ) {
                            syncOptions.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.displayName) },
                                    onClick = {
                                        refreshInterval = option
                                        themePrefs.configRefreshInterval = option
                                        sh.kavi.fasttravel.data.ConfigRefreshScheduler
                                            .schedule(context, option)
                                        dropdownExpanded = false
                                    },
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "Last synced: $lastSynced",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            if (isRefreshing) return@Button
                            isRefreshing = true
                            scope.launch {
                                val result = configRepository.fetchFromGitHub()
                                if (result != null) {
                                    onConfigChanged()
                                    lastSyncedTimestamp = configRepository.lastSyncedAt() ?: 0L
                                    snackbarHostState.showSnackbar("Config refreshed")
                                } else {
                                    snackbarHostState.showSnackbar("Failed to refresh config")
                                }
                                isRefreshing = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        enabled = !isRefreshing,
                    ) {
                        if (isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Refresh configuration",
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (isRefreshing) "Refreshing..." else "Refresh Now")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Icon cache (Coil memory + disk cache for favicons)
            SettingsCategoryHeader(title = "Icon Cache")
            SettingsCard {
                ListItem(
                    headlineContent = {
                        Text(
                            "Clear icon cache",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    },
                    supportingContent = {
                        Text(
                            "Force re-fetch all command favicons",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable {
                        scope.launch {
                            val loader = coil.Coil.imageLoader(context)
                            loader.memoryCache?.clear()
                            loader.diskCache?.clear()
                            snackbarHostState.showSnackbar("Icon cache cleared")
                        }
                    },
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Reset to remote default (clears local edits)
            SettingsCategoryHeader(title = "Local Edits")
            SettingsCard {
                ListItem(
                    headlineContent = {
                        Text(
                            "Reset to remote default",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error,
                        )
                    },
                    supportingContent = {
                        Text(
                            "Discard all local edits and re-fetch from the config URL",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { showResetDialog = true },
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Reset to remote default") },
            text = { Text("This will discard all local edits and reload from the config URL. Are you sure?") },
            confirmButton = {
                TextButton(onClick = {
                    showResetDialog = false
                    scope.launch {
                        configRepository.resetToRemote()
                        onConfigChanged()
                        snackbarHostState.showSnackbar("Reset to remote default")
                    }
                }) {
                    Text("Reset", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

// ==================== Ignore List Screen ====================

private enum class CandidateRowState { ACTIVE, BELOW, RED }

private data class CandidateRow(
    val trigger: String,
    val count: Int,
    val doNotIgnore: Boolean,
    val state: CandidateRowState,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IgnoreListScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    val context = LocalContext.current
    val autoIgnoreStore = remember { AutoIgnoreStore(context) }
    val themePrefs = remember { ThemePreferences(context) }

    var newItem by remember { mutableStateOf("") }
    var permanentExpanded by remember { mutableStateOf(true) }
    var autoExpanded by remember { mutableStateOf(true) }
    var threshold by remember { mutableStateOf(themePrefs.autoIgnoreThreshold) }
    var refreshTick by remember { mutableStateOf(0) }

    // Long-press sheets + reset confirmation
    var permanentSheetFor by remember { mutableStateOf<String?>(null) }
    var candidateSheetFor by remember { mutableStateOf<CandidateRow?>(null) }
    var showResetDialog by remember { mutableStateOf(false) }

    // Derived data
    val permanentList: List<String> = remember(config, refreshTick) {
        (config?.ignoreList.orEmpty()).map { it.lowercase() }.distinct().sorted()
    }
    val candidateList: List<CandidateRow> = remember(refreshTick, threshold) {
        autoIgnoreStore.all().map { (trigger, c) ->
            val state = when {
                c.doNotIgnore -> CandidateRowState.RED
                c.count >= threshold -> CandidateRowState.ACTIVE
                else -> CandidateRowState.BELOW
            }
            CandidateRow(trigger, c.count, c.doNotIgnore, state)
        }.sortedWith(compareByDescending<CandidateRow> { it.count }.thenBy { it.trigger })
    }

    fun submitAdd() {
        if (newItem.isBlank()) return
        val cfg = config ?: return
        val trimmed = newItem.trim()
        if (cfg.ignoreList.none { it.equals(trimmed, ignoreCase = true) }) {
            editableStore.saveLocalConfig(cfg.withIgnoreAdded(trimmed))
        }
        // If the trigger was a candidate (possibly red-flagged), delete it so
        // manual add wins cleanly. Matches the design doc's "manual add
        // overrides red flag" rule.
        autoIgnoreStore.remove(trimmed)
        newItem = ""
        onConfigChanged()
        refreshTick++
    }

    fun removePermanent(trigger: String) {
        val cfg = config ?: return
        editableStore.saveLocalConfig(cfg.withIgnoreRemoved(trigger))
        // No counter side-effect: permanent entries never had active counters.
        onConfigChanged()
        refreshTick++
    }

    fun confirmCandidate(trigger: String) {
        val cfg = config ?: return
        if (cfg.ignoreList.none { it.equals(trigger, ignoreCase = true) }) {
            editableStore.saveLocalConfig(cfg.withIgnoreAdded(trigger))
        }
        autoIgnoreStore.remove(trigger)
        onConfigChanged()
        refreshTick++
    }

    fun toggleDoNotIgnore(trigger: String) {
        val current = autoIgnoreStore.isDoNotIgnore(trigger)
        autoIgnoreStore.setDoNotIgnore(trigger, !current)
        refreshTick++
    }

    fun removeCandidate(trigger: String) {
        autoIgnoreStore.remove(trigger)
        refreshTick++
    }

    fun resetAllCounts() {
        autoIgnoreStore.clearAll()
        refreshTick++
    }

    fun adjustThreshold(delta: Int) {
        val next = (threshold + delta).coerceIn(
            ThemePreferences.AUTO_IGNORE_THRESHOLD_MIN,
            ThemePreferences.AUTO_IGNORE_THRESHOLD_MAX,
        )
        if (next != threshold) {
            threshold = next
            themePrefs.autoIgnoreThreshold = next
        }
    }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "Ignore List",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { inner ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            // ----- Permanent section -----
            item {
                IgnoreSectionHeader(
                    label = "Permanent",
                    expanded = permanentExpanded,
                    onToggle = { permanentExpanded = !permanentExpanded },
                )
            }
            if (permanentExpanded) {
                item {
                    // Add row (inside expanded section so it collapses with the header)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextFieldS(
                            value = newItem,
                            onValueChange = { newItem = it },
                            label = { Text("Add a term…") },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            onKeyboardAction = { submitAdd() },
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = { submitAdd() }, shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.Add, contentDescription = "Add")
                        }
                    }
                }
                if (permanentList.isEmpty()) {
                    item {
                        Text(
                            text = "No permanent entries. Add one above, or confirm an auto-tracked trigger below.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        )
                    }
                } else {
                    items(permanentList, key = { "p:$it" }) { trigger ->
                        PermanentRow(
                            trigger = trigger,
                            onLongClick = { permanentSheetFor = trigger },
                        )
                    }
                }
            }

            item { HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp)) }

            // ----- Auto-ignore tracking section -----
            item {
                IgnoreSectionHeader(
                    label = "Auto-ignore tracking",
                    expanded = autoExpanded,
                    onToggle = { autoExpanded = !autoExpanded },
                )
            }
            if (autoExpanded) {
                item {
                    // Threshold stepper
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Threshold", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Dismissals before auto-adding a trigger",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .border(
                                    width = 1.dp,
                                    color = MaterialTheme.colorScheme.outline,
                                    shape = RoundedCornerShape(20.dp),
                                )
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                        ) {
                            IconButton(
                                onClick = { adjustThreshold(-1) },
                                enabled = threshold > ThemePreferences.AUTO_IGNORE_THRESHOLD_MIN,
                                modifier = Modifier.size(36.dp),
                            ) { Icon(Icons.Default.Remove, contentDescription = "Decrease threshold") }
                            Text(
                                text = threshold.toString(),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier
                                    .widthIn(min = 28.dp)
                                    .padding(horizontal = 4.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )
                            IconButton(
                                onClick = { adjustThreshold(1) },
                                enabled = threshold < ThemePreferences.AUTO_IGNORE_THRESHOLD_MAX,
                                modifier = Modifier.size(36.dp),
                            ) { Icon(Icons.Default.Add, contentDescription = "Increase threshold") }
                        }
                    }
                }

                item {
                    // Reset all counts
                    OutlinedButton(
                        onClick = { showResetDialog = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                        enabled = candidateList.isNotEmpty(),
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Reset all counts")
                    }
                }

                if (candidateList.isEmpty()) {
                    item {
                        Text(
                            text = "No tracked triggers yet. Dismiss a typo suggestion to start tracking.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        )
                    }
                } else {
                    items(candidateList, key = { "c:${it.trigger}" }) { entry ->
                        CandidateListRow(
                            entry = entry,
                            threshold = threshold,
                            onLongClick = { candidateSheetFor = entry },
                        )
                    }
                }
            }
        }
    }

    // ----- Bottom sheets + dialog -----
    permanentSheetFor?.let { trigger ->
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { permanentSheetFor = null },
            sheetState = sheetState,
        ) {
            SheetActionRow(
                icon = Icons.Default.Close,
                label = "Remove",
                destructive = true,
                onClick = {
                    removePermanent(trigger)
                    permanentSheetFor = null
                },
            )
            Spacer(Modifier.height(8.dp))
        }
    }

    candidateSheetFor?.let { entry ->
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { candidateSheetFor = null },
            sheetState = sheetState,
        ) {
            SheetActionRow(
                icon = Icons.Default.Check,
                label = "Confirm as permanent",
                onClick = {
                    confirmCandidate(entry.trigger)
                    candidateSheetFor = null
                },
            )
            SheetActionRow(
                icon = Icons.Default.Block,
                label = if (entry.doNotIgnore) "Unflag 'Do not ignore'" else "Flag as 'Do not ignore'",
                onClick = {
                    toggleDoNotIgnore(entry.trigger)
                    candidateSheetFor = null
                },
            )
            SheetActionRow(
                icon = Icons.Default.Delete,
                label = "Remove from tracking",
                destructive = true,
                onClick = {
                    removeCandidate(entry.trigger)
                    candidateSheetFor = null
                },
            )
            Spacer(Modifier.height(8.dp))
        }
    }

    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Reset all counts?") },
            text = { Text("This clears every dismissal counter. Permanent entries are unaffected.") },
            confirmButton = {
                TextButton(onClick = {
                    resetAllCounts()
                    showResetDialog = false
                }) {
                    Text("Reset", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun IgnoreSectionHeader(
    label: String,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = if (expanded) "Collapse" else "Expand",
            modifier = Modifier
                .size(20.dp)
                .rotate(if (expanded) 90f else 0f),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            letterSpacing = 0.08.em,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PermanentRow(trigger: String, onLongClick: () -> Unit) {
    ListItem(
        headlineContent = {
            Text(
                trigger,
                style = MaterialTheme.typography.bodyLarge,
                fontFamily = FontFamily.Monospace,
            )
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.combinedClickable(onClick = {}, onLongClick = onLongClick),
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CandidateListRow(
    entry: CandidateRow,
    threshold: Int,
    onLongClick: () -> Unit,
) {
    val alpha = if (entry.state == CandidateRowState.BELOW) 0.55f else 1f
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .alpha(alpha),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (entry.state == CandidateRowState.RED) {
            Icon(
                imageVector = Icons.Default.Block,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            text = entry.trigger,
            style = MaterialTheme.typography.bodyLarge,
            fontFamily = FontFamily.Monospace,
            color = if (entry.state == CandidateRowState.RED) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        // Count badge
        val countBg = when (entry.state) {
            CandidateRowState.ACTIVE -> MaterialTheme.colorScheme.secondaryContainer
            CandidateRowState.BELOW -> MaterialTheme.colorScheme.surfaceVariant
            CandidateRowState.RED -> MaterialTheme.colorScheme.errorContainer
        }
        val countFg = when (entry.state) {
            CandidateRowState.ACTIVE -> MaterialTheme.colorScheme.onSecondaryContainer
            CandidateRowState.BELOW -> MaterialTheme.colorScheme.onSurfaceVariant
            CandidateRowState.RED -> MaterialTheme.colorScheme.onErrorContainer
        }
        Surface(shape = RoundedCornerShape(10.dp), color = countBg) {
            Text(
                text = "×${entry.count}",
                style = MaterialTheme.typography.labelSmall,
                color = countFg,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
        Spacer(Modifier.width(8.dp))
        val stateLabel = when (entry.state) {
            CandidateRowState.ACTIVE -> "active"
            CandidateRowState.BELOW -> "below threshold"
            CandidateRowState.RED -> "never ignored"
        }
        Text(
            text = stateLabel,
            style = MaterialTheme.typography.labelSmall,
            color = if (entry.state == CandidateRowState.RED) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SheetActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    val color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color)
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = color)
    }
}

// ==================== Search History Screen ====================

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SearchHistoryScreen(
    navController: NavHostController,
    searchHistory: SearchHistory,
    snackbarHostState: SnackbarHostState,
) {
    var history by remember { mutableStateOf(searchHistory.getHistory()) }
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "Search History",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            if (history.isNotEmpty()) {
                // Clear all button
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    color = Color.Transparent,
                ) {
                    OutlinedButton(
                        onClick = {
                            searchHistory.clearHistory()
                            history = emptyList()
                            scope.launch {
                                snackbarHostState.showSnackbar("Search history cleared")
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Clear all",
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Clear All")
                    }
                }

                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(history) { entry ->
                        ListItem(
                            headlineContent = {
                                Text(
                                    text = entry.query,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            },
                            supportingContent = {
                                val time = SimpleDateFormat(
                                    "MMM d, h:mm a",
                                    Locale.getDefault(),
                                ).format(Date(entry.timestamp))
                                Text(
                                    text = buildString {
                                        if (entry.commandId != null) {
                                            append(entry.commandId)
                                            append(" \u00b7 ")
                                        }
                                        append(time)
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            modifier = Modifier.combinedClickable(
                                onClick = {},
                                onLongClick = { pendingDelete = entry.query },
                            ),
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No search history",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    val deleteTarget = pendingDelete
    if (deleteTarget != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete entry") },
            text = { Text("Remove \"$deleteTarget\" from search history?") },
            confirmButton = {
                TextButton(onClick = {
                    searchHistory.remove(deleteTarget)
                    history = searchHistory.getHistory()
                    pendingDelete = null
                    scope.launch {
                        snackbarHostState.showSnackbar("Entry removed")
                    }
                }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}

// ==================== About Screen ====================

@Composable
fun AboutScreen(navController: NavHostController) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "About",
                onBack = { navController.popBackStack() },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(48.dp))

            Text(
                text = "Fast Travel",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "v2.0.0",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Command-based search engine replacement",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.height(32.dp))

            SettingsCard {
                ListItem(
                    headlineContent = {
                        Text("Author", style = MaterialTheme.typography.bodyLarge)
                    },
                    supportingContent = {
                        Text(
                            "Kavish",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                )
                ListItem(
                    headlineContent = {
                        Text("GitHub", style = MaterialTheme.typography.bodyLarge)
                    },
                    supportingContent = {
                        Text(
                            "github.com/DoubleGremlin181/fast-travel",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable {
                        val intent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://github.com/DoubleGremlin181/fast-travel"),
                        )
                        context.startActivity(intent)
                    },
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ==================== Default Command Picker ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DefaultCommandPicker(
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    themePrefs: ThemePreferences,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
    scope: kotlinx.coroutines.CoroutineScope,
) {
    val context = LocalContext.current
    val commands = remember(config) {
        if (config != null) getAllCommands(config) else emptyList()
    }
    val triggerOptions: List<Pair<String, String>> = remember(commands) {
        commands.flatMap { cmd -> cmd.triggers.map { it to cmd.name } }
    }
    var expanded by remember { mutableStateOf(false) }
    val currentValue = config?.defaultCommand.orEmpty()
    val currentCmdName = commands.firstOrNull { it.triggers.contains(currentValue) }?.name

    ListItem(
        headlineContent = {
            Text("Default Command", style = MaterialTheme.typography.bodyLarge)
        },
        supportingContent = {
            Column {
                if (config == null) {
                    Text(
                        "Loading...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = it },
                    ) {
                        OutlinedTextField(
                            value = currentValue + (currentCmdName?.let { " ($it)" } ?: ""),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Trigger") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                            shape = RoundedCornerShape(8.dp),
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            triggerOptions.forEach { (trigger, name) ->
                                DropdownMenuItem(
                                    text = { Text("$trigger  —  $name") },
                                    onClick = {
                                        expanded = false
                                        val updated = config.withDefaultCommand(trigger)
                                        val errors = ConfigValidator.validate(updated)
                                        if (errors.isNotEmpty()) {
                                            scope.launch {
                                                snackbarHostState.showSnackbar(errors.first())
                                            }
                                        } else {
                                            editableStore.saveLocalConfig(updated)
                                            themePrefs.configSourceDirty = true
                                            ConfigRefreshScheduler.schedule(context, ConfigRefreshInterval.MANUAL)
                                            onConfigChanged()
                                            scope.launch {
                                                snackbarHostState.showSnackbar(
                                                    "Default command set to $trigger",
                                                )
                                            }
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}

// ==================== Groups Home Screen ====================

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun GroupsHomeScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    var searchQuery by remember { mutableStateOf("") }
    val groups = config?.groups ?: emptyList()
    val filteredGroups = remember(groups, searchQuery) {
        val needle = searchQuery.trim().lowercase()
        if (needle.isEmpty()) groups
        else groups.filter {
            it.name.lowercase().contains(needle) || it.id.lowercase().contains(needle)
        }
    }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "Groups",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        floatingActionButton = {
            androidx.compose.material3.ExtendedFloatingActionButton(
                onClick = { navController.navigate(SettingsRoute.GroupNew.route) },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("New group") },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            OutlinedTextFieldS(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search groups") },
                leadingIcon = {
                    Icon(imageVector = Icons.Default.Search, contentDescription = null)
                },
                trailingIcon = if (searchQuery.isNotEmpty()) {
                    {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear search")
                        }
                    }
                } else null,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                shape = RoundedCornerShape(12.dp),
            )

            if (groups.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = if (config == null) "Loading…" else "No groups yet. Tap + to create one.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                val lazyListState = androidx.compose.foundation.lazy.rememberLazyListState()
                val reorderableState = rememberReorderableLazyListState(
                    lazyListState = lazyListState,
                ) { from, to ->
                    // LazyColumn index 0 is the section header; subtract it to get group index.
                    val fromIdx = (from.index - 1).coerceAtLeast(0)
                    val toIdx = (to.index - 1).coerceAtLeast(0)
                    val cfg = config ?: return@rememberReorderableLazyListState
                    editableStore.saveLocalConfig(cfg.withGroupMoved(fromIdx, toIdx))
                    onConfigChanged()
                }
                LazyColumn(
                    state = lazyListState,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item(key = "header") {
                        Text(
                            text = "GROUPS (${filteredGroups.size})",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            letterSpacing = 1.sp,
                            modifier = Modifier.padding(
                                start = 16.dp, top = 16.dp, bottom = 4.dp, end = 16.dp,
                            ),
                        )
                    }
                    if (filteredGroups.isEmpty()) {
                        item {
                            Text(
                                text = "No groups match \"$searchQuery\"",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(32.dp),
                            )
                        }
                    }
                    items(filteredGroups, key = { it.id }) { group ->
                        ReorderableItem(reorderableState, key = group.id) { isDragging ->
                            GroupListRow(
                                group = group,
                                isDragging = isDragging,
                                onClick = {
                                    navController.navigate(SettingsRoute.GroupEdit.build(group.id))
                                },
                                dragHandleModifier = Modifier.longPressDraggableHandle(),
                            )
                        }
                    }
                    item { Spacer(Modifier.height(80.dp)) }
                }
            }
        }
    }

}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GroupListRow(
    group: Group,
    isDragging: Boolean,
    onClick: () -> Unit,
    dragHandleModifier: Modifier,
) {
    val swatch = parseGroupColor(group.color) ?: MaterialTheme.colorScheme.outline
    val containerColor = if (isDragging) MaterialTheme.colorScheme.surfaceContainerHigh
        else Color.Transparent
    ListItem(
        leadingContent = {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .background(swatch),
            )
        },
        headlineContent = {
            Text(
                text = group.id,
                style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.primary,
            )
        },
        supportingContent = {
            Text(
                text = "${group.name} · ${pluralize(group.commands.size, "command")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            Icon(
                imageVector = Icons.Default.DragIndicator,
                contentDescription = "Drag to reorder",
                modifier = dragHandleModifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        colors = ListItemDefaults.colors(containerColor = containerColor),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

// ==================== Group Edit Screen ====================

/**
 * Canonical color presets offered to the user. Match the keys in
 * [sh.kavi.fasttravel.ui.theme.GroupColorPalette] so the existing palette
 * overrides apply automatically; custom hexes fall back to the dynamic deriver.
 */
private val GROUP_COLOR_PRESETS = listOf(
    "#4285F4", "#EA4335", "#34A853", "#FBBC04", "#9C27B0",
    "#FF9800", "#00897B", "#C2185B", "#5E35B1", "#455A64",
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun GroupEditScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    groupId: String?,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    val isNew = groupId.isNullOrBlank()
    val existing = remember(config, groupId) {
        if (!isNew && config != null) config.findGroupById(groupId!!) else null
    }
    val scope = rememberCoroutineScope()

    var idField by remember(existing) { mutableStateOf(existing?.id ?: "") }
    var nameField by remember(existing) { mutableStateOf(existing?.name ?: "") }
    var colorField by remember(existing) {
        mutableStateOf(existing?.color ?: GROUP_COLOR_PRESETS.first())
    }
    var idError by remember { mutableStateOf<String?>(null) }
    var colorError by remember { mutableStateOf<String?>(null) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = if (isNew) "New group" else "Edit group",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OutlinedTextFieldS(
                value = idField,
                onValueChange = {
                    idField = it.lowercase().replace(Regex("[^a-z0-9-]+"), "-")
                    idError = null
                },
                label = { Text("ID") },
                supportingText = {
                    Text(idError ?: "Lowercase letters, digits, hyphens. Cannot change after create.")
                },
                isError = idError != null,
                enabled = isNew,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextFieldS(
                value = nameField,
                onValueChange = { nameField = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth(),
            )

            Text(
                text = "Color",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GROUP_COLOR_PRESETS.forEach { hex ->
                    val parsed = parseGroupColor(hex) ?: return@forEach
                    val selected = colorField.equals(hex, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(parsed)
                            .border(
                                width = if (selected) 3.dp else 0.dp,
                                color = MaterialTheme.colorScheme.onSurface,
                                shape = RoundedCornerShape(20.dp),
                            )
                            .clickable {
                                colorField = hex
                                colorError = null
                            },
                    )
                }
            }

            OutlinedTextFieldS(
                value = colorField,
                onValueChange = {
                    colorField = it.trim()
                    colorError = null
                },
                label = { Text("Custom hex (#RRGGBB)") },
                supportingText = {
                    Text(colorError ?: "Any 6-digit hex. Chips derive a tint automatically.")
                },
                isError = colorError != null,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        val id = idField.trim()
                        val name = nameField.trim()
                        val color = colorField.trim().ifEmpty { null }
                        if (!Regex("^[a-z0-9-]+$").matches(id)) {
                            idError = "Must match [a-z0-9-]+"
                            return@Button
                        }
                        if (name.isEmpty()) return@Button
                        if (color != null && !Regex("^#[0-9A-Fa-f]{6}$").matches(color)) {
                            colorError = "Must be #RRGGBB"
                            return@Button
                        }
                        val cfg = config ?: return@Button
                        if (isNew && cfg.allGroupIds().contains(id)) {
                            idError = "ID already exists"
                            return@Button
                        }
                        val newCfg = if (isNew) {
                            cfg.withGroupAdded(Group(id = id, name = name, color = color))
                        } else {
                            cfg.withGroupUpdated(id, name, color)
                        }
                        editableStore.saveLocalConfig(newCfg)
                        onConfigChanged()
                        scope.launch {
                            snackbarHostState.showSnackbar(if (isNew) "Group created" else "Group updated")
                        }
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (isNew) "Create" else "Save")
                }
                OutlinedButton(
                    onClick = { navController.popBackStack() },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Cancel")
                }
            }

            if (!isNew) {
                Spacer(Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(6.dp))
                    Text("Delete group", color = MaterialTheme.colorScheme.error)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }

    if (showDeleteDialog && existing != null) {
        val hasContents = existing.commands.isNotEmpty() || existing.groups.isNotEmpty()
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete group") },
            text = {
                if (hasContents) {
                    Text(
                        "\"${existing.name}\" still contains ${existing.commands.size} " +
                            "commands and ${existing.groups.size} subgroups. Move or delete " +
                            "those first.",
                    )
                } else {
                    Text("Delete \"${existing.name}\"?")
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !hasContents,
                    onClick = {
                        val cfg = config
                        showDeleteDialog = false
                        if (cfg != null && !hasContents) {
                            editableStore.saveLocalConfig(cfg.withGroupDeleted(existing.id))
                            onConfigChanged()
                            scope.launch {
                                snackbarHostState.showSnackbar("Deleted \"${existing.name}\"")
                            }
                            navController.popBackStack()
                        }
                    },
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            },
        )
    }
}

private fun parseGroupColor(hex: String?): Color? {
    if (hex.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (_: IllegalArgumentException) {
        null
    }
}

// ==================== Helper Functions ====================

internal fun getAllCommands(config: FastTravelConfig): List<Command> {
    val commands = mutableListOf<Command>()
    fun walk(groups: List<Group>) {
        for (group in groups) {
            commands.addAll(group.commands)
            walk(group.groups)
        }
    }
    walk(config.groups)
    return commands.sortedBy { it.triggers.first() }
}

