import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Rutas relativas al directorio de este archivo (root del proyecto Vite) — evita
// depender de "node:path"/"__dirname" y por lo tanto de @types/node, que no forma
// parte de las dependencias aprobadas para este scaffolding inicial.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        admin: "admin/index.html",
        baja: "baja/index.html",
      },
    },
  },
});
