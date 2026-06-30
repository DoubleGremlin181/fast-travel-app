import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@shared": resolve(__dirname, "../shared"),
    },
  },
});
