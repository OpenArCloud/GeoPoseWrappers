import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import cesium from "vite-plugin-cesium";
import path from "path";

export default defineConfig({
  plugins: [svelte(), cesium()],
  resolve: {
    alias: {
      "geopose-lib": path.resolve(__dirname, "../../packages/geopose-lib/src/index.ts")
    }
  }
});
