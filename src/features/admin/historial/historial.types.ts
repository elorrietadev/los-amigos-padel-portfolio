// Tipos de Historial (D5). `VentaCruda`/`ItemVentaCruda` se derivan del tipo
// inferido REAL de la query de historial.api.ts (vía Awaited<ReturnType<...>>)
// en vez de tipearse a mano — así el shape crudo (incluyendo los embeds
// anidados de reservas/productos/devoluciones) queda garantizado en sync con
// el `select` real: si alguien cambia las columnas del select sin actualizar
// un tipo escrito a mano, esto rompería en compilación en vez de desalinearse
// en silencio.

import type { MedioReembolso } from "../devoluciones/devoluciones.logic";
import type { obtenerVentasConDetalle } from "./historial.api";

type FilaVentaCruda = NonNullable<Awaited<ReturnType<typeof obtenerVentasConDetalle>>["data"]>[number];

export type VentaCruda = FilaVentaCruda;
export type ItemVentaCruda = FilaVentaCruda["venta_items"][number];

// --- Shape procesado (lo que consume HistorialView) -------------------------

export interface ReservaAsociada {
  id: string;
  nombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  confirmada: boolean;
}

// D6 — una devolución real, no un incremento agregado: se guarda una entrada
// por cada llamada exitosa a registrar_devolucion (motivo aparte no se
// guarda acá, Historial no lo muestra todavía — ver historial.logic.ts).
// Mantener el registro real (no solo la suma) es lo que permite calcular
// totales por medio de reembolso en D7 sin rediseñar este shape otra vez.
export interface DevolucionResumen {
  cantidad: number;
  medioReembolso: MedioReembolso;
}

export interface ItemVentaConDetalle {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidadOriginal: number;
  cantidadDevuelta: number;
  cantidadVigente: number;
  precioSnapshot: number;
  costoSnapshot: number;
  subtotalOriginal: number;
  subtotalVigente: number;
  devoluciones: DevolucionResumen[];
}

export interface VentaConDetalle {
  id: string;
  fecha: string;
  total: number;
  pagoEfectivo: number;
  pagoTransferencia: number;
  creado: string;
  // null = venta suelta (D3) — no null = venta atada a esta reserva (D4).
  reserva: ReservaAsociada | null;
  items: ItemVentaConDetalle[];
}

export type FiltroTipoVenta = "todas" | "atadas" | "sueltas";
