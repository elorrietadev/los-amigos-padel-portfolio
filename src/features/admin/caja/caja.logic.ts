// Lógica pura de Caja — FINAL-F6. Sin Supabase, sin estado de componente.
//
// REGLA CONTABLE: Caja = movimientos REALES de dinero dentro del rango, por su
// fecha contable (día de Buenos Aires del instante real del movimiento):
//
//     pagos de reservas (cobros − reintegros ± correcciones)
//   + ventas (lo cobrado al registrar la venta)
//   − devoluciones (cantidad × precio histórico del ítem)
//   = NETO
//
// Ya NO depende de reservas.fecha, de si el turno se jugó, ni de si la
// reserva es visible/ocupante/bloqueada: el dinero es el de los movimientos.
// 'saldo_migrado' (pagos previos al historial, sin fecha real de cobro) queda
// FUERA: no es dinero que haya entrado en ese día.
//
// Todos los importes de ResumenCaja están en CENTAVOS enteros (lib/dinero.ts):
// sumas exactas, sin acumulación flotante. Se pasan a pesos solo al mostrar.
//
// Lo OPERATIVO (turnos jugados sin cobrar / con saldo pendiente, por fecha del
// turno) vive aparte en `calcularOperativoCaja`: es información, no dinero, y
// nunca se mezcla con el neto.

import { aCentavos, sumarCentavos, type Centavos } from "../../../lib/dinero";
import { esPasado, horaToMinutos } from "../../../lib/datetime";
import type { ReservaProcesada } from "../reservas/reservas.types";
import type { DevolucionCaja, MovimientoCaja, VentaCaja } from "./caja.api";

export type { DevolucionCaja, MovimientoCaja, VentaCaja };

export interface ResumenCaja {
  // Pagos de reservas por tipo y medio. Reintegros en magnitud positiva (se
  // restan); correcciones con signo.
  cobrosReservasEfectivo: Centavos;
  cobrosReservasTransferencia: Centavos;
  reintegrosReservasEfectivo: Centavos;
  reintegrosReservasTransferencia: Centavos;
  correccionesReservasEfectivo: Centavos;
  correccionesReservasTransferencia: Centavos;
  // Neto de pagos de reservas por medio (= SUM(importe) de sus movimientos).
  reservasEfectivo: Centavos;
  reservasTransferencia: Centavos;
  ventasEfectivo: Centavos;
  ventasTransferencia: Centavos;
  devolucionesEfectivo: Centavos;
  devolucionesTransferencia: Centavos;
  ingresosEfectivo: Centavos;
  ingresosTransferencia: Centavos;
  bruto: Centavos;
  devolucionesTotal: Centavos;
  netoEfectivo: Centavos;
  netoTransferencia: Centavos;
  netoTotal: Centavos;
  reservasBruto: Centavos;
  productosBruto: Centavos;
  cantidadMovimientosPago: number;
  cantidadVentas: number;
  cantidadDevoluciones: number;
  // Movimientos 'saldo_migrado' del rango, EXCLUIDOS del neto (informativo).
  saldoMigradoExcluido: Centavos;
}

export function montoDevolucion(d: Pick<DevolucionCaja, "cantidad" | "venta_items">): Centavos {
  // cantidad (entero) × precio histórico en centavos: exacto.
  return d.cantidad * aCentavos(d.venta_items?.precio_unitario_snapshot);
}

const enRango = (fecha: string | null, desde: string, hasta: string) => fecha !== null && fecha >= desde && fecha <= hasta;

export function calcularCajaRango(
  movimientosRaw: ReadonlyArray<MovimientoCaja>,
  ventasRaw: ReadonlyArray<VentaCaja>,
  devolucionesRaw: ReadonlyArray<DevolucionCaja>,
  desde: string,
  hasta: string,
): ResumenCaja {
  // Defensa: aunque la query ya filtra por fecha, se vuelve a acotar acá (el
  // test de reconciliación pasa fuentes más amplias a propósito).
  const movs = movimientosRaw.filter((m) => enRango(m.fecha, desde, hasta));
  const contables = movs.filter((m) => m.tipo !== "saldo_migrado");
  const ventas = ventasRaw.filter((v) => enRango(v.fecha, desde, hasta));
  const devoluciones = devolucionesRaw.filter((d) => enRango(d.fecha, desde, hasta));

  const suma = (tipo: string, medio: string) =>
    sumarCentavos(contables.filter((m) => m.tipo === tipo && m.medio === medio), (m) => m.importe);

  const cobrosReservasEfectivo = suma("cobro", "efectivo");
  const cobrosReservasTransferencia = suma("cobro", "transferencia");
  // "0 - x" (no "-x"): con x = 0 da 0, no -0.
  const reintegrosReservasEfectivo = 0 - suma("reintegro", "efectivo");
  const reintegrosReservasTransferencia = 0 - suma("reintegro", "transferencia");
  const correccionesReservasEfectivo = suma("correccion", "efectivo");
  const correccionesReservasTransferencia = suma("correccion", "transferencia");
  const reservasEfectivo = sumarCentavos(contables.filter((m) => m.medio === "efectivo"), (m) => m.importe);
  const reservasTransferencia = sumarCentavos(contables.filter((m) => m.medio === "transferencia"), (m) => m.importe);

  const ventasEfectivo = sumarCentavos(ventas, (v) => v.pago_efectivo);
  const ventasTransferencia = sumarCentavos(ventas, (v) => v.pago_transferencia);

  let devolucionesEfectivo = 0;
  let devolucionesTransferencia = 0;
  for (const d of devoluciones) {
    if (d.medio_reembolso === "efectivo") devolucionesEfectivo += montoDevolucion(d);
    else if (d.medio_reembolso === "transferencia") devolucionesTransferencia += montoDevolucion(d);
  }

  const ingresosEfectivo = reservasEfectivo + ventasEfectivo;
  const ingresosTransferencia = reservasTransferencia + ventasTransferencia;
  const bruto = ingresosEfectivo + ingresosTransferencia;
  const devolucionesTotal = devolucionesEfectivo + devolucionesTransferencia;

  return {
    cobrosReservasEfectivo,
    cobrosReservasTransferencia,
    reintegrosReservasEfectivo,
    reintegrosReservasTransferencia,
    correccionesReservasEfectivo,
    correccionesReservasTransferencia,
    reservasEfectivo,
    reservasTransferencia,
    ventasEfectivo,
    ventasTransferencia,
    devolucionesEfectivo,
    devolucionesTransferencia,
    ingresosEfectivo,
    ingresosTransferencia,
    bruto,
    devolucionesTotal,
    netoEfectivo: ingresosEfectivo - devolucionesEfectivo,
    netoTransferencia: ingresosTransferencia - devolucionesTransferencia,
    netoTotal: bruto - devolucionesTotal,
    reservasBruto: reservasEfectivo + reservasTransferencia,
    productosBruto: ventasEfectivo + ventasTransferencia,
    cantidadMovimientosPago: contables.length,
    cantidadVentas: ventas.length,
    cantidadDevoluciones: devoluciones.length,
    saldoMigradoExcluido: sumarCentavos(movs.filter((m) => m.tipo === "saldo_migrado"), (m) => m.importe),
  };
}

// --- Operativo (NO es dinero de Caja) ----------------------------------------

export interface OperativoCaja {
  // Turnos jugados (por fecha del turno) sin ningún pago registrado.
  sinRegistrarReservas: ReservaProcesada[];
  montoSinRegistrarReservas: Centavos;
  // Turnos jugados con saldo pendiente (precio − registrado > 0).
  turnosConSaldo: number;
  saldoPendienteReservas: Centavos;
}

function aperturaVigenteMin(r: { hora_apertura_vigente: string | null }): number | null {
  return r.hora_apertura_vigente != null ? horaToMinutos(r.hora_apertura_vigente) : null;
}

export function calcularOperativoCaja(
  reservas: ReadonlyArray<ReservaProcesada>,
  desde: string,
  hasta: string,
  ahora: number,
): OperativoCaja {
  const jugadas = reservas.filter(
    (r) => !r.bloqueado && r.fecha >= desde && r.fecha <= hasta && esPasado(r, aperturaVigenteMin(r), ahora),
  );
  const pagado = (r: ReservaProcesada) => aCentavos(r.pago_efectivo) + aCentavos(r.pago_transferencia);
  const sinRegistrarReservas = jugadas.filter((r) => pagado(r) === 0);
  const conSaldo = jugadas.filter((r) => aCentavos(r.precio) - pagado(r) > 0);
  return {
    sinRegistrarReservas,
    montoSinRegistrarReservas: sumarCentavos(sinRegistrarReservas, (r) => r.precio),
    turnosConSaldo: conSaldo.length,
    saldoPendienteReservas: conSaldo.reduce((acc, r) => acc + aCentavos(r.precio) - pagado(r), 0),
  };
}
