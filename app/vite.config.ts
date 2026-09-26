import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Node globals (Buffer/process) are needed by some Solana deps in the browser.
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      // lightweight buffer shim for browser
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  server: { port: 5173, host: "127.0.0.1" },
});
