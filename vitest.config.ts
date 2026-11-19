import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config (doesn't load vite.config.ts / the TanStack Start plugin),
// so unit tests stay fast and don't touch generated route files.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".vercel/**", ".output/**", "dist/**"],
  },
});
