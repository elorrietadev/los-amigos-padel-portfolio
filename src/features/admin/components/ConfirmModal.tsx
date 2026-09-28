// ConfirmModal — overlay + card con mensaje y dos botones (Volver/acción).
// Patrón compartido por el modal de cancelar reserva (reservas/ReservasView) y
// el de desajuste de pago (reservas/PaymentModal): en ambos casos el markup es
// estructuralmente idéntico (overlay que cierra al click, card que detiene la
// propagación, mensaje, dos botones) — solo variaban el texto, el label del
// botón de acción y si hay un estado "busy" que bloquear. Se extrajo acá para
// no repetirlo una tercera vez, sin generalizar más allá de ese patrón exacto
// (no es un "ModalSystem": el modal de pago en sí, con 3 modos e inputs, sigue
// siendo su propio componente, no encaja en este molde).

import type { ReactNode } from "react";
import { Button } from "../../../components/ui/Button";
import type { ButtonVariant } from "../../../components/ui/Button";
import { useDialogFocus } from "./useDialogFocus";

export interface ConfirmModalProps {
  mensaje: ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  closeLabel?: string;
  confirmVariant?: ButtonVariant;
  // Mientras es true: deshabilita ambos botones y bloquea el cierre por click
  // en el overlay — mismo criterio ya aprobado para el modal de cancelar
  // reserva (B4.2).
  busy?: boolean;
  ariaLabel?: string;
  // Permite apilar un ConfirmModal por encima de otro modal ya abierto (ej. la
  // confirmación de desajuste de pago, que se abre sobre el modal de pago).
  zIndexClassName?: string;
  // Tercer botón opcional, entre "Volver" y la acción principal — pensado
  // para una variante de la misma acción destructiva (P1: "Cancelar sin
  // avisar" / "Cancelar y avisar"). Ausente por defecto: ningún llamador
  // existente cambia de 2 a 3 botones sin pedirlo explícitamente.
  accionSecundaria?: { label: string; onClick: () => void; variant?: ButtonVariant };
}

export function ConfirmModal({
  mensaje,
  confirmLabel,
  onClose,
  onConfirm,
  closeLabel = "Volver",
  confirmVariant = "destructive",
  busy = false,
  ariaLabel,
  zIndexClassName = "z-50",
  accionSecundaria,
}: ConfirmModalProps) {
  const dialogFocus = useDialogFocus(onClose, busy);
  return (
    <div
      className={`overlay-anim fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-overlay p-5 backdrop-blur-[3px]`}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        {...dialogFocus}
        className="modal-pop max-h-[calc(100dvh-40px)] w-full max-w-[380px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <p className="text-sm text-text">{mensaje}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            {closeLabel}
          </Button>
          {accionSecundaria && (
            <Button
              variant={accionSecundaria.variant ?? confirmVariant}
              onClick={accionSecundaria.onClick}
              disabled={busy}
            >
              {accionSecundaria.label}
            </Button>
          )}
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
