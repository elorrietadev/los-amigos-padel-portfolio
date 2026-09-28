// limpiarTelefonoWa: copiada exacta de admin.html:358-363, sin cambios de lógica.
export function limpiarTelefonoWa(tel: string): string {
  let limpio = (tel || "").replace(/[^0-9]/g, "");
  if (limpio.startsWith("0")) limpio = limpio.slice(1);
  if (limpio && !limpio.startsWith("549") && !limpio.startsWith("54")) limpio = "549" + limpio;
  return limpio;
}

// formatearMoneda: no existía como función con nombre en el legacy — es la
// deduplicación del patrón `$${valor.toLocaleString("es-AR")}` repetido ~19 veces
// en admin.html/index.html, más la variante con `{ maximumFractionDigits: 2 }` que
// ya usa la calculadora de Reponer Stock (3 veces). El parámetro `opciones` es
// opcional para que ambos usos reales queden cubiertos sin inventar comportamiento:
// llamarla sin opciones reproduce el caso dominante tal cual está hoy.
//
// Deliberadamente NO cubre new Date(x).toLocaleString("es-AR") (admin.html:2651,
// "último backup") — es Date.prototype.toLocaleString, formatea fecha+hora, no un
// monto, y no tiene relación con este patrón.
export function formatearMoneda(valor: number, opciones?: Intl.NumberFormatOptions): string {
  return `$${valor.toLocaleString("es-AR", opciones)}`;
}

// montosIguales: D3 (ventas) — comparación de dinero normalizada a centavos,
// para no comparar `numeric` con igualdad flotante cruda (0.1+0.2 !== 0.3 en
// JS). `precio_venta`/`pago_efectivo`/`pago_transferencia` son `numeric` sin
// escala fija y sus inputs ya usan `step="any"` — los decimales son un caso
// real, no teórico. DEUDA CONOCIDA, no se corrige acá: PaymentModal.tsx
// (pagos de reserva) tiene el mismo patrón de comparación cruda
// (`suma !== precio`) sin normalizar — no se toca en D3, queda anotado.
export function montosIguales(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
