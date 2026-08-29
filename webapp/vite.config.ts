import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { vibecodePlugin } from "@vibecodeapp/webapp/plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8000,
    allowedHosts: true, // Allow all hosts
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  plugins: [
    react(),
    mode === "development" && vibecodePlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
