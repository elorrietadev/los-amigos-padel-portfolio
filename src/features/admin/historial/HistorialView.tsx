import { invalidarEconomia } from "../economiaEvents";
import "./historial.css";
// HistorialView — D5: historial de ventas, de solo lectura. Vive en su propio
// dominio (historial/) pero se monta como sub-vista de ProductosView (mismo
// contenedor que Catálogo/Vender, ver cabecera de ProductosView.tsx) — con
// montaje CONDICIONAL, no `hidden`: a diferencia de VenderView (D3/D4), acá
// no hay ningún estado transaccional que proteger (carrito, pago). Perder
// filtros/scroll al salir y volver es aceptable, y un refetch fresco al
// reentrar es lo correcto (una venta registrada en "Vender" mientras se
// estaba en otra sub-vista aparece sola, sin pedir un refresh manual).
//
// R7 — rediseño puramente visual/estructural: CERO cambios en useHistorialVentas
// (paginación/patch de devolución), historial.logic.ts ni en confirmarDevolucion
// de abajo. Lo nuevo es la interacción: la lista de ventas pasa de ser una
// pila de cards grandes (fecha/total/pago/items, todo siempre visible) a una
// lista densa (fecha, tipo, total, productos, indicador de devolución) +
// panel de detalle al seleccionar una — mismo patrón lista+detalle que ya usa
// ReservasView (panel sticky en desktop vía useEsDesktop, bottom sheet en
// mobile vía AnimatePresence). El detalle es donde vive el desglose de
// pago/reserva/devuelto-neto y la lista de ítems con las acciones Devolver.

import { DrawerSurface } from "../components/DrawerSurface";
import { useDialogFocus } from "../components/useDialogFocus";
import { DatePicker } from "../../../components/ui/DatePicker";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { MENSAJE_CLAVE_REUTILIZADA, esErrorClaveReutilizada, useClaveIdempotencia } from "../../../lib/idempotencia";
import { AnimatePresence } from "motion/react";
import { Receipt, X } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { IconButton } from "../../../components/ui/IconButton";
import { Input } from "../../../components/ui/Input";
import { SegmentedControl, type SegmentedOption } from "../../../components/ui/SegmentedControl";
import { formatearMoneda } from "../../../lib/format";
import { useEsDesktop } from "../agenda/useEsDesktop";
import { DevolucionModal, type DatosDevolucion } from "../devoluciones/DevolucionModal";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import { esErrorDevolucionExcedeDisponible } from "../devoluciones/devoluciones.logic";
import type { UseProductosResult } from "../productos/useProductos";
import { formatearBadgeFecha, obtenerRangoUltimosDias } from "../reservas/reservas.logic";
import { calcularTotalDevuelto, calcularTotalNeto, filtrarVentasHistorial } from "./historial.logic";
import type { FiltroTipoVenta, ItemVentaConDetalle, VentaConDetalle } from "./historial.types";
import { useHistorialVentas } from "./useHistorialVentas";

const DIAS_RANGO_DEFAULT = 30;

// R9.1 — reemplaza las "pills" finas (border-success/border-border, mismo
// patrón viejo que VenderView) por el SegmentedControl genérico.
const FILTROS_TIPO: ReadonlyArray<SegmentedOption<FiltroTipoVenta>> = [
  { value: "todas", label: "Todas" },
  { value: "atadas", label: "Atadas" },
  { value: "sueltas", label: "Sueltas" },
];

const SPRING_SHEET = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

export interface HistorialViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  productos: UseProductosResult;
}

// D6 — qué venta/ítem tiene el modal de devolución abierto. `ventaId` viaja
// aparte de `item` (que ya trae su propio `id`, el venta_item_id) porque
// patchearDevolucion necesita ubicar la venta contenedora, que el ítem no
// conoce por sí solo.
interface DevolucionModalState {
  ventaId: string;
  item: ItemVentaConDetalle;
}

// R7 — mismo helper local que ReservasView usaba para filas
// etiqueta/valor en el panel de detalle (dos <span> separados, sin necesidad
// de que el texto combinado matchee un único nodo — ver Fila de
// ReservasView.tsx, mismo criterio).
function Fila({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-[13px] last:border-b-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold tabular-nums text-text">{valor}</span>
    </div>
  );
}

export function HistorialView({ mostrarToast, productos }: HistorialViewProps) {
  const esDesktop = useEsDesktop(1200);
  const [desde, setDesde] = useState(() => obtenerRangoUltimosDias(Date.now(), DIAS_RANGO_DEFAULT).inicio);
  const [hasta, setHasta] = useState(() => obtenerRangoUltimosDias(Date.now(), DIAS_RANGO_DEFAULT).fin);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoVenta>("todas");

  const historial = useHistorialVentas(desde, hasta);
  const ventasFiltradas = filtrarVentasHistorial(historial.data, filtroTexto, filtroTipo);

  // R7 — solo el id: la venta seleccionada se resuelve siempre contra
  // `ventasFiltradas` (nunca un objeto guardado aparte), así que un patch de
  // devolución o un cambio de filtro que la deja afuera se reflejan solos en
  // el próximo render, sin ningún efecto dedicado (mismo criterio que
  // `itemSeleccionado` en ReservasView.tsx).
  const [ventaSeleccionadaId, setVentaSeleccionadaId] = useState<string | null>(null);
  const ventaSeleccionada = ventaSeleccionadaId ? (ventasFiltradas.find((v) => v.id === ventaSeleccionadaId) ?? null) : null;

  const [devolucionModal, setDevolucionModal] = useState<DevolucionModalState | null>(null);
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);
  // FINAL-F6 — una clave de idempotencia por devolución: se reusa en los
  // reintentos mientras el modal sigue abierto y se renueva al cerrarlo.
  const claveDevolucion = useClaveIdempotencia();
  useEffect(() => {
    if (!devolucionModal) claveDevolucion.renovar();
  }, [devolucionModal, claveDevolucion]);

  function cerrarDevolucionModal() {
    if (guardandoDevolucion) return;
    setDevolucionModal(null);
  }

  // D6 — patch de historial y de stock SOLO en la rama de éxito, nunca de
  // forma optimista (mismo criterio que confirmarReposicion en
  // ProductosView.tsx). `devolucion_excede_disponible` (la cantidad
  // disponible cambió entre que se abrió el modal y se confirmó — carrera
  // real, no defensiva) recarga Historial completo desde el servidor en vez
  // de patchear: el estado local quedó demostradamente desactualizado, mismo
  // espíritu que productos.recargar() ante "stock_insuficiente" en
  // VenderView.tsx. Cualquier otro error deja todo intacto — el modal sigue
  // abierto con lo tipeado, no se pierde el formulario.
  async function confirmarDevolucion(datos: DatosDevolucion) {
    if (guardandoDevolucion || !devolucionModal) return;
    setGuardandoDevolucion(true);
    const { error } = await registrarDevolucion(
      devolucionModal.item.id,
      datos.cantidad,
      datos.motivo,
      datos.medioReembolso,
      claveDevolucion.actual(),
    );
    setGuardandoDevolucion(false);

    if (error) {
      if (esErrorDevolucionExcedeDisponible(error)) {
        mostrarToast("La cantidad disponible para devolver cambió, revisá el detalle e intentá de nuevo.", "error");
        setDevolucionModal(null);
        historial.reintentar();
      } else if (esErrorClaveReutilizada(error)) {
        mostrarToast(MENSAJE_CLAVE_REUTILIZADA, "error");
        setDevolucionModal(null);
        historial.reintentar();
      } else {
        mostrarToast("No se pudo registrar la devolución. Probá de nuevo.", "error");
      }
      return;
    }

    productos.ajustarStockLocal(devolucionModal.item.productoId, datos.cantidad, null);
    setDevolucionModal(null);
    invalidarEconomia({
      stockActualizado: true,
      devolucion: { ventaId: devolucionModal.ventaId, itemId: devolucionModal.item.id, productoId: devolucionModal.item.productoId, cantidad: datos.cantidad, medioReembolso: datos.medioReembolso },
    });
    mostrarToast("Devolución registrada.", "ok");
  }

  const desktopFocus = useDialogFocus(() => setVentaSeleccionadaId(null), false, {
    active: esDesktop && !!ventaSeleccionada, trap: false,
  });

  const detalleProps = { venta: ventaSeleccionada, onDevolver: (item: ItemVentaConDetalle) => setDevolucionModal({ ventaId: ventaSeleccionada!.id, item }) };

  return (
    <div className="admin-workspace historial-workspace flex flex-col gap-4">
      <section className="historial-filters rounded-lg border border-border bg-surface p-3.5 shadow-sm">
        <div className="historial-filters-title mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Filtros</div>
        <div className="historial-filters-body flex flex-col gap-3">
        <div className="historial-filters-fechas flex flex-wrap gap-2.5">
          <div className="text-xs text-muted">
            Desde
            <DatePicker aria-label="Desde" className="mt-1 block" value={desde} onChange={setDesde} />
          </div>
          <div className="text-xs text-muted">
            Hasta
            <DatePicker aria-label="Hasta" className="mt-1 block" value={hasta} onChange={setHasta} />
          </div>
        </div>
        <Input
          className="historial-filters-search"
          aria-label="Buscar por reserva o producto..."
          placeholder="Buscar por reserva o producto..."
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
        />
        <div className="historial-filters-tipo">
          <SegmentedControl ariaLabel="Filtrar por tipo de venta" options={FILTROS_TIPO} value={filtroTipo} onChange={setFiltroTipo} />
        </div>
        </div>
      </section>

      <div className={esDesktop ? "admin-workspace-columns historial-columns grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4" : "flex flex-col gap-4"}>
        <Card className={`p-3.5 ${esDesktop ? "admin-workspace-list historial-list min-h-0 min-w-0 overflow-y-auto" : ""}`}>
          {historial.loading && <p className="text-sm text-muted">Cargando historial...</p>}

          {!historial.loading && historial.error && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-error">No se pudo cargar el historial.</p>
              <button
                type="button"
                onClick={() => historial.reintentar()}
                className="tap-fx ui-transition rounded-pill border border-border px-3 py-1 text-xs font-semibold text-text hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Reintentar
              </button>
            </div>
          )}

          {!historial.loading && !historial.error && ventasFiltradas.length === 0 && (
            <p className="text-sm text-muted">No hay ventas que coincidan en el rango elegido.</p>
          )}

          {!historial.loading && !historial.error && ventasFiltradas.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {ventasFiltradas.map((venta) => (
                <FilaVenta
                  key={venta.id}
                  venta={venta}
                  seleccionada={ventaSeleccionadaId === venta.id}
                  onClick={() => setVentaSeleccionadaId(venta.id)}
                />
              ))}
            </div>
          )}

          {!historial.loading && !historial.error && historial.hayMas && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {historial.errorMasAntiguas && <p className="text-xs text-error">No se pudieron cargar más ventas.</p>}
              <button
                type="button"
                onClick={() => historial.cargarMasAntiguas()}
                disabled={historial.cargandoMasAntiguas}
                className="tap-fx ui-transition w-full rounded-md border border-dashed border-border py-3 text-[13px] font-semibold text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50"
              >
                {historial.cargandoMasAntiguas ? "Cargando..." : "Cargar más antiguas"}
              </button>
            </div>
          )}
        </Card>

        {esDesktop && (
          <Card className="historial-detail min-h-0 min-w-0 overflow-y-auto p-4" data-testid="detalle-venta">
            <div {...desktopFocus} role="region" aria-label="Detalle de la venta">
            <DetalleVentaContenido {...detalleProps} />
          </div>
          </Card>
        )}
      </div>

      {!esDesktop && (
        <AnimatePresence>
          {ventaSeleccionada && (
            <>
              <div data-drawer-backdrop className="fixed inset-0 z-40" onClick={() => setVentaSeleccionadaId(null)} />
              <DrawerSurface
                onClose={() => setVentaSeleccionadaId(null)}
                role="dialog"
                aria-modal="true"
                aria-label="Detalle de la venta"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={SPRING_SHEET}
                onClick={(e) => e.stopPropagation()}
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-xl border-t border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-lg"
                data-testid="detalle-venta"
              >
                <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex shrink-0 justify-end border-b border-border bg-surface-elevated px-5 py-2">
                  <IconButton aria-label="Cerrar" variant="ghost" size="sm" onClick={() => setVentaSeleccionadaId(null)}>
                    <X size={18} strokeWidth={1.75} />
                  </IconButton>
                </div>
                <DetalleVentaContenido {...detalleProps} />
              </DrawerSurface>
            </>
          )}
        </AnimatePresence>
      )}

      {devolucionModal && (
        <DevolucionModal
          productoNombre={devolucionModal.item.productoNombre}
          cantidadVigente={devolucionModal.item.cantidadVigente}
          precioSnapshot={devolucionModal.item.precioSnapshot}
          guardando={guardandoDevolucion}
          onGuardar={confirmarDevolucion}
          onClose={cerrarDevolucionModal}
        />
      )}
    </div>
  );
}

interface FilaVentaProps {
  venta: VentaConDetalle;
  seleccionada: boolean;
  onClick: () => void;
}

// R7 — fila densa: fecha + tipo (suelta/atada) + total arriba, productos
// abajo (texto plano, sin cantidades — el desglose completo vive en el
// detalle). Un indicador chico de devolución si corresponde, sin acciones
// inline (esas viven en DetalleVentaContenido, mismo criterio que
// FilaReserva/DetalleReservaContenido en ReservasView.tsx).
function FilaVenta({ venta, seleccionada, onClick }: FilaVentaProps) {
  const totalDevuelto = calcularTotalDevuelto(venta);
  return (
    <button
      type="button"
      data-testid="fila-venta"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={`tap-fx ui-transition historial-row flex flex-col items-start gap-2 rounded-md border px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        seleccionada ? "border-accent bg-accent-muted" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="neutral">{formatearBadgeFecha(venta.fecha)}</Badge>
          {venta.reserva ? <Badge variant="info">Atada a: {venta.reserva.nombre}</Badge> : <Badge variant="neutral">Venta suelta</Badge>}
          {totalDevuelto > 0 && <Badge variant="warning">Con devolución</Badge>}
        </div>
        <span className="shrink-0 pt-0.5 text-body-sm font-bold whitespace-nowrap tabular-nums text-text">{formatearMoneda(venta.total)}</span>
      </div>
      {/* R7 — cada nombre de producto vive en SU PROPIO <span> (nunca junto a
          la coma separadora, que es un <span> hermano aparte): así
          `getByText(nombreProducto)` sigue siendo una igualdad exacta contra
          un solo nodo aunque la venta tenga más de un ítem — ver el test "el
          patch de una devolución no toca otras líneas ni otras ventas". */}
      <div className="flex flex-wrap text-xs leading-relaxed text-muted">
        {venta.items.map((item, i) => (
          <Fragment key={item.id}>
            <span>{item.productoNombre}</span>
            {i < venta.items.length - 1 && <span>,&nbsp;</span>}
          </Fragment>
        ))}
      </div>
    </button>
  );
}

interface DetalleVentaContenidoProps {
  venta: VentaConDetalle | null;
  onDevolver: (item: ItemVentaConDetalle) => void;
}

// R7 — panel de detalle: header (tipo + fecha + total), desglose de pago,
// reserva atada y devuelto/neto si aplica, y la lista de ítems con sus
// acciones — mismo lenguaje visual que DetalleReservaContenido de
// ReservasView.tsx (título en mayúsculas chico + monto grande, filas
// etiqueta/valor, acciones al pie de cada ítem).
function DetalleVentaContenido({ venta, onDevolver }: DetalleVentaContenidoProps) {
  if (!venta) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
        <Receipt size={28} strokeWidth={1.5} />
        <p className="text-sm">Seleccioná una venta para ver el detalle.</p>
      </div>
    );
  }

  const totalDevuelto = calcularTotalDevuelto(venta);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-bold tracking-wide text-muted uppercase">
            {venta.reserva ? "Venta atada a reserva" : "Venta suelta"}
          </p>
          <p className="font-heading mt-0.5 text-[20px] font-bold text-text">{formatearBadgeFecha(venta.fecha)}</p>
        </div>
        <span className="font-heading text-lg font-bold text-accent">{formatearMoneda(venta.total)}</span>
      </div>

      <p className="mt-3 text-xs text-muted">
        Efectivo {formatearMoneda(venta.pagoEfectivo)} · Transferencia {formatearMoneda(venta.pagoTransferencia)}
      </p>
      {totalDevuelto > 0 && (
        <p className="mt-1 text-xs text-muted">
          Devuelto {formatearMoneda(totalDevuelto)} · Neto {formatearMoneda(calcularTotalNeto(venta))}
        </p>
      )}

      {venta.reserva && (
        <div className="mt-3 flex flex-col">
          <Fila label="Reserva" valor={venta.reserva.nombre} />
          <Fila label="Turno" valor={`${formatearBadgeFecha(venta.reserva.fecha)} ${venta.reserva.horaInicio}`} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {venta.items.map((item) => (
          <div
            key={item.id}
            data-testid="item-venta"
            className="rounded-md border border-border bg-surface-2 p-2.5 text-xs text-muted"
          >
            <div className="flex items-center justify-between gap-3 text-sm text-text">
              <span>{item.productoNombre}</span>
              <span>{formatearMoneda(item.subtotalOriginal)}</span>
            </div>
            <div className="mt-1">
              Cantidad: {item.cantidadOriginal}
              {item.cantidadDevuelta > 0 && ` (devuelto ${item.cantidadDevuelta}, vigente ${item.cantidadVigente})`}
            </div>
            <div>
              Precio {formatearMoneda(item.precioSnapshot)} · Costo {formatearMoneda(item.costoSnapshot)}
            </div>
            {item.cantidadDevuelta > 0 && <div>Subtotal vigente: {formatearMoneda(item.subtotalVigente)}</div>}
            {/* D6 — vigente === 0 implica que YA se devolvió todo
                (cantidadOriginal siempre > 0, así que si no queda nada
                vigente es porque cantidadDevuelta llegó a igualarla): badge
                en vez de botón, sin acción posible. Con algo vigente (total o
                parcial) el botón sigue disponible para otra devolución hasta
                agotar el remanente. */}
            {item.cantidadVigente === 0 && (
              <Badge variant="neutral" className="mt-1.5">
                Devuelta completa
              </Badge>
            )}
            {item.cantidadVigente > 0 && (
              <Button variant="secondary" size="sm" className="mt-1.5" onClick={() => onDevolver(item)}>
                Devolver
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
