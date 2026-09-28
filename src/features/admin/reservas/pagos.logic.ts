// FINAL-F6 — lógica pura de los movimientos de pago de una reserva (sin
// Supabase, sin React). Espejo exacto de las reglas de
// `registrar_movimiento_pago` (final_f6_contabilidad_movimientos.sql) para
// bloquear ANTES de llamar al servidor; el servidor sigue siendo la autoridad.
//
//   cobro      dinero que entra: importes >= 0 por medio, suma > 0, el total
//              registrado no puede superar el precio. Campos vacíos al abrir:
//              nunca se asume que el saldo faltante fue cobrado.
//   reintegro  dinero que se devuelve, en el MISMO medio en que se cobró:
//              cada medio <= lo neto cobrado en ese medio. Motivo obligatorio.
//   correccion ajuste administrativo de un error de carga: el usuario indica
//              el valor FINAL correcto por medio; se registran diferencias.
//              Motivo obligatorio. No es un reintegro.
//
// Todo en centavos enteros (lib/dinero.ts).

import { aCentavos, formatearCentavos, parsearMontoInput, type Centavos } from "../../../lib/dinero";
import type { Tables } from "../../../types/database.types";

export type TipoMovimientoPago = "cobro" | "reintegro" | "correccion";
export type TipoMovimientoRegistrado = TipoMovimientoPago | "saldo_migrado";
export type MovimientoPagoRow = Tables<"reserva_pago_movimientos">;

export const LABEL_TIPO_MOVIMIENTO: Record<TipoMovimientoRegistrado, string> = {
  cobro: "Cobro",
  reintegro: "Reintegro",
  correccion: "Corrección",
  saldo_migrado: "Saldo migrado (sin fecha real)",
};

export const MOTIVO_MINIMO = 3;

export interface EstadoPagoActual {
  precio: Centavos;
  efectivo: Centavos;
  transferencia: Centavos;
}

export function estadoPagoActual(r: { precio: number | string; pago_efectivo: number | string; pago_transferencia: number | string }): EstadoPagoActual {
  return { precio: aCentavos(r.precio), efectivo: aCentavos(r.pago_efectivo), transferencia: aCentavos(r.pago_transferencia) };
}

export interface PrevisualizacionPago {
  // Lo que queda registrado si se guarda.
  efectivoFinal: Centavos;
  transferenciaFinal: Centavos;
  // Movimiento resultante por medio (con signo).
  deltaEfectivo: Centavos;
  deltaTransferencia: Centavos;
  saldoFinal: Centavos;
  // null = se puede guardar. Si no, el motivo exacto (se muestra tal cual).
  error: string | null;
}

// `efectivoTexto`/`transferenciaTexto` son lo tipeado: en cobro/reintegro el
// importe del movimiento; en corrección el valor FINAL de ese medio.
export function previsualizarPago(
  estado: EstadoPagoActual,
  tipo: TipoMovimientoPago,
  efectivoTexto: string,
  transferenciaTexto: string,
  motivo: string,
): PrevisualizacionPago {
  const ef = parsearMontoInput(efectivoTexto);
  const tr = parsearMontoInput(transferenciaTexto);
  const base = {
    efectivoFinal: estado.efectivo,
    transferenciaFinal: estado.transferencia,
    deltaEfectivo: 0,
    deltaTransferencia: 0,
    saldoFinal: estado.precio - estado.efectivo - estado.transferencia,
  };
  if (ef === null || tr === null) return { ...base, error: "Ingresá importes válidos (números, hasta 2 decimales)." };

  let dEf = 0;
  let dTr = 0;
  if (tipo === "cobro") {
    dEf = ef;
    dTr = tr;
  } else if (tipo === "reintegro") {
    dEf = -ef;
    dTr = -tr;
  } else {
    dEf = ef - estado.efectivo;
    dTr = tr - estado.transferencia;
  }
  const efectivoFinal = estado.efectivo + dEf;
  const transferenciaFinal = estado.transferencia + dTr;
  const res = {
    efectivoFinal,
    transferenciaFinal,
    deltaEfectivo: dEf,
    deltaTransferencia: dTr,
    saldoFinal: estado.precio - efectivoFinal - transferenciaFinal,
  };

  if (tipo === "cobro" && ef + tr <= 0) return { ...res, error: "Ingresá cuánto recibiste." };
  if (tipo === "reintegro") {
    if (ef + tr <= 0) return { ...res, error: "Ingresá cuánto devolvés." };
    if (ef > estado.efectivo)
      return { ...res, error: `No podés reintegrar ${formatearCentavos(ef)} en efectivo: en efectivo se cobró ${formatearCentavos(estado.efectivo)}. Los reintegros se hacen por el mismo medio del cobro.` };
    if (tr > estado.transferencia)
      return { ...res, error: `No podés reintegrar ${formatearCentavos(tr)} por transferencia: por transferencia se cobró ${formatearCentavos(estado.transferencia)}. Los reintegros se hacen por el mismo medio del cobro.` };
  }
  if (tipo === "correccion" && dEf === 0 && dTr === 0) return { ...res, error: "Los valores corregidos son iguales a los registrados." };
  if (efectivoFinal + transferenciaFinal > estado.precio)
    return { ...res, error: `El total registrado (${formatearCentavos(efectivoFinal + transferenciaFinal)}) no puede superar el precio del turno (${formatearCentavos(estado.precio)}).` };
  if (tipo !== "cobro" && motivo.trim().length < MOTIVO_MINIMO) return { ...res, error: "El motivo es obligatorio." };
  return { ...res, error: null };
}

// ---- Cobrar: selector Efectivo / Transferencia / Mixto sobre el SALDO ----
// Solo UX del admin: el cobro sigue siendo un movimiento `cobro` común
// (previsualizarPago / parametrosMovimiento / registrar_movimiento_pago). Estas
// funciones solo deciden QUÉ TEXTO llevan los dos campos de importe, siempre en
// centavos enteros, para que efectivo + transferencia == saldo exacto.

export type MedioCobro = "efectivo" | "transferencia" | "mixto";

export interface ImportesCobroTexto {
  efectivo: string;
  transferencia: string;
}

// Centavos -> texto de importe ("0" incluido), sin decimales si son enteros.
export function textoMonto(c: Centavos): string {
  return (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
}

// Efectivo/Transferencia: el saldo completo por un solo medio. Mixto: se parte
// de efectivo (lo que ya estaba cargado), el llamador no recalcula al cambiar.
export function importesCobroPorMedio(saldo: Centavos, medio: MedioCobro): ImportesCobroTexto {
  const s = Math.max(0, saldo);
  if (medio === "transferencia") return { efectivo: "0", transferencia: textoMonto(s) };
  return { efectivo: textoMonto(s), transferencia: "0" };
}

// Mixto: el campo editado conserva lo tipeado (topeado al saldo) y el otro es
// el complemento exacto `max(0, saldo - tipeado)`. null = texto inválido (más
// de 2 decimales, negativo, no numérico): el llamador ignora el cambio.
export function repartirCobroMixto(saldo: Centavos, campo: "efectivo" | "transferencia", texto: string): ImportesCobroTexto | null {
  const tipeado = parsearMontoInput(texto);
  if (tipeado === null) return null;
  const s = Math.max(0, saldo);
  const propio = tipeado > s ? textoMonto(s) : texto;
  const complemento = textoMonto(Math.max(0, s - tipeado));
  return campo === "efectivo" ? { efectivo: propio, transferencia: complemento } : { efectivo: complemento, transferencia: propio };
}

// Parámetros exactos que viajan a la RPC (en pesos, 2 decimales).
export function parametrosMovimiento(
  estado: EstadoPagoActual,
  efectivoTexto: string,
  transferenciaTexto: string,
): { efectivo: number; transferencia: number; esperadoEfectivo: number; esperadoTransferencia: number } {
  return {
    efectivo: (parsearMontoInput(efectivoTexto) ?? 0) / 100,
    transferencia: (parsearMontoInput(transferenciaTexto) ?? 0) / 100,
    esperadoEfectivo: estado.efectivo / 100,
    esperadoTransferencia: estado.transferencia / 100,
  };
}

// Traducción de los errores de registrar_movimiento_pago a un mensaje claro.
export function mensajeErrorMovimientoPago(error: { message?: string; code?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (error?.code === "IK001" || msg === "idempotency_key_reutilizada")
    return "La operación anterior ya se había registrado (la respuesta no llegó). No se registró de nuevo: cerrá y volvé a abrir el pago para ver el estado actual.";
  if (msg === "pago_desactualizado")
    return "Otro admin u otra pestaña registró un movimiento en este turno. No se guardó nada: cerrá y volvé a abrir el pago para ver el estado actual.";
  if (msg === "reserva_inexistente") return "Esa reserva ya no existe: el pago no se guardó. Recargá la lista.";
  if (msg === "reserva_bloqueada") return "Un bloqueo de horario no puede tener pagos.";
  if (msg === "reintegro_excede_cobrado") return "No podés reintegrar más de lo cobrado en ese medio. Los reintegros se hacen por el mismo medio del cobro.";
  if (msg === "pago_supera_precio") return "El total registrado no puede superar el precio del turno.";
  if (msg === "motivo_requerido") return "El motivo es obligatorio.";
  if (msg === "correccion_sin_cambios") return "Los valores corregidos son iguales a los registrados.";
  if (msg === "importe_invalido") return "Importe inválido.";
  return "No se pudo guardar el pago. Probá de nuevo (no se registra dos veces).";
}

// El pago quedó en un estado que la UI local ya no conoce: hay que recargar.
export function requiereRecargarPago(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = error?.message ?? "";
  return error?.code === "IK001" || msg === "idempotency_key_reutilizada" || msg === "pago_desactualizado" || msg === "reserva_inexistente";
}

export interface ResultadoMovimientoPago {
  operacion_id: string;
  reserva_id: string;
  pago_efectivo: number;
  pago_transferencia: number;
  repetido: boolean;
}
