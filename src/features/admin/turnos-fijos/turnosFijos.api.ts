// Capa de transporte de Turnos Fijos (mismo patrón que reservas/reservas.api.ts:
// una función por llamada, sin decidir loading/cache/guards/patch local — eso
// vive en useTurnosFijos.ts y en TurnosFijosView).
//
// C2 — `obtenerTurnosFijos`/`obtenerExcepciones`/`crearExcepcionTurnoFijo` se
// mudan acá desde agenda/agenda.api.ts (B7): son del dominio de Turnos Fijos,
// no de Agenda — vivían ahí solo porque Agenda fue la primera en necesitarlas
// para pintar la grilla. Agenda pasa a importarlas desde acá (mismo criterio
// que ya aplica este archivo con las queries de `reservas`: se reusan del
// dueño real del dominio, no se duplican). `agenda.api.ts` se elimina: sin
// estas 3 funciones no le quedaba nada propio.

import { supabase } from "../../../lib/supabase";
import type { Json } from "../../../types/database.types";
import type { HorarioAltaInput, TitularTurnoFijoCreado } from "./turnosFijos.types";

// admin.html:619 (dentro de cargarTodo)
//
// TF-R2 — nombre/telefono ya no viven acá (ver titulares_turno_fijo): se
// traen con un embed de PostgREST y useTurnosFijos.cargar() los aplana antes
// de construir TurnoFijoConHorario, así que el resto del código sigue viendo
// el mismo shape que antes.
export function obtenerTurnosFijos() {
  return supabase
    .from("turnos_fijos")
    .select("*, titulares_turno_fijo(nombre, telefono)")
    .order("dia_semana")
    .order("hora_inicio");
}

// admin.html:620 (dentro de cargarTodo) — sin filtro de rango, igual que el
// legacy: son pocas filas, se traen todas.
export function obtenerExcepciones() {
  return supabase.from("excepciones_turno_fijo").select("*");
}

// admin.html:2023 (dentro de cancelarOcurrencia) — una sola fecha, usada desde
// el sheet de detalle de la grilla (Agenda).
export function crearExcepcionTurnoFijo(turnoFijoId: string, fecha: string) {
  return supabase.from("excepciones_turno_fijo").insert([{ turno_fijo_id: turnoFijoId, fecha }]);
}

// TF-R3.1 — reemplaza el crearTurnoFijo de C2 (2 inserts secuenciales desde
// el cliente + rollback best-effort del titular si el segundo fallaba, que
// dejaba una ventana real de estado parcial si el proceso se caía justo
// entre medio). Un titular con 1 horario es simplemente el caso `horarios`
// de longitud 1 — no queda ningún camino especial para "1 horario" separado
// de "N horarios", evita mantener dos formas de crear lo mismo.
//
// Atomicidad real: crear_titular_turno_fijo es una única función plpgsql
// (una sola llamada RPC = una sola transacción). Si cualquier horario falla
// (duración inválida, solapamiento — mismos triggers de siempre, ahora
// evaluados también ENTRE los horarios de este mismo alta, no solo contra
// los ya existentes en la tabla), Postgres revierte TODO: titular incluido,
// sin lógica de rollback del lado del cliente. Ver docs/database-design.md para el
// detalle de por qué este es el enfoque elegido.
//
// Las excepciones automáticas por choques con reservas (antes un segundo
// paso separado vía crearExcepcionesTurnoFijo, con su propio rollback
// best-effort) viajan DENTRO de cada horario y se crean en la misma
// transacción — ya no hay una ventana de "turno creado pero sin sus
// excepciones" como antes.
export async function crearTitularConHorarios(nombre: string, telefono: string, horarios: HorarioAltaInput[]) {
  const { data, error } = await supabase.rpc("crear_titular_turno_fijo", {
    p_nombre: nombre,
    p_telefono: telefono,
    p_horarios: horarios as unknown as Json,
  });
  if (error || !data) {
    return { data: null, error };
  }
  return { data: data as unknown as TitularTurnoFijoCreado, error: null };
}

// TF-R3 — agregar un horario a un titular que YA existe (elegido desde
// TitularPicker o desde el botón "+ Agregar horario" de su grupo): a
// diferencia de crearTitularConHorarios, acá no se crea ningún titular
// nuevo, solo el horario — sigue siendo un insert directo (TF-R3.1 no le
// agrega multi-alta a propósito, ver pedido explícito). Mismas validaciones
// server-side (duración/solape) que cualquier insert en turnos_fijos.
export function agregarHorarioATitular(titularId: string, diaSemana: number, horaInicio: string, horaFin: string) {
  return supabase
    .from("turnos_fijos")
    .insert([{ titular_id: titularId, dia_semana: diaSemana, hora_inicio: horaInicio, hora_fin: horaFin }])
    .select()
    .single();
}

// TF-R3 — elimina el titular COMPLETO (no un horario puntual): sus horarios
// (turnos_fijos.titular_id), token (titulares_turno_fijo_tokens.titular_id)
// y excepciones (vía turnos_fijos) son ON DELETE CASCADE (confirmado contra
// el schema real en TF-R2), un solo delete alcanza.
//
// FINAL-F3 — ya no es un .delete() directo (la tabla dejó de aceptarlo): la
// RPC toma los locks en orden, materializa PRIMERO cualquier ocurrencia ya
// terminada y todavía no registrada de sus horarios, y recién después borra,
// todo en una sola transacción. Mismo contrato de retorno que antes (los
// llamadores solo miran `error`).
export function eliminarTitular(titularId: string) {
  return supabase.rpc("admin_eliminar_titular_turno_fijo", { p_titular_id: titularId });
}

// TF-R3 — editar nombre/telefono sin borrar/recrear el titular (eso rompería
// su token y sus horarios). Requiere la policy de UPDATE agregada en esta
// misma etapa (antes solo había SELECT/INSERT/DELETE) — ver
// tf_r3_permitir_editar_titular. El trigger de validación de teléfono
// (validar_telefono_titulares_turno_fijo) ya cubría BEFORE UPDATE OF telefono
// desde TF-R2, sin cambios ahí.
export function actualizarTitular(titularId: string, nombre: string, telefono: string) {
  return supabase.from("titulares_turno_fijo").update({ nombre, telefono }).eq("id", titularId).select().single();
}

// admin.html:2011 (dentro de eliminarTurnoFijo) — delete simple: la FK de
// excepciones_turno_fijo es ON DELETE CASCADE (confirmado contra el schema
// real en C1), así que no hace falta borrarlas a mano acá.
//
// TF-R2/TF-R3 — esto borra UN horario, no el titular: si el titular tiene
// otros turnos_fijos, su fila en titulares_turno_fijo (y su token) sigue
// existiendo a propósito. Si este era su ÚLTIMO horario, TurnosFijosView
// llama además a eliminarTitular (preferencia explícita: no dejar titulares
// vacíos) — esa decisión vive del lado del llamador, no acá.
//
// FINAL-F3 — misma razón que eliminarTitular: RPC atómica que registra antes
// las ocurrencias jugadas pendientes de ESTE horario (ver la migración
// final_f3_integridad_materializacion_turnos_fijos.sql).
export function eliminarTurnoFijo(id: string) {
  return supabase.rpc("admin_eliminar_turno_fijo", { p_turno_fijo_id: id });
}

// C5.1 — misma vista pública que ya usa reservations-public/reservations.api.ts
// (configuracion_cancha_publica): TurnosFijosView deja de usar un mínimo de 60
// hardcodeado e independiente, y ahora también respeta el máximo real (que
// hasta acá no se validaba en este formulario). Se duplica esta única línea en
// vez de importar del dominio de reservations-public — mismo criterio de
// aislamiento de dominios que ya documenta turnosFijos.logic.ts arriba.
export function obtenerConfiguracionDuracion() {
  return supabase.from("configuracion_cancha_publica").select().single();
}

// admin.html:1940-1942 (dentro de guardarTurnoFijo) — bulk insert de
// excepciones para las fechas que chocan con reservas reales al dar de alta
// un turno fijo. Nueva en C2 (la versión singular de arriba solo cubre
// cancelar UNA ocurrencia puntual desde la grilla).
export function crearExcepcionesTurnoFijo(turnoFijoId: string, fechas: string[]) {
  return supabase.from("excepciones_turno_fijo").insert(fechas.map((fecha) => ({ turno_fijo_id: turnoFijoId, fecha })));
}

// C3 — admin.html:2033-2037 (dentro de obtenerOCrearToken). `ignoreDuplicates`
// hace que, si ya existe una fila para este titular, el upsert NO la pise ni
// devuelva fila (`data` viene null) — de ahí el fallback select de abajo en
// vez de asumir que este upsert siempre trae el token.
//
// TF-R2 — el token pasa a ser por titular (titulares_turno_fijo_tokens), no
// por horario: comparte un solo link entre todos los turnos_fijos del mismo
// titular_id (ver useTurnosFijos.obtenerOCrearToken, que resuelve el
// titular_id a partir del turnoFijoId antes de llamar a esto).
export function upsertTokenTitular(titularId: string) {
  return supabase
    .from("titulares_turno_fijo_tokens")
    .upsert([{ titular_id: titularId }], { onConflict: "titular_id", ignoreDuplicates: true })
    .select()
    .single();
}

// admin.html:2040 — fallback cuando el upsert de arriba no devolvió fila
// (ya existía un token para este titular, con `ignoreDuplicates` de por medio).
export function obtenerTokenTitular(titularId: string) {
  return supabase.from("titulares_turno_fijo_tokens").select("token").eq("titular_id", titularId).single();
}
