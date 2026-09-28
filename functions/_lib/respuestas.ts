// Contrato de respuesta de /api/reservar. El servidor devuelve SOLO códigos estables
// (nunca texto SQL, stack, ni detalles de Supabase); los mensajes en español los
// arma el frontend (mapearErrorCrearReserva), que además conoce el límite configurado.
//
// Los headers de _headers NO aplican a respuestas de Functions: se fijan acá.

import type { CodigoNegocio } from "./gateway";

export type CodigoError =
  | CodigoNegocio
  | "PAYLOAD_INVALIDO"
  | "ORIGEN_NO_PERMITIDO"
  | "TURNSTILE_FALLIDO"
  | "DEMASIADOS_INTENTOS"
  | "ERROR_TEMPORAL"
  | "RESERVA_INCIERTA"
  | "VERIFICACION_NO_DISPONIBLE"
  | "METODO_NO_PERMITIDO"
  | "CONTENT_TYPE_INVALIDO"
  | "PAYLOAD_DEMASIADO_GRANDE";

const STATUS: Record<CodigoError, number> = {
  PAYLOAD_INVALIDO: 400,
  PAYLOAD_DEMASIADO_GRANDE: 413,
  CONTENT_TYPE_INVALIDO: 415,
  METODO_NO_PERMITIDO: 405,
  ORIGEN_NO_PERMITIDO: 403,
  TURNSTILE_FALLIDO: 403,
  TELEFONO_BLOQUEADO: 403,
  HORARIO_OCUPADO: 409,
  LIMITE_TELEFONO: 409,
  TELEFONO_INVALIDO: 422,
  NOMBRE_INVALIDO: 422,
  FECHA_INVALIDA: 422,
  ANTICIPACION_MAXIMA_EXCEDIDA: 422,
  ANTICIPACION_MINIMA_NO_CUMPLIDA: 422,
  DURACION_INVALIDA: 422,
  FUERA_DE_HORARIO: 422,
  HORARIO_YA_PASO: 422,
  DIA_CERRADO: 422,
  DEMASIADOS_INTENTOS: 429,
  ERROR_TEMPORAL: 503,
  RESERVA_INCIERTA: 503,
  VERIFICACION_NO_DISPONIBLE: 503,
};

const HEADERS_BASE = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function respuestaOk(precio: number): Response {
  return new Response(JSON.stringify({ ok: true, precio }), { status: 200, headers: HEADERS_BASE });
}

export function respuestaError(codigo: CodigoError, extra?: { retryAfter?: number }): Response {
  const headers: Record<string, string> = { ...HEADERS_BASE };
  const body: { ok: false; codigo: CodigoError; retryAfter?: number } = { ok: false, codigo };
  if (codigo === "METODO_NO_PERMITIDO") headers.Allow = "POST";
  if (extra?.retryAfter !== undefined) {
    body.retryAfter = extra.retryAfter;
    headers["Retry-After"] = String(extra.retryAfter);
  }
  return new Response(JSON.stringify(body), { status: STATUS[codigo], headers });
}
