// DevolucionModal (D6) — form de devolución de un ítem de venta. Puerto
// nuevo, sin equivalente en admin.html (Devoluciones no existía en el
// legacy). Mismo patrón que ReponerStockModal: valida y arma los datos acá,
// se los entrega a `onGuardar` ya resueltos — no sabe nada de Supabase ni de
// Historial/Productos. A diferencia de ReponerStockModal (que tiene un paso
// de confirmación aparte para el precio), acá no hay ningún caso que
// requiera un segundo paso: `registrar_devolucion` no tiene bandera de
// fuerza, así que enviar el form ES la confirmación.
//
// Recibe primitivos (productoNombre/cantidadVigente/precioSnapshot) en vez
// del ItemVentaConDetalle completo de Historial — Devoluciones es su propio
// dominio (mismo criterio que ventas/ separado de historial/) y no necesita
// conocer el shape entero de Historial para renderizar un form.

import { useDialogFocus } from "../components/useDialogFocus";
import { useState, type FormEvent } from "react";
import { formatearMoneda } from "../../../lib/format";
import { cantidadDevolucionValida, type MedioReembolso } from "./devoluciones.logic";

export interface DatosDevolucion {
  cantidad: number;
  motivo: string | null;
  medioReembolso: MedioReembolso;
}

export interface DevolucionModalProps {
  productoNombre: string;
  cantidadVigente: number;
  precioSnapshot: number;
  guardando: boolean;
  onGuardar: (datos: DatosDevolucion) => void;
  onClose: () => void;
}

const MEDIOS_REEMBOLSO: ReadonlyArray<{ key: MedioReembolso; label: string }> = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
];

export function DevolucionModal({
  productoNombre,
  cantidadVigente,
  precioSnapshot,
  guardando,
  onGuardar,
  onClose,
}: DevolucionModalProps) {
  const dialogFocus = useDialogFocus(onClose, guardando, { modal: true });
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [medioReembolso, setMedioReembolso] = useState<MedioReembolso>("efectivo");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cantidadNum = Number(cantidad) || 0;
  const montoADevolver = cantidadNum > 0 ? cantidadNum * precioSnapshot : 0;

  function cerrar() {
    if (guardando) return;
    onClose();
  }

  // noValidate: mismo motivo que ReponerStockModal — la validación de rango
  // es la nuestra (mensaje inline), no la nativa del navegador vía
  // min/max, que bloquearía el submit en silencio antes de que corra esto.
  function confirmar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    if (!cantidadDevolucionValida(cantidadNum, cantidadVigente)) {
      setMensaje(`La cantidad tiene que ser un entero entre 1 y ${cantidadVigente}.`);
      return;
    }
    onGuardar({ cantidad: cantidadNum, motivo: motivo.trim() || null, medioReembolso });
  }

  return (
    <div
      className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
      onClick={cerrar}
    >
      <div
        {...dialogFocus}
        className="modal-pop outline-none flex max-h-[calc(100dvh-32px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface p-[22px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Devolver · ${productoNombre}`}
      >
        <div className="text-[11px] font-bold tracking-wide text-muted uppercase">Devolver · {productoNombre}</div>
        <p className="mt-1 text-xs text-muted">Cantidad disponible para devolver: {cantidadVigente}</p>
        <form onSubmit={confirmar} noValidate aria-describedby={mensaje ? "operacion-error" : undefined} className="mt-3 flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 flex flex-col gap-3">
          <label className="text-xs text-muted">
            Cantidad
            <input
              type="number"
              min="1"
              max={cantidadVigente}
              step="1"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={guardando}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MEDIOS_REEMBOLSO.map((op) => (
              <button
                key={op.key}
                type="button"
                onClick={() => setMedioReembolso(op.key)}
                disabled={guardando}
                className={`rounded-pill border px-2 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  medioReembolso === op.key ? "border-success bg-success/15 text-success" : "border-border text-muted"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-muted">
            Motivo (opcional)
            <input
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
              placeholder="Ej: producto en mal estado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={guardando}
            />
          </label>
          {cantidadNum > 0 && <p className="text-xs text-muted">Monto a devolver: {formatearMoneda(montoADevolver)}</p>}
          {mensaje && <p id="operacion-error" role="alert" className="text-xs text-error">{mensaje}</p>}
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-border pt-3">
            <button
              type="button"
              className="tap-fx rounded-pill border border-border px-4 py-1.5 text-[13px] font-semibold text-muted disabled:opacity-50"
              onClick={cerrar}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="tap-fx rounded-pill bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent disabled:opacity-50"
              disabled={guardando}
            >
              {guardando ? "Guardando..." : "Devolver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
