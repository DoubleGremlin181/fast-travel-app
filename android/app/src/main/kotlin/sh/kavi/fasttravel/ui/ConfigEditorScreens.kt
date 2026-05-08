package sh.kavi.fasttravel.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.material.icons.filled.DragIndicator
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.CommandType
import sh.kavi.fasttravel.core.DeviceType
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group
import sh.kavi.fasttravel.core.IconOverride
import sh.kavi.fasttravel.core.Pattern
import sh.kavi.fasttravel.core.NormalizeStep
import sh.kavi.fasttravel.core.Route
import sh.kavi.fasttravel.core.RouteDevices
import sh.kavi.fasttravel.core.resolveIconUrl
import sh.kavi.fasttravel.data.ConfigValidator
import sh.kavi.fasttravel.data.EditableConfigStore
import sh.kavi.fasttravel.data.allGroupsFlat
import sh.kavi.fasttravel.data.withCommandDeleted
import sh.kavi.fasttravel.data.withCommandMoved
import sh.kavi.fasttravel.data.withCommandUpsertedInGroup
import kotlinx.coroutines.launch

// Known browser presets.
private val KNOWN_BROWSERS = listOf("chrome", "firefox", "safari", "edge", "other")

// ==================== In-memory draft for nested editors ====================

/**
 * CommandEditScreen needs to let RouteEdit / PatternEdit sub-screens mutate the
 * currently-being-edited command and return, without committing to storage until
 * the user taps Save. We share a per-navigation-graph draft via this singleton.
 */
internal object CommandEditorDraft {
    var commandId: String? = null
    var triggers: MutableList<String> = mutableListOf()
    var name: String = ""
    var type: CommandType = CommandType.Standard
    var iconUrl: String = ""
    var iconOverrides: MutableList<IconOverrideDraft> = mutableListOf()
    var suggestionsApi: String = ""
    var normalize: MutableList<NormalizeStep> = mutableListOf()
    var routes: MutableList<Route> = mutableListOf()
    var originalGroupId: String? = null
    var isNew: Boolean = false

    fun reset() {
        commandId = null
        triggers = mutableListOf()
        name = ""
        type = CommandType.Standard
        iconUrl = ""
        iconOverrides = mutableListOf()
        suggestionsApi = ""
        normalize = mutableListOf()
        routes = mutableListOf()
        originalGroupId = null
        isNew = false
    }
}

internal data class IconOverrideDraft(
    var devices: MutableList<DeviceType> = mutableListOf(),
    var iconUrl: String = "",
)

// ==================== CommandsHomeScreen ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommandsHomeScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: sh.kavi.fasttravel.data.EditableConfigStore,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
    markDirty: () -> Unit = {},
) {
    var showGroupPicker by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    // Flatten groups with commands (only leaf groups contribute commands).
    data class GroupEntry(
        val id: String,
        val name: String,
        val color: String?,
        val commands: List<Command>,
    )
    val allEntries: List<GroupEntry> = remember(config) {
        val out = mutableListOf<GroupEntry>()
        if (config != null) {
            for (g in config.groups) {
                if (g.commands.isNotEmpty()) {
                    out.add(GroupEntry(g.id, g.name, g.color, g.commands))
                }
            }
        }
        out
    }
    val groupEntries: List<GroupEntry> = remember(allEntries, searchQuery) {
        val needle = searchQuery.trim().lowercase()
        if (needle.isEmpty()) return@remember allEntries
        allEntries.mapNotNull { entry ->
            val filtered = entry.commands.filter { cmd ->
                cmd.name.lowercase().contains(needle) ||
                    cmd.triggers.any { it.lowercase().contains(needle) } ||
                    cmd.id.lowercase().contains(needle)
            }
            if (filtered.isEmpty()) null else entry.copy(commands = filtered)
        }
    }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = "Commands",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showGroupPicker = true },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Add command") },
            )
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(top = 8.dp, bottom = 16.dp)) {
            OutlinedTextFieldS(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search commands or triggers") },
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
            val lazyListState = androidx.compose.foundation.lazy.rememberLazyListState()
            val reorderState = rememberReorderableLazyListState(
                lazyListState = lazyListState,
            ) { from, to ->
                val cfg = config ?: return@rememberReorderableLazyListState
                val fromKey = from.key as? String ?: return@rememberReorderableLazyListState
                val toKey = to.key as? String ?: return@rememberReorderableLazyListState
                if (!fromKey.startsWith("c:") || !toKey.startsWith("c:")) {
                    return@rememberReorderableLazyListState
                }
                val fromCmdId = fromKey.removePrefix("c:")
                val toCmdId = toKey.removePrefix("c:")
                val fromEntry = groupEntries.firstOrNull { e -> e.commands.any { it.id == fromCmdId } }
                    ?: return@rememberReorderableLazyListState
                val toEntry = groupEntries.firstOrNull { e -> e.commands.any { it.id == toCmdId } }
                    ?: return@rememberReorderableLazyListState
                if (fromEntry.id != toEntry.id) return@rememberReorderableLazyListState
                val fromIdx = fromEntry.commands.indexOfFirst { it.id == fromCmdId }
                val toIdx = fromEntry.commands.indexOfFirst { it.id == toCmdId }
                if (fromIdx < 0 || toIdx < 0) return@rememberReorderableLazyListState
                editableStore.saveLocalConfig(cfg.withCommandMoved(fromEntry.id, fromIdx, toIdx))
                markDirty()
                onConfigChanged()
            }
            SettingsCard(modifier = Modifier.weight(1f)) {
                LazyColumn(state = lazyListState, modifier = Modifier.fillMaxSize()) {
                    if (groupEntries.isEmpty() && searchQuery.isNotEmpty()) {
                        item {
                            Text(
                                text = "No commands match \"$searchQuery\"",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(32.dp),
                            )
                        }
                    }
                    groupEntries.forEach { entry ->
                        item(key = "g:${entry.id}") {
                            Row(
                                modifier = Modifier.padding(
                                    start = 16.dp, top = 16.dp, bottom = 4.dp, end = 16.dp,
                                ),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                val swatch = parseGroupColorHex(entry.color)
                                if (swatch != null) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(androidx.compose.foundation.shape.CircleShape)
                                            .background(swatch),
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                Text(
                                    text = "${entry.name.uppercase()} (${entry.commands.size})",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    letterSpacing = 1.sp,
                                )
                            }
                        }
                        items(entry.commands, key = { "c:${it.id}" }) { command ->
                            ReorderableItem(reorderState, key = "c:${command.id}") { isDragging ->
                                CommandListRow(
                                    command = command,
                                    isDragging = isDragging,
                                    dragHandleModifier = Modifier.longPressDraggableHandle(),
                                    onClick = {
                                        navController.navigate(SettingsRoute.CommandEdit.build(command.id))
                                    },
                                )
                            }
                        }
                    }
                    item { Spacer(Modifier.height(80.dp)) }
                }
            }
        }
    }

    if (showGroupPicker) {
        AlertDialog(
            onDismissRequest = { showGroupPicker = false },
            title = { Text("Add to group") },
            text = {
                Column {
                    if (groupEntries.isEmpty()) {
                        Text("No groups available yet. Refresh config first.")
                    } else {
                        groupEntries.forEach { entry ->
                            ListItem(
                                headlineContent = { Text(entry.name) },
                                supportingContent = { Text(pluralize(entry.commands.size, "command")) },
                                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                modifier = Modifier.clickable {
                                    showGroupPicker = false
                                    navController.navigate(SettingsRoute.CommandNew.build(entry.id))
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showGroupPicker = false }) { Text("Cancel") }
            },
        )
    }
}

internal fun parseGroupColorHex(hex: String?): Color? {
    if (hex.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (_: IllegalArgumentException) {
        null
    }
}

@Composable
private fun CommandListRow(
    command: Command,
    isDragging: Boolean = false,
    dragHandleModifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val containerColor = if (isDragging) MaterialTheme.colorScheme.surfaceContainerHigh
        else Color.Transparent
    ListItem(
        leadingContent = {
            val resolvedIcon = resolveIconUrl(command, DeviceType.Android)
            if (!resolvedIcon.isNullOrBlank()) {
                val ctx = androidx.compose.ui.platform.LocalContext.current
                val req = remember(resolvedIcon) {
                    coil.request.ImageRequest.Builder(ctx)
                        .data(resolvedIcon)
                        .transformations(sh.kavi.fasttravel.image.FaviconPadTransformation())
                        .build()
                }
                AsyncImage(
                    model = req,
                    contentDescription = null,
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(6.dp)),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .padding(2.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = command.triggers.firstOrNull()?.take(1)?.uppercase() ?: "?",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        },
        headlineContent = {
            Text(
                text = command.triggers.firstOrNull() ?: command.id,
                style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.primary,
            )
        },
        supportingContent = {
            Text(
                text = command.name,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            Icon(
                imageVector = androidx.compose.material.icons.Icons.Default.DragIndicator,
                contentDescription = "Drag to reorder",
                modifier = dragHandleModifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        colors = ListItemDefaults.colors(containerColor = containerColor),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

// ==================== CommandEditScreen ====================

/**
 * Helper to locate group containing a commandId in the current merged config.
 */
private fun findGroupForCommand(config: FastTravelConfig, commandId: String): Pair<Group, Command>? {
    for (g in config.groups) {
        val c = g.commands.firstOrNull { it.id == commandId }
        if (c != null) return g to c
    }
    return null
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CommandEditScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    commandId: String?,
    initialGroupId: String?,
    refreshConfig: () -> Unit,
    snackbarHostState: SnackbarHostState,
    markDirty: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()

    // Seed the draft once per navigation entry. We use a keyed `remember` so
    // re-navigating to the same command re-seeds, but coming back from Route/Pattern
    // preserves the existing draft.
    remember(commandId, initialGroupId) {
        if (CommandEditorDraft.commandId != commandId ||
            (commandId == null && CommandEditorDraft.originalGroupId != initialGroupId)) {
            CommandEditorDraft.reset()
            if (commandId != null && config != null) {
                val found = findGroupForCommand(config, commandId)
                if (found != null) {
                    val (g, c) = found
                    CommandEditorDraft.commandId = c.id
                    CommandEditorDraft.triggers = c.triggers.toMutableList()
                    CommandEditorDraft.name = c.name
                    CommandEditorDraft.type = c.type
                    CommandEditorDraft.iconUrl = c.iconUrl.orEmpty()
                    CommandEditorDraft.iconOverrides = c.iconOverrides
                        .map { IconOverrideDraft(devices = it.devices.toMutableList(), iconUrl = it.iconUrl) }
                        .toMutableList()
                    CommandEditorDraft.suggestionsApi = c.suggestionsApi.orEmpty()
                    CommandEditorDraft.normalize = c.normalize.toMutableList()
                    CommandEditorDraft.routes = c.routes.toMutableList()
                    CommandEditorDraft.originalGroupId = g.id
                    CommandEditorDraft.isNew = false
                }
            } else {
                CommandEditorDraft.isNew = true
                CommandEditorDraft.originalGroupId = initialGroupId
            }
        }
        0
    }

    // Mirror mutable draft into Compose state so UI recomposes.
    var triggers by remember { mutableStateOf(CommandEditorDraft.triggers.toList()) }
    var name by remember { mutableStateOf(CommandEditorDraft.name) }
    var type by remember { mutableStateOf(CommandEditorDraft.type) }
    var iconUrl by remember { mutableStateOf(CommandEditorDraft.iconUrl) }
    var iconOverrides by remember {
        mutableStateOf(
            CommandEditorDraft.iconOverrides.map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
        )
    }
    var suggestionsApi by remember { mutableStateOf(CommandEditorDraft.suggestionsApi) }
    var normalize by remember { mutableStateOf(CommandEditorDraft.normalize.toList()) }
    var routes by remember { mutableStateOf(CommandEditorDraft.routes.toList()) }
    var selectedGroupId by remember {
        mutableStateOf(
            CommandEditorDraft.originalGroupId
                ?: config?.allGroupsFlat()?.firstOrNull()?.id
                ?: ""
        )
    }

    // Pull any updates (e.g. from RouteEditScreen) back into local state on re-entry.
    LaunchedRouteSync {
        triggers = CommandEditorDraft.triggers.toList()
        routes = CommandEditorDraft.routes.toList()
    }

    var newTrigger by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = if (CommandEditorDraft.isNew) "New Command" else "Edit Command",
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            SettingsCategoryHeader("Triggers")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        triggers.forEach { t ->
                            InputChip(
                                selected = false,
                                onClick = { },
                                label = {
                                    Text(t, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                                },
                                trailingIcon = {
                                    IconButton(
                                        onClick = {
                                            val m = CommandEditorDraft.triggers.toMutableList()
                                            m.remove(t)
                                            CommandEditorDraft.triggers = m
                                            triggers = m.toList()
                                        },
                                        modifier = Modifier.size(16.dp),
                                    ) {
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = "Remove $t",
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                },
                                colors = InputChipDefaults.inputChipColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                ),
                            )
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextFieldS(
                            value = newTrigger,
                            onValueChange = { newTrigger = it },
                            label = { Text("Add trigger") },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val t = newTrigger.trim().lowercase()
                                if (t.isNotEmpty() && !CommandEditorDraft.triggers.contains(t)) {
                                    val m = CommandEditorDraft.triggers.toMutableList()
                                    m.add(t)
                                    CommandEditorDraft.triggers = m
                                    triggers = m.toList()
                                    newTrigger = ""
                                }
                            },
                            shape = RoundedCornerShape(8.dp),
                        ) { Icon(Icons.Default.Add, contentDescription = "Add trigger") }
                    }
                }
            }
            SettingsCategoryHeader("Details")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    OutlinedTextFieldS(
                        value = name,
                        onValueChange = { name = it; CommandEditorDraft.name = it },
                        label = { Text("Name") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Type", style = MaterialTheme.typography.labelLarge)
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            CommandType.entries.forEachIndexed { idx, t ->
                                SegmentedButton(
                                    shape = SegmentedButtonDefaults.itemShape(idx, CommandType.entries.size),
                                    selected = type == t,
                                    onClick = { type = t; CommandEditorDraft.type = t },
                                ) { Text(t.name) }
                            }
                        }
                    }
                }
            }
            SettingsCategoryHeader("Group")
            SettingsCard {
                Column(Modifier.padding(16.dp)) {
                    var expanded by remember { mutableStateOf(false) }
                    val allGroups = config?.allGroupsFlat() ?: emptyList()
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = it },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedTextFieldS(
                            value = allGroups.find { it.id == selectedGroupId }?.name ?: selectedGroupId,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Group") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth(),
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            allGroups.forEach { group ->
                                DropdownMenuItem(
                                    text = { Text(group.name) },
                                    onClick = {
                                        selectedGroupId = group.id
                                        expanded = false
                                    },
                                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                                )
                            }
                        }
                    }
                }
            }
            SettingsCategoryHeader("Icons")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextFieldS(
                        value = iconUrl,
                        onValueChange = { iconUrl = it; CommandEditorDraft.iconUrl = it },
                        label = { Text("Icon URL (optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        trailingIcon = {
                            if (iconUrl.isNotBlank()) {
                                AsyncImage(
                                    model = iconUrl,
                                    contentDescription = "Icon preview",
                                    modifier = Modifier.size(28.dp).padding(4.dp),
                                )
                            }
                        },
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Per-device icons (optional)",
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Text(
                            "Override the icon for specific devices. Each device can appear in at most one row.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        iconOverrides.forEachIndexed { idx, ov ->
                            val usedElsewhere: Set<DeviceType> = iconOverrides
                                .filterIndexed { i, _ -> i != idx }
                                .flatMap { it.devices }
                                .toSet()
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                ),
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        DeviceType.entries.forEach { device ->
                                            val selected = device in ov.devices
                                            val disabled = !selected && device in usedElsewhere
                                            FilterChip(
                                                selected = selected,
                                                enabled = !disabled,
                                                onClick = {
                                                    val newDevices = if (selected) {
                                                        ov.devices - device
                                                    } else {
                                                        ov.devices + device
                                                    }
                                                    val newOv = IconOverrideDraft(
                                                        newDevices.toMutableList(),
                                                        ov.iconUrl,
                                                    )
                                                    val newList = iconOverrides.toMutableList()
                                                        .also { it[idx] = newOv }
                                                    iconOverrides = newList
                                                    CommandEditorDraft.iconOverrides = newList
                                                        .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                                                        .toMutableList()
                                                },
                                                label = { Text(device.name) },
                                            )
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        OutlinedTextFieldS(
                                            value = ov.iconUrl,
                                            onValueChange = { new ->
                                                val newOv = IconOverrideDraft(
                                                    ov.devices.toMutableList(),
                                                    new,
                                                )
                                                val newList = iconOverrides.toMutableList()
                                                    .also { it[idx] = newOv }
                                                iconOverrides = newList
                                                CommandEditorDraft.iconOverrides = newList
                                                    .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                                                    .toMutableList()
                                            },
                                            label = { Text("Icon URL") },
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                        )
                                        if (ov.iconUrl.isNotBlank()) {
                                            Spacer(Modifier.width(8.dp))
                                            AsyncImage(
                                                model = ov.iconUrl,
                                                contentDescription = null,
                                                modifier = Modifier.size(28.dp),
                                            )
                                        }
                                        IconButton(
                                            onClick = {
                                                val newList = iconOverrides.filterIndexed { i, _ -> i != idx }
                                                iconOverrides = newList
                                                CommandEditorDraft.iconOverrides = newList
                                                    .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                                                    .toMutableList()
                                            },
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = "Remove override")
                                        }
                                    }
                                }
                            }
                        }
                        OutlinedButton(
                            onClick = {
                                val newList = iconOverrides + IconOverrideDraft()
                                iconOverrides = newList
                                CommandEditorDraft.iconOverrides = newList
                                    .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                                    .toMutableList()
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Add per-device icon")
                        }
                    }
                }
            }
            SettingsCategoryHeader("Advanced")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextFieldS(
                        value = suggestionsApi,
                        onValueChange = { suggestionsApi = it; CommandEditorDraft.suggestionsApi = it },
                        label = { Text("Suggestions API (optional)") },
                        placeholder = { Text("https://…?q={query}") },
                        supportingText = { Text("Use {query} as the typed-text placeholder.") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Normalize steps", style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            NormalizeStep.entries.forEach { step ->
                                val selected = normalize.contains(step)
                                FilterChip(
                                    selected = selected,
                                    onClick = {
                                        val m = CommandEditorDraft.normalize.toMutableList()
                                        if (selected) m.remove(step) else m.add(step)
                                        CommandEditorDraft.normalize = m
                                        normalize = m.toList()
                                    },
                                    label = {
                                        Text(step.value, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                                    },
                                )
                            }
                        }
                    }
                }
            }
            SettingsCategoryHeader("Routes")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    routes.forEachIndexed { index, route ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            ),
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text(
                                    text = "Devices: " + when (val d = route.devices) {
                                        is RouteDevices.Wildcard -> "All"
                                        is RouteDevices.DeviceList ->
                                            d.devices.joinToString(", ") { it.name }
                                                .ifEmpty { "(none)" }
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                )
                                Text(
                                    text = route.defaultUrl,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                )
                                if (route.patterns.isNotEmpty()) {
                                    Text(
                                        text = "${route.patterns.size} pattern(s)",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Spacer(Modifier.height(6.dp))
                                Row {
                                    OutlinedButton(
                                        onClick = {
                                            CommandEditorDraft.routes = routes.toMutableList()
                                            navController.navigate(
                                                SettingsRoute.RouteEdit.build(
                                                    CommandEditorDraft.commandId ?: "__new__",
                                                    index,
                                                ),
                                            )
                                        },
                                    ) {
                                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Edit")
                                    }
                                    Spacer(Modifier.width(8.dp))
                                    OutlinedButton(
                                        onClick = {
                                            val m = CommandEditorDraft.routes.toMutableList()
                                            if (index in m.indices) m.removeAt(index)
                                            CommandEditorDraft.routes = m
                                            routes = m.toList()
                                        },
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Delete")
                                    }
                                }
                            }
                        }
                    }
                    OutlinedButton(
                        onClick = {
                            CommandEditorDraft.routes = routes.toMutableList()
                            navController.navigate(
                                SettingsRoute.RouteEdit.build(
                                    CommandEditorDraft.commandId ?: "__new__",
                                    -1,
                                ),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Add route")
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        if (CommandEditorDraft.triggers.isEmpty() || name.isBlank() || routes.isEmpty()) {
                            scope.launch {
                                snackbarHostState.showSnackbar(
                                    "Triggers, name, and at least one route are required",
                                )
                            }
                            return@Button
                        }
                        val currentCfg = config ?: run {
                            scope.launch {
                                snackbarHostState.showSnackbar("Config not loaded yet")
                            }
                            return@Button
                        }
                        val cmdId = CommandEditorDraft.commandId
                            ?: sanitizeId("custom-${CommandEditorDraft.triggers.first()}")
                        val cmd = Command(
                            id = cmdId,
                            triggers = CommandEditorDraft.triggers.toList(),
                            name = name.trim(),
                            type = type,
                            iconUrl = iconUrl.trim().ifEmpty { null },
                            iconOverrides = CommandEditorDraft.iconOverrides
                                .filter { it.devices.isNotEmpty() && it.iconUrl.isNotBlank() }
                                .map { IconOverride(devices = it.devices.toList(), iconUrl = it.iconUrl.trim()) },
                            suggestionsApi = suggestionsApi.trim().ifEmpty { null },
                            normalize = CommandEditorDraft.normalize.toList(),
                            routes = routes.toList(),
                        )
                        val groupId = selectedGroupId.ifEmpty {
                            currentCfg.allGroupsFlat().firstOrNull()?.id ?: "custom"
                        }
                        val next = currentCfg.withCommandUpsertedInGroup(groupId, cmd)
                        val otherIds = mutableSetOf<String>()
                        val otherTriggers = mutableMapOf<String, String>()
                        for (g in next.groups) {
                            for (c in g.commands) {
                                if (c.id != cmd.id) {
                                    otherIds.add(c.id)
                                    c.triggers.forEach { t ->
                                        otherTriggers[t.lowercase()] = c.id
                                    }
                                }
                            }
                        }
                        val errors = ConfigValidator.validateCommand(cmd, otherIds, otherTriggers)
                        if (errors.isNotEmpty()) {
                            scope.launch { snackbarHostState.showSnackbar(errors.first()) }
                            return@Button
                        }
                        editableStore.saveLocalConfig(next)
                        markDirty()
                        refreshConfig()
                        CommandEditorDraft.reset()
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Save") }
                OutlinedButton(
                    onClick = {
                        CommandEditorDraft.reset()
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Cancel") }
            }
            if (!CommandEditorDraft.isNew) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(6.dp))
                    Text("Delete command", color = MaterialTheme.colorScheme.error)
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    if (showDeleteDialog) {
        val id = CommandEditorDraft.commandId
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete command") },
            text = { Text("Remove \"${CommandEditorDraft.name}\"? This can be undone by refreshing config.") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    if (id != null && config != null) {
                        editableStore.saveLocalConfig(config.withCommandDeleted(id))
                        markDirty()
                    }
                    refreshConfig()
                    CommandEditorDraft.reset()
                    navController.popBackStack()
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            },
        )
    }
}

/** Re-runs `block` on every recomposition to pull latest draft data after sub-navigation. */
@Composable
private fun LaunchedRouteSync(block: () -> Unit) {
    androidx.compose.runtime.SideEffect { block() }
}

// ==================== RouteEditScreen ====================

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RouteEditScreen(
    navController: NavHostController,
    commandId: String,
    routeIndex: Int,
) {
    val existing: Route? = remember(routeIndex) {
        if (routeIndex in CommandEditorDraft.routes.indices) CommandEditorDraft.routes[routeIndex] else null
    }

    var wildcard by remember {
        mutableStateOf(existing?.devices is RouteDevices.Wildcard || existing == null)
    }
    val initialDevices: Set<DeviceType> = when (val d = existing?.devices) {
        is RouteDevices.DeviceList -> d.devices.toSet()
        else -> emptySet()
    }
    var devices by remember { mutableStateOf(initialDevices) }
    var defaultUrl by remember { mutableStateOf(existing?.defaultUrl ?: "") }
    var searchUrl by remember { mutableStateOf(existing?.searchUrl ?: "") }
    var patterns by remember { mutableStateOf(existing?.patterns ?: emptyList()) }
    var browsers by remember { mutableStateOf(existing?.browsers?.toSet() ?: emptySet()) }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = if (routeIndex < 0) "New Route" else "Edit Route",
                onBack = { navController.popBackStack() },
            )
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Pull back any updates from PatternEditScreen when we re-enter.
            val roundtrip = RouteRoundtrip.consume(routeIndex)
            if (roundtrip != null) {
                patterns = roundtrip.patterns
            }

            SettingsCategoryHeader("Devices")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = wildcard,
                        onClick = { wildcard = !wildcard },
                        label = { Text("All (wildcard)") },
                    )
                    if (!wildcard) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            DeviceType.entries.forEach { dt ->
                                FilterChip(
                                    selected = dt in devices,
                                    onClick = {
                                        devices = if (dt in devices) devices - dt else devices + dt
                                    },
                                    label = { Text(dt.name) },
                                )
                            }
                        }
                    }
                }
            }
            SettingsCategoryHeader("URLs")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextFieldS(
                        value = defaultUrl,
                        onValueChange = { defaultUrl = it },
                        label = { Text("Default URL") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                    OutlinedTextFieldS(
                        value = searchUrl,
                        onValueChange = { searchUrl = it },
                        label = { Text("Search URL (optional)") },
                        supportingText = { Text("Use {query} or {term} as the typed-text placeholder.") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                }
            }
            SettingsCategoryHeader("Patterns")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    patterns.forEachIndexed { pIdx, p ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = p.match,
                                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                    )
                                    Text(
                                        text = p.url,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                    )
                                }
                                IconButton(onClick = {
                                    val newRoute = Route(
                                        devices = if (wildcard) RouteDevices.Wildcard
                                        else RouteDevices.DeviceList(devices.toList()),
                                        defaultUrl = defaultUrl,
                                        searchUrl = searchUrl.ifBlank { null },
                                        patterns = patterns,
                                        browsers = browsers.toList(),
                                    )
                                    stashRouteDraft(routeIndex, newRoute)
                                    navController.navigate(
                                        SettingsRoute.PatternEdit.build(commandId, routeIndex, pIdx),
                                    )
                                }) {
                                    Icon(Icons.Default.Edit, contentDescription = "Edit pattern")
                                }
                                IconButton(onClick = {
                                    patterns = patterns.toMutableList().also { it.removeAt(pIdx) }
                                }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Delete pattern",
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    }
                    OutlinedButton(
                        onClick = {
                            val newRoute = Route(
                                devices = if (wildcard) RouteDevices.Wildcard
                                else RouteDevices.DeviceList(devices.toList()),
                                defaultUrl = defaultUrl,
                                searchUrl = searchUrl.ifBlank { null },
                                patterns = patterns,
                                browsers = browsers.toList(),
                            )
                            stashRouteDraft(routeIndex, newRoute)
                            navController.navigate(
                                SettingsRoute.PatternEdit.build(commandId, routeIndex, -1),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Add pattern")
                    }
                }
            }
            SettingsCategoryHeader("Browsers")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        KNOWN_BROWSERS.forEach { b ->
                            FilterChip(
                                selected = b in browsers,
                                onClick = {
                                    browsers = if (b in browsers) browsers - b else browsers + b
                                },
                                label = { Text(b.replaceFirstChar { it.uppercase() }) },
                            )
                        }
                    }
                    if (browsers.isEmpty()) {
                        Text(
                            "Empty = no browser restriction.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        val saved = Route(
                            devices = if (wildcard) RouteDevices.Wildcard
                            else RouteDevices.DeviceList(devices.toList()),
                            defaultUrl = defaultUrl,
                            searchUrl = searchUrl.ifBlank { null },
                            patterns = patterns,
                            browsers = browsers.toList(),
                        )
                        val list = CommandEditorDraft.routes.toMutableList()
                        if (routeIndex < 0) list.add(saved)
                        else if (routeIndex in list.indices) list[routeIndex] = saved
                        else list.add(saved)
                        CommandEditorDraft.routes = list
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Save") }
                OutlinedButton(
                    onClick = { navController.popBackStack() },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Cancel") }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

// Scratch storage for the in-progress route while the user edits a pattern.
private object RouteRoundtrip {
    private var slot: Pair<Int, Route>? = null
    fun stash(index: Int, route: Route) { slot = index to route }
    fun consume(expectedIndex: Int): Route? {
        val s = slot ?: return null
        if (s.first != expectedIndex) return null
        slot = null
        return s.second
    }
}
private fun stashRouteDraft(routeIndex: Int, route: Route) {
    RouteRoundtrip.stash(routeIndex, route)
}

// ==================== PatternEditScreen ====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatternEditScreen(
    navController: NavHostController,
    commandId: String,
    routeIndex: Int,
    patternIndex: Int,
) {
    // Fetch in-progress route from RouteRoundtrip without consuming (peek by stashing same).
    val initialRoute: Route? = remember {
        // Pattern screen has no state-bearing roundtrip of its own; it reads from stash.
        peekRouteDraft(routeIndex)
    }
    val existingPattern: Pattern? = remember(patternIndex, initialRoute) {
        if (initialRoute != null && patternIndex in initialRoute.patterns.indices)
            initialRoute.patterns[patternIndex] else null
    }

    var match by remember { mutableStateOf(existingPattern?.match ?: "") }
    var url by remember { mutableStateOf(existingPattern?.url ?: "") }

    Scaffold(
        topBar = {
            SettingsTopBar(
                title = if (patternIndex < 0) "New Pattern" else "Edit Pattern",
                onBack = { navController.popBackStack() },
            )
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            SettingsCategoryHeader("Pattern")
            SettingsCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextFieldS(
                        value = match,
                        onValueChange = { match = it },
                        label = { Text("Match") },
                        supportingText = { Text("Use {placeholder} as a capture group.") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                    OutlinedTextFieldS(
                        value = url,
                        onValueChange = { url = it },
                        label = { Text("URL") },
                        supportingText = { Text("Use {placeholder} to substitute the capture back.") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        val route = initialRoute ?: Route(
                            devices = RouteDevices.Wildcard,
                            defaultUrl = "",
                            patterns = emptyList(),
                        )
                        val newPatterns = route.patterns.toMutableList()
                        val p = Pattern(match = match, url = url)
                        if (patternIndex < 0) newPatterns.add(p)
                        else if (patternIndex in newPatterns.indices) newPatterns[patternIndex] = p
                        else newPatterns.add(p)
                        stashRouteDraft(routeIndex, route.copy(patterns = newPatterns))
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Save") }
                OutlinedButton(
                    onClick = { navController.popBackStack() },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                ) { Text("Cancel") }
            }
        }
    }
}

/** Peek at the current stashed route without consuming the one-shot slot. */
private fun peekRouteDraft(routeIndex: Int): Route? {
    // Consume-and-restash pattern: this keeps the single-slot contract but lets PatternEdit read.
    val peeked = RouteRoundtrip.consume(routeIndex) ?: return null
    RouteRoundtrip.stash(routeIndex, peeked)
    return peeked
}

// ==================== Helpers ====================

/** Coerce a free-form id candidate to the `[a-z0-9-]+` schema. */
internal fun sanitizeId(raw: String): String {
    val cleaned = raw.trim().lowercase()
        .map { if (it.isLetterOrDigit() || it == '-') it else '-' }
        .joinToString("")
        .trim('-')
    return cleaned.ifEmpty { "custom-command" }
}
