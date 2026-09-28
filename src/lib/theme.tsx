// Sistema de temas (R1) — infraestructura real, sin botón visible todavía
// (eso es R2, junto con la Sidebar). Lo que sí debe funcionar desde ya:
// cambiar el tema programáticamente (useTheme().toggleTheme()/setTheme()) y
// que todo el sistema de tokens responda, con persistencia y sin flash.
//
// Fuente de verdad única: el atributo data-theme de <html>.
// - Antes del primer paint lo pone web/public/theme-init.js (ver ese
//   archivo — no puede ser un <script> inline por la CSP actual).
// - Después del mount, este ThemeProvider lo mantiene sincronizado con su
//   propio estado de React y con localStorage.
// No se vuelve a leer localStorage acá para el valor inicial: se lee el
// atributo del documento, que theme-init.js ya dejó correcto — dos lugares
// leyendo la misma localStorage por separado es la forma más fácil de que
// terminen desincronizados.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

// Tiene que coincidir con la misma clave usada en web/public/theme-init.js.
const STORAGE_KEY = "lap-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function leerThemeDelDocumento(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(leerThemeDelDocumento);

  // Único lugar que escribe data-theme/localStorage después del mount — se
  // dispara también en el primer render (idempotente: vuelve a poner el
  // mismo valor que theme-init.js ya había puesto, sin flash).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage inaccesible (modo privado, cuota) — el tema sigue
      // funcionando en memoria para esta sesión, solo no persiste.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((actual) => (actual === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return ctx;
}
