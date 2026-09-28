import { useDialogFocus } from "../components/useDialogFocus";
// ReponerStockModal — reponer stock de un producto + calculadora de costo
// unitario en vivo + confirmación de cambio de precio vigente (D1). Puerto de
// admin.html: abrirReponerStock (909-918), intentarConfirmarReposicion
// (920-937), guardarReposicion (939-958) y los dos modales (3047-3096).
//
// El paso de confirmación de precio NO reusa ConfirmModal: ahí "cancelar" y
// "confirmar" son las dos únicas opciones (una aborta, la otra actúa).
// Acá hay dos caminos reales, NINGUNO de los cuales es "cancelar" — los dos
// guardan la reposición, solo difieren en si además pisan `precio_venta`
// ("Dejar como está" / "Actualizar precio"). Por eso es su propio bloque,
// mismo criterio que documenta el header de ConfirmModal.tsx ("no es un
// ModalSystem"). El click en su overlay SÍ es un cancelar real (aborta ese
// paso y vuelve al formulario sin guardar nada) — paridad exacta con el
// legacy, que en ese click solo hacía `setConfirmActualizarPrecioModal(null)`
// sin llamar a guardarReposicion.
//
// Mismo criterio que ProductoFormModal: valida y arma los datos acá, se los
// entrega a `onGuardar` ya resueltos — no sabe nada de Supabase. Los errores
// de guardado los muestra ProductosView por toast (no acá), el modal sigue
// abierto y lo tipeado no se pierde.

import { useState, type FormEvent } from "react";
import { formatearMoneda } from "../../../lib/format";
import { calcularCostoUnitario, type Producto } from "./productos.logic";

export interface DatosReposicion {
  cantidad: number;
  costoTotal: number;
  nota: string | null;
  precioVentaSimulado: number;
  actualizarPrecioVenta: boolean;
}

export interface ReponerStockModalProps {
  producto: Producto;
  cantidadInicial?: number;
  guardando: boolean;
  onGuardar: (datos: DatosReposicion) => void;
  onClose: () => void;
}

interface FormReposicion {
  cantidad: string;
  costoTotal: string;
  precioVentaSimulado: string;
  nota: string;
}

export function ReponerStockModal({ producto, guardando, onGuardar, onClose, cantidadInicial }: ReponerStockModalProps) {
  const [form, setForm] = useState<FormReposicion>({
    cantidad: cantidadInicial ? String(cantidadInicial) : "",
    costoTotal: "",
    precioVentaSimulado: String(producto.precio_venta),
    nota: "",
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [confirmarPrecio, setConfirmarPrecio] = useState<{ nuevoPrecio: number } | null>(null);

  const cantidadNum = Number(form.cantidad) || 0;
  const costoTotalNum = Number(form.costoTotal) || 0;
  const costoUnitario = calcularCostoUnitario(cantidadNum, costoTotalNum);

  function cerrar() {
    if (guardando) return;
    onClose();
  }

  // admin.html:923-937 (intentarConfirmarReposicion). La comparación contra
  // el precio vigente para decidir si hace falta confirmar es SIEMPRE entre
  // valores numéricos ya normalizados (`Number(...) || 0` de un lado,
  // `producto.precio_venta` del otro, que ya es number) — nunca entre los
  // strings crudos de los inputs, para no disparar la confirmación por una
  // diferencia puramente de formato ("10000" vs "10000.00").
  function intentarConfirmar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      setMensaje("La cantidad tiene que ser mayor a 0.");
      return;
    }
    if (!form.costoTotal.trim()) {
      setMensaje("Ingresá el costo conocido del lote. Si no lo conocés, podés volver y reponer más tarde.");
      return;
    }
    if (!(costoTotalNum >= 0)) {
      setMensaje("El costo total no puede ser negativo.");
      return;
    }
    const precioSimuladoNum = Number(form.precioVentaSimulado) || 0;
    if (precioSimuladoNum !== Number(producto.precio_venta)) {
      setConfirmarPrecio({ nuevoPrecio: precioSimuladoNum });
      return;
    }
    guardar(false);
  }

  // El valor de precio que viaja es siempre `precioSimuladoNum`, calculado
  // acá una única vez — nunca se vuelve a leer/parsear `form.precioVentaSimulado`
  // en ningún otro punto (ni en el patch local que hace ProductosView, que
  // recibe este mismo número, no el string del input).
  function guardar(actualizarPrecioVenta: boolean) {
    const precioSimuladoNum = Number(form.precioVentaSimulado) || 0;
    onGuardar({
      cantidad: cantidadNum,
      costoTotal: costoTotalNum,
      nota: form.nota.trim() || null,
      precioVentaSimulado: precioSimuladoNum,
      actualizarPrecioVenta,
    });
  }

  const dialogFocus = useDialogFocus(onClose, guardando, { modal: true });

  const precioFocus = useDialogFocus(() => setConfirmarPrecio(null), guardando, { modal: true, active: !!confirmarPrecio });

  return (
    <>
      <div
        className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
        onClick={cerrar}
      >
        <div
          className="modal-pop outline-none flex max-h-[calc(100dvh-32px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface p-[22px]"
          onClick={(e) => e.stopPropagation()}
          {...dialogFocus}
        role="dialog"
          aria-modal="true"
          aria-label={`Reponer stock · ${producto.nombre}`}
        >
          <div className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Reponer stock · {producto.nombre}
          </div>
          {/* noValidate: la validación de cantidad/costo negativos es la
              nuestra (mensaje inline de abajo), no la nativa del navegador —
              sin esto, `min="1"`/`min="0"` bloquearían el evento submit en
              silencio antes de que corra intentarConfirmar. */}
          <form onSubmit={intentarConfirmar} noValidate aria-describedby={mensaje ? "operacion-error" : undefined} className="mt-3 flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 flex flex-col gap-3">
            <label className="text-xs text-muted">
              Cantidad
              <input
                type="number"
                min="1"
                step="1"
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                value={form.cantidad}
                onChange={(e) => setForm((p) => ({ ...p, cantidad: e.target.value }))}
                disabled={guardando}
              />
            </label>
            <label className="text-xs text-muted">
              Costo total
              <input
                type="number"
                min="0"
                step="any"
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                value={form.costoTotal}
                onChange={(e) => setForm((p) => ({ ...p, costoTotal: e.target.value }))}
                disabled={guardando}
              />
            </label>
            {cantidadNum > 0 && (
              <p className="text-xs text-muted">Costo unitario: {form.costoTotal.trim() ? formatearMoneda(costoUnitario, { maximumFractionDigits: 2 }) : "Sin informar"}</p>
            )}
            {form.costoTotal.trim() && cantidadNum > 0 && <p className="text-xs text-muted">Margen por unidad: {formatearMoneda(Number(form.precioVentaSimulado) - costoUnitario)}</p>}
            <label className="text-xs text-muted">
              Precio de venta
              <input
                type="number"
                min="0"
                step="any"
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                value={form.precioVentaSimulado}
                onChange={(e) => setForm((p) => ({ ...p, precioVentaSimulado: e.target.value }))}
                disabled={guardando}
              />
            </label>
            <label className="text-xs text-muted">
              Nota (opcional)
              <input
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                placeholder="Ej: compra en Deportes XYZ"
                value={form.nota}
                onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))}
                disabled={guardando}
              />
            </label>
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
                {guardando ? "Guardando..." : "Reponer stock"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {confirmarPrecio && (
        <div
          className="overlay-anim fixed inset-0 z-[51] flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
          onClick={() => setConfirmarPrecio(null)}
        >
          <div
            className="modal-pop outline-none flex max-h-[calc(100dvh-32px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface p-[22px]"
            onClick={(e) => e.stopPropagation()}
            {...precioFocus}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar precio de venta"
          >
            <p className="text-sm text-text">
              Pusiste un precio de venta ({formatearMoneda(confirmarPrecio.nuevoPrecio)}) distinto al vigente del
              producto. ¿Querés actualizar también el precio de venta del producto, o dejarlo como está?
            </p>
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                type="button"
                className="tap-fx rounded-pill border border-border px-4 py-1.5 text-[13px] font-semibold text-muted"
                onClick={() => {
                  setConfirmarPrecio(null);
                  guardar(false);
                }}
              >
                Dejar como está
              </button>
              <button
                type="button"
                className="tap-fx rounded-pill bg-accent px-4 py-1.5 text-[13px] font-semibold text-bg"
                onClick={() => {
                  setConfirmarPrecio(null);
                  guardar(true);
                }}
              >
                Actualizar precio
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
