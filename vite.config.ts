import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mkcert from "vite-plugin-mkcert";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mkcert()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    proxy: {
      "/party": {
        target: "http://127.0.0.1:1999",
        ws: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("/three/")) return "vendor-three";
          if (id.includes("@react-three/") || id.includes("/postprocessing/"))
            return "vendor-r3f";
          if (
            id.includes("/yjs/") ||
            id.includes("/y-webrtc/") ||
            id.includes("/partykit/")
          )
            return "vendor-sync";
        },
      },
    },
  },
});
