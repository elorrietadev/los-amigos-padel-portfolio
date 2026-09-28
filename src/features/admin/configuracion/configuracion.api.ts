// Capa de transporte de Configuración (C10) — mismo patrón que productos.api.ts/
// backup.api.ts: una función por llamada a Supabase, sin decidir loading/
// estados/adapter (eso vive en useConfiguracion.ts/configuracion.adapter.ts).
//
// Todo lo de acá pasa por RLS `is_admin()` (horarios_semana, configuracion_cancha)
// o por RPCs SECURITY DEFINER admin-only (admin_listar_*/admin_set_*, C1/C8) —
// nada nuevo se expone a anon/authenticated no-admin.

import { supabase } from "../../../lib/supabase";
import { primeraFila } from "./configuracion.adapter";

// ---------------------------------------------------------------------------
// General — precio base (precio_base_historico vía C8)
// ---------------------------------------------------------------------------
export async function obtenerPrecioBaseVigente() {
  const { data, error } = await supabase.rpc("admin_listar_precio_base_vigente");
  return { data: primeraFila(data), error };
}

export function setPrecioBase(precioHora: number) {
  return supabase.rpc("admin_set_precio_base", { p_precio_hora: precioHora });
}

// ---------------------------------------------------------------------------
// Horarios — historizados por fecha efectiva (AUDIT-DAY-FIX). Dos lecturas
// distintas a propósito, no intercambiables:
// - obtenerHorariosSemana(): el horario VIGENTE HOY (vista pública, misma
//   fuente que usa Información) — para validar contra el horario operativo
//   real (TurnosFijosView).
// - obtenerHorariosSemanaConfiguracion(): la ÚLTIMA fila guardada por día
//   (RPC admin, incluye vigente_desde_fecha — puede ser una fecha futura si
//   el cambio todavía no entró en vigencia) — solo para la UI de
//   Configuración, que necesita mostrar "programado" vs. "vigente".
// Escribir sigue siendo un solo RPC (admin_set_horario_semana): por defecto
// programa el cambio para mañana, nunca hoy — un cambio excepcional de hoy
// pasa por Fechas especiales, no por acá.
// ---------------------------------------------------------------------------
export function obtenerHorariosSemana() {
  return supabase.from("horarios_semana_publica").select("*").order("dia_semana");
}

export function obtenerHorariosSemanaConfiguracion() {
  return supabase.rpc("admin_listar_horarios_semana");
}

export function actualizarHorarioDia(
  diaSemana: number,
  patch: { abierto: boolean; hora_apertura: string; hora_cierre: string },
) {
  return supabase.rpc("admin_set_horario_semana", {
    p_dia_semana: diaSemana,
    p_abierto: patch.abierto,
    p_hora_apertura: patch.hora_apertura,
    p_hora_cierre: patch.hora_cierre,
  });
}

// ---------------------------------------------------------------------------
// Duraciones + Reservas — configuracion_cancha (C5-C7), singleton id=1,
// UPDATE directo (sin RPC, RLS is_admin()) — comparten la misma fila.
// ---------------------------------------------------------------------------
export function obtenerConfiguracionCancha() {
  return supabase.from("configuracion_cancha").select("*").eq("id", 1).single();
}

export function actualizarConfiguracionCancha(
  patch: Partial<{
    duracion_minima_minutos: number;
    duracion_maxima_minutos: number;
    anticipacion_minima_minutos: number;
    anticipacion_maxima_dias: number;
    limite_reservas_activas_telefono: number;
    cancelacion_horas_minimas: number;
  }>,
) {
  return supabase.from("configuracion_cancha").update(patch).eq("id", 1).select().single();
}

// ---------------------------------------------------------------------------
// Tarifas por duración (tarifas_por_duracion_historico, C1/C8)
// ---------------------------------------------------------------------------
export function obtenerTarifasDuracionVigentes() {
  return supabase.rpc("admin_listar_tarifas_duracion_vigentes");
}

export function setTarifaDuracion(duracionMinutos: number, activo: boolean, descuentoPct: number | null) {
  return supabase.rpc("admin_set_tarifa_duracion", {
    p_duracion_minutos: duracionMinutos,
    p_activo: activo,
    p_descuento_pct: descuentoPct ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Tarifas por franja horaria (tarifas_por_franja_historico, C1/C8)
// ---------------------------------------------------------------------------
export function obtenerTarifasFranjaVigentes() {
  return supabase.rpc("admin_listar_tarifas_franja_vigentes");
}

export function setTarifaFranja(
  franjaId: string,
  diasSemana: number[],
  horaInicio: string,
  horaFin: string,
  activo: boolean,
  descuentoPct: number | null,
) {
  return supabase.rpc("admin_set_tarifa_franja", {
    p_franja_id: franjaId,
    p_dias_semana: diasSemana,
    p_hora_inicio: horaInicio,
    p_hora_fin: horaFin,
    p_activo: activo,
    p_descuento_pct: descuentoPct ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Fechas especiales (fechas_especiales_historico, C1/C8) — rango default del
// propio RPC (30 días atrás a 365 adelante, huso de la cancha): alcanza para
// esta UI, no hace falta paginar ni acotar desde el cliente.
// ---------------------------------------------------------------------------
export function obtenerFechasEspecialesVigentes() {
  return supabase.rpc("admin_listar_fechas_especiales_vigentes");
}

// ---------------------------------------------------------------------------
// Datos públicos — datos_publicos_cancha (singleton, CFG-F1), UPDATE directo
// (sin RPC, RLS is_admin()) — mismo criterio que configuracion_cancha.
// ---------------------------------------------------------------------------
export function obtenerDatosPublicosCancha() {
  return supabase.from("datos_publicos_cancha").select("*").eq("id", 1).single();
}

export function actualizarDatosPublicosCancha(
  patch: Partial<{
    nombre_cancha: string;
    whatsapp_numero: string;
    instagram_url: string | null;
    direccion: string;
    mapa_lat: number;
    mapa_lng: number;
  }>,
) {
  return supabase.from("datos_publicos_cancha").update(patch).eq("id", 1).select().single();
}

export function setFechaEspecial(
  fecha: string,
  activo: boolean,
  cerrado: boolean | null,
  horaApertura: string | null,
  horaCierre: string | null,
  tarifaTipo: "descuento_pct" | "precio_hora_fijo" | null,
  tarifaValor: number | null,
) {
  return supabase.rpc("admin_set_fecha_especial", {
    p_fecha: fecha,
    p_activo: activo,
    p_cerrado: cerrado ?? undefined,
    p_hora_apertura: horaApertura ?? undefined,
    p_hora_cierre: horaCierre ?? undefined,
    p_tarifa_tipo: tarifaTipo ?? undefined,
    p_tarifa_valor: tarifaValor ?? undefined,
  });
}
