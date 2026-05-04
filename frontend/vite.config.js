import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In dev, Vite proxies /api → local backend so the React app can fetch from
// "/api/..." with no CORS hassle. In a production build the static site
// hits the absolute backend URL via VITE_API_URL (see src/lib/api.js).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5176,
      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:3011",
          changeOrigin: true,
        },
      },
    },
  };
});
