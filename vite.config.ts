import { defineConfig } from "vite";

export default defineConfig({
  server: {
    hmr: false,
    watch: null,
  },
  test: {
    environment: "node",
    server: {
      deps: {
        external: [/node_modules/, /vendor/],
      },
    },
  },
});
