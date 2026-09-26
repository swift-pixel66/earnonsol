import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Dev-only: serve the React app entry (app/index.html) for /app and /app/... URLs.
function appRouteFallback() {
  return {
    name: "app-route-fallback",
    configureServer(server: any) {
      server.middlewares.use((req: any, _res: any, next: any) => {
        const url = (req.url || "").split("?")[0];
        if (url === "/app" || url === "/app/" || url.startsWith("/app/")) {
          req.url = "/app/index.html" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
        }
        next();
      });
    },
  };
}

// Node globals (Buffer/process) are needed by some Solana deps in the browser.
export default defineConfig({
  plugins: [react(), appRouteFallback()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
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
