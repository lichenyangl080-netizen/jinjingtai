import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url)),
).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
