// R2 — fuente única de verdad de la navegación del admin: sidebar (desktop),
// bottom nav + "Más" (mobile) y AdminShell (qué vista renderizar) leen todos
// de acá, en vez de mantener 3 listas de destinos por separado.
//
// Torneos queda deliberadamente afuera (ver informe de R2): un ítem de nav
// que abre un placeholder no aporta a un panel que se supone se sienta más
// premium. Vuelve a aparecer acá el día que tenga funcionalidad real.

import type { ComponentType } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChartNoAxesColumn,
  DatabaseBackup,
  Lock,
  Package,
  ReceiptText,
  Repeat,
  ShoppingCart,
  Wallet,
  SlidersHorizontal,
} from "lucide-react";

export type Vista =
  | "grilla"
  | "reservas"
  | "fijos"
  | "bloquear"
  | "vender"
  | "productos"
  | "historial"
  | "caja"
  | "reportes"
  | "backup"
  | "configuracion";

// CFG-F1 — visible por defecto (ya conectada al backend real desde C10):
// VITE_ADMIN_CONFIGURACION_UI queda solo como kill-switch de emergencia.
// Ausente o "true" = visible; "false" = oculta.
export const CONFIGURACION_UI_ENABLED = import.meta.env.VITE_ADMIN_CONFIGURACION_UI !== "false";

export type IconoNav = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export interface NavItemDef {
  vista: Vista;
  label: string;
  Icon: IconoNav;
}

export interface NavGroupDef {
  label: string;
  items: readonly NavItemDef[];
}

export const NAV_GROUPS: readonly NavGroupDef[] = [
  {
    label: "Operación",
    items: [
      { vista: "grilla", label: "Agenda", Icon: CalendarDays },
      { vista: "reservas", label: "Reservas", Icon: CalendarCheck },
      { vista: "fijos", label: "Turnos fijos", Icon: Repeat },
      { vista: "bloquear", label: "Bloqueos", Icon: Lock },
    ],
  },
  {
    label: "Ventas",
    items: [
      { vista: "vender", label: "Vender", Icon: ShoppingCart },
      { vista: "productos", label: "Productos", Icon: Package },
      { vista: "historial", label: "Historial", Icon: ReceiptText },
      { vista: "caja", label: "Caja", Icon: Wallet },
    ],
  },
  {
    label: "Administración",
    items: [
      { vista: "reportes", label: "Reportes", Icon: ChartNoAxesColumn },
      { vista: "backup", label: "Backup", Icon: DatabaseBackup },
      ...(CONFIGURACION_UI_ENABLED ? [{ vista: "configuracion" as const, label: "Configuración", Icon: SlidersHorizontal }] : []),
    ],
  },
];

export const NAV_ITEMS: readonly NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

export const TITULOS_VISTA: Record<Vista, string> = {
  grilla: "Agenda",
  reservas: "Reservas",
  fijos: "Turnos fijos",
  bloquear: "Bloqueos",
  vender: "Vender",
  productos: "Productos",
  historial: "Historial",
  caja: "Caja",
  reportes: "Reportes",
  backup: "Backup",
  configuracion: "Configuración",
};

// Mobile — 4 destinos principales + "Más" (sección 12): el resto vive en
// MoreMenu. No son necesariamente los primeros 4 ítems de NAV_GROUPS (Vender
// y Caja pesan más en el uso diario desde el celular que, por ejemplo,
// Turnos fijos o Bloqueos).
export const BOTTOM_NAV_ITEMS: readonly NavItemDef[] = [
  NAV_ITEMS.find((i) => i.vista === "grilla")!,
  NAV_ITEMS.find((i) => i.vista === "reservas")!,
  NAV_ITEMS.find((i) => i.vista === "vender")!,
  NAV_ITEMS.find((i) => i.vista === "caja")!,
];

const BOTTOM_NAV_VISTAS = new Set(BOTTOM_NAV_ITEMS.map((i) => i.vista));
export const MORE_MENU_ITEMS: readonly NavItemDef[] = NAV_ITEMS.filter((i) => !BOTTOM_NAV_VISTAS.has(i.vista));
