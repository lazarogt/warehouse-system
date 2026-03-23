import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
    fs: {
      allow: [path.resolve(rootDir, "..")],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT ?? 5173),
  },
});
