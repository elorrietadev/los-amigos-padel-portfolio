// Orquestación de POST /api/reservar. Orden deliberado:
//   método -> Content-Type -> Origin -> body/forma -> Turnstile -> gateway_reservar
// Turnstile va ANTES del rate limit (que vive en gateway_reservar): si no, cualquiera
// podría agotar el cupo de un teléfono ajeno sin resolver ningún desafío.

import { validarEnv, type Env } from "./env";
import { llamarGatewayReservar } from "./gateway";
import { bucketDeIp, hashIp } from "./ip";
import { leerBodyLimitado, validarPayload } from "./payload";
import { respuestaError, respuestaOk } from "./respuestas";
import { verificarTurnstile } from "./turnstile";

export interface Deps {
  fetchImpl: typeof fetch;
  // Solo para tests: permite capturar los logs sin ensuciar la salida.
  log?: (nivel: "warn" | "error", mensaje: string) => void;
}

const logPorDefecto = (nivel: "warn" | "error", mensaje: string) => console[nivel](`[api/reservar] ${mensaje}`);

function origenPermitido(request: Request, extras: string[]): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true; // clientes no-navegador: igual necesitan Turnstile
  const o = origin.toLowerCase();
  return o === new URL(request.url).origin.toLowerCase() || extras.includes(o);
}

export async function manejarReservar(request: Request, env: Env, deps: Deps): Promise<Response> {
  const log = deps.log ?? logPorDefecto;

  if (request.method !== "POST") return respuestaError("METODO_NO_PERMITIDO");

  const cfg = validarEnv(env);
  if (!cfg.ok) {
    log("error", `configuración incompleta, faltan: ${cfg.faltan.join(", ")}`);
    return respuestaError("ERROR_TEMPORAL");
  }
  const c = cfg.valor;

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return respuestaError("CONTENT_TYPE_INVALIDO");
  }
  if (!origenPermitido(request, c.origenesExtra)) return respuestaError("ORIGEN_NO_PERMITIDO");

  const texto = await leerBodyLimitado(request);
  if (texto === null) return respuestaError("PAYLOAD_DEMASIADO_GRANDE");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return respuestaError("PAYLOAD_INVALIDO");
  }
  const p = validarPayload(json);
  if (!p.ok) return respuestaError(p.motivo === "token_ausente" ? "TURNSTILE_FALLIDO" : "PAYLOAD_INVALIDO");
  const d = p.valor;

  const ipCruda = request.headers.get("cf-connecting-ip");
  const ts = await verificarTurnstile({
    token: d.turnstileToken,
    secret: c.turnstileSecret,
    ip: ipCruda,
    accionEsperada: c.turnstileAction,
    hostnamesPermitidos: c.turnstileHostnames,
    fetchImpl: deps.fetchImpl,
  });
  if (!ts.ok) {
    if (ts.tipo === "no_disponible") {
      log("error", `Turnstile no disponible: ${ts.detalle}`);
      return respuestaError("VERIFICACION_NO_DISPONIBLE");
    }
    return respuestaError("TURNSTILE_FALLIDO");
  }

  // Sin CF-Connecting-IP (no debería pasar detrás de Cloudflare) no se bucketiza por IP:
  // hash aleatorio => el límite por IP no aplica, pero sí el de teléfono y el global.
  let ipHash: string;
  if (ipCruda) {
    ipHash = await hashIp(bucketDeIp(ipCruda), c.pepper);
  } else {
    log("warn", "request sin CF-Connecting-IP; sin límite por IP para esta request");
    ipHash = await hashIp(crypto.randomUUID(), c.pepper);
  }

  const r = await llamarGatewayReservar({
    supabaseUrl: c.supabaseUrl,
    anonKey: c.supabaseAnonKey,
    gatewayKey: c.gatewayKey,
    ipHash,
    fetchImpl: deps.fetchImpl,
    datos: { fecha: d.fecha, horaInicio: d.horaInicio, horaFin: d.horaFin, nombre: d.nombre, telefono: d.telefono },
  });

  switch (r.tipo) {
    case "ok":
      return respuestaOk(r.precio);
    case "negocio":
      return respuestaError(r.codigo);
    case "limite":
      return respuestaError("DEMASIADOS_INTENTOS", { retryAfter: r.retryAfter });
    case "temporal":
      // After sending to the database, a missing response cannot prove rollback.
      log("error", `gateway_reservar: ${r.detalle}`);
      return respuestaError("RESERVA_INCIERTA");
  }
}
