// PaymentSegmented — R6: selector de método de pago (Efectivo/Transferencia/
// Mixto) reusable entre vistas del admin. Cápsula que se DESLIZA físicamente
// entre segmentos vía Motion `layoutId` — mismo mecanismo ya aprobado y en
// producción en Sidebar (cápsula del ítem activo) y en el tablist de
// ReservasView (cápsula del tab activo), no un cambio de background plano. En
// "Mixto" revela los dos inputs de monto con una transición de altura suave
// (AnimatePresence) en vez de aparecer de golpe.
//
// Puramente de presentación: no calcula nada y no sabe de Supabase ni de
// `total`/`precio` — el consumidor sigue siendo dueño del autocálculo
// bidireccional (complemento = resto contra su propio total/precio) y de
// armar el split final (`calcularSplitPago`). Reutilizado por VenderView y
// PaymentModal: modo + 2 montos + handlers, sin cálculos ni transporte aquí.
//
// `useId()` en vez de pedir un `layoutId` por prop: si en algún momento hay
// dos instancias montadas a la vez (ej. Vender + un PaymentModal abierto
// simultáneamente), cada una genera su propia cápsula sin que el consumidor
// tenga que coordinar nada a mano — Framer Motion solo anima ENTRE elementos
// que comparten el mismo layoutId.
//
// `modo`/`onModoChange` usan el literal "efectivo" | "transferencia" | "mixto"
// inline (no importan `ModoPago` de reservas/reservas.types) a propósito:
// este componente vive en components/ui-adyacente del admin pero no debe
// depender de un módulo de una vista puntual (reservas/) — TypeScript los
// trata como el mismo tipo estructuralmente, así que VenderView (que sí usa
// `ModoPago` de reservas.types) le pasa sus valores sin ninguna conversión.

import { useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

export type ModoPagoSegmentado = "efectivo" | "transferencia" | "mixto";

const OPCIONES: ReadonlyArray<{ key: ModoPagoSegmentado; label: string }> = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
  { key: "mixto", label: "Mixto" },
];

const SPRING_CAPSULA = { type: "spring", stiffness: 500, damping: 34, mass: 0.7 } as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const INPUT_CLASS =
  "payment-amount ui-transition mt-1 block min-w-0 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text placeholder:text-muted hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]";

export interface PaymentSegmentedProps {
  modo: ModoPagoSegmentado;
  onModoChange: (modo: ModoPagoSegmentado) => void;
  montoEfectivo: string;
  montoTransferencia: string;
  onMontoEfectivoChange: (valor: string) => void;
  onMontoTransferenciaChange: (valor: string) => void;
  disabled?: boolean;
  // Slot opcional para un mensaje de aviso/desajuste (PaymentModal ya tiene
  // el suyo, con su propia lógica de sobrepago/desajuste) — este componente
  // no impone ningún texto propio, solo le da un lugar debajo de los inputs.
  avisoMixto?: ReactNode;
}

export function PaymentSegmented({
  modo,
  onModoChange,
  montoEfectivo,
  montoTransferencia,
  onMontoEfectivoChange,
  onMontoTransferenciaChange,
  disabled = false,
  avisoMixto,
}: PaymentSegmentedProps) {
  const uid = useId();
  const layoutId = `payment-segmented-capsule-${uid}`;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Método de pago"
        className="grid grid-cols-[1fr_1.4fr_1fr] gap-1 rounded-pill border border-border bg-surface-2 p-1"
      >
        {OPCIONES.map((op) => {
          const activo = modo === op.key;
          return (
            <button
              key={op.key}
              type="button"
              aria-pressed={activo}
              disabled={disabled}
              onClick={() => onModoChange(op.key)}
              className={`ui-transition relative min-h-10 rounded-pill px-1 py-2 text-[11px] sm:text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)] ${
                activo ? "text-on-accent" : "text-muted hover:text-text"
              }`}
            >
              {activo && (
                <motion.span
                  layoutId={layoutId}
                  transition={SPRING_CAPSULA}
                  className="absolute inset-0 rounded-pill bg-accent"
                />
              )}
              <span className="relative z-10">{op.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {modo === "mixto" && (
          <motion.div
            key="mixto-inputs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col gap-2.5 pt-0.5">
              <label className="flex min-w-0 flex-col text-xs text-muted">
                Monto en efectivo
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={montoEfectivo}
                  onChange={(e) => onMontoEfectivoChange(e.target.value)}
                  disabled={disabled}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex min-w-0 flex-col text-xs text-muted">
                Monto en transferencia
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={montoTransferencia}
                  onChange={(e) => onMontoTransferenciaChange(e.target.value)}
                  disabled={disabled}
                  className={INPUT_CLASS}
                />
              </label>
              {avisoMixto}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
