import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the "@/*" -> "./src/*" alias in jsconfig.json. Next resolves that
  // itself during a build, but vitest needs it spelled out to test modules
  // under src/app that import shared code via "@/lib/...".
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
