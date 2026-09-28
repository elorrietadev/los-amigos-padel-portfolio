// Capa de transporte de teléfonos bloqueados (C5) — tabla propia
// `telefonos_bloqueados` (PK = telefono, sin relación con `reservas`), mismo
// patrón que reservas.api.ts/turnosFijos.api.ts: una función por llamada, sin
// decidir loading/cache/guards/patch local — eso vive en
// useTelefonosBloqueados.ts.

import { supabase } from "../../../lib/supabase";

// admin.html:621 (dentro de cargarTodo) — mismo orden (más reciente primero).
export function obtenerTelefonosBloqueados() {
  return supabase.from("telefonos_bloqueados").select("*").order("creado", { ascending: false });
}

// admin.html:1062 (bloquearTelefono). `.select().single()` (a diferencia del
// insert crudo del legacy) para poder patchear la lista local sin refetch —
// mismo criterio que crearTurnoFijo/crearBloqueo. Si `telefono` ya existe,
// esto falla por la PK duplicada (ver useTelefonosBloqueados.ts para el
// mensaje que se le muestra al usuario).
export function bloquearTelefono(telefono: string, motivo: string | null) {
  return supabase.from("telefonos_bloqueados").insert([{ telefono, motivo }]).select().single();
}

// admin.html:1068 (desbloquearTelefono).
export function desbloquearTelefono(telefono: string) {
  return supabase.from("telefonos_bloqueados").delete().eq("telefono", telefono);
}
