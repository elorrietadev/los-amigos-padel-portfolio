// PublicTopNav — navegación desktop del público (PUBLIC-R2), visible desde
// `lg` (1024px). Barra superior estática (no fixed): en desktop hay lugar de
// sobra, no hace falta flotar ni robar viewport. Incluye el toggle de tema
// acá (chrome compartido de todas las vistas en desktop) — en mobile el
// toggle vive en el header de cada vista (ver PublicHomeView), no en esta
// barra, siguiendo la composición aprobada en el artifact.
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { PadelBallLogo, PubButton } from "../../components/ui-public";
import { PUB_SELECTION_SPRING, usarPubReducedMotion } from "../../lib/motion-public";
import { useTheme } from "../../lib/theme";
import { NAV_ITEMS_PUBLICOS, type VistaPublica } from "./nav.config";

export interface PublicTopNavProps {
  vista: VistaPublica;
  onSeleccionar: (vista: VistaPublica) => void;
}

export function PublicTopNav({ vista, onSeleccionar }: PublicTopNavProps) {
  const reducirMovimiento = usarPubReducedMotion();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-[76px] items-center justify-between border-b border-pub-border px-10">
      <div className="flex items-center gap-2 font-pub-heading text-lg font-semibold text-pub-text">
        <PadelBallLogo size={44} />
        LOS AMIGOS <b className="font-extrabold text-pub-accent">PADEL</b>
      </div>

      <nav aria-label="Navegación principal" className="flex items-center gap-1">
        {NAV_ITEMS_PUBLICOS.map((item) => {
          const activo = vista === item.vista;
          return (
            <button
              key={item.vista}
              type="button"
              onClick={() => onSeleccionar(item.vista)}
              aria-current={activo ? "page" : undefined}
              className={`pub-transition relative rounded-pub-pill px-4 py-2.5 text-[13.5px] font-semibold pub-focus-ring ${
                activo ? "text-pub-accent" : "text-pub-text-secondary hover:bg-pub-surface-2 hover:text-pub-text"
              }`}
            >
              {activo && (
                <motion.span
                  layoutId="pub-top-nav-pill"
                  layout="position"
                  layoutDependency={vista}
                  transition={reducirMovimiento ? { duration: 0 } : PUB_SELECTION_SPRING}
                  className="absolute inset-0 rounded-pub-pill bg-pub-accent-muted"
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          className="pub-transition flex h-9 w-9 items-center justify-center rounded-pub-pill border border-pub-border bg-pub-surface text-pub-text active:scale-[0.9] motion-reduce:active:scale-100 pub-focus-ring"
        >
          {theme === "dark" ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
        </button>
        <PubButton size="sm" onClick={() => onSeleccionar("reservar")}>
          Reservar ahora
        </PubButton>
      </div>
    </header>
  );
}
