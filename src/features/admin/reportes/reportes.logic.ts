import { tieneMovimientoContable } from "../reservas/reservas.logic";
// Lógica pura del Reporte de Caja y Actividad — FINAL-F6. Sin Supabase, sin
// XLSX. Arma las filas de cada hoja a partir de las filas crudas y en
// CENTAVOS enteros (lib/dinero.ts). El Resumen NO se calcula acá: sale de
// calcularCajaRango (caja.logic.ts) sobre las MISMAS filas que alimentan las
// hojas financieras, para que Caja, Resumen y detalle no puedan divergir.

import { aCentavos } from "../../../lib/dinero";
import { esPasado, esReservaVigente, horaToMinutos } from "../../../lib/datetime";
import { fechaContableDe, horaContableDe, rangoMesContable, rangoSemanaContable } from "../../../lib/fechaContable";
import { abreviarDia } from "../reservas/reservas.logic";
import type { ReservaRow } from "../reservas/reservas.types";
import { LABEL_TIPO_MOVIMIENTO, type MovimientoPagoRow, type TipoMovimientoRegistrado } from "../reservas/pagos.logic";
import type { VentaCruda } from "../historial/historial.types";
import type { DevolucionCaja, MovimientoCaja, VentaCaja } from "../caja/caja.api";
import type { DevolucionReporteCruda } from "./reportes.api";
import type {
  EstadoReservaReporte,
  FilaActividad,
  FilaDevolucion,
  FilaPagoReserva,
  FilaVenta,
  FiltroRangoRapido,
  RangoFechas,
} from "./reportes.types";

function aperturaVigenteMin(r: { hora_apertura_vigente: string | null }): number | null {
  return r.hora_apertura_vigente != null ? horaToMinutos(r.hora_apertura_vigente) : null;
}

export function idCorto(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// --- Rango de fechas (fecha contable, Buenos Aires) -------------------------

export function obtenerRangoMes(ahora: number): RangoFechas {
  const { inicio, fin } = rangoMesContable(ahora);
  return { desde: inicio, hasta: fin };
}

export function calcularRango(
  filtro: FiltroRangoRapido,
  ahora: number,
  personalizado?: Partial<RangoFechas>,
): RangoFechas | null {
  const hoy = fechaContableDe(ahora);
  if (filtro === "hoy") return { desde: hoy, hasta: hoy };
  if (filtro === "semana") {
    const { inicio, fin } = rangoSemanaContable(ahora);
    return { desde: inicio, hasta: fin };
  }
  if (filtro === "semanaAnterior") {
    const { inicio, fin } = rangoSemanaContable(ahora, -1);
    return { desde: inicio, hasta: fin };
  }
  if (filtro === "mes") return obtenerRangoMes(ahora);
  if (filtro === "personalizado") {
    if (!personalizado?.desde || !personalizado?.hasta) return null;
    if (personalizado.desde > personalizado.hasta) return null;
    return { desde: personalizado.desde, hasta: personalizado.hasta };
  }
  return null;
}

// --- Adaptadores a las fuentes de Caja (mismo cálculo que la pantalla) -----

export function movimientosParaCaja(movs: ReadonlyArray<MovimientoPagoRow>): MovimientoCaja[] {
  return movs.map((m) => ({ id: m.id, creado: m.creado, fecha: m.fecha, medio: m.medio, importe: m.importe, tipo: m.tipo }));
}

export function ventasParaCaja(ventas: ReadonlyArray<VentaCruda>): VentaCaja[] {
  return ventas.map((v) => ({ id: v.id, creado: v.creado, fecha: v.fecha, pago_efectivo: v.pago_efectivo, pago_transferencia: v.pago_transferencia, total: v.total }));
}

export function devolucionesParaCaja(devs: ReadonlyArray<DevolucionReporteCruda>): DevolucionCaja[] {
  return devs.map((d) => ({
    id: d.id,
    creado: d.creado,
    cantidad: d.cantidad,
    medio_reembolso: d.medio_reembolso,
    fecha: d.fecha,
    venta_items: d.venta_items ? { precio_unitario_snapshot: d.venta_items.precio_unitario_snapshot } : null,
  }));
}

// --- Hoja Pagos de reservas --------------------------------------------------

// 'saldo_migrado' NO es un movimiento de caja (fecha real de cobro
// desconocida): no entra en la hoja ni en el Resumen.
export function construirFilasPagos(movs: ReadonlyArray<MovimientoPagoRow>): FilaPagoReserva[] {
  return movs
    .filter((m) => m.tipo !== "saldo_migrado")
    .slice()
    .sort((a, b) => a.creado.localeCompare(b.creado) || a.medio.localeCompare(b.medio))
    .map((m) => ({
      fecha: m.fecha ?? fechaContableDe(m.creado),
      hora: horaContableDe(m.creado),
      tipo: LABEL_TIPO_MOVIMIENTO[m.tipo as TipoMovimientoRegistrado] ?? m.tipo,
      medio: m.medio as FilaPagoReserva["medio"],
      importe: aCentavos(m.importe),
      motivo: m.motivo ?? "",
      turnoFecha: m.reserva_fecha,
      turnoHorario: `${m.reserva_hora_inicio.slice(0, 5)} - ${m.reserva_hora_fin.slice(0, 5)}`,
      jugador: m.reserva_nombre,
      turnoFijo: m.reserva_turno_fijo ? "Sí" : "No",
      reservaEliminada: m.reserva_id ? "" : "Sí",
      operacion: idCorto(m.operacion_id),
    }));
}

// --- Hoja Ventas ---------------------------------------------------------------

// Un renglón por ítem VENDIDO (cantidad original: las devoluciones van en su
// propia hoja, con su propia fecha). El pago se escribe una sola vez por venta.
export function construirFilasVentas(ventas: ReadonlyArray<VentaCruda>): FilaVenta[] {
  const ordenadas = [...ventas].sort((a, b) => a.creado.localeCompare(b.creado) || a.id.localeCompare(b.id));
  const filas: FilaVenta[] = [];
  for (const v of ordenadas) {
    const reservaAsociada = v.reservas ? `${v.reservas.nombre} (turno ${v.reservas.fecha})` : "Venta suelta";
    const items = [...(v.venta_items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    items.forEach((it, i) => {
      const primera = i === 0;
      const precio = aCentavos(it.precio_unitario_snapshot);
      const costo = aCentavos(it.costo_unitario_snapshot);
      filas.push({
        fecha: primera ? v.fecha : "",
        hora: primera ? horaContableDe(v.creado) : "",
        venta: idCorto(v.id),
        reservaAsociada: primera ? reservaAsociada : "",
        producto: it.productos?.nombre ?? "Producto eliminado",
        cantidad: it.cantidad,
        precioUnitario: precio,
        subtotal: it.cantidad * precio,
        costoUnitario: costo,
        costoTotal: it.cantidad * costo,
        margen: it.cantidad * (precio - costo),
        pagoEfectivo: primera ? aCentavos(v.pago_efectivo) : "",
        pagoTransferencia: primera ? aCentavos(v.pago_transferencia) : "",
      });
    });
  }
  return filas;
}

// --- Hoja Devoluciones -----------------------------------------------------------

export function construirFilasDevoluciones(devs: ReadonlyArray<DevolucionReporteCruda>): FilaDevolucion[] {
  return [...devs]
    .sort((a, b) => a.creado.localeCompare(b.creado) || a.id.localeCompare(b.id))
    .map((d) => {
      const precio = aCentavos(d.venta_items?.precio_unitario_snapshot);
      const venta = d.venta_items?.ventas;
      return {
        fecha: d.fecha ?? fechaContableDe(d.creado),
        hora: horaContableDe(d.creado),
        venta: venta ? idCorto(venta.id) : "",
        fechaVenta: venta?.fecha ?? "",
        producto: d.venta_items?.productos?.nombre ?? "Producto eliminado",
        cantidad: d.cantidad,
        precioUnitario: precio,
        importe: d.cantidad * precio,
        medio: d.medio_reembolso as FilaDevolucion["medio"],
        motivo: d.motivo ?? "",
      };
    });
}

// --- Hoja Actividad operativa (por fecha del turno; NO es caja) -------------

export function filtrarReservasParaReporte(reservas: ReservaRow[], ahora: number): ReservaRow[] {
  return reservas.filter(
    (r) =>
      !r.bloqueado &&
      (tieneMovimientoContable(r) || esReservaVigente(
        { bloqueado: r.bloqueado, confirmada: r.confirmada, creado: r.creado ?? new Date(0).toISOString() },
        { ahora },
      )),
  );
}

export function calcularEstadoReserva(
  r: { fecha: string; hora_inicio: string; hora_fin: string; confirmada: boolean; hora_apertura_vigente: string | null },
  ahora: number,
): EstadoReservaReporte {
  const horaInicio = r.hora_inicio.slice(0, 5);
  const horaFin = r.hora_fin.slice(0, 5);
  const pasado = esPasado({ fecha: r.fecha, horaInicio, horaFin }, aperturaVigenteMin(r), ahora);
  if (pasado) return r.confirmada ? "JUGADO" : "NO CONFIRMADO";
  return r.confirmada ? "CONFIRMADO" : "PENDIENTE";
}

export function construirFilasActividad(reservas: ReservaRow[], ahora: number): FilaActividad[] {
  return filtrarReservasParaReporte(reservas, ahora)
    .slice()
    .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))
    .map((r) => {
      const precio = aCentavos(r.precio);
      const registrado = aCentavos(r.pago_efectivo) + aCentavos(r.pago_transferencia);
      return {
        dia: abreviarDia(r.fecha),
        fecha: r.fecha,
        horario: `${r.hora_inicio.slice(0, 5)} - ${r.hora_fin.slice(0, 5)}`,
        jugador: r.nombre,
        telefono: String(r.telefono),
        estado: calcularEstadoReserva(r, ahora),
        turnoFijo: r.turno_fijo_id ? "Sí" : "No",
        precio,
        registrado,
        saldo: precio - registrado,
      };
    });
}
