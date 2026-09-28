// Capa de transporte: cada función hace exactamente una llamada a Supabase y
// propaga { data, error } tal cual lo devuelve el cliente tipado — mismo
// criterio que reservations.api.ts. Sin cast a TurnoFijoPublicoData/
// BajaTurnoFijoResultado acá: `data` sigue tipado como Json (lo que realmente
// devuelve el cliente para estas 2 RPC) hasta que se interprete en el hook
// (useBajaTurnoFijo, Sub-paso C) — un solo cast puntual ahí, no repartido acá.
// Nada de mapeo de error a mensaje de UI (eso es de baja.logic.ts) ni de
// decidir qué hacer con `ok`/`valido` (eso es del hook). Son las 2 únicas
// operaciones reales que hace baja.html — ninguna otra.

import { supabase } from "../../lib/supabase";
import type { BajaTurnoFijoPublicoArgs, ObtenerTurnosFijosTitularPublicoArgs } from "./baja.types";

// TF-R2 — reemplaza obtener_turno_fijo_publico: un token identifica a un
// titular (no a un horario), y devuelve todos sus turnos fijos.
export function obtenerTurnosFijosTitularPublico(args: ObtenerTurnosFijosTitularPublicoArgs) {
  return supabase.rpc("obtener_turnos_fijos_titular_publico", args);
}

export function darDeBajaTurnoFijo(args: BajaTurnoFijoPublicoArgs) {
  return supabase.rpc("baja_turno_fijo_publico", args);
}
