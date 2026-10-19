import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          realtime: ["socket.io-client"],
        },
      },
    },
  },
});
