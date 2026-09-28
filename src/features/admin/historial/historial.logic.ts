// Lógica pura de Historial (D5) — sin Supabase, sin estado de componente.
// `procesarVenta`/`procesarItem` son el único lugar que cruza el shape crudo
// de la query (embeds anidados) contra lo que consume HistorialView; el resto
// de funciones operan sobre el shape ya procesado.

import { recortarHora } from "../../../lib/datetime";
import type { MedioReembolso } from "../devoluciones/devoluciones.logic";
import type {
  DevolucionResumen,
  FiltroTipoVenta,
  ItemVentaConDetalle,
  ItemVentaCruda,
  VentaConDetalle,
  VentaCruda,
} from "./historial.types";

// --- Devoluciones (D6 — Devoluciones ya existe como feature; D5 lo dejó
// preparado leyendo `devoluciones` embebido, sin poder escribir todavía). --

export function calcularCantidadDevuelta(devoluciones: ReadonlyArray<{ cantidad: number }>): number {
  return devoluciones.reduce((acc, d) => acc + d.cantidad, 0);
}

export function calcularCantidadVigente(cantidadOriginal: number, cantidadDevuelta: number): number {
  return cantidadOriginal - cantidadDevuelta;
}

// Deliberadamente distinto de la columna generada `subtotal` de venta_items
// (= cantidad_original * precio_snapshot): ese subtotal NO se ajusta ante una
// devolución parcial. `subtotalVigente` es el que sí lo refleja.
export function calcularSubtotalVigente(cantidadVigente: number, precioSnapshot: number): number {
  return cantidadVigente * precioSnapshot;
}

// Monto devuelto de UN ítem, derivado de sus devoluciones reales (no de
// `subtotalOriginal - subtotalVigente`, aunque da el mismo número): cada
// DevolucionResumen ya guarda la cantidad real devuelta a su precio
// histórico (`precioSnapshot` es el mismo para todas las devoluciones de un
// ítem, nunca cambia dentro de una venta ya cerrada).
export function calcularMontoDevueltoItem(item: ItemVentaConDetalle): number {
  return item.devoluciones.reduce((acc, d) => acc + d.cantidad * item.precioSnapshot, 0);
}

// Total devuelto de una venta completa — suma de calcularMontoDevueltoItem
// sobre todos sus ítems. `venta.total` (el original, columna de `ventas`)
// nunca se toca: total/pagoEfectivo/pagoTransferencia quedan inmutables,
// "neto" es siempre un derivado en cliente.
export function calcularTotalDevuelto(venta: VentaConDetalle): number {
  return venta.items.reduce((acc, it) => acc + calcularMontoDevueltoItem(it), 0);
}

export function calcularTotalNeto(venta: VentaConDetalle): number {
  return venta.total - calcularTotalDevuelto(venta);
}

// --- Procesamiento del shape crudo -> shape consumido por la UI ------------

export function procesarItem(itemCrudo: ItemVentaCruda): ItemVentaConDetalle {
  // `medio_reembolso` llega tipado `string` a secas (columna `text` con
  // CHECK, no un enum de Postgres) — el cast confía en ese CHECK de DB para
  // garantizar que solo puede ser "efectivo"/"transferencia".
  const devoluciones: DevolucionResumen[] = (itemCrudo.devoluciones ?? []).map((d) => ({
    cantidad: d.cantidad,
    medioReembolso: d.medio_reembolso as MedioReembolso,
  }));
  const cantidadDevuelta = calcularCantidadDevuelta(devoluciones);
  const cantidadVigente = calcularCantidadVigente(itemCrudo.cantidad, cantidadDevuelta);
  return {
    id: itemCrudo.id,
    productoId: itemCrudo.producto_id,
    // `productos` nunca debería venir null en la práctica (producto_id es
    // NOT NULL y no hay política de DELETE sobre productos, ver auditoría D0)
    // — fallback puramente defensivo, mismo criterio que el resto del
    // proyecto ante datos que "no deberían" faltar.
    productoNombre: itemCrudo.productos?.nombre ?? "Producto eliminado",
    cantidadOriginal: itemCrudo.cantidad,
    cantidadDevuelta,
    cantidadVigente,
    precioSnapshot: itemCrudo.precio_unitario_snapshot,
    costoSnapshot: itemCrudo.costo_unitario_snapshot,
    subtotalOriginal: itemCrudo.subtotal ?? 0,
    subtotalVigente: calcularSubtotalVigente(cantidadVigente, itemCrudo.precio_unitario_snapshot),
    devoluciones,
  };
}

export function procesarVenta(ventaCruda: VentaCruda): VentaConDetalle {
  return {
    id: ventaCruda.id,
    fecha: ventaCruda.fecha,
    total: ventaCruda.total,
    pagoEfectivo: ventaCruda.pago_efectivo,
    pagoTransferencia: ventaCruda.pago_transferencia,
    creado: ventaCruda.creado,
    reserva: ventaCruda.reservas
      ? {
          id: ventaCruda.reservas.id,
          nombre: ventaCruda.reservas.nombre,
          fecha: ventaCruda.reservas.fecha,
          horaInicio: recortarHora(ventaCruda.reservas.hora_inicio)!,
          horaFin: recortarHora(ventaCruda.reservas.hora_fin)!,
          confirmada: ventaCruda.reservas.confirmada,
        }
      : null,
    items: (ventaCruda.venta_items ?? []).map(procesarItem),
  };
}

// --- Filtro / búsqueda (client-side, sobre lo ya cargado) -------------------

export function filtrarVentasHistorial(
  ventas: VentaConDetalle[],
  filtroTexto: string,
  filtroTipo: FiltroTipoVenta,
): VentaConDetalle[] {
  const porTipo = ventas.filter((v) => {
    if (filtroTipo === "atadas") return v.reserva !== null;
    if (filtroTipo === "sueltas") return v.reserva === null;
    return true;
  });
  const q = filtroTexto.trim().toLowerCase();
  if (!q) return porTipo;
  return porTipo.filter(
    (v) =>
      (v.reserva !== null && v.reserva.nombre.toLowerCase().includes(q)) ||
      v.items.some((it) => it.productoNombre.toLowerCase().includes(q)),
  );
}

// --- Paginación (D5 — offset liso, sin keyset, ver reporte de sesión) ------

// admin.html no tiene equivalente — patrón nuevo, mismo espíritu que el resto
// del proyecto (patch local puro, sin Supabase). Dedup por id: cubre el caso
// de que el offset se corra por una venta nueva insertada arriba mientras se
// pagina hacia atrás y una fila del borde llegue duplicada.
export function agregarVentasSinDuplicar(actuales: VentaConDetalle[], nuevas: VentaConDetalle[]): VentaConDetalle[] {
  const idsExistentes = new Set(actuales.map((v) => v.id));
  return [...actuales, ...nuevas.filter((v) => !idsExistentes.has(v.id))];
}

// --- Patch local de devoluciones (D6) --------------------------------------

// Tras un registrar_devolucion exitoso: agrega la devolución REAL (cantidad +
// medio, no un incremento agregado suelto) al ítem correspondiente y
// recalcula cantidadDevuelta/cantidadVigente/subtotalVigente a partir del
// array ya actualizado — un solo origen de verdad (`item.devoluciones`), sin
// mantener un contador aparte que se pueda desincronizar. Inmutable, mismo
// criterio que agregarVentasSinDuplicar: no toca ninguna otra venta ni ítem.
export function patchearDevolucionEnVenta(
  ventas: VentaConDetalle[],
  ventaId: string,
  itemId: string,
  devolucion: DevolucionResumen,
): VentaConDetalle[] {
  return ventas.map((v) => {
    if (v.id !== ventaId) return v;
    return {
      ...v,
      items: v.items.map((it) => {
        if (it.id !== itemId) return it;
        const devoluciones = [...it.devoluciones, devolucion];
        const cantidadDevuelta = calcularCantidadDevuelta(devoluciones);
        const cantidadVigente = calcularCantidadVigente(it.cantidadOriginal, cantidadDevuelta);
        return {
          ...it,
          devoluciones,
          cantidadDevuelta,
          cantidadVigente,
          subtotalVigente: calcularSubtotalVigente(cantidadVigente, it.precioSnapshot),
        };
      }),
    };
  });
}
