import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, CircleAlert } from "lucide-react";

export interface ToastData {
  texto: string;
  tipo: "ok" | "error";
}

// AdminShell conserva el estado y el temporizador. El portal evita que un
// ancestor con transform/overflow encierre el aviso debajo de un sheet.
export function Toast({ toast }: { toast: ToastData | null }) {
  const reducedMotion = useReducedMotion();
  const Icon = toast?.tipo === "error" ? CircleAlert : CircleCheck;
  return createPortal(
    <div className="admin-toast pointer-events-none fixed inset-x-4 z-[100] mx-auto max-w-[420px]" role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        {toast && (
          <motion.div
            key={`${toast.tipo}-${toast.texto}`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`flex items-start gap-3 rounded-lg border bg-surface-elevated p-4 text-body-sm font-semibold text-text shadow-lg ${toast.tipo === "error" ? "border-error/50" : "border-success/50"}`}
          >
            <Icon aria-hidden="true" size={20} className={`shrink-0 ${toast.tipo === "error" ? "text-error" : "text-success"}`} />
            <span className="min-w-0 break-words">{toast.texto}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
