// Llamada a la RPC gateway_reservar de Supabase con la anon key + x-gateway-key.
// NO usa service_role: el secreto compartido solo habilita ESTA función. La lógica de negocio sigue
// 100% en crear_reserva; acá solo se transporta y se sanea la respuesta.

const TIMEOUT_MS = 10_000;

// Códigos de negocio que pueden llegar al cliente (lista blanca, espejo del SQL).
export const CODIGOS_NEGOCIO = [
  "HORARIO_OCUPADO",
  "LIMITE_TELEFONO",
  "TELEFONO_BLOQUEADO",
  "TELEFONO_INVALIDO",
  "NOMBRE_INVALIDO",
  "FECHA_INVALIDA",
  "ANTICIPACION_MAXIMA_EXCEDIDA",
  "ANTICIPACION_MINIMA_NO_CUMPLIDA",
  "DURACION_INVALIDA",
  "FUERA_DE_HORARIO",
  "HORARIO_YA_PASO",
  "DIA_CERRADO",
] as const;
export type CodigoNegocio = (typeof CODIGOS_NEGOCIO)[number];

export type ResultadoGateway =
  | { tipo: "ok"; precio: number }
  | { tipo: "negocio"; codigo: CodigoNegocio }
  | { tipo: "limite"; retryAfter: number }
  // Todo lo demás: config, red, 5xx, NO_AUTORIZADO, respuesta inesperada. Sin detalle al cliente.
  | { tipo: "temporal"; detalle: string };

export interface OpcionesGateway {
  supabaseUrl: string;
  anonKey: string;
  gatewayKey: string;
  ipHash: string;
  fetchImpl: typeof fetch;
  datos: { fecha: string; horaInicio: string; horaFin: string; nombre: string; telefono: string };
}

const esCodigoNegocio = (v: unknown): v is CodigoNegocio => (CODIGOS_NEGOCIO as readonly unknown[]).includes(v);

export async function llamarGatewayReservar(o: OpcionesGateway): Promise<ResultadoGateway> {
  let res: Response;
  try {
    res = await o.fetchImpl(`${o.supabaseUrl}/rest/v1/rpc/gateway_reservar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: o.anonKey,
        Authorization: `Bearer ${o.anonKey}`,
        "x-gateway-key": o.gatewayKey,
      },
      body: JSON.stringify({
        p_fecha: o.datos.fecha,
        p_hora_inicio: o.datos.horaInicio,
        p_hora_fin: o.datos.horaFin,
        p_nombre: o.datos.nombre,
        p_telefono: o.datos.telefono,
        p_ip_hash: o.ipHash,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { tipo: "temporal", detalle: e instanceof Error ? e.name : "error de red" };
  }

  // Solo el status va al log: el cuerpo de un error de PostgREST puede traer nombres internos.
  if (!res.ok) return { tipo: "temporal", detalle: `supabase http ${res.status}` };

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { tipo: "temporal", detalle: "respuesta no-JSON" };
  }
  if (data === null || typeof data !== "object") return { tipo: "temporal", detalle: "respuesta inválida" };
  const r = data as Record<string, unknown>;

  if (r.ok === true) {
    return typeof r.precio === "number" && Number.isFinite(r.precio)
      ? { tipo: "ok", precio: r.precio }
      : { tipo: "temporal", detalle: "precio inválido" };
  }
  if (r.codigo === "DEMASIADOS_INTENTOS") {
    const ra = typeof r.retry_after === "number" && Number.isFinite(r.retry_after) ? Math.ceil(r.retry_after) : 60;
    return { tipo: "limite", retryAfter: Math.min(Math.max(ra, 1), 86400) };
  }
  if (esCodigoNegocio(r.codigo)) return { tipo: "negocio", codigo: r.codigo };
  // NO_AUTORIZADO (GATEWAY_KEY mal cargada), PAYLOAD_INVALIDO (ip_hash), ERROR_TEMPORAL,
  // CONFIGURACION_NO_DISPONIBLE o cualquier cosa desconocida: no se reenvía.
  return { tipo: "temporal", detalle: `codigo ${typeof r.codigo === "string" ? r.codigo.slice(0, 40) : "?"}` };
}
