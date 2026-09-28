// ProductosView — Catálogo + Reposición de stock (D1) + activar/desactivar
// (D2). Puerto de admin.html: Catálogo (2677-2727), abrirNuevoProducto/
// abrirEditarProducto/guardarProducto (882-907) y abrirReponerStock/
// guardarReposicion (909-958). El toggle activo/inactivo es D2 — no existía
// en el legacy, es una feature nueva sobre la columna `productos.activo`
// (ver auditoría D0: existía en el schema pero nunca se usó desde ningún
// lado).
//
// R2 — "Vender" (D3) e "Historial" (D5) dejaron de ser sub-tabs de esta
// vista: son destinos de navegación propios (VenderView/HistorialView, sin
// cambios en esos componentes). `productos` ahora llega por prop en vez de
// esta vista crear su propia instancia de useProductos — la instancia única
// la levantó AdminShell (mismo criterio que turnosFijos en C3) y la comparte
// con las tres, para que una reposición hecha acá se vea al instante en
// Vender (y una venta hecha en Vender se vea al instante acá) sin fetch
// duplicado. Ver AdminShell.tsx.
//
// Errores de guardado (crear/editar/reponer/activar) se avisan por TOAST y el
// modal (o el estado local) queda como estaba — mismo patrón que
// confirmarPago en ReservasView. La validación de cliente (nombre vacío,
// precio negativo, cantidad/costo inválidos) es inline dentro de cada modal,
// porque nunca llega a pisar al servidor.
//
// R7 — rediseño puramente visual/estructural: CERO cambios en las funciones
// de arriba (confirmarGuardarProducto/confirmarCambiarActivo/
// confirmarReposicion/confirmarExportarStock) ni en ProductoFormModal/
// ReponerStockModal (fuera de alcance — ya usan el lenguaje visual de
// modales del resto del admin, no son las "cards grandes" del pedido). Lo
// nuevo es la card de catálogo: Editar/Reponer stock/Activar-Desactivar
// pasan de 3 botones apilados a un menú de 3 puntos (ProductoAccionesMenu,
// abajo) para que la card quede compacta, y el header/buscador/filtro
// adoptan los primitivos R1 (Card/Button/Input/Badge) ya usados en
// Reservas/TurnosFijos/Vender.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreVertical, Package, Plus, Search } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { IconButton } from "../../../components/ui/IconButton";
import { Input } from "../../../components/ui/Input";
import { formatearMoneda } from "../../../lib/format";
import { ChipSelector } from "../turnos-fijos/ChipSelector";
import { exportarStock } from "../reportes/exportarStock";
import {
  actualizarCatalogoPublico,
  actualizarProducto,
  cambiarActivoProducto,
  crearProducto,
  reponerStock,
  type DatosCatalogoPublico,
} from "./productos.api";
import { esStockBajo, filtrarPorNombre, productosConStockBajo, type Producto } from "./productos.logic";
import { ProductoFormModal, type DatosProducto } from "./ProductoFormModal";
import { ReponerStockModal, type DatosReposicion } from "./ReponerStockModal";
import type { UseProductosResult } from "./useProductos";
import { EstadoCatalogo } from "./EstadoCatalogo";

export interface ProductosViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  productos: UseProductosResult;
}

// D2 — filtro de catálogo por estado. Default "activos": es la vista de uso
// diario (reponer, revisar stock); "inactivos"/"todos" son para gestión del
// catálogo viejo. No vive en productos.logic.ts: es una decisión pura de
// presentación de esta vista, no una regla de negocio reusable.
type FiltroActivo = "activos" | "inactivos" | "todos";

const FILTRO_ACTIVO_OPCIONES: readonly FiltroActivo[] = ["activos", "inactivos", "todos"];
const FILTRO_ACTIVO_LABELS: Record<FiltroActivo, string> = {
  activos: "Activos",
  inactivos: "Inactivos",
  todos: "Todos",
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function ProductosView({ mostrarToast, productos }: ProductosViewProps) {
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroActivo, setFiltroActivo] = useState<FiltroActivo>("activos");

  // undefined en `producto` = alta, definido = edición — mismo criterio
  // unificado que el legacy (productoModal.id: null).
  const [formModal, setFormModal] = useState<{ producto?: Producto } | null>(null);
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  const [stockInicial, setStockInicial] = useState<number | undefined>();
  const [reponerModal, setReponerModal] = useState<Producto | null>(null);
  const [guardandoReposicion, setGuardandoReposicion] = useState(false);

  // D2 — id del producto cuyo activar/desactivar está en vuelo (mismo patrón
  // que desbloqueandoId/eliminandoId de otras vistas): deshabilita solo el
  // botón de esa card, no toda la vista.
  const [cambiandoActivoId, setCambiandoActivoId] = useState<string | null>(null);

  // R7 — menú de 3 puntos: un solo id abierto a la vez (abrir el de una card
  // cierra el de cualquier otra automáticamente).
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);

  // E6 — export del Reporte de Productos/Stock. Sin modal de rango (a
  // diferencia de Exportar de Reservas): es una foto del momento, no hay
  // fecha que elegir.
  const [exportandoStock, setExportandoStock] = useState(false);

  // R2 — el toast de productos.error se movió a AdminShell (dueño único de
  // la instancia compartida con Vender/Historial): si se quedara acá
  // duplicaría el aviso ahora que las tres quedan siempre montadas.

  // D2 — el filtro por estado corre ANTES que el de nombre (mismo orden que
  // el legacy aplicaba filtro-de-nombre sobre la fuente ya acotada). Si se
  // desactiva un producto estando parado en "Activos", desaparece solo de acá
  // en el próximo render (ningún código especial: `productos.productos` ya
  // trae `activo:false` vía patch local, y este filtro se recalcula siempre).
  const productosPorEstado =
    filtroActivo === "activos"
      ? productos.productos.filter((p) => p.activo)
      : filtroActivo === "inactivos"
        ? productos.productos.filter((p) => !p.activo)
        : productos.productos;
  const productosFiltrados = filtrarPorNombre(productosPorEstado, filtroNombre);

  // D2 — el banner agregado de stock bajo cuenta SOLO productos activos,
  // sin importar qué filtro esté viendo el usuario ahora mismo: no tiene
  // sentido alertar sobre reponer algo que ya se dejó de vender. Se resuelve
  // filtrando acá antes de llamar a productosConStockBajo (que sigue siendo
  // genérica, sin saber nada de `activo`) — no hizo falta tocar
  // productos.logic.ts para esto.
  const stockBajo = productosConStockBajo(productos.productos.filter((p) => p.activo));

  function cerrarFormModal() {
    if (guardandoProducto) return;
    setFormModal(null);
  }

  // admin.html:890-907 (guardarProducto) — alta y edición unificadas acá,
  // como en el legacy, según si `formModal.producto` está definido.
  //
  // PUBLIC-R4 — dos UPDATE/INSERT separados (base + catálogo, ver comentario
  // en actualizarCatalogoPublico) detrás de un solo "Guardar": si el primero
  // falla, ni se intenta el segundo. Si el primero funciona pero el segundo
  // falla, el producto queda guardado con sus campos base al día pero el
  // catálogo público sin el cambio — se avisa con un toast propio (distinto
  // del de "no se pudo guardar") y el estado local se patchea con lo que sí
  // se confirmó en el servidor, nunca con lo que se intentó mandar.
  async function confirmarGuardarProducto(datosBase: DatosProducto, datosCatalogo: DatosCatalogoPublico) {
    if (guardandoProducto || !formModal) return false;
    setGuardandoProducto(true);
    const editando = formModal.producto;
    try {
      const { data: filaBase, error } = editando
        ? await actualizarProducto(editando.id, datosBase.nombre, datosBase.precioVenta, datosBase.stockMinimo)
        : await crearProducto(datosBase.nombre, datosBase.precioVenta, datosBase.stockMinimo);
      if (error || !filaBase) {
        mostrarToast("No se pudo guardar el producto. Probá de nuevo.", "error");
        return false;
      }
      // Preserve the confirmed ID even if the following request throws.
      // Retrying a partial creation must edit this product, never duplicate it.
      setFormModal({ producto: filaBase });
      if (editando) productos.actualizarProductoLocal(filaBase);
      else productos.agregarProductoLocal(filaBase);

      const { data: filaCompleta, error: errorCatalogo } = await actualizarCatalogoPublico(filaBase.id, datosCatalogo);
      if (errorCatalogo || !filaCompleta) {
        mostrarToast("Se guardó el producto, pero no se pudo actualizar el catálogo público. Probá de nuevo.", "error");
        return false;
      }
      productos.actualizarProductoLocal(filaCompleta);
      mostrarToast(editando ? "Producto actualizado." : "Producto creado.", "ok");
      if (datosBase.stockInicial) {
        setStockInicial(datosBase.stockInicial);
        setReponerModal(filaCompleta);
      }
      return true;
    } catch {
      mostrarToast("No se pudo completar el guardado del producto. Probá de nuevo.", "error");
      return false;
    } finally {
      setGuardandoProducto(false);
    }
  }

  // D2 — activar/desactivar. Remoto primero: el patch local (vía
  // actualizarProductoLocal, reusado de D1 — no hizo falta un método nuevo en
  // useProductos) corre SOLO en la rama de éxito, nunca de forma optimista.
  // Si falla, no se toca el estado local — el producto sigue como estaba y
  // el toast de error es la única señal.
  async function confirmarCambiarActivo(p: Producto) {
    if (cambiandoActivoId) return;
    setCambiandoActivoId(p.id);
    const nuevoActivo = !p.activo;
    const { data: fila, error } = await cambiarActivoProducto(p.id, nuevoActivo);
    setCambiandoActivoId(null);
    if (error || !fila) {
      mostrarToast("No se pudo actualizar el producto. Probá de nuevo.", "error");
      return;
    }
    productos.actualizarProductoLocal(fila);
    mostrarToast(nuevoActivo ? "Producto activado." : "Producto desactivado.", "ok");
  }

  function cerrarReponerModal() {
    if (guardandoReposicion) return;
    setReponerModal(null);
  }

  // admin.html:939-958 (guardarReposicion). `ajustarStockLocal` SOLO corre
  // tras el éxito del RPC — nunca de forma optimista antes de la respuesta.
  // El precio que se patchea es exactamente `datos.precioVentaSimulado`
  // (el número ya resuelto por ReponerStockModal, el mismo que viajó como
  // `p_precio_venta_simulado`) — no se vuelve a derivar de ningún input acá.
  async function confirmarReposicion(datos: DatosReposicion) {
    if (guardandoReposicion || !reponerModal) return;
    setGuardandoReposicion(true);
    const { error } = await reponerStock(
      reponerModal.id,
      datos.cantidad,
      datos.costoTotal,
      datos.nota,
      datos.precioVentaSimulado,
      datos.actualizarPrecioVenta,
    );
    setGuardandoReposicion(false);
    if (error) {
      mostrarToast("No se pudo registrar la reposición. Probá de nuevo.", "error");
      return;
    }
    productos.ajustarStockLocal(reponerModal.id, datos.cantidad, datos.actualizarPrecioVenta ? datos.precioVentaSimulado : null);
    setReponerModal(null);
    mostrarToast("Stock repuesto.", "ok");
  }

  // E6 — todo o nada: si cualquiera de las 2 queries falla, exportarStock no
  // genera archivo (ver exportarStock.ts) — el único feedback es el toast de
  // error, sin estado que limpiar ni rango que conservar.
  async function confirmarExportarStock() {
    if (exportandoStock) return;
    setExportandoStock(true);
    try {
      const resultado = await exportarStock(Date.now());
      setExportandoStock(false);
      if (!resultado.ok) {
        mostrarToast(resultado.error ?? "No se pudo generar el reporte de stock. Probá de nuevo.", "error");
        return;
      }
      mostrarToast("Excel de stock generado.", "ok");
    } catch { mostrarToast("No se pudo generar o descargar el reporte de stock.", "error"); }
    finally { setExportandoStock(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* R2 — data-testid se mantiene a propósito (ProductosView.test.tsx lo
          usa en decenas de lugares vía el helper `catalogo()`) aunque ya no
          haga falta desambiguar de nada: esta vista ya no tiene más
          contenido que el catálogo. Tocar el test file entero por esto no
          aportaba nada. */}
      <div data-testid="catalogo-panel" className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
                <Package size={17} strokeWidth={2} />
              </span>
              <div>
                <h2 className="font-heading text-section-title font-bold text-text">Catálogo de productos</h2>
                <p className="text-body-sm text-text-secondary">
                  {productos.loading ? "Cargando catálogo…" : productos.error ? "Catálogo no disponible" : productos.productos.length === 1 ? "1 producto cargado" : `${productos.productos.length} productos cargados`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={confirmarExportarStock} disabled={exportandoStock}>
                {exportandoStock ? "Generando..." : "Exportar stock"}
              </Button>
              <Button size="sm" onClick={() => setFormModal({})}>
                <Plus size={15} strokeWidth={2.25} /> Nuevo producto
              </Button>
            </div>
          </div>

          <div className="mb-3">
            <ChipSelector
              ariaLabel="Filtrar por estado"
              options={FILTRO_ACTIVO_OPCIONES}
              value={filtroActivo}
              onChange={setFiltroActivo}
              renderLabel={(f) => FILTRO_ACTIVO_LABELS[f]}
            />
          </div>

          <div className="relative mb-3">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            />
            <Input
              aria-label="Buscar por nombre..."
              placeholder="Buscar por nombre..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="pl-9"
            />
          </div>

          {stockBajo.length > 0 && (
            <p className="mb-3 flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning">
              ⚠ {stockBajo.length === 1 ? "1 producto tiene" : `${stockBajo.length} productos tienen`} stock bajo:{" "}
              {stockBajo.map((p) => p.nombre).join(", ")}.
            </p>
          )}

          {/* D2 — tres niveles de "vacío": sin productos en absoluto, sin
              productos para el filtro de estado elegido, o sin coincidencias
              de nombre dentro de ese filtro. Cada uno con su propio mensaje
              para no confundir "no hay nada cargado" con "elegiste un filtro
              que hoy no tiene nada". */}
          <EstadoCatalogo productos={productos} />
          {!productos.loading && !productos.error && productos.productos.length === 0 && <p className="text-sm text-muted">No hay productos cargados todavía.</p>}
          {!productos.loading && !productos.error && productos.productos.length > 0 && productosPorEstado.length === 0 && (
            <p className="text-sm text-muted">
              {filtroActivo === "activos" ? "No hay productos activos." : "No hay productos inactivos."}
            </p>
          )}
          {!productos.loading && !productos.error && productosPorEstado.length > 0 && productosFiltrados.length === 0 && (
            <p className="text-sm text-muted">No se encontraron productos con ese nombre.</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
            {productosFiltrados.map((p) => (
              <ProductoCard
                key={p.id}
                producto={p}
                menuAbierto={menuAbiertoId === p.id}
                guardandoActivo={cambiandoActivoId === p.id}
                onAbrirMenu={() => setMenuAbiertoId(p.id)}
                onCerrarMenu={() => setMenuAbiertoId((id) => (id === p.id ? null : id))}
                onEditar={() => {
                  setFormModal({ producto: p });
                  setMenuAbiertoId(null);
                }}
                onReponer={() => {
                  setStockInicial(undefined);
                  setReponerModal(p);
                  setMenuAbiertoId(null);
                }}
                onToggleActivo={() => {
                  confirmarCambiarActivo(p);
                  setMenuAbiertoId(null);
                }}
              />
            ))}
          </div>
        </Card>
      </div>

      {formModal && (
        <ProductoFormModal
          producto={formModal.producto}
          guardando={guardandoProducto}
          onGuardar={confirmarGuardarProducto}
          onClose={cerrarFormModal}
        />
      )}

      {reponerModal && (
        <ReponerStockModal
          producto={reponerModal}
          cantidadInicial={stockInicial}
          guardando={guardandoReposicion}
          onGuardar={confirmarReposicion}
          onClose={cerrarReponerModal}
        />
      )}
    </div>
  );
}

interface ProductoCardProps {
  producto: Producto;
  menuAbierto: boolean;
  guardandoActivo: boolean;
  onAbrirMenu: () => void;
  onCerrarMenu: () => void;
  onEditar: () => void;
  onReponer: () => void;
  onToggleActivo: () => void;
}

// R7 — card compacta: nombre + menú de 3 puntos arriba, badges de
// estado/stock bajo en el medio, precio/stock abajo. Las 3 acciones
// (Editar/Reponer stock/Activar-Desactivar) que antes eran 3 botones
// apilados ahora viven en `ProductoAccionesMenu`, debajo.
function ProductoCard({
  producto: p,
  menuAbierto,
  guardandoActivo,
  onAbrirMenu,
  onCerrarMenu,
  onEditar,
  onReponer,
  onToggleActivo,
}: ProductoCardProps) {
  const bajo = esStockBajo(p);

  return (
    <div
      data-testid="producto-card"
      className={`ui-transition flex flex-col gap-2 rounded-md border p-3 hover:border-border-strong ${
        !p.activo ? "border-border bg-surface-2 opacity-70" : bajo ? "border-warning/40 bg-surface-2" : "border-border bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-text">{p.nombre}</span>
        <ProductoAccionesMenu
          producto={p}
          abierto={menuAbierto}
          guardandoActivo={guardandoActivo}
          onAbrir={onAbrirMenu}
          onCerrar={onCerrarMenu}
          onEditar={onEditar}
          onReponer={onReponer}
          onToggleActivo={onToggleActivo}
        />
      </div>

      {/* D2 — "Inactivo" es el estado visual principal de la card (badge con
          jerarquía plena); "Stock bajo" para un producto inactivo pasa a ser
          solo texto informativo, sin badge ni fondo, deliberadamente con
          menos peso visual. Un producto activo con stock bajo sigue
          mostrando el badge completo, igual que en D1. */}
      {(!p.activo || bajo || p.mostrar_en_catalogo) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!p.activo && <Badge variant="neutral">Inactivo</Badge>}
          {bajo && !p.activo && <span className="text-[11px] text-warning">⚠ Stock bajo</span>}
          {bajo && p.activo && <Badge variant="warning">⚠ Stock bajo</Badge>}
          {/* PUBLIC-R4 — visibilidad en el catálogo público, para que el
              admin no tenga que abrir "Editar" para saber si un producto ya
              está expuesto. "Destacado" solo se muestra si además está
              visible: destacado sin mostrar_en_catalogo no tiene efecto
              público (misma jerarquía que la vista pública, ver
              catalogo.logic.ts). */}
          {p.mostrar_en_catalogo && <Badge variant="info">En catálogo</Badge>}
          {p.mostrar_en_catalogo && p.destacado && <Badge variant="accent">★ Destacado</Badge>}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-text">{formatearMoneda(p.precio_venta)}</span>
        <span className={bajo && p.activo ? "font-bold text-warning" : "font-bold text-muted"}>Stock: {p.stock_actual}</span>
      </div>
    </div>
  );
}

interface ProductoAccionesMenuProps {
  producto: Producto;
  abierto: boolean;
  guardandoActivo: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onEditar: () => void;
  onReponer: () => void;
  onToggleActivo: () => void;
}

// R7 — menú de 3 puntos: popover posicionado (no un bottom sheet, a
// diferencia de MoreMenu.tsx — ese es específico de la navegación mobile).
// Se cierra solo con click afuera o Escape; abrir el de una card cierra
// cualquier otro (estado `menuAbiertoId` vive en ProductosView, un solo id a
// la vez). Sin ARIA de menú completo (role="menu"/"menuitem" con navegación
// por flechas) a propósito: son 3 botones comunes dentro de un popover con
// aria-haspopup/aria-expanded en el disparador, no un widget de teclado
// completo — más simple y sin comportamiento a medio implementar.
function ProductoAccionesMenu({
  producto,
  abierto,
  guardandoActivo,
  onAbrir,
  onCerrar,
  onEditar,
  onReponer,
  onToggleActivo,
}: ProductoAccionesMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onCerrar();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [abierto, onCerrar]);

  const itemClass =
    "ui-transition w-full px-3.5 py-2.5 text-left text-[13px] font-medium text-text hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <IconButton
        aria-label="Más acciones"
        aria-haspopup="true"
        aria-expanded={abierto}
        variant="ghost"
        size="sm"
        onClick={() => (abierto ? onCerrar() : onAbrir())}
      >
        <MoreVertical size={16} strokeWidth={2} />
      </IconButton>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface-elevated py-1 shadow-lg"
          >
            <button type="button" className={itemClass} onClick={onEditar}>
              Editar
            </button>
            <button type="button" className={itemClass} onClick={onReponer}>
              Reponer stock
            </button>
            <button type="button" className={itemClass} onClick={onToggleActivo} disabled={guardandoActivo}>
              {guardandoActivo ? "Guardando..." : producto.activo ? "Desactivar" : "Activar"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
