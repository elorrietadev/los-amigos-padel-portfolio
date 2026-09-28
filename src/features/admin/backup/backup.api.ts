// Capa de transporte del backup admin (E7) — único punto que toca Supabase.
//
// admin.html:1166 (descargarUltimoBackup) leía `backups_semanales` con un
// SELECT directo — eso ya no es posible ni deseable: `authenticated` no tiene
// ningún GRANT sobre esa tabla (confirmado antes de escribir esto, ver
// informe de la sesión) y reabrirla completa al cliente sería más superficie
// de la necesaria para "descargar el más reciente". En su lugar, una RPC
// nueva y mínima (obtener_ultimo_backup_admin, SECURITY DEFINER): valida
// is_admin() server-side, devuelve SOLO el último backup (nunca una lista),
// no permite restaurar ni generar. `anon` no tiene EXECUTE; `authenticated`
// sí, pero el guard interno de la función corta antes de tocar la tabla si
// is_admin() da false — confirmado con pruebas reales (anon: permission
// denied a nivel GRANT; authenticated no-admin: no_autorizado; admin real:
// devuelve el backup completo).
//
// Devuelve `data: null` cuando la tabla está vacía (nunca corrió el cron
// todavía) — no es un error, así que no se envuelve en ninguna excepción acá.

import { supabase } from "../../../lib/supabase";

export function obtenerUltimoBackupAdmin() {
  return supabase.rpc("obtener_ultimo_backup_admin");
}
