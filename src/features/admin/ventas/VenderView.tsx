import { invalidarEconomia } from "../economiaEvents";
// VenderView — venta suelta (D3) + venta atada a una reserva (D4). Puerto de
// admin.html: agregarAlCarrito/cambiarCantidadCarrito/quitarDelCarrito/
// calcularPagoVenta (961-982), intentarRegistrarVenta/registrarVenta
// (984-1034) y el markup de "Vender" (2729-2800) — el legacy no tenía el
// toggle "atada a una reserva" (`p_reserva_id` no se usaba desde ningún
// lado, ver auditoría D0), es una extensión nueva sobre el mismo flujo.
//
// D4 — el toggle Venta suelta/Atada a reserva es SOLO de dónde sale
// `reserva_id`: carrito, pago, `resolverCarrito`, `intentarRegistrarVenta`/
// `registrarVentaReal` son los mismos para los dos modos, no hay dos flujos
// paralelos. `reservaSeleccionada` guarda el objeto completo (no solo el id)
// para poder mostrar nombre/fecha/horario de lo elegido sin tener que
// volver a buscarlo en `reservasParaVenta.data`.
//
// Sin hook propio para productos: recibe `productos` (instancia de useProductos
// que crea y comparte ProductosView con el sub-tab Catálogo — mismo motivo que
// useTurnosFijos compartido entre Agenda/Reservas/TurnosFijosView en C3) — ver
// cabecera de ProductosView.tsx sobre el montaje con `hidden` que mantiene esta
// vista viva (con su carrito) al cambiar de sub-tab. Para reservas SÍ hay un
// hook propio y nuevo (`useReservasParaVenta`, D4) — ningún hook existente de
// reservas/ calza para un picker de "últimos 7 días" (ver su cabecera para el
// detalle de por qué no se reusa useReservasProximas/Jugadas/Busqueda).
//
// El carrito es ItemCarrito[] = {productoId, cantidad} puro — nombre, precio,
// stock y activo se resuelven SIEMPRE en vivo contra `productos.productos`
// vía resolverCarrito (ventas.logic.ts). Ver ese archivo para el porqué: un
// snapshot de precio permitiría cobrar un monto viejo si el catálogo cambia
// con el carrito abierto, y registrar_venta no valida pago contra total.
//
// Reusa calcularSplitPago/ModoPago/SplitPago de reservas.logic.ts/
// reservas.types.ts tal cual — es el mismo cálculo de pago que ya existe
// para reservas, sin ninguna diferencia de reglas (mismo criterio que
// TurnosFijosView reusando piezas de reservas/).
//
// R6 — rediseño puramente visual/estructural (mini-POS de dos columnas en
// desktop, una columna en mobile): CERO cambios en el bloque de arriba (todas
// las funciones/handlers de esta vista quedan idénticas letra por letra,
// incluido el orden de validaciones de intentarRegistrarVenta). Lo nuevo es
// 1) el catálogo pasa de una lista vertical a una grilla compacta de cards
// (ProductoCard, abajo) con stock bajo destacado y un flash corto al agregar
// (`.add-flash`, CSS puro — ver justificación en el componente), 2) el
// carrito pasa a un panel fijo a la derecha (sticky en desktop) con cantidad
// +/- además del input existente, animado con Motion (`layout` +
// AnimatePresence) para altas/bajas/reordenamiento, y 3) el selector de pago
// pasa a `PaymentSegmented` (components/, R6) — mismo cálculo, misma validación,
// otra presentación.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link2, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { IconButton } from "../../../components/ui/IconButton";
import { Input } from "../../../components/ui/Input";
import { SegmentedControl, type SegmentedOption } from "../../../components/ui/SegmentedControl";
import { formatearMoneda, montosIguales } from "../../../lib/format";
import { MENSAJE_CLAVE_REUTILIZADA, esErrorClaveReutilizada, useClaveIdempotencia } from "../../../lib/idempotencia";
import { ConfirmModal } from "../components/ConfirmModal";
import { PaymentSegmented } from "../components/PaymentSegmented";
import { esStockBajo, filtrarPorNombre, type Producto } from "../productos/productos.logic";
import type { UseProductosResult } from "../productos/useProductos";
import { EstadoCatalogo } from "../productos/EstadoCatalogo";
import { calcularSplitPago, formatearBadgeFecha } from "../reservas/reservas.logic";
import type { ModoPago, ReservaProcesada } from "../reservas/reservas.types";
import { registrarVenta } from "./ventas.api";
import {
  agregarAlCarrito,
  armarItemsParaRpc,
  calcularTotalCarrito,
  cambiarCantidadCarrito,
  esErrorReservaInexistente,
  filtrarReservasParaVenta,
  hayInactivosEnCarrito,
  lineasSinStock,
  quitarDelCarrito,
  resolverCarrito,
  type ItemCarrito,
  type LineaCarrito,
} from "./ventas.logic";
import { useReservasParaVenta } from "./useReservasParaVenta";

export interface VenderViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  productos: UseProductosResult;
}

interface ConfirmVentaState {
  mensaje: string;
  forzarStock: boolean;
}

// D4 — decide únicamente de dónde sale `reserva_id`, ver cabecera del archivo.
type ModoVenta = "suelta" | "atada";

const SPRING_LINEA = { type: "spring", stiffness: 500, damping: 40, mass: 0.8 } as const;

// R9.1 — reemplaza las dos "pills" sueltas (border-success/border-border) por
// el SegmentedControl genérico: mismo cambio de modo, presentación de cápsula
// animada más grande y visible (pedido explícito).
const OPCIONES_MODO_VENTA: ReadonlyArray<SegmentedOption<ModoVenta>> = [
  { value: "suelta", label: "Venta suelta" },
  { value: "atada", label: "Atada a reserva" },
];

export function VenderView({ mostrarToast, productos }: VenderViewProps) {
  const [filtroProducto, setFiltroProducto] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [modoPago, setModoPago] = useState<ModoPago>("efectivo");
  const [montoEfectivo, setMontoEfectivo] = useState("0");
  const [montoTransferencia, setMontoTransferencia] = useState("0");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [confirmVenta, setConfirmVenta] = useState<ConfirmVentaState | null>(null);
  const [guardandoVenta, setGuardandoVenta] = useState(false);
  // FINAL-F6 — idempotencia: una clave por venta en armado, reusada en cada
  // reintento (timeout, error de red, doble click, "Registrar igual") y
  // renovada solo cuando el servidor confirma la venta. El ref corta el doble
  // submit en el mismo tick, antes de que el re-render deshabilite el botón.
  const claveVenta = useClaveIdempotencia();
  const ventaEnVueloRef = useRef(false);

  // D4 — carrito/pago arriba son compartidos por los dos modos, sin ningún
  // duplicado. Solo lo de acá abajo es nuevo.
  const [modoVenta, setModoVenta] = useState<ModoVenta>("suelta");
  const [filtroReserva, setFiltroReserva] = useState("");
  const [reservaSeleccionada, setReservaSeleccionada] = useState<ReservaProcesada | null>(null);
  const reservasParaVenta = useReservasParaVenta();
  // Carga solo la primera vez que se entra a "atada" en esta sesión del
  // componente — un "Reintentar" manual (botón de abajo) no pasa por este
  // ref, así que sí puede volver a disparar `cargar()` sin límite.
  const yaCargoReservasRef = useRef(false);

  useEffect(() => {
    if (modoVenta === "atada" && !yaCargoReservasRef.current) {
      yaCargoReservasRef.current = true;
      reservasParaVenta.cargar();
    }
  }, [modoVenta, reservasParaVenta.cargar]);

  // Atada -> Suelta limpia la selección (decisión explícita, D4): si no se
  // limpiara, volver a "atada" después reaparecería con una reserva
  // potencialmente vieja ya elegida, sin que el admin la haya vuelto a mirar
  // — riesgo de atar una venta nueva a una reserva equivocada por descuido.
  // Suelta -> Atada no necesita el mismo tratamiento: la selección ya está
  // en null en ese momento (o bien nunca se eligió, o la limpió este mismo
  // efecto la vez anterior que se salió de "atada").
  function cambiarModoVenta(modo: ModoVenta) {
    setModoVenta(modo);
    if (modo === "suelta") setReservaSeleccionada(null);
  }

  // P2 (revisión) — la apertura vigente NO sale de configCancha (config
  // estática/actual): filtrarReservasParaVenta resuelve la de CADA reserva
  // desde su propia columna `hora_apertura_vigente` (ver ventas.logic.ts), así
  // que reinterpretar reservas viejas tras un cambio de horario no es
  // posible acá. Solo `ahora` es responsabilidad de esta vista — se recalcula
  // en cada render, mismo criterio que ReservasView.tsx (sin poll propio:
  // alcanza con que un re-render la refresque).
  const ahora = Date.now();
  const reservasElegibles = filtrarReservasParaVenta(reservasParaVenta.data, filtroReserva, ahora);

  // admin.html:1145-1147 (productosParaVenta) — solo productos activos, sin
  // excepción: un producto inactivo no se puede agregar al carrito (D2).
  const disponibles = filtrarPorNombre(
    productos.productos.filter((p) => p.activo),
    filtroProducto,
  );

  const lineas = resolverCarrito(carrito, productos.productos);
  const total = calcularTotalCarrito(lineas);
  const montoEfectivoNum = Number(montoEfectivo) || 0;
  const montoTransferenciaNum = Number(montoTransferencia) || 0;
  const cantidadPorProducto = new Map(carrito.map((it) => [it.productoId, it.cantidad]));

  function agregar(productoId: string) {
    setCarrito((prev) => agregarAlCarrito(prev, productoId));
  }

  function quitar(productoId: string) {
    setCarrito((prev) => quitarDelCarrito(prev, productoId));
  }

  function cambiarCantidad(productoId: string, valor: string) {
    setCarrito((prev) => cambiarCantidadCarrito(prev, productoId, Number(valor)));
  }

  // admin.html:2994-3003 (autocálculo bidireccional de PaymentModal, mismo
  // patrón acá): cambiar un monto autocompleta el complemento para que sumen
  // el total. Si el total cambia (se agrega/quita algo del carrito) los
  // montos ya tipeados NO se reajustan solos — el desajuste, si queda
  // alguno, se detecta recién al intentar registrar (mismo criterio legacy).
  function cambiarMontoEfectivo(valor: string) {
    const complemento = Math.max(0, total - (Number(valor) || 0));
    setMontoEfectivo(valor);
    setMontoTransferencia(String(complemento));
  }

  function cambiarMontoTransferencia(valor: string) {
    const complemento = Math.max(0, total - (Number(valor) || 0));
    setMontoTransferencia(valor);
    setMontoEfectivo(String(complemento));
  }

  // D4 — tras una venta exitosa se limpia también `reservaSeleccionada` (sea
  // suelta o atada: en suelta ya es null, no cambia nada). `modoVenta` NO se
  // resetea a "suelta" — la próxima venta puede seguir en modo atada, pero
  // exige elegir de nuevo una reserva, para no asociar por descuido una
  // venta nueva a la reserva de la venta anterior.
  function resetearFormulario() {
    setCarrito([]);
    setModoPago("efectivo");
    setMontoEfectivo("0");
    setMontoTransferencia("0");
    setReservaSeleccionada(null);
  }

  // admin.html:984-1004 (intentarRegistrarVenta), con un corte nuevo (D3, no
  // existía en el legacy porque activo/inactivo tampoco existía): un
  // producto inactivo (o que ya no resuelve contra el catálogo) bloquea el
  // registro ANTES de evaluar stock/pago — sin "forzar" posible para este
  // caso, a diferencia de sin-stock. No llama a registrarVenta hasta que se
  // lo saque del carrito o se lo reactive desde Catálogo.
  //
  // E1 — pago desajustado en modo mixto también es un corte duro, sin
  // "forzar" posible (decisión de negocio explícita): `registrar_venta` ya
  // rechaza server-side cualquier suma de pagos que no coincida con el total
  // real (error `monto_pago_no_coincide`, ver registrarVentaReal más abajo),
  // así que un "Registrar igual" acá siempre fallaría — se bloquea antes de
  // llamar al RPC, con el mismo criterio que el resto de los cortes duros de
  // esta función (setMensaje + return, sin ConfirmModal). En modo
  // efectivo/transferencia el split siempre coincide con `total` por
  // construcción (calcularSplitPago no deja input libre en esos modos), así
  // que este chequeo es, en la práctica, exclusivo de modo mixto.
  function intentarRegistrarVenta() {
    setMensaje(null);
    if (carrito.length === 0) {
      setMensaje("Agregá al menos un producto.");
      return;
    }
    // D4 — corte duro: en modo atada, sin reserva elegida no hay registro
    // posible, sin excepción ni "forzar" (a diferencia de sin-stock, más
    // abajo). Antes de evaluar inactivos/stock/pago porque no tiene sentido
    // validar el resto de un envío que no va a salir.
    if (modoVenta === "atada" && reservaSeleccionada === null) {
      setMensaje("Elegí una reserva.");
      return;
    }
    if (hayInactivosEnCarrito(lineas)) {
      setMensaje("Hay productos inactivos (o que ya no existen) en el carrito — quitalos o reactivalos antes de registrar la venta.");
      return;
    }

    const split = calcularSplitPago(modoPago, total, montoEfectivoNum, montoTransferenciaNum);
    if (modoPago === "mixto" && !montosIguales(split.efectivo + split.transferencia, total)) {
      setMensaje(
        `La suma del pago (${formatearMoneda(split.efectivo + split.transferencia)}) no coincide con el total (${formatearMoneda(total)}). Corregí los importes para poder registrar la venta.`,
      );
      return;
    }

    const sinStock = lineasSinStock(lineas);
    if (sinStock.length === 0) {
      registrarVentaReal(false);
      return;
    }

    setConfirmVenta({
      mensaje: `No hay stock suficiente de ${sinStock
        .map((l) => `${l.producto!.nombre} (pedís ${l.cantidad}, hay ${l.producto!.stock_actual})`)
        .join(", ")}.`,
      forzarStock: true,
    });
  }

  // admin.html:1006-1034 (registrarVenta). `forzarStock` es la ÚNICA bandera
  // que este flujo puede "forzar" — nunca aplica a inactivos ni a pago
  // desajustado (ambos son cortes duros en intentarRegistrarVenta, sin
  // bypass — el pago desajustado ni siquiera llega a llamar esta función).
  async function registrarVentaReal(forzarStock: boolean) {
    if (guardandoVenta || ventaEnVueloRef.current) return;
    ventaEnVueloRef.current = true;
    setGuardandoVenta(true);
    const split = calcularSplitPago(modoPago, total, montoEfectivoNum, montoTransferenciaNum);
    // D4 — el corte duro de intentarRegistrarVenta ya garantiza que en modo
    // atada `reservaSeleccionada` no es null antes de llegar acá (única
    // puerta de entrada a esta función, directo o vía ConfirmModal).
    const reservaId = modoVenta === "atada" ? reservaSeleccionada!.id : null;
    const { error } = await registrarVenta(
      armarItemsParaRpc(carrito),
      split.efectivo,
      split.transferencia,
      forzarStock,
      reservaId,
      claveVenta.actual(),
    );
    ventaEnVueloRef.current = false;
    setGuardandoVenta(false);
    setConfirmVenta(null);

    if (error) {
      if (error.message === "stock_insuficiente") {
        // admin.html:1019-1021 — el stock cambió entre que se armó el
        // carrito y se confirmó (carrera real, no solo defensiva): acá SÍ
        // vale la pena recargar todo el catálogo en vez de patchear, porque
        // el estado local quedó demostradamente desactualizado. El carrito y
        // el pago NO se tocan — el usuario ajusta cantidades a mano contra
        // el stock fresco.
        mostrarToast("El stock cambió justo ahora, revisá el carrito e intentá de nuevo.", "error");
        productos.recargar();
      } else if (error.message === "monto_pago_no_coincide") {
        // E1 — `registrar_venta` valida server-side, bajo lock, que el pago
        // coincida con el total real: si esto dispara es porque el precio de
        // algún producto cambió entre que se armó el carrito y se confirmó
        // la venta (carrera real, mismo espíritu que stock_insuficiente
        // arriba). Mismo criterio: recargar catálogo, no tocar carrito/modo
        // de pago/importes tipeados ni el stock local — el admin corrige a
        // mano contra los precios frescos.
        mostrarToast("El precio de uno o más productos cambió. Revisá los importes e intentá de nuevo.", "error");
        productos.recargar();
      } else if (esErrorClaveReutilizada(error)) {
        // La venta anterior con esta clave SÍ se registró (la respuesta se
        // perdió) y ahora el carrito es otro: no se registra una segunda.
        mostrarToast(MENSAJE_CLAVE_REUTILIZADA, "error");
        claveVenta.renovar();
        resetearFormulario();
        invalidarEconomia({ stockActualizado: true });
        productos.recargar();
      } else if (esErrorReservaInexistente(error)) {
        // D4 — la reserva elegida se borró entre la selección y la
        // confirmación (carrera real, ver reporte de sesión: `registrar_venta`
        // deja caer el insert por la FK, sin validar antes). Solo se limpia
        // la selección para obligar a elegir otra — carrito y pago quedan
        // intactos, a diferencia de resetearFormulario tras un éxito.
        mostrarToast("La reserva ya no existe. Elegí otra.", "error");
        setReservaSeleccionada(null);
      } else {
        mostrarToast("No se pudo registrar la venta. Probá de nuevo (si ya se había registrado, no se duplica).", "error");
      }
      return;
    }

    // Patch local: registrar_venta SIEMPRE descuenta exactamente `cantidad`
    // por línea (forzado o no — forzar solo permite que el contador quede
    // negativo, no cambia el monto descontado), así que es seguro reusar
    // ajustarStockLocal (D1) con un delta negativo, sin agregar ningún
    // método nuevo a useProductos.
    claveVenta.renovar();
    carrito.forEach((it) => productos.ajustarStockLocal(it.productoId, -it.cantidad, null));
    invalidarEconomia({ reservaId, stockActualizado: true });
    resetearFormulario();
    mostrarToast("Venta registrada.", "ok");
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      {/* R6 — columna izquierda: catálogo. `min-w-0` es necesario para que el
          grid interno pueda encogerse por debajo de su ancho de contenido
          cuando el panel derecho (ancho fijo) le come espacio en desktop. */}
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <SegmentedControl
          ariaLabel="Tipo de venta"
          options={OPCIONES_MODO_VENTA}
          value={modoVenta}
          onChange={cambiarModoVenta}
          size="lg"
          className="w-full max-w-[380px]"
        />

        {modoVenta === "atada" && (
          <section className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
            <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Reserva</div>
            <Input
              aria-label="Buscar reserva por nombre..."
              placeholder="Buscar reserva por nombre..."
              value={filtroReserva}
              onChange={(e) => setFiltroReserva(e.target.value)}
              className="mb-3"
            />
            {reservasParaVenta.loading && <p className="text-sm text-muted">Buscando reservas...</p>}
            {!reservasParaVenta.loading && reservasParaVenta.error && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-error">No se pudieron cargar las reservas.</p>
                <button
                  type="button"
                  onClick={() => reservasParaVenta.cargar()}
                  className="tap-fx ui-transition rounded-pill border border-border px-3 py-1 text-xs font-semibold text-text hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Reintentar
                </button>
              </div>
            )}
            {!reservasParaVenta.loading && !reservasParaVenta.error && (
              <>
                {reservasElegibles.length === 0 && (
                  <p className="text-sm text-muted">No hay reservas en juego ni terminadas hace menos de 3 horas que coincidan.</p>
                )}
                <div className="scroll-hidden flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {reservasElegibles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={reservaSeleccionada?.id === r.id}
                      onClick={() => setReservaSeleccionada(r)}
                      className={`tap-fx ui-transition flex items-center justify-between gap-3 rounded-md border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                        reservaSeleccionada?.id === r.id
                          ? "border-success bg-success/15"
                          : "border-border bg-surface-2 hover:border-border-strong hover:bg-surface-hover"
                      }`}
                    >
                      <span className="text-sm text-text">
                        {r.nombre}
                        <span className="ml-1.5 text-xs text-muted">
                          {formatearBadgeFecha(r.fecha)} {r.horaInicio}–{r.horaFin}
                        </span>
                      </span>
                      <span className="rounded-pill border border-border px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {r.confirmada ? "Confirmada" : "Pendiente"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {reservaSeleccionada && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-success/30 bg-success-muted p-2.5 text-success">
                <Link2 size={15} strokeWidth={2} className="shrink-0" />
                <p className="min-w-0 text-[13px] font-semibold">
                  <span className="truncate">Venta atada a: {reservaSeleccionada.nombre}</span>
                  <span className="text-success/80"> — {formatearBadgeFecha(reservaSeleccionada.fecha)}</span>
                </p>
              </div>
            )}
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
              <ShoppingCart size={17} strokeWidth={2} />
            </span>
            <h2 className="font-heading text-section-title font-bold text-text">Catálogo</h2>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            />
            <Input
              aria-label="Buscar producto para agregar..."
              placeholder="Buscar producto para agregar..."
              value={filtroProducto}
              onChange={(e) => setFiltroProducto(e.target.value)}
              className="pl-9"
            />
          </div>
          <EstadoCatalogo productos={productos} />
          {!productos.loading && !productos.error && productos.productos.length === 0 && <p className="text-sm text-muted">No hay productos cargados todavía.</p>}
          {!productos.loading && !productos.error && productos.productos.length > 0 && disponibles.length === 0 && (
            <p className="text-sm text-muted">No hay productos disponibles para vender.</p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] gap-2.5">
            {disponibles.map((p) => (
              <ProductoCard key={p.id} producto={p} cantidadEnCarrito={cantidadPorProducto.get(p.id) ?? 0} onAgregar={agregar} />
            ))}
          </div>
        </section>
      </section>

      {/* R6 — columna derecha: carrito + pago + registrar, todo en un mismo
          panel "pegado" en desktop (sticky, mismo mecanismo que ya usa el
          panel de detalle de ReservasView) y apilado debajo del catálogo en
          mobile (sin sticky: "no forzar layout desktop"). */}
      <Card
        variant="elevated"
        className="flex w-full flex-col xl:sticky xl:top-4 xl:w-[380px] xl:shrink-0 xl:self-start"
        data-testid="carrito-panel"
      >
        <div className="flex items-center gap-2.5 border-b border-border p-3.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
            <ShoppingCart size={17} strokeWidth={2} />
          </span>
          <h2 className="font-heading text-section-title font-bold text-text">Carrito</h2>
          {lineas.length > 0 && <Badge variant="accent">{lineas.length}</Badge>}
        </div>

        <div className="flex flex-col gap-2 p-3.5 xl:max-h-[40vh] xl:overflow-y-auto">
          {lineas.length === 0 && <p className="text-sm text-muted">Todavía no agregaste productos.</p>}
          <AnimatePresence initial={false}>
            {lineas.map((l) => (
              <LineaCarritoRow key={l.productoId} linea={l} onQuitar={quitar} onCambiarCantidad={cambiarCantidad} />
            ))}
          </AnimatePresence>
        </div>

        {/* R6 — "total siempre visible": queda fuera del área con scroll de
            arriba, así nunca se pierde de vista revisando el carrito. */}
        <div className="flex justify-between border-t border-border p-3.5 text-sm font-bold text-text">
          <span>Total</span>
          <span className="font-heading text-lg">{formatearMoneda(total)}</span>
        </div>

        <div className="z-10 flex flex-col gap-3 rounded-b-lg border-t border-border bg-surface-elevated p-3.5 xl:sticky xl:bottom-0">
          <div>
            <div className="text-label mb-1.5 font-bold tracking-wide text-muted uppercase">Método de pago</div>
            <PaymentSegmented
              modo={modoPago}
              onModoChange={setModoPago}
              montoEfectivo={montoEfectivo}
              montoTransferencia={montoTransferencia}
              onMontoEfectivoChange={cambiarMontoEfectivo}
              onMontoTransferenciaChange={cambiarMontoTransferencia}
              disabled={guardandoVenta}
            />
          </div>

          {mensaje && <p role="alert" className="text-xs text-error">{mensaje}</p>}

          <Button onClick={intentarRegistrarVenta} loading={guardandoVenta} className="w-full">
            {guardandoVenta ? "Registrando..." : "Registrar venta"}
          </Button>
        </div>
      </Card>

      {confirmVenta && (
        <ConfirmModal
          mensaje={confirmVenta.mensaje}
          confirmLabel={guardandoVenta ? "Registrando..." : "Registrar igual"}
          busy={guardandoVenta}
          ariaLabel="Confirmar venta"
          onClose={() => setConfirmVenta(null)}
          onConfirm={() => registrarVentaReal(confirmVenta.forzarStock)}
        />
      )}
    </div>
  );
}

// R6 — card compacta de catálogo: nombre, precio, stock (destacado si está
// bajo — reusa `esStockBajo`, ya existente en productos.logic.ts, sin
// reimplementar el umbral acá) y un botón de agregar con feedback corto.
// `justAgregado` es puramente visual (una clase CSS, `.add-flash`, ver
// globals.css) y se apaga solo al terminar la animación (onAnimationEnd, sin
// setTimeout) — el texto/nombre accesible del botón NUNCA cambia, así que
// clickear "Agregar" dos veces seguidas (fundir cantidad) sigue encontrando
// el mismo botón sin depender de temporizadores.
interface ProductoCardProps {
  producto: Producto;
  cantidadEnCarrito: number;
  onAgregar: (productoId: string) => void;
}

function ProductoCard({ producto, cantidadEnCarrito, onAgregar }: ProductoCardProps) {
  const [justAgregado, setJustAgregado] = useState(false);
  const bajo = esStockBajo(producto);

  function handleAgregar() {
    onAgregar(producto.id);
    setJustAgregado(true);
  }

  return (
    <div
      data-testid="producto-card"
      className={`ui-transition flex flex-col gap-2 rounded-md border p-2.5 hover:border-border-strong hover:bg-surface-hover ${
        bajo ? "border-warning/50 bg-warning-muted" : "border-border bg-surface"
      } ${justAgregado ? "add-flash" : ""}`}
      onAnimationEnd={() => setJustAgregado(false)}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-sm font-semibold text-text">{producto.nombre}</span>
        {cantidadEnCarrito > 0 && (
          <Badge variant="accent" className="shrink-0">
            {cantidadEnCarrito}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-1.5 text-xs">
        <span className="font-semibold text-text">{formatearMoneda(producto.precio_venta)}</span>
        <span className={bajo ? "font-semibold text-warning" : "text-muted"}>
          Stock: {producto.stock_actual}
          {bajo && " ⚠"}
        </span>
      </div>
      <Button size="sm" onClick={handleAgregar}>
        <Plus size={14} strokeWidth={2.25} /> Agregar
      </Button>
    </div>
  );
}

// R6 — fila de carrito: cantidad +/- (además del input existente, que sigue
// aceptando un valor tipeado directo) + Motion `layout` para que altas/bajas
// del resto de las líneas reacomoden esta fila con una transición suave en
// vez de saltar de golpe (AnimatePresence en el padre se encarga de la
// animación de entrada/salida de la fila en sí).
interface LineaCarritoRowProps {
  linea: LineaCarrito;
  onQuitar: (productoId: string) => void;
  onCambiarCantidad: (productoId: string, valor: string) => void;
}

function LineaCarritoRow({ linea: l, onQuitar, onCambiarCantidad }: LineaCarritoRowProps) {
  const inactivo = l.producto ? !l.producto.activo : false;
  const noDisponible = !l.producto;
  const excedeStock = l.producto ? l.cantidad > l.producto.stock_actual : false;
  const cantidadInputId = `cantidad-${l.productoId}`;

  // R9.1 — bump corto (reusa .add-flash, ya existente) al cambiar la cantidad,
  // sea por +/-/tipeo directo. Puramente visual: no toca `onCambiarCantidad`
  // ni ningún cálculo — solo compara la cantidad anterior contra la actual
  // para decidir cuándo reproducir la animación (mismo patrón onAnimationEnd
  // sin setTimeout que ya usa ProductoCard/justAgregado).
  const [bump, setBump] = useState(false);
  const cantidadAnteriorRef = useRef(l.cantidad);
  useEffect(() => {
    if (cantidadAnteriorRef.current !== l.cantidad) {
      cantidadAnteriorRef.current = l.cantidad;
      setBump(true);
    }
  }, [l.cantidad]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={SPRING_LINEA}
      className="rounded-md border border-border bg-surface-2 p-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text">{l.producto?.nombre ?? "Producto no disponible"}</span>
        <Button variant="destructive" size="sm" onClick={() => onQuitar(l.productoId)}>
          Quitar
        </Button>
      </div>
      {inactivo && (
        <span className="mt-1.5 inline-block w-fit rounded-pill border border-border bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">
          Inactivo
        </span>
      )}
      {noDisponible && <p className="mt-1.5 text-xs text-error">Este producto ya no está disponible.</p>}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <label htmlFor={cantidadInputId} className="text-xs text-muted">
            Cantidad
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <IconButton
              aria-label="Restar uno"
              size="sm"
              variant="secondary"
              disabled={l.cantidad <= 1}
              onClick={() => onCambiarCantidad(l.productoId, String(l.cantidad - 1))}
            >
              <Minus size={14} strokeWidth={2.25} />
            </IconButton>
            <input
              id={cantidadInputId}
              type="number"
              min="1"
              step="1"
              className={`ui-transition w-16 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-center text-sm font-semibold text-text focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${bump ? "add-flash" : ""}`}
              value={l.cantidad}
              onChange={(e) => onCambiarCantidad(l.productoId, e.target.value)}
              onAnimationEnd={() => setBump(false)}
            />
            <IconButton
              aria-label="Sumar uno"
              size="sm"
              variant="secondary"
              onClick={() => onCambiarCantidad(l.productoId, String(l.cantidad + 1))}
            >
              <Plus size={14} strokeWidth={2.25} />
            </IconButton>
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-text">
          {formatearMoneda(l.cantidad * (l.producto?.precio_venta ?? 0))}
        </div>
      </div>
      {excedeStock && <p className="mt-1.5 text-xs text-warning">⚠ Stock disponible: {l.producto!.stock_actual}</p>}
    </motion.div>
  );
}
