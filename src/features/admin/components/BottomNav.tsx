// BottomNav — navegación mobile (R2, sección 12). Barra flotante redondeada,
// separada del borde inferior, con los 4 destinos de más uso diario + "Más"
// (abre MoreMenu). CSS puro para hover/tap/activo — nada de Motion acá
// (sección 19: la sensación de continuidad viene de la sidebar/shell, no de
// animar cada ítem de esta barra).

import { MoreHorizontal } from "lucide-react";
import { useViewportDock } from "../../../components/ui/useViewportDock";
import { BOTTOM_NAV_ITEMS, type Vista } from "../nav.config";

export interface BottomNavProps {
  vista: Vista;
  onSeleccionar: (vista: Vista) => void;
  masAbierto: boolean;
  onAbrirMas: () => void;
}

export function BottomNav({ vista, onSeleccionar, masAbierto, onAbrirMas }: BottomNavProps) {
  const dockRef = useViewportDock("--admin-nav-space", 12);
  return (
    <nav
      ref={dockRef}
      aria-label="Navegación del panel"
      className="fixed right-3 bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 z-40 flex items-center justify-around rounded-xl border border-border bg-surface px-1.5 py-1.5 shadow-lg"
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const activo = !masAbierto && vista === item.vista;
        return (
          <button
            key={item.vista}
            type="button"
            onClick={() => onSeleccionar(item.vista)}
            aria-current={activo ? "page" : undefined}
            className="ui-transition flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-semibold active:scale-95"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${activo ? "bg-accent text-on-accent" : "text-muted"}`}
            >
              <item.Icon size={18} strokeWidth={1.75} />
            </span>
            <span className={activo ? "text-text" : "text-muted"}>{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAbrirMas}
        aria-current={masAbierto ? "page" : undefined}
        aria-haspopup="dialog"
        aria-expanded={masAbierto}
        className="ui-transition flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-semibold active:scale-95"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${masAbierto ? "bg-accent text-on-accent" : "text-muted"}`}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </span>
        <span className={masAbierto ? "text-text" : "text-muted"}>Más</span>
      </button>
    </nav>
  );
}
