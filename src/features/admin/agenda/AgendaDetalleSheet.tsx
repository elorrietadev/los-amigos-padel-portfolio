import { invalidarEconomia } from "../economiaEvents";
// AgendaDetalleSheet — R3: reemplaza el modal chico centrado por un Drawer
// lateral derecho en desktop/notebook y un BottomSheet en mobile (mismo
// componente, el layout lo decide useEsDesktop — igual criterio de
// breakpoint que el resto de la Agenda). Sigue sin disparar ninguna mutación
// directamente: junta la confirmación y se la pasa a AgendaView vía
// onCancelarReserva/onCancelarOcurrencia, igual que antes.
//
// Sin overlay oscuro de fondo a propósito (pedido explícito: "Fondo de
// Agenda debe seguir visible") — una capa transparente en su lugar solo para
// poder cerrar clickeando afuera. La confirmación anidada (ConfirmModal) sí
// mantiene su propio overlay oscuro — es un paso de "estás seguro" aparte,
// no la vista de detalle en sí.

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MENSAJE_CLAVE_REUTILIZADA, esErrorClaveReutilizada, useClaveIdempotencia } from "../../../lib/idempotencia";
import { X } from "lucide-react";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import { formatearMoneda } from "../../../lib/format";
import { IconWhatsapp } from "../icons";
import { ConfirmModal } from "../components/ConfirmModal";
import { useNombreCancha } from "../configuracion/useNombreCancha";
import { AgendaCancelacionModal } from "./AgendaCancelacionModal";
import { DevolucionModal, type DatosDevolucion } from "../devoluciones/DevolucionModal";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import { esErrorDevolucionExcedeDisponible } from "../devoluciones/devoluciones.logic";
import { textoPago } from "../reservas/reservas.logic";
import {
  calcularTotalesReserva,
  estadoPagoTurno,
  itemsConVentaId,
  type EstadoPagoTurno,
  type ItemVentaConVentaId,
} from "../ventas/ventas.logic";
import { useVentasDeReserva, type UseVentasDeReservaResult } from "../ventas/useVentasDeReserva";
import { DIAS_SEMANA, construirLinkWhatsappReserva, formatearBadgeFecha, telefonoParaWhatsapp, type CeldaGrilla } from "./agenda.logic";
import { estaPagoPendiente } from "./agenda.presentacion";
import { DrawerSurface } from "../components/DrawerSurface";
import { useEsDesktop } from "./useEsDesktop";

type CeldaOcupada = Extract<CeldaGrilla, { estado: "reserva" | "bloqueado" | "fijo" }>;

export interface AgendaDetalleSheetProps {
  celda: CeldaOcupada;
  procesando: boolean;
  // P1 — segundo argumento: true = "cancelar y avisar por WhatsApp" (solo si
  // el DELETE real confirma éxito, ver AgendaView.confirmarCancelarReserva).
  onCancelarReserva: (id: string, avisar: boolean) => void;
  onCancelarOcurrencia: (turnoFijoId: string, fecha: string) => void;
  onClose: () => void;
  // P4 — feedback de la devolución (éxito/error); la mutación en sí
  // (registrar_devolucion) vive acá adentro, mismo criterio que el resto de
  // este sheet no delega en AgendaView salvo cancelación.
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
}

function Fila({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-[13px] last:border-b-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold tabular-nums text-text">{valor}</span>
    </div>
  );
}

// Shared visual shell for real detail sections; future product data can use
// the same shell without rendering placeholders or inventing a contract.
// `accion` (P3) — nodo opcional a la derecha del título (ej. el Badge de
// estado de pago), sin forzar a cada sección a reimplementar ese layout.
function SeccionDetalle({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-border/60 bg-surface px-3.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2 pt-1 pb-2">
        <h3 className="text-[10px] font-bold tracking-widest text-muted uppercase">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

// P3/P4 — productos/ventas asociados a la reserva. `ventasDeReserva` es el
// resultado tal cual de useVentasDeReserva (loading/error/reintentar/
// patchearDevolucion), sin tocar Supabase acá: esta pieza es puramente
// presentacional. `onDevolver` abre el modal — la mutación en sí vive en
// AgendaDetalleSheet (mismo dueño del hook).
function SeccionProductos({
  ventasDeReserva,
  onDevolver,
}: {
  ventasDeReserva: UseVentasDeReservaResult;
  onDevolver: (item: ItemVentaConVentaId) => void;
}) {
  const { ventas, loading, error, reintentar } = ventasDeReserva;

  if (loading) return <p className="py-1 text-sm text-muted">Cargando productos...</p>;
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <p className="text-sm text-error">No se pudieron cargar los productos.</p>
        <button
          type="button"
          onClick={reintentar}
          className="tap-fx ui-transition rounded-pill border border-border px-3 py-1 text-xs font-semibold text-text hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // P4 — itemsConVentaId (ventas.logic.ts) reemplaza el flatMap crudo de P3:
  // conserva `ventaId` por ítem, necesario para patchear la venta correcta
  // tras una devolución (ver confirmarDevolucion más abajo). El resumen de
  // abajo sigue agregando los totales por reserva completa, no por venta.
  const items = itemsConVentaId(ventas);
  if (items.length === 0) return <p className="py-1 text-sm text-muted">Sin productos asociados.</p>;

  return (
    <div className="flex flex-col divide-y divide-border/60">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1 py-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text">
              {item.productoNombre} × {item.cantidadOriginal}
            </span>
            <span className="font-semibold tabular-nums text-text">{formatearMoneda(item.subtotalVigente)}</span>
          </div>
          {/* Trazabilidad de devoluciones (no se ocultan): el importe de
              arriba ya es el neto (subtotalVigente), esta línea solo explica
              por qué no coincide con cantidadOriginal × precio. */}
          {item.cantidadDevuelta > 0 && (
            <span className="text-[11.5px] font-semibold text-warning">
              {item.cantidadVigente === 0
                ? `Totalmente devuelto (${item.cantidadDevuelta})`
                : `Devueltos ${item.cantidadDevuelta} de ${item.cantidadOriginal}`}
            </span>
          )}
          {/* P4 — mismo criterio que HistorialView: vigente 0 ya no tiene
              acción posible (se devolvió todo), no se muestra el botón. */}
          {item.cantidadVigente > 0 && (
            <Button variant="secondary" size="sm" className="mt-0.5 self-start" onClick={() => onDevolver(item)}>
              Devolver
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// admin.html:2907-2909 / 2934
const TITULOS: Record<CeldaOcupada["estado"], string> = {
  reserva: "Turno reservado",
  bloqueado: "Horario bloqueado",
  fijo: "Turno fijo",
};

// admin.html:2928 / 2939 — mismo label exacto por estado.
const LABELS_BOTON: Record<CeldaOcupada["estado"], string> = {
  reserva: "Cancelar turno",
  bloqueado: "Desbloquear",
  fijo: "Cancelar este día",
};

// P3 — estado de pago del turno (ventas.logic.ts, estadoPagoTurno): solo
// presentación acá (texto + color de Badge), la clasificación en sí vive en
// la lógica pura, compartida con ReservasView. Texto con prefijo "Pago "
// deliberado: sin él, "Pendiente" colisiona textualmente (y en los tests, por
// ambigüedad de getByText) con el badge de confirmación de la reserva
// (Confirmado/Pendiente) que ya vive en el header de este mismo sheet.
const LABEL_ESTADO_PAGO: Record<EstadoPagoTurno, string> = {
  pendiente: "Pago pendiente",
  parcial: "Pago parcial",
  pagado: "Pago completo",
};
const VARIANTE_ESTADO_PAGO: Record<EstadoPagoTurno, BadgeVariant> = {
  pendiente: "warning",
  parcial: "info",
  pagado: "success",
};

// Matches Court Graphite's --ease-out and --duration-base tokens.
const TRANSICION_DRAWER = { type: "tween", duration: 0.25, ease: [0.22, 1, 0.36, 1] } as const;

export function AgendaDetalleSheet({
  celda,
  procesando,
  onCancelarReserva,
  onCancelarOcurrencia,
  onClose,
  mostrarToast,
}: AgendaDetalleSheetProps) {
  const esDesktop = useEsDesktop();
  const reducirMovimiento = useReducedMotion();
  const nombreCancha = useNombreCancha();
  // Include the floating inset and shadow so no edge remains before unmount.
  // Full transform strings allow Motion to use compositor-driven animation.
  const transformCerrado = esDesktop ? "translateX(calc(100% + 3rem))" : "translateY(calc(100% + 3rem))";
  const transformAbierto = esDesktop ? "translateX(calc(0% + 0rem))" : "translateY(calc(0% + 0rem))";
  const [confirmando, setConfirmando] = useState(false);

  // P3 — productos/ventas asociados: solo una reserva real puede tenerlos
  // (un bloqueo o una ocurrencia virtual de turno fijo, no). El hook decide
  // solo qué hacer con `null` (limpia sin pegarle a la red) — se llama
  // siempre, sin condicionar el hook en sí, solo su input.
  const reservaId = celda.estado === "reserva" ? celda.reserva.id : null;
  const ventasDeReserva = useVentasDeReserva(reservaId);
  const estadoPago = celda.estado === "reserva" ? estadoPagoTurno(celda.reserva) : null;
  const totales = celda.estado === "reserva" && !ventasDeReserva.loading && !ventasDeReserva.error ? calcularTotalesReserva(celda.reserva, ventasDeReserva.ventas) : null;

  // P4 — devolver un producto asociado. Mismo flujo exacto que
  // confirmarDevolucion en HistorialView.tsx (mismo RPC, mismo error
  // esperado, mismo patch local vía patchearDevolucionEnVenta) — la única
  // diferencia real es de dónde sale `ventaId` (acá, del ítem ya aplanado
  // con itemsConVentaId; en Historial, de la venta seleccionada).
  const [devolucionModal, setDevolucionModal] = useState<ItemVentaConVentaId | null>(null);
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

  async function confirmarDevolucion(datos: DatosDevolucion) {
    if (guardandoDevolucion || !devolucionModal) return;
    setGuardandoDevolucion(true);
    const { error } = await registrarDevolucion(devolucionModal.id, datos.cantidad, datos.motivo, datos.medioReembolso, claveDevolucion.actual());
    setGuardandoDevolucion(false);

    if (error) {
      if (esErrorDevolucionExcedeDisponible(error)) {
        mostrarToast("La cantidad disponible para devolver cambió, revisá el detalle e intentá de nuevo.", "error");
        setDevolucionModal(null);
        ventasDeReserva.reintentar();
      } else if (esErrorClaveReutilizada(error)) {
        mostrarToast(MENSAJE_CLAVE_REUTILIZADA, "error");
        setDevolucionModal(null);
        ventasDeReserva.reintentar();
      } else {
        mostrarToast("No se pudo registrar la devolución. Probá de nuevo.", "error");
      }
      return;
    }

    setDevolucionModal(null);
    invalidarEconomia({
      reservaId,
      devolucion: { ventaId: devolucionModal.ventaId, itemId: devolucionModal.id, productoId: devolucionModal.productoId, cantidad: datos.cantidad, medioReembolso: datos.medioReembolso },
    });
    mostrarToast("Devolución registrada.", "ok");
  }

  // AnimatePresence (AgendaView) mantiene este componente montado durante su
  // animación de salida después de que el padre ya decidió cerrar el sheet
  // (onCancelarReserva/onCancelarOcurrencia siempre terminan cerrándolo, con
  // o sin error). Sin este efecto, el ConfirmModal anidado quedaría visible
  // (con sus botones disabled) durante esa salida, porque nada más pone
  // `confirmando` en false — antes de R3 esto no importaba porque el sheet
  // se desmontaba al instante, sin animación de por medio.
  const procesandoAnteriorRef = useRef(procesando);
  useEffect(() => {
    if (procesandoAnteriorRef.current && !procesando) setConfirmando(false);
    procesandoAnteriorRef.current = procesando;
  }, [procesando]);

  function cerrar() {
    if (procesando) return;
    onClose();
  }

  function confirmar(avisar = false) {
    if (celda.estado === "fijo") {
      onCancelarOcurrencia(celda.turnoFijo.id, celda.fecha);
    } else {
      onCancelarReserva(celda.reserva.id, avisar);
    }
  }

  // admin.html:1900 (cancelarReserva) — mismo mensaje genérico para
  // reserva/bloqueado. admin.html:2021 (cancelarOcurrencia) — fecha ISO
  // cruda, no formateada, igual que el legacy.
  const mensajeConfirmacion =
    celda.estado === "fijo"
      ? `¿Cancelar el turno fijo solo para el ${celda.fecha}? El horario queda libre ese día.`
      : "¿Cancelar este turno?";

  const labelBoton = LABELS_BOTON[celda.estado];
  const nombreTitulo = celda.estado === "fijo" ? celda.turnoFijo.nombre : celda.estado === "bloqueado" ? "Horario bloqueado" : celda.reserva.nombre;
  const pendiente = estaPagoPendiente(celda);

  // P1 — solo para reservas reales (no bloqueado/fijo: "Desbloquear" y
  // "Cancelar este día" siguen exactamente igual que antes, sin WhatsApp).
  const linkWhatsapp = celda.estado === "reserva" ? construirLinkWhatsappReserva(celda.reserva, nombreCancha ?? "") : null;
  const puedeAvisarCancelacion = celda.estado === "reserva" && telefonoParaWhatsapp(celda.reserva.telefono) !== null;

  return (
    <>
      <div data-drawer-backdrop className="fixed inset-0 z-40" onClick={cerrar} />
      <DrawerSurface
        onClose={cerrar}
        busy={procesando || confirmando || !!devolucionModal}
        role="dialog"
        aria-modal="true"
        aria-label={TITULOS[celda.estado]}
        initial={reducirMovimiento ? { opacity: 0 } : { transform: transformCerrado }}
        animate={reducirMovimiento ? { opacity: 1 } : { transform: transformAbierto }}
        exit={reducirMovimiento
          ? { opacity: 0 }
          : { transform: transformCerrado, transition: { ...TRANSICION_DRAWER, duration: 0.2 } }}
        transition={reducirMovimiento ? { duration: 0.15 } : TRANSICION_DRAWER}
        onClick={(e) => e.stopPropagation()}
        className={
          // rounded-xl (28px, --radius-xl) en vez de rounded-lg (20px): mismo
          // radio ya usado por la Sidebar flotante — "más redondeado" pero
          // dentro de la escala de tokens.css, sin inventar un valor nuevo.
          esDesktop
            ? "fixed top-3 right-3 bottom-3 z-50 flex w-full max-w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg"
            : "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-xl border-t border-border bg-surface-elevated shadow-lg"
        }
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5 pb-4">
          <div className="min-w-0">
            <p className="text-label font-bold tracking-wide text-muted uppercase">{TITULOS[celda.estado]}</p>
            <p className="font-heading mt-0.5 break-words text-[20px] font-bold text-text">{nombreTitulo}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {celda.estado === "reserva" && (
              <Badge variant={celda.reserva.confirmada ? "success" : "warning"}>{celda.reserva.confirmada ? "Confirmado" : "Pendiente"}</Badge>
            )}
            {celda.estado === "fijo" && <Badge variant="info">Turno fijo</Badge>}
            <IconButton aria-label="Cerrar" variant="ghost" size="sm" onClick={cerrar} disabled={procesando}>
              <X size={18} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        {/* R9.1 — flex-1 min-h-0 es lo que hace que ESTE bloque sea el único
            que scrollea (si el contenido llegara a ser más alto que el
            espacio disponible): el header de arriba y las acciones de abajo
            quedan fuera de ese scroll, siempre visibles, sin depender de que
            el contenido sea corto como pasa hoy. */}
        <div className="scroll-hidden flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <SeccionDetalle titulo="Detalle del turno">
            <Fila label="Día" valor={celda.estado === "fijo" ? DIAS_SEMANA[celda.turnoFijo.dia_semana] : formatearBadgeFecha(celda.reserva.fecha)} />
            <Fila label="Horario" valor={
              <span className="text-[16px] tracking-tight">
                {celda.estado === "fijo" ? `${celda.turnoFijo.horaInicio} - ${celda.turnoFijo.horaFin}` : `${celda.reserva.horaInicio} - ${celda.reserva.horaFin}`}
              </span>
            } />
          </SeccionDetalle>
          {celda.estado !== "bloqueado" && (
            <SeccionDetalle titulo="Contacto">
              <Fila label="Teléfono" valor={celda.estado === "fijo" ? celda.turnoFijo.telefono : celda.reserva.telefono} />
            </SeccionDetalle>
          )}
          {celda.estado === "reserva" && estadoPago && (
            <SeccionDetalle
              titulo="Pago del turno"
              accion={<Badge variant={VARIANTE_ESTADO_PAGO[estadoPago]}>{LABEL_ESTADO_PAGO[estadoPago]}</Badge>}
            >
              <Fila label="Precio del turno" valor={`$${Number(celda.reserva.precio || 0).toLocaleString("es-AR")}`} />
              <Fila label="Pago" valor={<span className={pendiente ? "text-warning" : "text-success"}>{textoPago(celda.reserva)}</span>} />
            </SeccionDetalle>
          )}
          {celda.estado === "reserva" && (
            <SeccionDetalle titulo="Productos">
              <SeccionProductos ventasDeReserva={ventasDeReserva} onDevolver={setDevolucionModal} />
            </SeccionDetalle>
          )}
          {celda.estado === "reserva" && totales && (
            <SeccionDetalle titulo="Resumen">
              <Fila label="Turno" valor={formatearMoneda(totales.precioTurno)} />
              <Fila label="Productos netos" valor={formatearMoneda(totales.productosNetos)} />
              <Fila label="Total asociado" valor={formatearMoneda(totales.totalAsociado)} />
              <Fila label="Cobrado neto" valor={formatearMoneda(totales.cobradoNeto)} />
              <Fila
                label="Saldo pendiente"
                valor={
                  <span className={totales.saldoPendienteTurno > 0 ? "text-warning" : "text-success"}>
                    {formatearMoneda(totales.saldoPendienteTurno)}
                  </span>
                }
              />
            </SeccionDetalle>
          )}
        </div>

        <div className="shrink-0 flex flex-col gap-2 border-t border-border p-5 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
          {/* P1 — botón de contacto general del detalle; NUNCA se dispara
              solo, es un <a href> que el admin clickea (mismo criterio que el
              WhatsApp de ReservasView). Sin teléfono usable (inválido o
              vacío), linkWhatsapp es null y el botón simplemente no aparece. */}
          {linkWhatsapp && (
            <a
              className="tap-fx ui-transition flex h-11 items-center justify-center gap-1.5 rounded-pill border border-success px-4 text-[13px] font-semibold text-success hover:bg-success-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              href={linkWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconWhatsapp size={15} /> WhatsApp
            </a>
          )}
          <Button variant="destructive" className="w-full" onClick={() => setConfirmando(true)} disabled={procesando}>
            {labelBoton}
          </Button>
        </div>
      </DrawerSurface>

      {confirmando && (puedeAvisarCancelacion ? (
        <AgendaCancelacionModal
          busy={procesando}
          onClose={() => setConfirmando(false)}
          onConfirm={() => confirmar(false)}
          onAvisar={() => confirmar(true)}
        />
      ) : (
        <ConfirmModal
          mensaje={mensajeConfirmacion}
          confirmLabel={labelBoton}
          busy={procesando}
          zIndexClassName="z-[60]"
          onClose={() => setConfirmando(false)}
          onConfirm={() => confirmar(false)}
        />
      ))}

      {devolucionModal && (
        <DevolucionModal
          productoNombre={devolucionModal.productoNombre}
          cantidadVigente={devolucionModal.cantidadVigente}
          precioSnapshot={devolucionModal.precioSnapshot}
          guardando={guardandoDevolucion}
          onGuardar={confirmarDevolucion}
          onClose={cerrarDevolucionModal}
        />
      )}
    </>
  );
}
