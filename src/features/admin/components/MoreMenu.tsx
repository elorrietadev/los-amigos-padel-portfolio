// MoreMenu — panel simple para los destinos secundarios de mobile (R2,
// sección 12). Deliberadamente NO es un bottom sheet arrastrable: eso
// adelantaría trabajo de R3/R7 (BottomSheet real con Motion `drag`). Esto es
// el "panel/modal sencillo" que pide la sección 12, reusando las mismas
// animaciones ya existentes de overlay/modal (.overlay-anim/.modal-pop) en
// vez de inventar una transición nueva.

import { LogOut } from "lucide-react";
import { MORE_MENU_ITEMS, type Vista } from "../nav.config";
import { ThemeSwitch } from "./ThemeSwitch";
import { useDialogFocus } from "./useDialogFocus";

export interface MoreMenuProps {
  vista: Vista;
  onSeleccionar: (vista: Vista) => void;
  onClose: () => void;
  onLogout: () => void;
}

export function MoreMenu({ vista, onSeleccionar, onClose, onLogout }: MoreMenuProps) {
  const dialogFocus = useDialogFocus(onClose);
  return (
    <div
      className="overlay-anim fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div
        {...dialogFocus}
        className="modal-pop max-h-[85dvh] w-full max-w-[420px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Más opciones"
      >
        <div className="grid grid-cols-3 gap-2">
          {MORE_MENU_ITEMS.map((item) => {
            const activo = vista === item.vista;
            return (
              <button
                key={item.vista}
                type="button"
                onClick={() => {
                  onSeleccionar(item.vista);
                  onClose();
                }}
                aria-current={activo ? "page" : undefined}
                className={`ui-transition flex flex-col items-center gap-1.5 rounded-md p-3 text-center text-[11px] font-semibold ${
                  activo ? "bg-accent-muted text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <item.Icon size={20} strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <ThemeSwitch />
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="ui-transition flex items-center gap-2 rounded-md px-2.5 py-2 text-body-sm font-medium text-muted hover:bg-surface-2 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <LogOut size={16} strokeWidth={1.75} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
