package sh.kavi.fasttravel.core

fun resolveIconUrl(cmd: Command, device: DeviceType): String? =
    cmd.iconOverrides.firstOrNull { device in it.devices }?.iconUrl ?: cmd.iconUrl
