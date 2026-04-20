import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    server: {
      deps: {
        external: [/node_modules/, /vendor/],
      },
    },
  },
});
