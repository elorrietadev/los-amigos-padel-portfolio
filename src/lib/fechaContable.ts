// FINAL-F6 — fecha CONTABLE: el día calendario de America/Argentina/Buenos_Aires
// del instante real del movimiento. Es la misma regla que ya aplican las
// columnas `fecha` de la base (reserva_pago_movimientos.fecha,
// devoluciones.fecha: GENERATED desde `creado` en esa zona; ventas.fecha:
// DEFAULT del día en esa zona), así que los rangos de Caja/Reportes se arman
// con esta zona fija — nunca con la del navegador, que en otro huso correría
// los límites de día/semana.
//
// Distinta de la fecha OPERATIVA del turno (reservas.fecha), que sigue siendo
// información operativa y no decide en qué día entra el dinero.

export const ZONA_CONTABLE = "America/Argentina/Buenos_Aires";

const FORMATO_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CONTABLE, year: "numeric", month: "2-digit", day: "2-digit" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_CONTABLE, hour: "2-digit", minute: "2-digit", hour12: false });

// YYYY-MM-DD del instante en Buenos Aires.
export function fechaContableDe(instante: number | string | Date): string {
  return FORMATO_ISO.format(new Date(instante));
}

// HH:MM del instante en Buenos Aires.
export function horaContableDe(instante: number | string | Date): string {
  return FORMATO_HORA.format(new Date(instante));
}

// Aritmética de días sobre un YYYY-MM-DD puro (en UTC, sin zona: un día
// calendario es un día calendario, sin horario de verano de por medio).
export function sumarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

export function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Semana contable lunes-domingo que contiene `ahora` (offset -1 = anterior).
export function rangoSemanaContable(ahora: number, offsetSemanas = 0): { inicio: string; fin: string } {
  const hoy = fechaContableDe(ahora);
  const dow = diaSemanaISO(hoy);
  const lunes = sumarDiasISO(hoy, (dow === 0 ? -6 : 1 - dow) + offsetSemanas * 7);
  return { inicio: lunes, fin: sumarDiasISO(lunes, 6) };
}

export function rangoMesContable(ahora: number): { inicio: string; fin: string } {
  const hoy = fechaContableDe(ahora);
  const [y, m] = hoy.split("-").map(Number);
  const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { inicio, fin };
}
