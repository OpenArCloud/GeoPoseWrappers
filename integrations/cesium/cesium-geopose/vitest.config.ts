import { defineConfig } from 'vitest/config';
export default defineConfig({ resolve: { dedupe: ['cesium', 'geopose-lib'] } });
