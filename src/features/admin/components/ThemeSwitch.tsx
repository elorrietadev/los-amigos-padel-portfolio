// ThemeSwitch — control visible del tema (R2). La infraestructura ya existía
// desde R1 (ThemeProvider/useTheme); esto es solo el primer botón que la usa.
// Ícono con crossfade CSS (la transición de color de fondo/borde ya la trae
// .ui-transition) — nada de Motion acá, pedido explícito de la sección 9.

import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../../lib/theme";

export interface ThemeSwitchProps {
  colapsado?: boolean;
  // Sidebar conserva la altura del texto incluso cuando está oculto.
  mantenerLabel?: boolean;
}

export function ThemeSwitch({ colapsado = false, mantenerLabel = false }: ThemeSwitchProps) {
  const { theme, toggleTheme } = useTheme();
  const esDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={esDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={colapsado ? (esDark ? "Tema claro" : "Tema oscuro") : undefined}
      className={`${mantenerLabel ? "sidebar-row w-full" : "flex items-center gap-2.5"} ui-transition rounded-md px-2.5 py-2 text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}
    >
      {esDark ? <Moon size={17} strokeWidth={1.75} className="shrink-0" /> : <Sun size={17} strokeWidth={1.75} className="shrink-0" />}
      {(mantenerLabel || !colapsado) && (
        <span aria-hidden={colapsado} className={`${mantenerLabel ? "sidebar-label" : ""} text-body-sm font-medium`}>
          {esDark ? "Tema oscuro" : "Tema claro"}
        </span>
      )}
    </button>
  );
}
