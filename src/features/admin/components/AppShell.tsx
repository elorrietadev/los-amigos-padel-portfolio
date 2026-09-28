// AppShell — layout raíz del admin nuevo (R2). Notebook-first: el corte
// sidebar/bottom-nav es por ANCHO (lg = 1024px de Tailwind), no por
// hover:hover+pointer:fine como el shell viejo (sección 13 del pedido) — así
// una tablet grande en horizontal (>=1024px, con o sin mouse) ya entra por la
// rama de sidebar/notebook, que es la prioridad, y solo lo angosto/vertical
// (celulares, tablets en portrait) cae a bottom-nav. Documentado acá porque
// es la única pieza nueva de "criterio responsive" de todo R2.
//
// Sin max-width global sobre el contenido (sección 11): cada vista sigue
// decidiendo su propio ancho por ahora, este shell solo deja de imponerle un
// techo artificial de ~1100px como hacía .admin-shell-page.

import { useState, type ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { MoreMenu } from "./MoreMenu";
import { PageHeader } from "./PageHeader";
import { Sidebar } from "./Sidebar";
import { NAV_ITEMS, type Vista } from "../nav.config";

export interface AppShellProps {
  vista: Vista;
  onSeleccionar: (vista: Vista) => void;
  colapsada: boolean;
  onToggleColapsada: () => void;
  nombreUsuario?: string | null;
  onLogout: () => void;
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  vista,
  onSeleccionar,
  colapsada,
  onToggleColapsada,
  nombreUsuario,
  onLogout,
  titulo,
  subtitulo,
  acciones,
  children,
}: AppShellProps) {
  const [masAbierto, setMasAbierto] = useState(false);
  // R5.1 — mismo ícono que ya identifica a esta vista en Sidebar/BottomNav
  // (nav.config.ts), reutilizado en el título de página (PageHeader) para
  // sumarle identidad/color sin inventar un segundo set de íconos por vista.
  const iconoVista = NAV_ITEMS.find((i) => i.vista === vista)?.Icon;

  return (
    <div className={`min-h-dvh bg-bg lg:flex lg:gap-3 lg:p-3 ${vista === "reservas" || vista === "historial" ? "admin-workspace-shell" : ""}`}>
      <div className="admin-sidebar-slot hidden shrink-0 lg:block" style={{ width: colapsada ? 68 : 250 }}>
        <Sidebar
          vista={vista}
          onSeleccionar={onSeleccionar}
          colapsada={colapsada}
          onToggleColapsada={onToggleColapsada}
          nombreUsuario={nombreUsuario}
          onLogout={onLogout}
        />
      </div>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(var(--admin-nav-space,96px)+env(safe-area-inset-bottom))] lg:px-0 lg:pt-0 lg:pb-0">
        <PageHeader titulo={titulo} subtitulo={subtitulo} icono={iconoVista} acciones={acciones} />
        {children}
      </main>

      <div className="lg:hidden">
        <BottomNav vista={vista} onSeleccionar={onSeleccionar} masAbierto={masAbierto} onAbrirMas={() => setMasAbierto(true)} />
        {masAbierto && (
          <MoreMenu vista={vista} onSeleccionar={onSeleccionar} onClose={() => setMasAbierto(false)} onLogout={onLogout} />
        )}
      </div>
    </div>
  );
}
