package sh.kavi.fasttravel.data

import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.FastTravelConfig
import sh.kavi.fasttravel.core.Group

/**
 * Immutable extension helpers that return a new [FastTravelConfig] with the
 * requested mutation applied. Callers pipe the result through
 * [EditableConfigStore.saveLocalConfig].
 */

fun FastTravelConfig.withCommandAdded(groupId: String, cmd: Command): FastTravelConfig {
    return copy(groups = groups.mapGroups { g ->
        if (g.id == groupId) g.copy(commands = g.commands + cmd) else g
    })
}

fun FastTravelConfig.withCommandUpdated(cmd: Command): FastTravelConfig {
    return copy(groups = groups.mapGroups { g ->
        if (g.commands.any { it.id == cmd.id }) {
            g.copy(commands = g.commands.map { if (it.id == cmd.id) cmd else it })
        } else g
    })
}

/** Move-or-update: if the command id exists in a different group, move it there. */
fun FastTravelConfig.withCommandUpsertedInGroup(groupId: String, cmd: Command): FastTravelConfig {
    val removed = withCommandDeleted(cmd.id)
    return removed.withCommandAdded(groupId, cmd)
}

fun FastTravelConfig.withCommandDeleted(id: String): FastTravelConfig {
    return copy(groups = groups.mapGroups { g ->
        g.copy(commands = g.commands.filterNot { it.id == id })
    })
}

fun FastTravelConfig.withGroupAdded(group: Group): FastTravelConfig {
    if (allGroupIds().contains(group.id)) return this
    return copy(groups = groups + group.copy(commands = emptyList()))
}

/**
 * Update a group's display fields (name/color). Does not move its commands or
 * nested groups — caller preserves the existing tree.
 */
fun FastTravelConfig.withGroupUpdated(
    id: String,
    newName: String,
    newColor: String?,
): FastTravelConfig {
    return copy(groups = groups.mapGroups { g ->
        if (g.id == id) g.copy(name = newName, color = newColor) else g
    })
}

/**
 * Move a command within its group from [fromIndex] to [toIndex]. No-op if the
 * group doesn't exist or either index is out of bounds.
 */
fun FastTravelConfig.withCommandMoved(
    groupId: String,
    fromIndex: Int,
    toIndex: Int,
): FastTravelConfig {
    if (fromIndex == toIndex) return this
    return copy(groups = groups.mapGroups { g ->
        if (g.id != groupId) g
        else if (fromIndex !in g.commands.indices || toIndex !in g.commands.indices) g
        else {
            val mutable = g.commands.toMutableList()
            val moved = mutable.removeAt(fromIndex)
            mutable.add(toIndex, moved)
            g.copy(commands = mutable)
        }
    })
}

/**
 * Move a top-level group from [fromIndex] to [toIndex]. Returns unchanged config
 * if either index is out of bounds. Only reorders top-level groups; nested
 * groups are not surfaced in the UI yet.
 */
fun FastTravelConfig.withGroupMoved(fromIndex: Int, toIndex: Int): FastTravelConfig {
    if (fromIndex !in groups.indices || toIndex !in groups.indices || fromIndex == toIndex) return this
    val mutable = groups.toMutableList()
    val moved = mutable.removeAt(fromIndex)
    mutable.add(toIndex, moved)
    return copy(groups = mutable)
}

/**
 * Delete a group by id. Refuses (returns `this` unchanged) if the group still
 * has commands — the caller should first move or delete those.
 */
fun FastTravelConfig.withGroupDeleted(id: String): FastTravelConfig {
    val target = findGroupById(id) ?: return this
    if (target.commands.isNotEmpty()) return this
    return copy(groups = groups.filterNot { it.id == id })
}

fun FastTravelConfig.findGroupById(id: String): Group? = groups.find { it.id == id }

fun FastTravelConfig.allGroupIds(): Set<String> = groups.map { it.id }.toSet()

fun FastTravelConfig.allGroupsFlat(): List<Group> = groups

fun FastTravelConfig.withIgnoreAdded(entry: String): FastTravelConfig {
    val trimmed = entry.trim()
    if (trimmed.isEmpty()) return this
    val exists = ignoreList.any { it.equals(trimmed, ignoreCase = true) }
    if (exists) return this
    return copy(ignoreList = ignoreList + trimmed.lowercase())
}

fun FastTravelConfig.withIgnoreRemoved(entry: String): FastTravelConfig {
    return copy(ignoreList = ignoreList.filterNot { it.equals(entry, ignoreCase = true) })
}

fun FastTravelConfig.withDefaultCommand(trigger: String): FastTravelConfig {
    return copy(defaultCommand = trigger)
}

fun FastTravelConfig.findGroupForCommand(commandId: String): Group? =
    groups.find { g -> g.commands.any { it.id == commandId } }

fun FastTravelConfig.allCommandsFlat(): List<Command> = groups.flatMap { it.commands }

private fun List<Group>.mapGroups(transform: (Group) -> Group): List<Group> = map { transform(it) }
