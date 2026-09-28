// Fixtures compartidas de los tests de notificaciones. Miércoles 17/06/2026
// 20:00 (semana lun 15 – dom 21): así "jugada esta semana" y "próxima" quedan
// sin ambigüedad respecto de `AHORA`.

import type { ReservaProcesada } from "../reservas/reservas.types";
import type { Producto } from "../productos/productos.logic";

export const AHORA = new Date("2026-06-17T20:00:00").getTime();

export const HACE_5_MIN = new Date(AHORA - 5 * 60 * 1000).toISOString();
export const HACE_20_MIN = new Date(AHORA - 20 * 60 * 1000).toISOString();

// Por defecto: una reserva JUGADA (martes 16, 10-11), confirmada y sin pago.
export function crearReserva(overrides: Partial<ReservaProcesada> = {}): ReservaProcesada {
  return {
    id: "r1",
    fecha: "2026-06-16",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    horaInicio: "10:00",
    horaFin: "11:00",
    nombre: "Juan",
    telefono: "3771111111",
    precio: 20000,
    creado: HACE_20_MIN,
    bloqueado: false,
    confirmada: true,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

// Por defecto: una reserva PENDIENTE futura (jueves 18, 19-20), creada hace 5 min.
export function crearPendiente(overrides: Partial<ReservaProcesada> = {}): ReservaProcesada {
  return crearReserva({
    id: "p1",
    fecha: "2026-06-18",
    hora_inicio: "19:00:00",
    hora_fin: "20:00:00",
    horaInicio: "19:00",
    horaFin: "20:00",
    confirmada: false,
    creado: HACE_5_MIN,
    ...overrides,
  });
}

export function crearProducto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: "prod1",
    nombre: "Agua",
    activo: true,
    categoria_publica: null,
    creado: HACE_20_MIN,
    descripcion_publica: null,
    destacado: false,
    imagen_path: null,
    mostrar_en_catalogo: true,
    orden_publico: null,
    precio_venta: 1500,
    stock_actual: 10,
    stock_minimo: 3,
    ...overrides,
  };
}

export const sinPago = (ids: string[]) => ids.map((id) => crearReserva({ id }));
export const stockBajo = (ids: string[]) => ids.map((id) => crearProducto({ id, nombre: id, stock_actual: 1 }));
