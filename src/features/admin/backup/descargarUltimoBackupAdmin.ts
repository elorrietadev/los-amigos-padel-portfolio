// Orquestación de la descarga del backup admin (E7) — fetch de la RPC +
// validación + generación del archivo. `generarArchivo` inyectable a
// propósito (default: Blob + <a download> reales, mismo mecanismo que
// admin.html:1171-1175), para que los tests verifiquen la lógica de
// éxito/error sin tocar el DOM — mismo criterio que exportarStock.ts.

import { obtenerUltimoBackupAdmin } from "./backup.api";
import { esBackupValido, nombreArchivoBackup, serializarBackup } from "./backup.logic";

export interface ResultadoDescargarBackup {
  ok: boolean;
  error?: string;
  // Presente solo si ok:true — para que el llamador pueda mostrar la fecha
  // del backup descargado en el toast sin tener que volver a leer el archivo.
  creado?: string;
}

const MENSAJE_ERROR_GENERICO = "No se pudo descargar el backup. Probá de nuevo.";
const MENSAJE_SIN_BACKUPS = "Todavía no hay ningún backup guardado.";

function descargarBlob(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  link.click();
  URL.revokeObjectURL(url);
}

export async function descargarUltimoBackupAdmin(
  generarArchivo: (contenido: string, nombreArchivo: string) => void = descargarBlob,
): Promise<ResultadoDescargarBackup> {
  const { data, error } = await obtenerUltimoBackupAdmin();
  if (error) {
    return { ok: false, error: MENSAJE_ERROR_GENERICO };
  }
  // La RPC devuelve null (no un array vacío) cuando backups_semanales todavía
  // no tiene ninguna fila — nunca corrió el cron, o es un ambiente nuevo.
  if (data === null) {
    return { ok: false, error: MENSAJE_SIN_BACKUPS };
  }
  if (!esBackupValido(data)) {
    return { ok: false, error: MENSAJE_ERROR_GENERICO };
  }

  generarArchivo(serializarBackup(data), nombreArchivoBackup(data.creado));
  return { ok: true, creado: data.creado };
}
