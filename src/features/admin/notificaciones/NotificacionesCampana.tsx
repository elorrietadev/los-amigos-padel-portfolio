// NotificacionesCampana — campana + panel flotante de pendientes del admin.
// Vive en el slot `acciones` del PageHeader (arriba a la derecha). No es un
// modal: no bloquea la app ni atrapa el foco, se cierra con click afuera,
// Escape, o cuando el foco sale del panel. Todo lo que muestra sale de
// useNotificaciones (estado real ya cargado por AdminShell, sin queries).

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { Banknote, Bell, CalendarClock, Check, Package, X } from "lucide-react";
import type { ReservaProcesada } from "../reservas/reservas.types";
import type { Producto } from "../productos/productos.logic";
import type { Notificacion, TipoNotificacion } from "./notificaciones.logic";
import { useNotificaciones } from "./useNotificaciones";

export type TabReservasDestino = "pendientes" | "jugadas";

export type DestinoNotificacion = { vista: "reservas"; tab: TabReservasDestino } | { vista: "productos" };

export interface NotificacionesCampanaProps {
  jugadas: ReservaProcesada[];
  proximas: ReservaProcesada[];
  productos: Producto[];
  onNavegar: (destino: DestinoNotificacion) => void;
}

interface Presentacion {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  titulo: (n: number) => string;
  descripcion: (n: number) => string;
  cta: string;
  destino: DestinoNotificacion;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const PRESENTACION: Record<TipoNotificacion, Presentacion> = {
  "reservas-pendientes": {
    Icon: CalendarClock,
    titulo: (n) => `${n} ${plural(n, "reserva pendiente", "reservas pendientes")}`,
    descripcion: (n) => plural(n, "Hay una reserva esperando confirmación", "Hay reservas esperando confirmación"),
    cta: "Ver reservas",
    destino: { vista: "reservas", tab: "pendientes" },
  },
  "sin-pago": {
    Icon: Banknote,
    titulo: (n) => `${n} ${plural(n, "turno sin pago", "turnos sin pago")}`,
    descripcion: (n) => plural(n, "Hay un turno jugado pendiente de cobro", "Hay turnos jugados pendientes de cobro"),
    cta: "Ver reservas",
    destino: { vista: "reservas", tab: "jugadas" },
  },
  "stock-bajo": {
    Icon: Package,
    titulo: (n) => `${n} ${plural(n, "producto con stock bajo", "productos con stock bajo")}`,
    descripcion: () => "Revisá el stock disponible",
    cta: "Ver productos",
    destino: { vista: "productos" },
  },
};

const EASE_SUAVE = [0.22, 1, 0.36, 1] as const;

export function NotificacionesCampana({ jugadas, proximas, productos, onNavegar }: NotificacionesCampanaProps) {
  const { items, total, descartar, novedadToken } = useNotificaciones({ jugadas, proximas, productos });
  const reducirMovimiento = useReducedMotion();
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const tituloId = useId();

  function cerrar({ devolverFoco }: { devolverFoco: boolean }) {
    setAbierto(false);
    if (devolverFoco) botonRef.current?.focus({ preventScroll: true });
  }

  // Foco al panel al abrir (contenedor, no un botón: el primer Tab llega al
  // primer CTA sin que el lector de pantalla arranque en medio de una fila).
  useEffect(() => {
    if (abierto) panelRef.current?.focus({ preventScroll: true });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function onPointerDown(e: PointerEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAbierto(false);
      botonRef.current?.focus({ preventScroll: true });
    }
    // El foco salió del panel hacia otro elemento (Tab hacia afuera): se cierra
    // sin robarle el foco al elemento que lo recibió.
    function onFocusIn(e: FocusEvent) {
      if (e.target instanceof Node && !raizRef.current?.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [abierto]);

  // Microanimación de la campana: una sola vez por novedad, nunca en bucle,
  // y no si el panel ya está abierto (la novedad se ve directamente).
  const [scope, animar] = useAnimate<HTMLSpanElement>();
  useEffect(() => {
    if (novedadToken === 0 || abierto || reducirMovimiento || !scope.current) return;
    void animar(scope.current, { rotate: [0, -14, 11, -7, 3, 0] }, { duration: 0.6, ease: "easeInOut" });
    // Solo reacciona a una novedad nueva; abierto/reducirMovimiento se leen en ese instante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novedadToken]);

  function navegar(destino: DestinoNotificacion) {
    cerrar({ devolverFoco: true });
    onNavegar(destino);
  }

  function descartarFila(tipo: TipoNotificacion) {
    descartar(tipo);
    // La fila (y su botón, que tenía el foco) desaparece: el foco vuelve al panel.
    panelRef.current?.focus({ preventScroll: true });
  }

  const textoBadge = total > 99 ? "99+" : String(total);
  const etiqueta = `Notificaciones, ${total} ${plural(total, "pendiente", "pendientes")}`;

  return (
    <div ref={raizRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={etiqueta}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        className={`tap-fx ui-transition relative flex h-10 w-10 items-center justify-center rounded-lg border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
          abierto ? "border-border-strong text-text" : "border-border text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text"
        }`}
      >
        <span ref={scope} className="flex origin-top items-center justify-center" style={{ transformOrigin: "50% 15%" }}>
          <Bell aria-hidden="true" size={18} strokeWidth={1.9} />
        </span>
        <AnimatePresence initial={false}>
          {total > 0 && (
            <motion.span
              key="badge"
              aria-hidden="true"
              initial={{ opacity: 0, scale: reducirMovimiento ? 1 : 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducirMovimiento ? 1 : 0.6 }}
              transition={{ duration: 0.16, ease: EASE_SUAVE }}
              className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center overflow-hidden rounded-pill bg-accent px-1 text-[10px] leading-none font-bold text-on-accent tabular-nums shadow-sm ring-2 ring-bg"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={textoBadge}
                  initial={{ opacity: 0, y: reducirMovimiento ? 0 : 7 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reducirMovimiento ? 0 : -7 }}
                  transition={{ duration: 0.16, ease: EASE_SUAVE }}
                >
                  {textoBadge}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={tituloId}
            tabIndex={-1}
            initial={{ opacity: 0, y: reducirMovimiento ? 0 : -6, scale: reducirMovimiento ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE_SUAVE } }}
            exit={{
              opacity: 0,
              y: reducirMovimiento ? 0 : -4,
              scale: reducirMovimiento ? 1 : 0.985,
              transition: { duration: 0.14, ease: "easeIn" },
            }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-[calc(100%+10px)] right-0 z-[60] flex max-h-[min(72dvh,520px)] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id={tituloId} className="font-heading text-[15px] font-bold tracking-wide text-text">
                Pendientes
              </h2>
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">
                {total === 0 ? "Al día" : `${total} en total`}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-muted text-success">
                  <Check aria-hidden="true" size={20} strokeWidth={2.2} />
                </span>
                <p className="text-body-sm font-semibold text-text">Todo al día</p>
                <p className="text-xs text-muted">No hay nada pendiente por ahora.</p>
              </div>
            ) : (
              <ul className="flex flex-col overflow-y-auto p-2">
                <AnimatePresence initial={false}>
                  {items.map((n, i) => (
                    <FilaNotificacion
                      key={n.tipo}
                      notificacion={n}
                      indice={i}
                      reducirMovimiento={!!reducirMovimiento}
                      onNavegar={navegar}
                      onDescartar={descartarFila}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FilaNotificacionProps {
  notificacion: Notificacion;
  indice: number;
  reducirMovimiento: boolean;
  onNavegar: (destino: DestinoNotificacion) => void;
  onDescartar: (tipo: TipoNotificacion) => void;
}

function FilaNotificacion({ notificacion, indice, reducirMovimiento, onNavegar, onDescartar }: FilaNotificacionProps) {
  const p = PRESENTACION[notificacion.tipo];
  const titulo = p.titulo(notificacion.cantidad);
  return (
    <motion.li
      layout={reducirMovimiento ? false : "position"}
      initial={{ opacity: 0, y: reducirMovimiento ? 0 : 4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_SUAVE, delay: reducirMovimiento ? 0 : Math.min(indice, 3) * 0.03 } }}
      exit={{ opacity: 0, x: reducirMovimiento ? 0 : 10, transition: { duration: 0.12 } }}
      className="group ui-transition relative flex gap-3 rounded-md p-2.5 hover:bg-surface-hover focus-within:bg-surface-hover"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
        <p.Icon aria-hidden="true" size={18} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-body-sm font-semibold text-text">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted">{p.descripcion(notificacion.cantidad)}</p>
        <button
          type="button"
          onClick={() => onNavegar(p.destino)}
          aria-label={`${p.cta}: ${titulo}`}
          className="tap-fx ui-transition mt-2 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-text hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {p.cta}
        </button>
      </div>
      <button
        type="button"
        onClick={() => onDescartar(notificacion.tipo)}
        aria-label={`Descartar: ${titulo}`}
        className="tap-fx ui-transition absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <X aria-hidden="true" size={14} strokeWidth={2} />
      </button>
    </motion.li>
  );
}
