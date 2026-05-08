import type { DeviceType } from "./types.js";

export function detectDevice(): DeviceType {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("mac")) return "MacOS";
  if (ua.includes("win")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Unknown";
}
