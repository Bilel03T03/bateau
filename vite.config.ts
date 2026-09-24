import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Un seul fichier HTML autonome : il sert à la fois pour GitHub Pages (PWA)
// et pour la page claude.ai (scripts/build-artifact.mjs le retravaille).
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 100_000_000 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
