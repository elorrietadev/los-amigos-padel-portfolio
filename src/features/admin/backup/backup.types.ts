// Tipos del backup admin (E7) — shape exacto de lo que devuelve la RPC
// obtener_ultimo_backup_admin(): { creado, schema_version, contenido }.
// `contenido` es jsonb en la DB (formato de generar_backup_semanal, ver
// backup.api.ts) — se descarga tal cual, sin validar su forma interna: este
// archivo nunca lo interpreta, solo lo transporta a un .json.

export interface UltimoBackupAdmin {
  creado: string; // timestamptz ISO con offset, ej "2026-09-10T17:09:06.968537+00:00"
  schema_version: number;
  contenido: Record<string, unknown>;
}
