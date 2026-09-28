// Sidebar — R2, primer cambio visual fuerte del admin nuevo. Flotante,
// redondeada, separada del borde (ver AppShell, que aporta el padding/gap).
// Cápsula activa animada con Motion (layoutId) — sección 5 del pedido:
// spring corto, nada exagerado. El resto (hover/tap/colapso de ancho) es CSS,
// a propósito (sección 6: "Motion solo para la cápsula activa y colapso si
// aporta" — el colapso local usa una transition CSS de
// `width`, no hizo falta Motion ahí también).
//
// Solo se renderiza en notebook/desktop (AdminShell la oculta por breakpoint,
// no por hover:hover — ver sección 13 del pedido). En mobile la navegación es
// BottomNav + MoreMenu.
//
// R9.1 — pulido de interacciones sobre la MISMA estructura de datos/props de
// R2 (nada de lo de arriba cambió):
//   - El control de colapsar/expandir se mueve arriba, junto a la marca —
//     antes vivía al pie, mezclado con tema/logout.
//   - Tema, datos de admin y logout quedan en tres bloques separados (antes
//     un solo grupo con gap-0.5) — logout como su propia fila, con más
//     distancia visual del resto para reducir el riesgo de click accidental.
//   - Logout pide confirmación (ConfirmModal, mismo componente que ya usa el
//     resto del admin para acciones destructivas) en vez de cerrar sesión al
//     primer click.
//   - Hover-expand: con la sidebar fijada colapsada (`colapsada` prop, la
//     preferencia persistida), acercar el mouse la expande temporalmente
//     (con un pequeño delay para no abrirla por un pasada accidental del
//     cursor) y alejarlo la vuelve a colapsar — sin tocar la preferencia
//     fijada, que sigue siendo dueña `onToggleColapsada`/`colapsada` como
//     siempre. `mostrarExpandida` (expandida-de-verdad O en preview por
//     hover) es la única bandera que decide qué se pinta; `colapsada` (la
//     prop real) sigue siendo la que decide qué hace/dice el botón de
//     colapsar y qué le pasa a la preferencia guardada.

import { LogOut, PanelLeftClose, PanelLeftOpen, User } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { NAV_GROUPS, type Vista } from "../nav.config";
import { ConfirmModal } from "./ConfirmModal";
import { ThemeSwitch } from "./ThemeSwitch";

export interface SidebarProps {
  vista: Vista;
  onSeleccionar: (vista: Vista) => void;
  colapsada: boolean;
  onToggleColapsada: () => void;
  nombreUsuario?: string | null;
  onLogout: () => void;
}

const SPRING_CAPSULA = { type: "spring", stiffness: 500, damping: 34, mass: 0.7 } as const;

// R9.1 — delay antes de expandir por hover (pedido explícito: "pequeño delay
// para evitar aperturas accidentales"). Cerrar es instantáneo a propósito:
// solo dispara al salir de TODA la sidebar (mouseleave del <aside>, no de
// cada ítem interno), así que no hace falta amortiguarlo también.
const HOVER_EXPAND_DELAY_MS = 175;

export function Sidebar({ vista, onSeleccionar, colapsada, onToggleColapsada, nombreUsuario, onLogout }: SidebarProps) {
  const reducirMovimiento = useReducedMotion();
  const [hoverExpandida, setHoverExpandida] = useState(false);
  const [focoExpandida, setFocoExpandida] = useState(false);
  const [confirmandoLogout, setConfirmandoLogout] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  // Si se fija expandida (pin manual) mientras había un preview de hover
  // activo, el preview deja de tener sentido — se limpia para que la próxima
  // vez que se colapse arranque de cero.
  useEffect(() => {
    if (!colapsada) setHoverExpandida(false);
  }, [colapsada]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) window.clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  function alEntrarMouse() {
    if (!colapsada) return; // ya está fijada expandida, no hay nada que previsualizar
    hoverTimeoutRef.current = window.setTimeout(() => setHoverExpandida(true), HOVER_EXPAND_DELAY_MS);
  }

  function alSalirMouse() {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoverExpandida(false);
  }

  // "Expandida a la vista", fijada o en preview por hover — la única bandera
  // que decide qué contenido se pinta (labels, ancho). `colapsada` (la prop
  // real/persistida) sigue siendo la única que decide qué hace y qué dice el
  // botón de colapsar.
  const mostrarExpandida = !colapsada || hoverExpandida || focoExpandida;

  return (
    <aside
      aria-label="Navegación principal"
      onMouseEnter={alEntrarMouse}
      onMouseLeave={alSalirMouse}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setFocoExpandida(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocoExpandida(false);
      }}
      data-expanded={mostrarExpandida}
      className={`admin-sidebar ui-transition-width sticky top-3 flex h-[calc(100dvh-24px)] flex-shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface p-3 shadow-lg ${
        mostrarExpandida ? "w-[250px]" : "w-[68px]"
      }`}
    >
      {/* R9.1 — marca + control de colapsar, ahora juntos arriba (antes el
          control vivía al pie de la sidebar). */}
      <div className="relative flex h-10 w-56 shrink-0 items-start gap-2 px-1 pb-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent font-heading text-[13px] font-bold text-on-accent">
          LA
        </span>
        <span aria-hidden={!mostrarExpandida} className="sidebar-label font-heading min-w-0 flex-1 truncate pr-9 pt-1.5 text-[13.5px] font-bold tracking-wide text-text uppercase">
          Los Amigos
        </span>
        <button
          type="button"
          onClick={onToggleColapsada}
          aria-label={colapsada ? "Expandir menú" : "Colapsar menú"}
          title={!mostrarExpandida ? (colapsada ? "Expandir menú" : "Colapsar menú") : undefined}
          className="sidebar-toggle ui-transition absolute right-1 top-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {colapsada ? (
            <PanelLeftOpen size={16} strokeWidth={1.75} className="shrink-0" />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.75} className="shrink-0" />
          )}
        </button>
      </div>

      <nav className="scroll-hidden min-h-0 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain px-0.5 pb-1" aria-label="Secciones del panel">
        {NAV_GROUPS.map((grupo) => (
          <div key={grupo.label} className="flex shrink-0 flex-col gap-0.5">
            <div aria-hidden={!mostrarExpandida} className="sidebar-group-label sidebar-label text-label whitespace-nowrap px-2 pb-1 font-bold tracking-wider text-muted uppercase">
              {grupo.label}
            </div>
            {grupo.items.map((item) => {
              const activo = vista === item.vista;
              return (
                <button
                  key={item.vista}
                  type="button"
                  onClick={() => onSeleccionar(item.vista)}
                  aria-current={activo ? "page" : undefined}
                  aria-label={!mostrarExpandida ? item.label : undefined}
                  title={!mostrarExpandida ? item.label : undefined}
                  className={`sidebar-row relative min-h-8 rounded-md px-2 py-1.5 text-body-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${activo ? "text-on-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}
                >
                  {activo && (
                    // El colapso CSS no debe disparar una segunda animación
                    // de layout ni escalar la cápsula; solo cambia de destino.
                    <motion.span
                      layoutId="sidebar-active-pill"
                      layout="position"
                      layoutDependency={vista}
                      transition={reducirMovimiento ? { duration: 0 } : SPRING_CAPSULA}
                      className="absolute inset-0 rounded-md bg-accent"
                    />
                  )}
                  <item.Icon size={19} strokeWidth={1.75} className="relative z-10 shrink-0" />
                  <span aria-hidden={!mostrarExpandida} className="sidebar-label relative z-10 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* R9.1 — tema separado del resto (antes compartía el mismo grupo con
          colapsar/logout). */}
      <div className="shrink-0 border-t border-border pt-1.5">
        <ThemeSwitch colapsado={!mostrarExpandida} mantenerLabel />
      </div>

      {/* R9.1 — admin + logout como su propio bloque, separado del de tema
          (border-t propio), con logout en su propia fila (ya no comparte fila
          con el nombre del admin) para quede más lejos del resto de las
          acciones frecuentes y no sea un click accidental. */}
      <div className="flex shrink-0 flex-col border-t border-border pt-1.5">
        <div className="sidebar-row px-2.5 py-1">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
            <User size={13} strokeWidth={1.75} />
          </span>
          <span aria-hidden={!mostrarExpandida} className="sidebar-label truncate text-body-sm text-muted">{nombreUsuario ?? "Admin"}</span>
        </div>

        <button
          type="button"
          onClick={() => setConfirmandoLogout(true)}
          aria-label="Cerrar sesión"
          title={!mostrarExpandida ? "Cerrar sesión" : undefined}
          className="sidebar-row ui-transition rounded-md px-2.5 py-1.5 text-muted hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
          <span aria-hidden={!mostrarExpandida} className="sidebar-label text-body-sm font-medium">Cerrar sesión</span>
        </button>
      </div>

      {confirmandoLogout && (
        <ConfirmModal
          mensaje="¿Cerrar la sesión actual?"
          confirmLabel="Sí, cerrar sesión"
          ariaLabel="Confirmar cierre de sesión"
          onClose={() => setConfirmandoLogout(false)}
          onConfirm={() => {
            setConfirmandoLogout(false);
            onLogout();
          }}
        />
      )}
    </aside>
  );
}
