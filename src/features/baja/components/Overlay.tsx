// Port del componente Overlay de baja.html (líneas 101-121 + sty.overlayBase/
// sty.modalCard). Se usa para los modales de confirmación y de aviso/error —
// NO para la pantalla de éxito, que en el legacy usa su propio overlay
// (sty.exitoOverlay/sty.exitoContenido) con z-index y blur distintos y sin
// esta animación de entrada/salida.
//
// PUBLIC-R5 — restyleado con tokens pub-* (border-pub-border/bg-pub-surface
// en vez de border-border/bg-surface): único consumidor de este componente
// es BajaPage, que ahora vive 100% en la identidad pública. La mecánica
// (overlay-anim/modal-pop, backdrop+blur, cierre por click afuera) es
// puramente geométrica (opacity/scale) y no depende de ningún token de
// color — se reutiliza tal cual.

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

export interface OverlayProps {
  /** true mientras corre la animación de cierre (140/130ms) antes de desmontar. */
  closing: boolean;
  /** Click en el backdrop. El propio legacy deja que el llamador decida si
   *  ignorarlo (ej. mientras `enviando`), acá pasa igual: es responsabilidad
   *  de quien usa Overlay, no de este componente. */
  onClose: () => void;
  children: ReactNode;
}

const SELECTOR_FOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// PUBLIC-R7 — foco de teclado: antes se quedaba sobre el botón que abrió el
// modal (nunca se movía adentro), Escape no hacía nada y Tab se escapaba
// libremente hacia botones de fondo (confirmado a mano: con el modal de
// confirmación de baja abierto, Tab movía el foco a un "No voy" de otra
// ocurrencia detrás del overlay). Acá se mueve el foco al primer control del
// diálogo al montar, se atrapa Tab/Shift+Tab dentro de sus controles, Escape
// cierra igual que el click en el backdrop (misma función `onClose`, así que
// respeta el mismo guard de "no cerrar mientras se está enviando" que ya
// tenía el backdrop) y se devuelve el foco a quien abrió el modal al cerrarse.
export function Overlay({ closing, onClose, children }: OverlayProps) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<Element | null>(null);

  useEffect(() => {
    disparadorRef.current = document.activeElement;
    dialogoRef.current?.querySelector<HTMLElement>(SELECTOR_FOCABLES)?.focus();
    return () => {
      if (disparadorRef.current instanceof HTMLElement) disparadorRef.current.focus();
    };
  }, []);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focables = dialogoRef.current?.querySelectorAll<HTMLElement>(SELECTOR_FOCABLES);
      if (!focables || focables.length === 0) return;
      const primero = focables[0];
      const ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  function detenerPropagacion(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return (
    <div
      className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
      data-closing={closing ? "true" : undefined}
      onClick={onClose}
    >
      <div
        ref={dialogoRef}
        className="modal-pop w-full max-w-[340px] rounded-pub-lg border border-pub-border bg-pub-surface p-[22px] shadow-pub-md"
        data-closing={closing ? "true" : undefined}
        onClick={detenerPropagacion}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
