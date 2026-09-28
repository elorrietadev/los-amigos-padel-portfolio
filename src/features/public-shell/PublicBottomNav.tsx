// PublicBottomNav — navegación mobile del público (PUBLIC-R2). Visible por
// debajo de `lg` (mismo corte por ANCHO que AppShell del admin, no por
// hover:hover+pointer:fine). A diferencia del BottomNav del admin (CSS puro
// a propósito), acá SÍ se pide indicador animado — cápsula con layoutId,
// mismo criterio que la Sidebar del admin (SPRING_CAPSULA/PUB_SELECTION_SPRING),
// desactivada del todo si el usuario pide reduced motion.
//
// layoutScroll + layoutRoot en el nav: Motion mide el indicador sumando el
// scroll de la página salvo que su contenedor sea una raíz de scroll. El nav es
// fixed, así que su posición en viewport NO depende del scroll; sin esta marca,
// cambiar de sección con la página scrolleada (el contenido cambia de alto, el
// navegador recorta scrollY y luego se hace scrollTo(0)) hacía que la píldora
// interpolara ese delta de scroll en Y: aparecía "desde abajo" en vez de
// deslizarse en X.
//
// Posición: CSS puro (fixed + bottom-0 + safe-area). Sin VisualViewport: en iOS
// Safari innerHeight y visualViewport.height no se mueven a la par cuando la
// barra del navegador se contrae/expande, y compensar esa diferencia con un
// margin-bottom dinámico levantaba el nav y dejaba una franja debajo. Las
// vistas públicas con inputs (Reservar) no montan este nav, así que tampoco
// hace falta esquivar el teclado.
import { motion } from "motion/react";
import { PUB_SELECTION_SPRING, usarPubReducedMotion } from "../../lib/motion-public";
import { NAV_ITEMS_PUBLICOS, type VistaPublica } from "./nav.config";

export interface PublicBottomNavProps {
  vista: VistaPublica;
  onSeleccionar: (vista: VistaPublica) => void;
}

export function PublicBottomNav({ vista, onSeleccionar }: PublicBottomNavProps) {
  const reducirMovimiento = usarPubReducedMotion();

  return (
    <motion.nav
      layoutScroll
      layoutRoot
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-pub-border bg-pub-surface/95 px-1.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-sm"
    >
      {NAV_ITEMS_PUBLICOS.map((item) => {
        const activo = vista === item.vista;
        return (
          <button
            key={item.vista}
            type="button"
            onClick={() => onSeleccionar(item.vista)}
            aria-current={activo ? "page" : undefined}
            className="pub-transition relative flex flex-col items-center gap-0.5 rounded-pub-md py-1.5 text-[10px] font-bold active:scale-[0.94] motion-reduce:active:scale-100 pub-focus-ring"
          >
            {activo && (
              <motion.span
                layoutId="pub-bottom-nav-pill"
                layout="position"
                layoutDependency={vista}
                transition={reducirMovimiento ? { duration: 0 } : PUB_SELECTION_SPRING}
                className="absolute inset-x-2 inset-y-0.5 rounded-pub-md bg-pub-accent-muted"
              />
            )}
            <item.Icon size={19} strokeWidth={1.9} className={`relative z-10 shrink-0 ${activo ? "text-pub-accent" : "text-pub-muted"}`} />
            <span className={`relative z-10 ${activo ? "text-pub-accent" : "text-pub-muted"}`}>{item.label}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}
