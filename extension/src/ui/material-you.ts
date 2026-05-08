import { argbFromHex, themeFromSourceColor, applyTheme } from "@material/material-color-utilities";

/**
 * Generates a Material You palette from a seed accent colour and writes the
 * resulting M3 tokens as CSS custom properties onto `<html>`. Called from
 * `applyAppearance` whenever the active variant is `material-you` or
 * `material-you-tint` and an accent is set.
 */
export function applyMaterialYouPalette(accentHex: string, mode: "light" | "dark"): void {
    const theme = themeFromSourceColor(argbFromHex(accentHex));
    applyTheme(theme, { target: document.documentElement, dark: mode === "dark" });
}
