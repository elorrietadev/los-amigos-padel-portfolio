// Lógica pura del carrito de venta suelta (D3) — sin Supabase, sin estado de
// componente. Validación de formulario (carrito vacío) queda inline en
// VenderView.tsx, mismo criterio que el resto del módulo.
//
// `ItemCarrito` guarda SOLO `productoId`/`cantidad` — deliberadamente sin
// nombre/precio/stock/activo. Guardar esos campos como snapshot al agregar
// permitiría que el carrito mostrara y cobrara un precio viejo si el
// catálogo cambia mientras sigue abierto: `registrar_venta` siempre cobra
// `productos.precio_venta` vigente en el momento del RPC (verificado contra
// el SQL real, sin tocarlo), así que el pago armado del lado cliente tiene
// que calcularse contra ESE mismo precio vigente — si no, el total mostrado
// y el pago enviado quedan armados contra un número viejo, y `registrar_venta`
// no valida que pago_efectivo+pago_transferencia == total (ver D0), así que
// el desajuste quedaría grabado en silencio. `resolverCarrito` es el único
// punto que cruza el carrito contra el catálogo vigente — todo lo demás
// (total, aviso de stock, bloqueo por inactivo) opera sobre su resultado.

import { finReservaDate, horaToMinutos, inicioReservaDate } from "../../../lib/datetime";
import { calcularTotalNeto } from "../historial/historial.logic";
import type { ItemVentaConDetalle, VentaConDetalle } from "../historial/historial.types";
import type { Producto } from "../productos/productos.logic";
import type { ReservaProcesada } from "../reservas/reservas.types";

export interface ItemCarrito {
  productoId: string;
  cantidad: number;
}

export interface ItemVentaRpc {
  producto_id: string;
  cantidad: number;
}

// `producto: undefined` = ya no está en el catálogo cargado — caso
// defensivo, no debería pasar en la práctica (sin política DELETE sobre
// `productos`, ver auditoría D0), pero un producto recién borrado por otra
// vía (o el catálogo todavía no terminó de cargar) no debe romper el cálculo.
export interface LineaCarrito {
  productoId: string;
  cantidad: number;
  producto: Producto | undefined;
}

export function resolverCarrito(carrito: ItemCarrito[], productos: Producto[]): LineaCarrito[] {
  return carrito.map((it) => ({ ...it, producto: productos.find((p) => p.id === it.productoId) }));
}

// admin.html:961-966 (agregarAlCarrito) — si el producto ya está en el
// carrito, funde incrementando la cantidad en vez de crear una segunda línea.
export function agregarAlCarrito(carrito: ItemCarrito[], productoId: string): ItemCarrito[] {
  const existe = carrito.find((it) => it.productoId === productoId);
  if (existe) {
    return carrito.map((it) => (it.productoId === productoId ? { ...it, cantidad: it.cantidad + 1 } : it));
  }
  return [...carrito, { productoId, cantidad: 1 }];
}

// admin.html:974-976 (quitarDelCarrito).
export function quitarDelCarrito(carrito: ItemCarrito[], productoId: string): ItemCarrito[] {
  return carrito.filter((it) => it.productoId !== productoId);
}

// admin.html:969-972 (cambiarCantidadCarrito) — clamp a mínimo 1, nunca 0 ni
// negativo, mismo criterio que el legacy.
export function cambiarCantidadCarrito(carrito: ItemCarrito[], productoId: string, cantidad: number): ItemCarrito[] {
  const cant = Math.max(1, Number(cantidad) || 1);
  return carrito.map((it) => (it.productoId === productoId ? { ...it, cantidad: cant } : it));
}

// Precio vigente (derivado, nunca un snapshot) — 0 para una línea cuyo
// producto no resolvió (caso defensivo de arriba).
export function calcularTotalCarrito(lineas: LineaCarrito[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.producto?.precio_venta ?? 0), 0);
}

// admin.html:988 (itemsSinStock) — stock vigente de LineaCarrito.producto,
// nunca un snapshot. Una línea sin producto resuelto no es "sin stock" (es
// el otro caso, ver hayInactivosEnCarrito) — no se duplica la señal.
export function lineasSinStock(lineas: LineaCarrito[]): LineaCarrito[] {
  return lineas.filter((l) => l.producto !== undefined && l.cantidad > l.producto.stock_actual);
}

// D3 — corte duro, sin "forzar" posible (a diferencia de lineasSinStock):
// un producto inactivo, o que ya no resuelve contra el catálogo, bloquea el
// registro de la venta hasta que se lo quite del carrito o se lo reactive.
export function hayInactivosEnCarrito(lineas: LineaCarrito[]): boolean {
  return lineas.some((l) => !l.producto || !l.producto.activo);
}

// Forma exacta que espera registrar_venta — el RPC no necesita precio.
export function armarItemsParaRpc(carrito: ItemCarrito[]): ItemVentaRpc[] {
  return carrito.map((it) => ({ producto_id: it.productoId, cantidad: it.cantidad }));
}

// --- D4 (venta atada a reserva) ---------------------------------------------

// P2 — ventana post-juego durante la cual una reserva ya terminada sigue
// siendo candidata para atarle una venta ("como máximo 3 horas").
const VENTANA_POST_JUEGO_MS = 3 * 60 * 60 * 1000;

// P2 (revisión) — la apertura vigente NUNCA se lee de la config actual
// (`configCancha`/franja_operativa de hoy): cada reserva ya trae la suya
// propia en `hora_apertura_vigente` (columna poblada por trigger desde C4.1,
// ver c4_1_resolver_instantes_segun_horario_operativo.sql — el mismo dato que
// usan los overloads puros de `instante_inicio_real`/`instante_fin_real` en
// Postgres para el EXCLUDE). Reinterpretar una reserva vieja con el horario
// de HOY rompería el registro histórico si el horario cambia después de
// jugada — por eso este helper nunca recibe un aperturaMin global. `null`
// (día marcado cerrado en su momento, o fila muy vieja sin resolver) se
// propaga tal cual a inicioReservaDate/finReservaDate, que ya saben degradar
// seguro sin corrimiento de día — nunca se sustituye por 08:00 ni por ningún
// otro valor inventado.
function aperturaMinDe(r: { hora_apertura_vigente: string | null }): number | null {
  return r.hora_apertura_vigente != null ? horaToMinutos(r.hora_apertura_vigente) : null;
}

// P2 — candidata para venta: reserva EN JUEGO (ya empezó, todavía no termina)
// o que terminó hace como máximo 3 horas. Usa inicioReservaDate/finReservaDate
// (lib/datetime.ts) — los mismos instantes reales que ya usa esPasado en
// reservas/ — en vez de comparar strings de hora, para que una reserva
// 23:30–01:00 siga siendo candidata mientras juega y durante las 3h
// posteriores aunque `fecha` (día de negocio) ya haya quedado en el pasado
// calendario. Borde de 3h inclusivo ("como máximo", igual criterio <= que ya
// usa esPasado para "terminó").
export function esReservaCandidataParaVenta(
  r: { fecha: string; horaInicio: string; horaFin: string; hora_apertura_vigente: string | null },
  ahora: number,
): boolean {
  const aperturaMin = aperturaMinDe(r);
  const inicio = inicioReservaDate(r, aperturaMin).getTime();
  if (ahora < inicio) return false; // todavía no empezó
  const fin = finReservaDate(r, aperturaMin).getTime();
  return ahora - fin <= VENTANA_POST_JUEGO_MS; // en juego (ahora <= fin) o terminada hace <=3h
}

// Reservas elegibles para el picker de VenderView: nunca un bloqueo de
// horario (`bloqueado`, ver crearBloqueo en reservas.api.ts — no es un
// cliente real), sin filtrar por `confirmada` (una reserva pendiente de seña
// puede estar jugando y comprar productos igual). P2 — además, solo las que
// están en juego o terminaron hace como máximo 3 horas (ver
// esReservaCandidataParaVenta arriba, que resuelve la apertura vigente de
// CADA reserva por su cuenta); `ahora` llega como parámetro explícito (mismo
// criterio que el resto del módulo de reservas/, nada de leer Date.now() acá
// adentro). Filtro de nombre substring case-insensitive — mismo criterio de
// una línea que filtrarPorNombre de productos.logic.ts, no se comparte esa
// función porque el tipo de entrada es distinto (Producto vs ReservaProcesada).
export function filtrarReservasParaVenta(
  reservas: ReservaProcesada[],
  filtroNombre: string,
  ahora: number,
): ReservaProcesada[] {
  const elegibles = reservas.filter((r) => !r.bloqueado).filter((r) => esReservaCandidataParaVenta(r, ahora));
  const q = filtroNombre.trim().toLowerCase();
  if (!q) return elegibles;
  return elegibles.filter((r) => r.nombre.toLowerCase().includes(q));
}

// `registrar_venta` no valida la existencia de `p_reserva_id` antes del
// insert en `ventas` (confirmado leyendo la función real vía Supabase MCP,
// solo lectura, ver reporte de sesión D4) — si la reserva elegida ya no
// existe, el insert cae por la FK real de Postgres (`ventas_reserva_id_fkey`,
// `ON DELETE SET NULL`, SQLSTATE `23503`), sin ningún RAISE EXCEPTION propio
// para este caso. Detección por código + nombre de constraint, nunca por el
// mensaje humano completo (frágil, puede cambiar de fraseo).
// FINAL-F6: registrar_venta ahora valida la reserva antes de insertar y
// responde 'reserva_inexistente' (RP004); la FK queda como red de seguridad.
export function esErrorReservaInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (error?.code === "RP004" || error?.message === "reserva_inexistente") return true;
  return error?.code === "23503" && !!error.message?.includes("ventas_reserva_id_fkey");
}

// --- P3 (detalle de reserva: productos/ventas asociados) --------------------
//
// Auditoría real (Supabase MCP, solo lectura, ver informe de sesión P3):
// `registrar_venta` exige `pago_efectivo + pago_transferencia = total` antes
// de aceptar la venta (si no, `monto_pago_no_coincide`) — una venta de
// productos SIEMPRE queda 100% pagada al registrarse. `registrar_devolucion`
// nunca toca `ventas.total`/`pago_efectivo`/`pago_transferencia` ni
// `venta_items.cantidad`: una devolución es un reembolso de plata ya
// cobrada, no una deuda nueva. Consecuencia directa: los productos NUNCA
// pueden generar saldo pendiente, ni antes ni después de una devolución — el
// saldo pendiente depende exclusivamente del turno.

export type EstadoPagoTurno = "pendiente" | "parcial" | "pagado";

// pendiente: pagado = 0 | parcial: 0 < pagado < precio | pagado: pagado >= precio.
export function estadoPagoTurno(reserva: {
  precio: number;
  pago_efectivo: number;
  pago_transferencia: number;
}): EstadoPagoTurno {
  const precio = Number(reserva.precio) || 0;
  const pagado = Number(reserva.pago_efectivo || 0) + Number(reserva.pago_transferencia || 0);
  if (pagado === 0) return "pendiente";
  if (pagado >= precio) return "pagado";
  return "parcial";
}

export interface TotalesReserva {
  precioTurno: number;
  pagadoTurno: number;
  saldoPendienteTurno: number;
  productosNetos: number;
  totalAsociado: number;
  cobradoNeto: number;
}

// `productosNetos` reusa `calcularTotalNeto` de historial.logic.ts (D5/D6) —
// NO se reimplementa la fórmula de neto-tras-devolución acá. Ninguna de las
// 6 salidas depende de `ventas.pago_efectivo/pago_transferencia`: como
// registrar_venta ya exige pago completo, sumar el "pagado" de cada venta
// daría exactamente lo mismo que sumar su total neto — usar SIEMPRE
// `productosNetos` para ambos lados (totalAsociado y cobradoNeto) dice, en el
// código, que los productos jamás son la causa de un saldo pendiente.
export function calcularTotalesReserva(
  reserva: { precio: number; pago_efectivo: number; pago_transferencia: number },
  ventas: VentaConDetalle[],
): TotalesReserva {
  const precioTurno = Number(reserva.precio) || 0;
  const pagadoTurno = Number(reserva.pago_efectivo || 0) + Number(reserva.pago_transferencia || 0);
  const productosNetos = ventas.reduce((acc, v) => acc + calcularTotalNeto(v), 0);
  return {
    precioTurno,
    pagadoTurno,
    saldoPendienteTurno: precioTurno - pagadoTurno,
    productosNetos,
    totalAsociado: precioTurno + productosNetos,
    cobradoNeto: pagadoTurno + productosNetos,
  };
}

// P4 (devolver productos desde el detalle de reserva) — el desglose de
// Productos aplana los ítems de todas las ventas de la reserva en una sola
// lista (ver AgendaDetalleSheet.tsx/ReservasView.tsx), pero
// `ItemVentaConDetalle` no trae de qué `venta_id` vino (en Historial no hace
// falta: ahí siempre hay una única venta seleccionada a la vez). Sin
// `ventaId` no se puede patchear la venta correcta tras una devolución
// exitosa (`patchearDevolucionEnVenta` la necesita) — por eso se agrega acá,
// una sola vez, en vez de que cada vista reimplemente el mismo flatMap.
export interface ItemVentaConVentaId extends ItemVentaConDetalle {
  ventaId: string;
}

export function itemsConVentaId(ventas: VentaConDetalle[]): ItemVentaConVentaId[] {
  return ventas.flatMap((v) => v.items.map((item) => ({ ...item, ventaId: v.id })));
}
