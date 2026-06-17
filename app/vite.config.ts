import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app consumes the SDK directly from this folder's parent `src/` — no publish
// step. Vite resolves the SDK's `.js` ESM specifiers to their `.ts` sources.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "quantum-migration": fileURLToPath(
        new URL("../src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  // If a platform runs `vite preview` directly, bind 0.0.0.0:$PORT so the
  // container is reachable (default localhost:4173 fails health checks).
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
  },
});
