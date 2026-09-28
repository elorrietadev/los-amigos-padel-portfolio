// PublicApp — shell de navegación pública (PUBLIC-R2/R3). Reemplaza el
// montaje directo de <PublicBookingPage/> en main-index.tsx: la vista
// "reservar" ahora es PublicReservarView (PUBLIC-R3, mismo flujo/lógica de
// siempre, rediseñado), no PublicBookingPage — ese componente y los suyos
// (ReservationForm/TimeSlotGrid/DateChipsSelector/SuccessScreen) quedan sin
// usar pero intactos en el repo, sin tocarlos.
//
// Sin URL/routing todavía (mismo criterio que el admin: `vista` es estado de
// React, no rutas) — no hace falta para R2/R3 y evita tocar la config de
// Vite/Cloudflare para esto.
//
// Bottom nav oculta durante "reservar" (PUBLIC-R3): PublicReservarView ya
// tiene su propio header sticky con botón Volver, así que ya no hace falta
// la nav del shell para salir — dos barras fijas compitiendo por el mismo
// espacio en mobile (la nav abajo + la CTA sticky de confirmar) hubiera sido
// peor UX, no mejor.
//
// Sin AnimatePresence acá a propósito: con mode="wait" quedó comprobado en
// el navegador real (no en los tests) que la navegación podía trabarse —
// la vista saliente a veces no dispara onExitComplete y la entrante nunca
// monta, dejando la nav sin efecto. Regla de la sección 18 ("ninguna
// animación debe bloquear interacción") pesa más que la salida animada: se
// mantiene solo la entrada (motion.div con key={vista}, sin exit), que no
// depende de que nada "termine" para que la navegación funcione.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { pubScreenEnter } from "../../lib/motion-public";
import { PublicBottomNav } from "./PublicBottomNav";
import { PublicCatalogoView } from "./PublicCatalogoView";
import { PublicHomeView } from "./PublicHomeView";
import { PublicInformacionView } from "./PublicInformacionView";
import { PublicReservarView } from "./PublicReservarView";
import { PublicTopNav } from "./PublicTopNav";
import type { VistaPublica } from "./nav.config";

export function PublicApp() {
  const [vista, setVista] = useState<VistaPublica>("home");
  const mainRef = useRef<HTMLElement>(null);
  const anteriorRef = useRef(vista);
  useEffect(() => {
    if (anteriorRef.current === vista) return;
    anteriorRef.current = vista;
    window.scrollTo({ top: 0, behavior: "instant" });
    const destino = mainRef.current?.querySelector<HTMLElement>("h1") ?? mainRef.current;
    destino?.setAttribute("tabindex", "-1");
    destino?.focus({ preventScroll: true });
  }, [vista]);
  const esReservar = vista === "reservar";

  return (
    <div className="min-h-dvh bg-pub-bg text-pub-text">
      <div className={esReservar ? "hidden" : "hidden lg:block"}>
        <PublicTopNav vista={vista} onSeleccionar={setVista} />
      </div>

      <main ref={mainRef} tabIndex={-1} className={esReservar ? "" : "pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0"}>
        <motion.div key={vista} variants={pubScreenEnter} initial="initial" animate="animate">
          {vista === "home" && <PublicHomeView onNavegar={setVista} />}
          {vista === "reservar" && <PublicReservarView onNavegar={setVista} />}
          {vista === "catalogo" && <PublicCatalogoView />}
          {vista === "informacion" && <PublicInformacionView />}
        </motion.div>
      </main>

      {!esReservar && (
        <div className="lg:hidden">
          <PublicBottomNav vista={vista} onSeleccionar={setVista} />
        </div>
      )}
    </div>
  );
}
