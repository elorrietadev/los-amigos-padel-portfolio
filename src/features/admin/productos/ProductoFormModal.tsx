import { useDialogFocus } from "../components/useDialogFocus";
// Owns uploaded temporaries for this editing session. Persist product first;
// commit the new path and remove the original only after confirmed success.
// Base fields can be persisted even if catalogue saving fails; the view keeps
// that product ID for retries while this form releases the failed temporary.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { borrarImagenProducto, type DatosCatalogoPublico } from "./productos.api";
import type { Producto } from "./productos.logic";
import { ImagenProductoField } from "./ImagenProductoField";

export interface DatosProducto {
  nombre: string;
  precioVenta: number;
  stockMinimo: number;
  stockInicial?: number;
}

export interface ProductoFormModalProps {
  // undefined = alta, definido = edición (precarga sus valores).
  producto?: Producto;
  guardando: boolean;
  onGuardar: (datosBase: DatosProducto, datosCatalogo: DatosCatalogoPublico) => Promise<boolean>;
  onClose: () => void;
}

interface FormProducto {
  nombre: string;
  precioVenta: string;
  stockMinimo: string;
  // PUBLIC-R4 — catálogo público. Separado de DatosProducto/actualizarProducto
  // (ver comentario en productos.api.ts), pero un solo formulario/"Guardar"
  // para el admin.
  mostrarEnCatalogo: boolean;
  destacado: boolean;
  categoriaPublica: string;
  descripcionPublica: string;
  ordenPublico: string;
  imagenPath: string | null;
}

// Límite de la descripción corta del catálogo — es una bajada de línea, no
// una ficha técnica (mismo espíritu que "no CMS complejo" del pedido).
const DESCRIPCION_PUBLICA_MAX = 160;

export function ProductoFormModal({ producto, guardando, onGuardar, onClose }: ProductoFormModalProps) {
  const original = useRef(producto?.imagen_path ?? null);
  const temporal = useRef<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => () => { if (temporal.current) void borrarImagenProducto(temporal.current); }, []);
  function cambiarImagen(path: string | null) {
    if (temporal.current && temporal.current !== path) void borrarImagenProducto(temporal.current);
    temporal.current = path !== original.current ? path : null;
    setForm((prev) => ({ ...prev, imagenPath: path }));
  }
  const esNuevo = useRef(!producto).current;
  const [stockInicial, setStockInicial] = useState("0");
  const [form, setForm] = useState<FormProducto>(() => ({
    nombre: producto?.nombre ?? "",
    precioVenta: producto ? String(producto.precio_venta) : "",
    stockMinimo: producto ? String(producto.stock_minimo) : "0",
    mostrarEnCatalogo: producto?.mostrar_en_catalogo ?? false,
    destacado: producto?.destacado ?? false,
    categoriaPublica: producto?.categoria_publica ?? "",
    descripcionPublica: producto?.descripcion_publica ?? "",
    ordenPublico: producto?.orden_publico != null ? String(producto.orden_publico) : "",
    imagenPath: producto?.imagen_path ?? null,
  }));
  const [mensaje, setMensaje] = useState<string | null>(null);

  function cerrar() {
    if (guardando) return;
    onClose();
  }

  // admin.html:892-897 (validación de guardarProducto) — mismos mensajes.
  async function intentarGuardar(e: FormEvent) {
    e.preventDefault();
    if (guardando || subiendo) return;
    setMensaje(null);
    const nombre = form.nombre.trim();
    const precioVenta = Number(form.precioVenta);
    const stockMinimo = Number(form.stockMinimo) || 0;
    if (!nombre) {
      setMensaje("Poné un nombre para el producto.");
      return;
    }
    if (!(precioVenta >= 0)) {
      setMensaje("El precio de venta no puede ser negativo.");
      return;
    }
    if (esNuevo && (!Number.isInteger(Number(stockInicial)) || Number(stockInicial) < 0)) {
      setMensaje("El stock inicial debe ser un entero mayor o igual a cero."); return;
    }
    const ordenPublico = form.ordenPublico.trim() === "" ? null : Number(form.ordenPublico);
    let guardado = false;
    try { guardado = await onGuardar(
      { nombre, precioVenta, stockMinimo, ...(esNuevo && Number(stockInicial) > 0 ? { stockInicial: Number(stockInicial) } : {}) },
      {
        mostrarEnCatalogo: form.mostrarEnCatalogo,
        destacado: form.destacado,
        categoriaPublica: form.categoriaPublica.trim() || null,
        descripcionPublica: form.descripcionPublica.trim() || null,
        ordenPublico: ordenPublico != null && Number.isFinite(ordenPublico) ? ordenPublico : null,
        imagenPath: form.imagenPath,
      },
    );
    } catch { setMensaje("No se pudo guardar el producto. Probá de nuevo."); }
    if (guardado) {
      temporal.current = null;
      if (original.current && original.current !== form.imagenPath) void borrarImagenProducto(original.current);
      onClose();
    } else {
      cambiarImagen(original.current);
    }
  }

  const dialogFocus = useDialogFocus(onClose, guardando, { modal: true });
  return (
    <div
      className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
      onClick={cerrar}
    >
      <div
        className="modal-pop outline-none flex max-h-[calc(100dvh-32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface p-[22px]"
        onClick={(e) => e.stopPropagation()}
        {...dialogFocus}
        role="dialog"
        aria-modal="true"
        aria-label={esNuevo ? "Nuevo producto" : "Editar producto"}
      >
        <div className="text-[11px] font-bold tracking-wide text-muted uppercase">
          {esNuevo ? "Nuevo producto" : "Editar producto"}
        </div>
        {/* noValidate: la validación de "precio negativo" es la nuestra (mensaje
            inline de abajo), no la nativa del navegador — sin esto, un `min="0"`
            bloquearía el evento submit en silencio antes de que corra
            intentarGuardar, sin mostrar ningún mensaje. */}
        <form onSubmit={intentarGuardar} noValidate aria-describedby={mensaje ? "operacion-error" : undefined} className="mt-3 flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 flex flex-col gap-3">
          <label className="text-xs text-muted">
            Nombre
            <input
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
              value={form.nombre}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              disabled={guardando}
            />
          </label>
          <label className="text-xs text-muted">
            Precio de venta
            <input
              type="number"
              min="0"
              step="any"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
              value={form.precioVenta}
              onChange={(e) => setForm((p) => ({ ...p, precioVenta: e.target.value }))}
              disabled={guardando}
            />
          </label>
          <label className="text-xs text-muted">
            Avisar cuando el stock llegue a
            <input
              type="number"
              min="0"
              step="1"
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
              value={form.stockMinimo}
              onChange={(e) => setForm((p) => ({ ...p, stockMinimo: e.target.value }))}
              disabled={guardando}
            />
          </label>

          {esNuevo && <label className="text-xs text-muted">
            Stock inicial
            <input type="number" min="0" step="1" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} disabled={guardando} className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text" />
            <span className="mt-2 block">Costo opcional para crear el producto sin stock. Si elegís stock inicial, al guardar continuarás con Reponer stock para confirmar el lote, su costo y el margen antes de incorporarlo.</span>
          </label>}
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Catálogo público</span>

            <label className="flex items-center gap-2 text-xs text-text">
              <input
                type="checkbox"
                checked={form.mostrarEnCatalogo}
                onChange={(e) => setForm((p) => ({ ...p, mostrarEnCatalogo: e.target.checked }))}
                disabled={guardando}
              />
              Mostrar en el catálogo público
            </label>

            <label className="flex items-center gap-2 text-xs text-text">
              <input
                type="checkbox"
                checked={form.destacado}
                onChange={(e) => setForm((p) => ({ ...p, destacado: e.target.checked }))}
                disabled={guardando}
              />
              Destacado
            </label>

            <ImagenProductoField
              imagenPath={form.imagenPath}
              onCambiar={cambiarImagen}
              onSubiendo={setSubiendo}
              disabled={guardando}
            />

            <label className="text-xs text-muted">
              Categoría pública
              <input
                type="text"
                placeholder="Ej: Bebidas"
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                value={form.categoriaPublica}
                onChange={(e) => setForm((p) => ({ ...p, categoriaPublica: e.target.value }))}
                disabled={guardando}
              />
            </label>

            <div>
              {/* span del contador FUERA del <label>: si quedara adentro,
                  getByLabelText("Descripción corta") dejaría de matchear —
                  el nombre accesible de un <label> es TODO su texto
                  descendiente, no solo el texto suelto de "Descripción
                  corta". */}
              <label className="text-xs text-muted">
                Descripción corta
                <textarea
                  rows={2}
                  maxLength={DESCRIPCION_PUBLICA_MAX}
                  placeholder="Se muestra debajo del nombre en el catálogo"
                  className="mt-1 w-full resize-none rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                  value={form.descripcionPublica}
                  onChange={(e) => setForm((p) => ({ ...p, descripcionPublica: e.target.value }))}
                  disabled={guardando}
                />
              </label>
              <span className="mt-0.5 block text-right text-[10.5px] text-muted">
                {form.descripcionPublica.length}/{DESCRIPCION_PUBLICA_MAX}
              </span>
            </div>

            <label className="text-xs text-muted">
              Orden en el catálogo (menor = primero)
              <input
                type="number"
                step="1"
                placeholder="Opcional"
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text"
                value={form.ordenPublico}
                onChange={(e) => setForm((p) => ({ ...p, ordenPublico: e.target.value }))}
                disabled={guardando}
              />
            </label>
          </div>

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
              disabled={guardando || subiendo}
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
