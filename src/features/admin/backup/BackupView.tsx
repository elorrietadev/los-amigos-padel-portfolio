// BackupView (R2) — "Descargar último backup" como destino propio de
// navegación. Movido tal cual desde BloqueosView (E7, admin.html:1161-1176):
// mismo estado, misma función, mismo texto — Bloqueos queda desde acá
// dedicado solo a horarios/teléfonos bloqueados, sin este contenido
// duplicado. No se tocó backup.api.ts ni la RPC.

import { useState } from "react";
import { descargarUltimoBackupAdmin } from "./descargarUltimoBackupAdmin";

export interface BackupViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
}

export function BackupView({ mostrarToast }: BackupViewProps) {
  const [descargandoBackup, setDescargandoBackup] = useState(false);

  async function alDescargarBackup() {
    if (descargandoBackup) return;
    setDescargandoBackup(true);
    try {
      const resultado = await descargarUltimoBackupAdmin();
      setDescargandoBackup(false);
      if (!resultado.ok) {
        mostrarToast(resultado.error ?? "No se pudo descargar el backup. Probá de nuevo.", "error");
        return;
      }
      const fecha = resultado.creado ? new Date(resultado.creado).toLocaleString("es-AR") : "";
      mostrarToast(fecha ? `Backup descargado (${fecha}).` : "Backup descargado.", "ok");
    } catch { mostrarToast("No se pudo descargar el backup.", "error"); }
    finally { setDescargandoBackup(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="glass-blur rounded-lg border border-border bg-surface-glass p-3.5">
        <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Backup de la base</div>
        <p className="mb-3 text-xs text-muted">Se guarda una copia automática todos los domingos.</p>
        <button
          type="button"
          onClick={alDescargarBackup}
          disabled={descargandoBackup}
          className="tap-fx rounded-pill border border-border px-4 py-2 text-[13px] font-semibold text-muted disabled:opacity-50"
        >
          {descargandoBackup ? "Descargando..." : "Descargar último backup"}
        </button>
      </section>
    </div>
  );
}
