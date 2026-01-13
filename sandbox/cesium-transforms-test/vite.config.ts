import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import cesium from "vite-plugin-cesium";
import path from "path";

export default defineConfig({
  plugins: [svelte(), cesium()],
  resolve: {
    alias: {
      "@geopose/transforms": path.resolve(__dirname, "../../gepose-transforms/typescript/src/index.ts")
    }
  }
});
