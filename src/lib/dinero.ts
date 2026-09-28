// FINAL-F6 — dinero en centavos enteros para TODO agregado monetario del
// frontend (Caja, Reportes, Excel, saldo del turno, PaymentModal).
//
// La base guarda numeric(10,2) y PostgREST lo entrega como número JS (o string,
// según el caso): cada valor individual se convierte UNA vez a centavos
// enteros con `aCentavos` y desde ahí solo se suman/restan enteros, que en JS
// son exactos hasta 2^53 (≈ 90 billones de pesos). Se vuelve a pesos
// (`desdeCentavos`) solo para mostrar o escribir una celda: una sola división,
// sin acumular error flotante. Así dos totales iguales al centavo son
// idénticos bit a bit, no solo "iguales al mostrarse".

export type Centavos = number;

// Math.round absorbe el error de representación binaria de un valor que en la
// base tiene exactamente 2 decimales (6172.83 * 100 = 617282.9999999999).
export function aCentavos(valor: number | string | null | undefined): Centavos {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function desdeCentavos(c: Centavos): number {
  return c / 100;
}

export function sumarCentavos<T>(items: ReadonlyArray<T>, valor: (item: T) => number | string | null | undefined): Centavos {
  let total = 0;
  for (const it of items) total += aCentavos(valor(it));
  return total;
}

// Parseo de un input de monto tipeado por el usuario ("", "1500", "1500.5",
// "1500,50"). Devuelve null si no es un monto válido >= 0 con a lo sumo 2
// decimales — el llamador decide si eso bloquea el guardado.
export function parsearMontoInput(texto: string): Centavos | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  return aCentavos(Number(limpio));
}

export function formatearCentavos(c: Centavos): string {
  return `$${desdeCentavos(c).toLocaleString("es-AR", { minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
