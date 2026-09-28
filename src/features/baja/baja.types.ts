// Tipos de esta feature (baja.html:79, 124-176). Los args de las 2 RPC ya están
// bien tipados en database.types.ts (no son Json); lo que sigue abajo son las
// interfaces del PAYLOAD de cada una, escritas a mano porque ambas declaran
// `Returns: Json` — Supabase no puede inferir la forma de un JSON de función.
//
// IMPORTANTE — no verificado contra el servidor real: el proyecto Supabase
// conectado en esta sesión (MCP) no es el proyecto real de Los Amigos Padel
// (URLs distintas — ver web/.env vs la conexión MCP), y no hay migraciones SQL
// locales en el repo. No se pudo confirmar nullability real, ni si
// hora_inicio/hora_fin llegan ya recortados a "HH:MM" o con segundos. Todo lo
// de abajo es exactamente lo que baja.html consume hoy (mismo nivel de
// confianza que el legacy: sin optional chaining en ningún campo de acá), no
// una garantía adicional inventada por la migración.

import type { Database } from "../../types/database.types";

export type ObtenerTurnosFijosTitularPublicoArgs =
  Database["public"]["Functions"]["obtener_turnos_fijos_titular_publico"]["Args"];
export type BajaTurnoFijoPublicoArgs = Database["public"]["Functions"]["baja_turno_fijo_publico"]["Args"];

// baja.html:214-231 — cada ocurrencia futura de un turno fijo en el calendario.
// El cálculo de estas 3 propiedades (existencia, cancelada, dentro/fuera de la
// ventana de cancelación configurable — ver cancelacion_horas_minimas más
// abajo) es autoritativo del servidor — no se recalcula acá.
export interface OcurrenciaTurnoFijo {
  fecha: string; // "YYYY-MM-DD", usada tal cual como key de lista y como arg de baja_turno_fijo_publico
  cancelada: boolean;
  puede_cancelar: boolean;
}

// TF-R2 — un titular puede tener varios horarios fijos (antes era 1:1 con el
// token). `obtener_turnos_fijos_titular_publico` devuelve uno de estos por
// cada turno_fijo del titular, cada uno con sus propias ocurrencias — dia_semana
// indexa DIAS_SEMANA (0=Domingo..6=Sábado), igual que Date.getDay().
export interface TurnoFijoDelTitular {
  turno_fijo_id: string;
  dia_semana: number;
  hora_inicio: string; // "HH:MM", ya formateado por el servidor
  hora_fin: string;
  ocurrencias: OcurrenciaTurnoFijo[];
}

// baja.html:146,150,202 — caso `data.valido === true`.
//
// C7 — cancelacion_horas_minimas: el plazo real (configuracion_cancha),
// agregado al JSON de respuesta para que esta página pueda mostrar el número
// real en vez de un "4 horas" hardcodeado. Mismo criterio que el resto de
// los campos de acá (pass-through directo del JSON, sin camelCase).
//
// TF-R2 — reemplaza el horario único (dia_semana/hora_inicio/hora_fin) suelto
// por `turnos`: la identidad ahora es el TITULAR (nombre), no un horario, y
// puede tener N turnos fijos. Confirmado por la definición SQL real de
// obtener_turnos_fijos_titular_publico.
export interface TurnoFijoPublicoValido {
  valido: true;
  nombre: string;
  cancelacion_horas_minimas: number;
  turnos: TurnoFijoDelTitular[];
}

// baja.html:146 — cualquier otro caso (token inexistente/vencido/inválido) se
// trata igual en el legacy: `!data.valido` alcanza, nunca se leen otros campos.
export interface TurnoFijoPublicoInvalido {
  valido: false;
}

export type TurnoFijoPublicoData = TurnoFijoPublicoValido | TurnoFijoPublicoInvalido;

// baja.html:166-170 — resultado de la baja. `error` solo se lee cuando
// `ok === false`; el único valor comparado explícitamente en el legacy es
// "fuera_de_plazo" (mapeado a un mensaje específico), cualquier otro string
// cae al mensaje genérico. No se puede confirmar el universo completo de
// códigos posibles sin ver el SQL de la función — se modela como `string`
// abierto, no como unión cerrada, para no inventar valores no vistos.
export interface BajaTurnoFijoResultado {
  ok: boolean;
  error?: string;
}
