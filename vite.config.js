import { defineConfig } from "vite";

export default defineConfig({
  base: "/the-backrooms/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
