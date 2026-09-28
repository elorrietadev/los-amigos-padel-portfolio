// Lógica pura del backup admin (E7) — sin Supabase, sin DOM. Nombre de
// archivo, validación de forma y serialización, separados de
// descargarUltimoBackupAdmin.ts (que es el único que toca la RPC y el DOM).

import type { UltimoBackupAdmin } from "./backup.types";

// admin.html:1174 usaba solo la FECHA de `creado` (`data.creado.slice(0,10)`)
// para el nombre. Acá se agrega la HORA (pedido explícito) porque el cron es
// semanal pero nada impide que en algún momento haya más de un backup el
// mismo día — sin hora, dos descargas de días distintos con el mismo prefijo
// de fecha podrían pisarse en la carpeta de Descargas del canchero.
// Deliberadamente la fecha/hora es la de CREACIÓN del backup (`creado`), no
// la del momento del click: el nombre identifica DE QUÉ MOMENTO es la foto,
// no cuándo alguien la bajó — igual criterio que el legacy.
// Fecha/hora LOCAL del dispositivo que ejecuta esto (getFullYear/getHours,
// no UTC) — mismo supuesto que el resto del proyecto: el dispositivo del
// canchero está en horario de Argentina, sin conversión de zona horaria
// explícita en ningún lado del código.
export function nombreArchivoBackup(creadoISO: string): string {
  const d = new Date(creadoISO);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Los_Amigos_Padel_Backup_${y}-${m}-${day}_${hh}-${mm}.json`;
}

// Guard mínimo contra una respuesta con forma inesperada de la RPC. Nunca
// debería dispararse (el guard real vive en SQL), pero `Json` es
// estructuralmente abierto en los tipos generados — sin este chequeo, una
// respuesta corrupta generaría un .json "válido" pero sin datos reales
// adentro, en vez de un error explícito.
export function esBackupValido(data: unknown): data is UltimoBackupAdmin {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.creado === "string" &&
    typeof d.schema_version === "number" &&
    typeof d.contenido === "object" &&
    d.contenido !== null
  );
}

// El objeto completo (creado + schema_version + contenido), no solo
// `contenido` como hacía el legacy (admin.html:1171) — `contenido` ya llega
// como objeto (columna jsonb, sin pasar por un segundo JSON.parse/stringify
// en ningún punto del camino), así que agregar creado/schema_version alrededor
// no duplica nada: es una sola serialización, y el archivo queda identificable
// por sí mismo aunque alguien le cambie el nombre.
export function serializarBackup(backup: UltimoBackupAdmin): string {
  return JSON.stringify(backup, null, 2);
}
