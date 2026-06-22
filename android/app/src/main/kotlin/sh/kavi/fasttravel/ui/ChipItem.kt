package sh.kavi.fasttravel.ui

import sh.kavi.fasttravel.core.Command
import sh.kavi.fasttravel.core.InstalledApp

/**
 * An entry in the empty-input shortcut grid. Commands and launched installed apps are
 * ranked together (see [sh.kavi.fasttravel.core.ChipRanking]) and rendered side by side.
 */
sealed interface ChipItem {
    data class Cmd(val command: Command) : ChipItem
    data class App(val app: InstalledApp) : ChipItem
}
