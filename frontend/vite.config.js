import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Frontend calls /api/... and Vite forwards to the backend on :8787
      "/api": "http://localhost:8787",
    },
  },
});
