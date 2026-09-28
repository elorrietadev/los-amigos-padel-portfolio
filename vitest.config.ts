import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Valores ficticios: los tests no dependen de un .env local ni hacen llamadas de red.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "anon-key-de-prueba",
      VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
    include: ["src/**/*.test.{ts,tsx}", "functions/**/*.test.ts"],
  },
});
