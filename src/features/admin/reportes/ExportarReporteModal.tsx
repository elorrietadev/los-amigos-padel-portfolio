import { useDialogFocus } from "../components/useDialogFocus";
// Modal de exportación del Reporte de Caja y Actividad (E5) — mismo patrón
// visual que ConfirmModal/PaymentModal (overlay + card), con su propio cuerpo
// (elegir rango) porque no encaja en el molde de "mensaje + 2 botones" de
// ConfirmModal.
//
// Todo-o-nada (punto 11): si exportarCajaActividad falla, el modal NO se
// cierra — queda con el rango elegido tal cual, listo para reintentar con el
// mismo botón, sin perder la selección.

import { DatePicker } from "../../../components/ui/DatePicker";
import { useState } from "react";
import { exportarCajaActividad } from "./exportCajaActividad";
import { calcularRango } from "./reportes.logic";
import type { FiltroRangoRapido } from "./reportes.types";

export interface ExportarReporteModalProps {
  // El llamador decide el punto de partida (ReservasView: si hay un filtro
  // de fecha activo en pantalla, "personalizado" con esa fecha; si no,
  // "semana" — mismo criterio que admin.html:1181-1184, abrirExportModal).
  rangoInicial: FiltroRangoRapido;
  fechaInicial?: string;
  ahora: number;
  nombreCancha: string;
  onClose: () => void;
  onExito: () => void;
}

const OPCIONES: ReadonlyArray<{ key: FiltroRangoRapido; label: string }> = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Esta semana" },
  { key: "semanaAnterior", label: "Semana anterior" },
  { key: "mes", label: "Este mes" },
  { key: "personalizado", label: "Personalizado" },
];

export function ExportarReporteModal({
  rangoInicial,
  fechaInicial,
  ahora,
  nombreCancha,
  onClose,
  onExito,
}: ExportarReporteModalProps) {
  const [filtro, setFiltro] = useState<FiltroRangoRapido>(rangoInicial);
  const [desde, setDesde] = useState(fechaInicial ?? "");
  const [hasta, setHasta] = useState(fechaInicial ?? "");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rango = calcularRango(filtro, ahora, { desde, hasta });

  async function generar() {
    if (generando) return; // evita doble click / exportaciones simultáneas
    if (!rango) {
      setError("Elegí un rango de fechas válido (desde tiene que ser anterior o igual a hasta).");
      return;
    }
    setError(null);
    setGenerando(true);
    try {
      const resultado = await exportarCajaActividad(rango, ahora, nombreCancha);
      setGenerando(false);
      if (!resultado.ok) {
        // El modal queda abierto con el rango tal cual quedó elegido, listo
        // para reintentar — no se pierde la selección.
        setError(resultado.error ?? "No se pudo generar el reporte. Probá de nuevo.");
        return;
      }
      onExito();
      onClose();
    } catch { setError("No se pudo generar o descargar el reporte. Probá de nuevo."); }
    finally { setGenerando(false); }
  }

  const dialogFocus = useDialogFocus(onClose, generando, { modal: true });

  return (
    <div
      className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
      onClick={() => {
        if (!generando) onClose();
      }}
    >
      <div
        className="modal-pop outline-none flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden w-full max-w-[380px] rounded-[16px] border border-border bg-surface p-[22px]"
        onClick={(e) => e.stopPropagation()}
        {...dialogFocus}
        role="dialog"
        aria-modal="true"
        aria-describedby={error ? "export-error" : undefined}
        aria-label="Exportar reporte de caja y actividad"
      >
        <div className="mb-3 text-[13px] font-bold tracking-wide text-text uppercase">
          Exportar reporte de caja y actividad
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="flex flex-wrap gap-1.5">
          {OPCIONES.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setFiltro(o.key)}
              disabled={generando}
              className={`tap-fx rounded-pill border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                filtro === o.key ? "border-accent bg-accent/15 text-accent" : "border-border text-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {filtro === "personalizado" && (
          <div className="mt-3 flex gap-2.5">
            <div className="min-w-0 flex-1 text-xs text-muted">
              Desde
              <DatePicker aria-label="Desde"
                value={desde}
                max={hasta || undefined}
                onChange={setDesde}
                disabled={generando}
                className="mt-1"
              />
            </div>
            <div className="min-w-0 flex-1 text-xs text-muted">
              Hasta
              <DatePicker aria-label="Hasta"
                value={hasta}
                min={desde || undefined}
                onChange={setHasta}
                disabled={generando}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {rango && <p className="mt-3 text-xs text-muted">Rango: {rango.desde} a {rango.hasta}</p>}
        {error && <p role="alert" id="export-error" className="mt-2 text-xs text-error">{error}</p>}

        </div>
        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={generando}
            className="tap-fx rounded-pill border border-border px-4 py-1.5 text-[13px] font-semibold text-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={generar}
            disabled={generando}
            className="tap-fx rounded-pill bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent disabled:opacity-50"
          >
            {generando ? "Generando..." : "Generar Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
