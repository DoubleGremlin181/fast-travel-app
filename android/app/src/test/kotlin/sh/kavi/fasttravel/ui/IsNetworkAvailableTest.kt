package sh.kavi.fasttravel.ui

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowNetwork
import org.robolectric.shadows.ShadowNetworkCapabilities
import org.robolectric.shadows.ShadowNetworkInfo

/**
 * Unit tests for [isNetworkAvailable].
 *
 * Bug fix verified here: NET_CAPABILITY_INTERNET alone is insufficient because
 * captive portals (hotel Wi-Fi, etc.) advertise INTERNET but have not been
 * confirmed reachable by the OS. NET_CAPABILITY_VALIDATED is set by the Android
 * connectivity stack only after a successful probe, so requiring both capabilities
 * means captive portals are correctly reported as offline.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class IsNetworkAvailableTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val shadowCm = shadowOf(cm)

    @Before fun setUp() {
        shadowCm.setDefaultNetworkActive(false)
        shadowCm.clearAllNetworks()
        shadowCm.setActiveNetworkInfo(null)
    }

    private fun setupNetwork(hasInternet: Boolean, hasValidated: Boolean) {
        // ShadowConnectivityManager.getActiveNetwork() resolves via:
        //   netIdToNetwork.get(getActiveNetworkInfo().getType())
        // so the network's netId must equal ConnectivityManager.TYPE_WIFI (1).
        @Suppress("DEPRECATION")
        val wifiType = ConnectivityManager.TYPE_WIFI
        val network = ShadowNetwork.newInstance(wifiType)

        val caps = ShadowNetworkCapabilities.newInstance()
        val shadowCaps = shadowOf(caps)
        if (hasInternet) shadowCaps.addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        if (hasValidated) shadowCaps.addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

        @Suppress("DEPRECATION")
        val networkInfo = ShadowNetworkInfo.newInstance(
            NetworkInfo.DetailedState.CONNECTED,
            wifiType,
            0,
            true,
            NetworkInfo.State.CONNECTED,
        )
        shadowCm.addNetwork(network, networkInfo)
        shadowCm.setNetworkCapabilities(network, caps)
        shadowCm.setActiveNetworkInfo(networkInfo)
        shadowCm.setDefaultNetworkActive(true)
    }

    @Test fun `returns false when no active network`() {
        // No network added, defaultNetworkActive stays false → getActiveNetwork returns null
        assertFalse(isNetworkAvailable(context))
    }

    @Test fun `returns false when INTERNET present but not VALIDATED (captive portal)`() {
        // Regression test: captive portals declare INTERNET but are not confirmed
        // reachable — the OS leaves VALIDATED absent until the probe succeeds.
        setupNetwork(hasInternet = true, hasValidated = false)
        assertFalse(isNetworkAvailable(context))
    }

    @Test fun `returns false when neither INTERNET nor VALIDATED`() {
        setupNetwork(hasInternet = false, hasValidated = false)
        assertFalse(isNetworkAvailable(context))
    }

    @Test fun `returns false when VALIDATED present but not INTERNET`() {
        setupNetwork(hasInternet = false, hasValidated = true)
        assertFalse(isNetworkAvailable(context))
    }

    @Test fun `returns true when both INTERNET and VALIDATED are present`() {
        setupNetwork(hasInternet = true, hasValidated = true)
        assertTrue(isNetworkAvailable(context))
    }
}
