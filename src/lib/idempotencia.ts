// FINAL-F6 — clave de idempotencia por OPERACIÓN monetaria (pago, venta,
// devolución). Regla:
//   * se genera al empezar una operación (abrir el modal / armar el carrito);
//   * se REUSA en cada reintento de esa misma operación (timeout, error de
//     red, doble click): el servidor devuelve el resultado original en vez
//     de registrar otro movimiento;
//   * se renueva solo tras un éxito confirmado (o al empezar otra operación).
// Si tras un error ambiguo el usuario cambia los datos y reintenta con la
// misma clave, el servidor responde `idempotency_key_reutilizada` (la primera
// sí se había registrado) y la UI lo explica en vez de duplicar.

import { useMemo, useRef } from "react";

export function nuevaClaveIdempotencia(): string {
  return crypto.randomUUID();
}

export interface ClaveIdempotencia {
  actual: () => string;
  renovar: () => void;
}

export function useClaveIdempotencia(): ClaveIdempotencia {
  const ref = useRef<string | null>(null);
  return useMemo(
    () => ({
      actual() {
        if (!ref.current) ref.current = nuevaClaveIdempotencia();
        return ref.current;
      },
      renovar() {
        ref.current = null;
      },
    }),
    [],
  );
}

// Errores comunes de idempotencia devueltos por las RPC monetarias.
export function esErrorClaveReutilizada(error: { message?: string; code?: string } | null | undefined): boolean {
  return error?.code === "IK001" || error?.message === "idempotency_key_reutilizada";
}

export const MENSAJE_CLAVE_REUTILIZADA =
  "La operación anterior ya se había registrado (la respuesta no llegó). No se registró de nuevo: revisá el estado actual.";
