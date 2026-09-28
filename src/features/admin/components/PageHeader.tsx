// PageHeader — compartido por todas las vistas del admin (R2, sección 10).
// Sin breadcrumbs: la sidebar ya dice dónde estás, esto solo da jerarquía
// dentro del contenido (título grande + subtítulo opcional + acciones).
//
// R5.1 — pulido visual: el título dejó de sentirse "pegado arriba a la
// izquierda" con tres cambios puramente de presentación (ningún cambio de
// texto/comportamiento): 1) un pequeño ícono en una placa color acento
// (mismo ícono que ya tiene la vista en la Sidebar/BottomNav, ver
// AppShell.tsx — no es un ícono nuevo, es identidad ya existente movida acá)
// que le da color/jerarquía al bloque, 2) un separador inferior que corta la
// sensación de "flota sin límite" contra el contenido de abajo, y 3) más
// aire (mb-5 -> mb-6, subtítulo con más separación). `icono` es opcional a
// propósito: AdminLogin u otras pantallas fuera de AppShell no tienen por
// qué pasarlo.
import type { ComponentType, ReactNode } from "react";

export interface PageHeaderProps {
  titulo: string;
  subtitulo?: string;
  icono?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  acciones?: ReactNode;
}

export function PageHeader({ titulo, subtitulo, icono: Icono, acciones }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-3">
        {Icono && (
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
            <Icono size={20} strokeWidth={2} />
          </span>
        )}
        <div>
          <h1 className="font-heading text-page-title font-bold tracking-wide text-text">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-body-sm text-muted">{subtitulo}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  );
}
