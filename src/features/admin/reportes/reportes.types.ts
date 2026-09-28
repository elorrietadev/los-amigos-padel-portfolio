// Tipos del Reporte de Caja y Actividad — FINAL-F6.
//
// Hojas FINANCIERAS (todas filtradas por fecha CONTABLE = día real del
// movimiento en Buenos Aires, la misma que usa Caja):
//   * Pagos de reservas  — un renglón por movimiento (cobro/reintegro/corrección)
//   * Ventas             — un renglón por ítem vendido (pago una vez por venta)
//   * Devoluciones       — un renglón por devolución
// Hoja OPERATIVA (por fecha del turno; NO explica el cierre):
//   * Actividad operativa
// Resumen = SUM(pagos de reservas) + SUM(ventas) − SUM(devoluciones) = NETO,
// con fórmulas sobre las hojas financieras. Importes en centavos hasta que se
// escriben en la celda.

import type { Centavos } from "../../../lib/dinero";
import type { ResumenCaja } from "../caja/caja.logic";

export interface RangoFechas {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

export type FiltroRangoRapido = "hoy" | "semana" | "semanaAnterior" | "mes" | "personalizado";

export type EstadoReservaReporte = "JUGADO" | "CONFIRMADO" | "PENDIENTE" | "NO CONFIRMADO";

export interface FilaPagoReserva {
  fecha: string; // fecha contable YYYY-MM-DD
  hora: string; // HH:MM Buenos Aires
  tipo: string; // "Cobro" | "Reintegro" | "Corrección"
  medio: "efectivo" | "transferencia";
  importe: Centavos; // con signo
  motivo: string;
  turnoFecha: string; // fecha OPERATIVA del turno (informativa)
  turnoHorario: string;
  jugador: string;
  turnoFijo: "Sí" | "No";
  reservaEliminada: "Sí" | "";
  operacion: string; // id corto de la operación (idempotency key)
}

export interface FilaVenta {
  fecha: string; // fecha contable; "" en ítems siguientes de la misma venta
  hora: string;
  venta: string; // id corto de la venta (el mismo que cita la hoja Devoluciones)
  reservaAsociada: string;
  producto: string;
  cantidad: number;
  precioUnitario: Centavos;
  subtotal: Centavos;
  costoUnitario: Centavos;
  costoTotal: Centavos;
  margen: Centavos;
  pagoEfectivo: Centavos | ""; // solo en el primer ítem de cada venta
  pagoTransferencia: Centavos | "";
}

export interface FilaDevolucion {
  fecha: string; // fecha contable de la DEVOLUCIÓN
  hora: string;
  venta: string; // id corto de la venta original
  fechaVenta: string; // fecha contable de la venta original (puede ser de otro período)
  producto: string;
  cantidad: number;
  precioUnitario: Centavos; // precio histórico del ítem
  importe: Centavos; // cantidad × precio
  medio: "efectivo" | "transferencia";
  motivo: string;
}

export interface FilaActividad {
  dia: string;
  fecha: string;
  horario: string;
  jugador: string;
  telefono: string;
  estado: EstadoReservaReporte;
  turnoFijo: "Sí" | "No";
  precio: Centavos;
  registrado: Centavos;
  saldo: Centavos;
}

export interface DatosReporte {
  desde: string;
  hasta: string;
  nombreCancha: string;
  resumen: ResumenCaja;
  filasPagos: FilaPagoReserva[];
  filasVentas: FilaVenta[];
  filasDevoluciones: FilaDevolucion[];
  filasActividad: FilaActividad[];
}

export interface ResultadoExportarReporte {
  ok: boolean;
  error?: string;
}
