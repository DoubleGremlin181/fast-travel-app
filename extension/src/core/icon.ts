import type { Command, DeviceType } from "./types.js";

export function resolveIconUrl(cmd: Command, device: DeviceType): string | undefined {
  const override = cmd.iconOverrides?.find((o) => o.devices.includes(device));
  return override?.iconUrl ?? cmd.iconUrl;
}
