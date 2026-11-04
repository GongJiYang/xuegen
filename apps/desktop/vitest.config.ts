import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Skin and core modules import through these aliases; mirror the renderer
      // config so tests resolve them the same way the app does.
      "@": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    // React 18 selects its dev or prod build from NODE_ENV at require time. The
    // ambient shell may set NODE_ENV=production (for the CLI); React Testing
    // Library needs the development build for `act`. Force it here.
    env: { NODE_ENV: "test" },
    // React contract tests need a DOM; the pure Node modules ignore it.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The agent's `session.ts` imports Pi lazily, so tests of pure modules never
    // touch the SDK. Nothing here spawns Electron.
  },
});
