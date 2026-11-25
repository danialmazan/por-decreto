/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// GitHub Pages: https://<usuario>.github.io/decretometro/ (se puede cambiar con BASE_PATH)
export default defineConfig({
  base: process.env.BASE_PATH ?? "/decretometro/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      input: {
        es: fileURLToPath(new URL("./index.html", import.meta.url)),
        en: fileURLToPath(new URL("./en/index.html", import.meta.url)),
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
