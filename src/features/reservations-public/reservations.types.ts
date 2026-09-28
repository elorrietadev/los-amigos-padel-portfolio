// Tipos de esta feature. La primera parte (filas/función crudas) está derivada
// directo de database.types.ts, generado desde el schema real — nada escrito a
// mano desde cero. La segunda parte (más abajo) son los tipos "de concepto
// frontend" que produce reservations.logic.ts al normalizar esas filas crudas.

import type { Database, Tables } from "../../types/database.types";

export type TurnoFijoPublico = Tables<"turnos_fijos_publicos">;
// E4.3.4 — excepciones_turno_fijo_publicas (turno_fijo_id, fecha), no la
// tabla base: es lo único que expone la fuente pública real ahora.
export type ExcepcionTurnoFijo = Tables<"excepciones_turno_fijo_publicas">;
export type ReservaPublica = Tables<"reservas_publicas">;

// database.types.ts no exporta un helper genérico para Functions (a diferencia de
// Tables/TablesInsert/TablesUpdate), así que se referencia directo desde Database.
export type CrearReservaArgs = Database["public"]["Functions"]["crear_reserva"]["Args"];
export type CrearReservaRow = Database["public"]["Functions"]["crear_reserva"]["Returns"];

// C4 — franja_operativa(p_fecha) devuelve un set de 1 fila (cerrado, hora_apertura,
// hora_cierre); FranjaOperativaRow es esa fila cruda tal como la tipa Supabase.
export type FranjaOperativaRow = Database["public"]["Functions"]["franja_operativa"]["Returns"][number];

// C5/C6/C7 — vista pública de configuracion_cancha: duración, anticipación
// máxima/mínima, límite de reservas activas por teléfono y plazo de
// cancelación. Esta feature (reservas públicas) solo consume los primeros 5
// campos — cancelacion_horas_minimas es del dominio de baja de turnos fijos
// (ver features/baja/baja.types.ts).
export type ConfiguracionCanchaPublicaRow = Tables<"configuracion_cancha_publica">;

// PUBLIC-R5 — vista pública del horario semanal configurable (C4:
// horarios_semana_publica), ya existía en el backend desde C4 pero ningún
// componente la consumía todavía: Información solo podía mostrar "Hoy"
// (franja_operativa) y cualquier "todos los días de X a Y" hardcodeado
// hubiera podido mentir en cuanto un admin desactivara un día o cambiara su
// horario. Esta vista es la fuente real para mostrar la semana completa.
export type HorarioSemanaRow = Tables<"horarios_semana_publica">;

// --- Tipos procesados (no-nullable) ---
// turnos_fijos_publicos/reservas_publicas son vistas sin NOT NULL declarado, así
// que sus Row generados marcan casi todo como `T | null`. El legacy nunca trató
// esos campos como null (una fila real de reservas/turnos_fijos siempre los tiene
// seteados). procesarReservasPublicas/procesarTurnosFijos en reservations.logic.ts
// son el ÚNICO lugar donde se cruza ese nullable -> no-nullable (con un cast
// puntual y comentado ahí mismo) — todo lo que sigue trabaja exclusivamente con
// estas formas ya no-nullable, sin casts repetidos en el resto de la lógica.

// Estructura común para ocupación: lo que consumen haySolape/horas*Disponibles.
// Tanto ReservaProcesada como TurnoFijoOcurrencia la satisfacen.
export interface OcupacionDelDia {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

// Reserva real ya procesada (recortarHora aplicado, solo las vigentes).
export type ReservaProcesada = OcupacionDelDia;

// Turno fijo ya procesado (recortarHora aplicado), sin fecha todavía.
export interface TurnoFijoProcesado {
  id: string;
  dia_semana: number;
  horaInicio: string;
  horaFin: string;
}

// Ocurrencia virtual: un turno fijo aplicado a una fecha concreta del calendario.
export interface TurnoFijoOcurrencia extends TurnoFijoProcesado {
  fecha: string;
}

// C4 — horario operativo YA RESUELTO para una fecha concreta (fecha especial
// vigente si la hay, si no horario semanal), tal como lo devuelve
// franja_operativa. horaApertura/horaCierre vienen en null cuando cerrado=true
// (nada que mostrar ese caso).
export interface FranjaOperativa {
  cerrado: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
}

// PUBLIC-R5 — una fila de horarios_semana_publica ya normalizada (hora
// recortada a "HH:MM", igual criterio que FranjaOperativa). dia_semana usa
// el mismo índice 0=Domingo..6=Sábado que Date.getDay() y que DIAS_SEMANA de
// features/baja/baja.logic.ts.
export interface HorarioSemanaDia {
  diaSemana: number;
  abierto: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
}

// C5/C6 — configuración operativa de reservas ya resuelta (duración en rango
// continuo: hoy el negocio permite cualquier duración entre min y max, no
// pasos discretos — ver auditoría en c5_configuracion_cancha_duracion.sql;
// anticipación máxima/mínima y límite por teléfono desde C6, ver auditoría en
// c6_anticipacion_limite_reservas.sql).
export interface ConfiguracionReservas {
  duracionMinima: number;
  duracionMaxima: number;
  anticipacionMaximaDias: number;
  anticipacionMinimaMinutos: number;
  limiteReservasActivasTelefono: number;
}

// Datos de la cancha que hoy vive en config.js (window.CONFIG_CANCHA). useReservaForm
// no lee ningún global: quien lo use decide de dónde saca estos valores.
export interface ConfigReserva {
  nombreCancha: string;
  precioHora: number;
  horaApertura: string; // "HH:MM"
  horaCierre: string; // "HH:MM" — puede cruzar medianoche (ej. "01:00")
  whatsappNumero: string;
}
