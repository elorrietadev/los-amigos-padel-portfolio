// Centro de notificaciones del admin — lógica pura. Todo se DERIVA del estado
// real que AdminShell ya carga (jugadas, próximas, productos): no hay tabla
// ni query propia. Lo único que se persiste (localStorage) son los descartes,
// y cada descarte guarda la "huella" exacta del conjunto descartado.

import { esPasado, esReservaVigente } from "../../../lib/datetime";
import {
  aperturaVigenteMin,
  calcularPendientesUrgentes,
  SEMANAS_HISTORICO_SIN_PAGO,
  obtenerRangoSemana,
  tieneMovimientoContable,
} from "../reservas/reservas.logic";
import type { ReservaProcesada } from "../reservas/reservas.types";
import { esStockBajo, type Producto } from "../productos/productos.logic";

export type TipoNotificacion = "sin-pago" | "reservas-pendientes" | "stock-bajo";

// Orden de aparición en el panel: lo que más plata/urgencia pierde primero.
export const TIPOS_NOTIFICACION: readonly TipoNotificacion[] = ["reservas-pendientes", "sin-pago", "stock-bajo"];

export interface Notificacion {
  tipo: TipoNotificacion;
  cantidad: number;
  ids: string[];
  huella: string;
}

export interface FuentesNotificaciones {
  jugadas: ReservaProcesada[];
  proximas: ReservaProcesada[];
  productos: Producto[];
  ahora: number;
}

function num(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

// FNV-1a de 32 bits — no criptográfico, solo una firma compacta y estable del
// conjunto de ids (evita guardar cientos de uuid en localStorage).
function hash32(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// tipo + cantidad + ids ORDENADOS: mismo conjunto → misma huella sin importar
// el orden de llegada; distinto conjunto con la misma cantidad → otra huella.
export function calcularHuella(tipo: TipoNotificacion, ids: readonly string[]): string {
  const ordenados = [...ids].sort();
  return `${tipo}:${ordenados.length}:${hash32(ordenados.join("|"))}`;
}

function armar(tipo: TipoNotificacion, ids: string[]): Notificacion | null {
  if (ids.length === 0) return null;
  return { tipo, cantidad: ids.length, ids, huella: calcularHuella(tipo, ids) };
}

// Mismas condiciones que "Sin registrar" de Caja (caja.logic.ts): jugada, no
// bloqueada, sin ningún pago cargado — pero SIN atarse a la semana actual: un
// turno sin cobrar sigue avisando al cambiar de semana hasta que se registre
// el pago. El piso es una ventana finita (SEMANAS_HISTORICO_SIN_PAGO semanas
// antes del lunes actual) y no "lo que haya en memoria", para que el número
// no dependa de cuántas semanas haya expandido el admin a mano en Reservas.
export function reservasJugadasSinPago(jugadas: ReservaProcesada[], ahora: number): ReservaProcesada[] {
  const { inicio } = obtenerRangoSemana(ahora, -SEMANAS_HISTORICO_SIN_PAGO);
  return jugadas.filter(
    (r) =>
      !r.bloqueado &&
      r.fecha >= inicio &&
      esPasado(r, aperturaVigenteMin(r), ahora) &&
      num(r.pago_efectivo) + num(r.pago_transferencia) === 0,
  );
}

// Mismas reglas que la pestaña "Pendientes" de Reservas (calcularPendientesUrgentes)
// más la vigencia RE-EVALUADA con `ahora`: los datos pueden llevar minutos en
// memoria y una pendiente vence a los 15 min. Se conserva una vencida solo si
// ya tiene movimiento contable (mismo criterio que procesarReservas.visibles).
export function reservasPendientesAccionables(proximas: ReservaProcesada[], ahora: number): ReservaProcesada[] {
  return calcularPendientesUrgentes(proximas, ahora).filter(
    (r) =>
      esReservaVigente(
        { bloqueado: r.bloqueado, confirmada: r.confirmada, creado: r.creado ?? new Date(0).toISOString() },
        { ahora },
      ) || tieneMovimientoContable(r),
  );
}

export function productosConStockBajoActivos(productos: Producto[]): Producto[] {
  return productos.filter((p) => p.activo && esStockBajo(p));
}

export function calcularNotificaciones({ jugadas, proximas, productos, ahora }: FuentesNotificaciones): Notificacion[] {
  const resultado = [
    armar("reservas-pendientes", reservasPendientesAccionables(proximas, ahora).map((r) => r.id)),
    armar("sin-pago", reservasJugadasSinPago(jugadas, ahora).map((r) => r.id)),
    armar("stock-bajo", productosConStockBajoActivos(productos).map((p) => p.id)),
  ];
  return resultado.filter((n): n is Notificacion => n !== null);
}

// --- Descartes (localStorage) ------------------------------------------------

export type Descartes = Partial<Record<TipoNotificacion, string>>;

export const DESCARTES_STORAGE_KEY = "lap-notificaciones-descartadas";

const TIPOS_VALIDOS = new Set<string>(TIPOS_NOTIFICACION);

// Nunca lanza: storage inaccesible, JSON roto o forma inesperada → sin descartes.
export function leerDescartes(): Descartes {
  try {
    const crudo = window.localStorage.getItem(DESCARTES_STORAGE_KEY);
    if (!crudo) return {};
    const parseado: unknown = JSON.parse(crudo);
    if (typeof parseado !== "object" || parseado === null || Array.isArray(parseado)) return {};
    const limpio: Descartes = {};
    for (const [tipo, huella] of Object.entries(parseado)) {
      if (TIPOS_VALIDOS.has(tipo) && typeof huella === "string") limpio[tipo as TipoNotificacion] = huella;
    }
    return limpio;
  } catch {
    return {};
  }
}

export function guardarDescartes(descartes: Descartes): void {
  try {
    if (Object.keys(descartes).length === 0) window.localStorage.removeItem(DESCARTES_STORAGE_KEY);
    else window.localStorage.setItem(DESCARTES_STORAGE_KEY, JSON.stringify(descartes));
  } catch {
    // localStorage inaccesible/lleno — el descarte vale solo durante la sesión.
  }
}
