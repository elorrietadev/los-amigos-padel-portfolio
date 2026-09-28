// PUBLIC-R2 — fuente única de la navegación pública (bottom nav mobile + top
// nav desktop leen de acá), mismo patrón que features/admin/nav.config.ts.
import type { ComponentType } from "react";
import { CalendarDays, House, Info, ShoppingBag } from "lucide-react";

export type VistaPublica = "home" | "reservar" | "catalogo" | "informacion";

export type IconoNavPublica = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export interface NavItemPublicaDef {
  vista: VistaPublica;
  label: string;
  Icon: IconoNavPublica;
}

export const NAV_ITEMS_PUBLICOS: readonly NavItemPublicaDef[] = [
  { vista: "home", label: "Inicio", Icon: House },
  { vista: "reservar", label: "Reservar", Icon: CalendarDays },
  { vista: "catalogo", label: "Catálogo", Icon: ShoppingBag },
  { vista: "informacion", label: "Información", Icon: Info },
];
