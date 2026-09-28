// Capa de transporte: cada función hace exactamente una llamada a Supabase y
// propaga { data, error } tal cual lo devuelve el cliente tipado. Nada de mapeo
// de códigos de error a mensajes de UI (eso es de useReservaForm) y nada de
// filtrado/procesamiento de negocio (eso es de useDisponibilidad).
// obtenerFranjaOperativa es la única que no viene del index.html legacy: es
// de C4 (horarios operativos configurables).

import { supabase } from "../../lib/supabase";
import type { CrearReservaArgs } from "./reservations.types";

// C4 — horario operativo real de una fecha (fecha especial vigente si la
// hay, si no horario semanal). Reemplaza los 08:00/01:00 hardcodeados de
// configCancha para la disponibilidad pública.
export function obtenerFranjaOperativa(fecha: string) {
  return supabase.rpc("franja_operativa", { p_fecha: fecha });
}

// C5/C6 — configuración operativa real de una reserva (duración, anticipación
// máxima/mínima, límite por teléfono). Reemplaza las constantes
// DURACION_MINIMA/DURACION_MAXIMA/14/3 hardcodeadas en el frontend público.
export function obtenerConfiguracionReservas() {
  return supabase.from("configuracion_cancha_publica").select().single();
}

// PUBLIC-R5 — horario semanal completo (C4: horarios_semana_publica), para
// mostrarlo en Información en vez de solo "Hoy" (franja_operativa no trae
// los otros 6 días).
export function obtenerHorariosSemana() {
  return supabase.from("horarios_semana_publica").select().order("dia_semana");
}

// CFG-F1 — nombre/WhatsApp/Instagram/dirección/mapa de la cancha (antes
// hardcodeados en config/canchaConfig.ts y config/contenidoPublico.ts).
export function obtenerDatosPublicosCancha() {
  return supabase.from("datos_publicos_cancha_publica").select().single();
}

export function obtenerTurnosFijosPublicos() {
  return supabase.from("turnos_fijos_publicos").select("*");
}

// E4.3.4 — excepciones_turno_fijo_publicas (turno_fijo_id, fecha) reemplaza
// el SELECT directo sobre excepciones_turno_fijo: la disponibilidad pública
// solo necesita esas 2 columnas (ver ocurrenciasTurnoFijoDelDia en
// reservations.logic.ts), no id/creado ni acceso directo a la tabla completa.
export function obtenerExcepcionesTurnoFijo() {
  return supabase.from("excepciones_turno_fijo_publicas").select("*");
}

export function obtenerReservasPublicasPorFecha(fecha: string) {
  return supabase.from("reservas_publicas").select("*").eq("fecha", fecha);
}

// PUBLIC-R3.1 — mismo motor de tarifas (fecha especial > franja > duración >
// base) que usa crear_reserva internamente (calcular_precio_en_instante,
// evaluado con el now() del servidor): cotizar_reserva es el único wrapper
// público de esa función (anon/authenticated), pensado exactamente para
// mostrar un precio estimado confiable ANTES de confirmar. No duplica ni
// reimplementa la lógica de prioridad en el cliente.
export function cotizarReserva(fecha: string, horaInicio: string, horaFin: string) {
  return supabase.rpc("cotizar_reserva", { p_fecha: fecha, p_hora_inicio: horaInicio, p_hora_fin: horaFin });
}

// FINAL-F5-B — la reserva pública ya NO llama a la RPC crear_reserva por
// PostgREST: pasa por POST /api/reservar (Cloudflare Pages Function), que valida
// Turnstile server-side, aplica rate limit y recién ahí llama a Supabase
// (gateway_reservar -> crear_reserva, la lógica autoritativa sigue en la DB).
//
// Se conserva la forma { data, error } y el primer argumento (los 5 p_* de la
// RPC, sin ningún precio — C2) para no tocar a los consumidores: `error.message`
// es un CÓDIGO estable (HORARIO_OCUPADO, LIMITE_TELEFONO, TURNSTILE_FALLIDO,
// DEMASIADOS_INTENTOS, ERROR_TEMPORAL, ...) que mapearErrorCrearReserva traduce a
// texto; el servidor nunca devuelve mensajes SQL. `precio` es el autoritativo.
// El token de Turnstile es de UN SOLO USO: quien llama lo reinicia después de
// cada intento (ver useReservaForm).
export interface ErrorReservar {
  message: string;
  // Segundos (solo con DEMASIADOS_INTENTOS), tomado del cuerpo de la respuesta.
  retryAfter?: number;
}

export type RespuestaReservar =
  | { data: { precio: number }; error: null }
  | { data: null; error: ErrorReservar };

export const RESERVAR_TIMEOUT_MS = 20000;

export async function crearReserva(args: CrearReservaArgs, turnstileToken: string): Promise<RespuestaReservar> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const incierta: RespuestaReservar = { data: null, error: { message: "RESERVA_INCIERTA" } };
  try {
    return await Promise.race([
      enviarReserva(args, turnstileToken, controller.signal),
      new Promise<RespuestaReservar>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(incierta); }, RESERVAR_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return incierta;
  } finally {
    clearTimeout(timer);
  }
}

async function enviarReserva(args: CrearReservaArgs, turnstileToken: string, signal: AbortSignal): Promise<RespuestaReservar> {
  let res: Response;
  try {
    res = await fetch("/api/reservar", {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: args.p_fecha,
        horaInicio: args.p_hora_inicio,
        horaFin: args.p_hora_fin,
        nombre: args.p_nombre,
        telefono: args.p_telefono,
        turnstileToken,
      }),
    });
  } catch {
    return { data: null, error: { message: "RESERVA_INCIERTA" } };
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    // Cuerpo no-JSON (p. ej. 404 en dev sin la Function, o un proxy caído): error genérico.
  }
  const o = cuerpo !== null && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : {};

  if (res.ok && o.ok === true && typeof o.precio === "number" && Number.isFinite(o.precio) && o.precio >= 0) {
    return { data: { precio: o.precio }, error: null };
  }
  const message = o.ok === false && typeof o.codigo === "string" ? o.codigo : "RESERVA_INCIERTA";
  const retryAfter = typeof o.retryAfter === "number" ? o.retryAfter : undefined;
  return { data: null, error: retryAfter === undefined ? { message } : { message, retryAfter } };
}

// PUBLIC-R7 — precio base vigente (precio_base_historico), para mostrar un
// "Desde $X" real en Home/Información en vez del configCancha.precioHora
// estático. Wrapper mínimo (solo el número, sin id/vigente_desde/histórico):
// mismo criterio "vigente" que ya usa admin_listar_precio_base_vigente, sin
// el chequeo is_admin() (ese RPC es exclusivo del admin) y sin reimplementar
// el motor de tarifas completo (fecha especial > franja > duración > base) —
// esto NO es una cotización, es solo la tarifa base de referencia.
export function obtenerPrecioBasePublico() {
  return supabase.rpc("precio_base_vigente");
}
