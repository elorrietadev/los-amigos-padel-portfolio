import { useId } from "react";
import { MessageCircleOff } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { useDialogFocus } from "../components/useDialogFocus";
import { IconWhatsapp } from "../icons";

interface AgendaCancelacionModalProps {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onAvisar: () => void;
}

// Presentación local de las dos opciones; Agenda conserva la cancelación y el aviso.
export function AgendaCancelacionModal({ busy, onClose, onConfirm, onAvisar }: AgendaCancelacionModalProps) {
  const id = useId();
  const dialogFocus = useDialogFocus(onClose, busy);
  const actionClass = "tap-fx ui-transition flex min-h-16 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]";

  return (
    <div
      className="overlay-anim fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-5 backdrop-blur-[3px]"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        {...dialogFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
        className="modal-pop max-h-[calc(100dvh-40px)] w-full max-w-[420px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-5 shadow-lg sm:p-6"
      >
        <h2 id={`${id}-title`} className="font-heading text-xl font-bold text-text">¿Cancelar este turno?</h2>
        <p id={`${id}-description`} className="mt-2 text-sm leading-relaxed text-muted">
          Podés cancelar el turno y avisarle al jugador por WhatsApp, o cancelarlo sin enviar mensaje.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className={`${actionClass} border-success/40 bg-success-muted text-success hover:border-success hover:bg-success/20`}
            onClick={onAvisar}
            disabled={busy}
            aria-labelledby={`${id}-notify`}
            aria-describedby={`${id}-notify-description`}
          >
            <span className="shrink-0" aria-hidden="true"><IconWhatsapp size={22} /></span>
            <span className="min-w-0">
              <span id={`${id}-notify`} className="block text-sm font-semibold">Cancelar y avisar</span>
              <span id={`${id}-notify-description`} className="mt-0.5 block text-xs leading-relaxed text-muted">Abrir WhatsApp con el mensaje de cancelación.</span>
            </span>
          </button>
          <button
            type="button"
            className={`${actionClass} border-error/40 text-error hover:border-error hover:bg-error-muted`}
            onClick={onConfirm}
            disabled={busy}
            aria-labelledby={`${id}-silent`}
            aria-describedby={`${id}-silent-description`}
          >
            <MessageCircleOff size={22} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span id={`${id}-silent`} className="block text-sm font-semibold">Cancelar sin avisar</span>
              <span id={`${id}-silent-description`} className="mt-0.5 block text-xs leading-relaxed text-muted">Cancelar el turno sin enviar ningún mensaje.</span>
            </span>
          </button>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <Button variant="ghost" className="w-full" onClick={onClose} disabled={busy}>Volver</Button>
        </div>
      </div>
    </div>
  );
}
