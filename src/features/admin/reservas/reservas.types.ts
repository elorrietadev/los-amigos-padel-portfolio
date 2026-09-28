// Tipos de la lógica pura de reservas del admin. `ReservaRow`/`TurnoFijoRow`/
// `ExcepcionTurnoFijoRow` vienen directo de database.types.ts (generado desde
// el schema real, confirmado contra Supabase antes de escribir este archivo)
// — nada tipado a mano que ya exista ahí.

import type { Tables } from "../../../types/database.types";

export type ReservaRow = Tables<"reservas"> & { ventas?: { count: number }[] };

// Paridad con admin.html: cargarProximos/cargarJugadosSemanaActual/etc. hacen
// `{ ...x, horaInicio: recortarHora(x.hora_inicio), horaFin: recortarHora(x.hora_fin) }`
// — mantienen los campos crudos Y agregan los recortados, no los reemplazan.
export type ReservaProcesada = ReservaRow & {
  horaInicio: string;
  horaFin: string;
};

// admin.html:1099-1124 (ocurrenciasFijasVirtuales) — ocurrencia futura de un
// turno fijo que todavía no existe como fila real en `reservas`.
export interface ReservaVirtual {
  virtual: true;
  turnoFijoId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  nombre: string;
  telefono: string;
}

// Shape de turno fijo que necesita ocurrenciasFijasVirtuales: la versión YA
// procesada (con horaInicio/horaFin recortadas) que produce el loader de
// turnos fijos — ese loader es dominio de C, acá solo se consume su forma de
// salida como dato de entrada, sin fetch ni CRUD.
//
// TF-R2 — nombre/telefono ya no viven en turnos_fijos (ver agenda.logic.ts,
// mismo criterio): useTurnosFijos los aplana desde titulares_turno_fijo antes
// de construir este shape.
export type TurnoFijoConHorario = Pick<Tables<"turnos_fijos">, "id" | "dia_semana" | "titular_id"> & {
  nombre: string;
  telefono: string;
  horaInicio: string;
  horaFin: string;
  // FINAL-F3 (M5) — turnos_fijos.creado, mismo campo opcional que en agenda.logic.ts.
  creado?: string | null;
};

export type ExcepcionTurnoFijoRow = Tables<"excepciones_turno_fijo">;

// Item combinado de la lista "Próximos" (admin.html:1126-1136) — reservas
// reales y ocurrencias virtuales de turnos fijos, intercaladas por fecha/hora.
export type ItemListaProximas = ReservaProcesada | ReservaVirtual;

export type FiltroRapido = "hoy" | "manana" | "semana" | "pendientes" | null;

export interface FiltrosReservas {
  filtroFecha: string;
  filtroNombre: string;
  filtroRapido: FiltroRapido;
}

export type OrdenJugadas = "recientes" | "antiguos";

export interface OcupacionHoy {
  reservasHoy: ReservaProcesada[];
  reservasHoyJugadas: ReservaProcesada[];
  ocupacionHoyPct: number;
}

export type ModoPago = "efectivo" | "transferencia" | "mixto";

export interface SplitPago {
  efectivo: number;
  transferencia: number;
}

export interface EstadoInicialPagoModal {
  modo: ModoPago;
  montoEfectivo: number;
  montoTransferencia: number;
}

export interface ResultadoProcesarReservas {
  // Commercial validity / court occupancy only.
  vigentes: ReservaProcesada[];
  // Expiration never implies permission to delete; F4 owns that decision.
  vencidas: ReservaRow[];
  conservadas: ReservaProcesada[];
  visibles: ReservaProcesada[];
}
