// Validación server-side del token Turnstile (Siteverify). Fail-closed: cualquier
// duda (red caída, 5xx, respuesta rara, config de secret mala) NUNCA aprueba.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;
const INTENTOS = 2; // 1 reintento ante red/5xx, con el MISMO idempotency_key (seguro por diseño)

export interface OpcionesTurnstile {
  token: string;
  secret: string;
  ip: string | null;
  accionEsperada: string;
  hostnamesPermitidos: string[];
  fetchImpl: typeof fetch;
}

export type ResultadoTurnstile =
  | { ok: true }
  // Token inválido / vencido / reutilizado / hostname o action que no corresponden.
  | { ok: false; tipo: "rechazado"; detalle: string }
  // Siteverify caído o secret mal configurado: no es culpa del usuario.
  | { ok: false; tipo: "no_disponible"; detalle: string };

interface RespuestaSiteverify {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  "error-codes"?: unknown;
}

// Errores que indican un problema NUESTRO (config) o de Cloudflare, no del usuario.
const ERRORES_NO_DISPONIBLE = new Set(["missing-input-secret", "invalid-input-secret", "bad-request", "internal-error"]);

export async function verificarTurnstile(o: OpcionesTurnstile): Promise<ResultadoTurnstile> {
  const idempotencyKey = crypto.randomUUID();
  const cuerpo = new URLSearchParams({ secret: o.secret, response: o.token, idempotency_key: idempotencyKey });
  if (o.ip) cuerpo.set("remoteip", o.ip);

  let ultimoError = "sin respuesta";
  for (let intento = 1; intento <= INTENTOS; intento++) {
    let res: Response;
    try {
      res = await o.fetchImpl(SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      ultimoError = e instanceof Error ? e.name : "error de red";
      continue;
    }
    if (res.status >= 500) {
      ultimoError = `http ${res.status}`;
      continue;
    }

    let data: RespuestaSiteverify;
    try {
      data = (await res.json()) as RespuestaSiteverify;
    } catch {
      return { ok: false, tipo: "no_disponible", detalle: "respuesta no-JSON" };
    }
    if (data === null || typeof data !== "object") return { ok: false, tipo: "no_disponible", detalle: "respuesta inválida" };

    const errores = Array.isArray(data["error-codes"]) ? data["error-codes"].filter((x): x is string => typeof x === "string") : [];

    if (data.success !== true) {
      if (errores.some((c) => ERRORES_NO_DISPONIBLE.has(c))) {
        return { ok: false, tipo: "no_disponible", detalle: errores.join(",") };
      }
      return { ok: false, tipo: "rechazado", detalle: errores.join(",") || "success=false" };
    }

    // success=true: además el token tiene que ser PARA ESTE sitio y ESTA acción.
    const hostname = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";
    if (!o.hostnamesPermitidos.includes(hostname)) {
      return { ok: false, tipo: "rechazado", detalle: "hostname no permitido" };
    }
    if (data.action !== o.accionEsperada) {
      return { ok: false, tipo: "rechazado", detalle: "action no coincide" };
    }
    return { ok: true };
  }
  return { ok: false, tipo: "no_disponible", detalle: ultimoError };
}
