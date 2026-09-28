// Validación de FORMA del request (no de negocio): tipos, largos y formatos. Las
// reglas de negocio (horarios, duración, nombre válido, teléfono, límites) son
// autoridad de crear_reserva en la base y NO se duplican acá.

export const MAX_BODY_BYTES = 4096;
export const MAX_TOKEN_LENGTH = 2048; // límite documentado de Turnstile
const MAX_NOMBRE_CRUDO = 200; // mismas cotas crudas que crear_reserva (F5-A)
const MAX_TELEFONO_CRUDO = 30;

export interface PayloadReserva {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  nombre: string;
  telefono: string;
  turnstileToken: string;
}

export type ResultadoPayload =
  | { ok: true; valor: PayloadReserva }
  | { ok: false; motivo: "invalido" | "token_ausente" };

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function fechaReal(v: string): boolean {
  const m = RE_FECHA.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validarPayload(raw: unknown): ResultadoPayload {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, motivo: "invalido" };
  const o = raw as Record<string, unknown>;
  const { fecha, horaInicio, horaFin, nombre, telefono, turnstileToken } = o;

  if (typeof fecha !== "string" || !fechaReal(fecha)) return { ok: false, motivo: "invalido" };
  if (typeof horaInicio !== "string" || !RE_HORA.test(horaInicio)) return { ok: false, motivo: "invalido" };
  if (typeof horaFin !== "string" || !RE_HORA.test(horaFin)) return { ok: false, motivo: "invalido" };
  if (typeof nombre !== "string" || nombre.length > MAX_NOMBRE_CRUDO) return { ok: false, motivo: "invalido" };
  if (typeof telefono !== "string" || telefono.length > MAX_TELEFONO_CRUDO) return { ok: false, motivo: "invalido" };

  // Token ausente/vacío/no-string: es un fallo anti-bot (403), no un payload roto.
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) return { ok: false, motivo: "token_ausente" };
  if (turnstileToken.length > MAX_TOKEN_LENGTH) return { ok: false, motivo: "invalido" };

  return { ok: true, valor: { fecha, horaInicio, horaFin, nombre, telefono, turnstileToken } };
}

// Lee el body con tope duro de bytes (no confía en Content-Length): corta el stream
// apenas se supera MAX_BODY_BYTES. Devuelve null si se excede.
export async function leerBodyLimitado(request: Request, max = MAX_BODY_BYTES): Promise<string | null> {
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    partes.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    buf.set(p, off);
    off += p.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}
