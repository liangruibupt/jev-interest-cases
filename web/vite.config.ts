import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Claude calls through Bedrock occasionally take tens of seconds; do not let the dev proxy 504 them.
    proxy: { "/api": { target: "http://localhost:8787", timeout: 180_000, proxyTimeout: 180_000 } },
  },
});
