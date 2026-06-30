package sh.kavi.fasttravel.localsearch.settings

import sh.kavi.fasttravel.core.CommandParser
import sh.kavi.fasttravel.core.FastTravelConfig

/**
 * Returns true only when both preconditions for enabling Local Search hold:
 *   (a) all required media permissions are granted, AND
 *   (b) no command in the active config already claims the 's' trigger.
 *
 * Pure — no android.* runtime calls; JVM-testable.
 */
fun canEnableLocalSearch(hasPermission: Boolean, configHasS: Boolean): Boolean =
    hasPermission && !configHasS

/**
 * Returns true when the active config contains a command whose trigger list
 * includes "s" (case-insensitive, matching [CommandParser.buildTriggerMap] semantics).
 *
 * Pure — no android.* runtime calls; JVM-testable.
 */
fun configHasSTrigger(config: FastTravelConfig): Boolean =
    CommandParser.buildTriggerMap(config).containsKey("s")
