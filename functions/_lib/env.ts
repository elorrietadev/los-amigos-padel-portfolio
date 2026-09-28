// Variables/secretos de la Pages Function (se cargan en Cloudflare, NUNCA en el repo
// ni con prefijo VITE_). Ver docs/ARCHITECTURE.md.
export interface Env {
  // Secret key del widget Turnstile (Siteverify). Secreto.
  TURNSTILE_SECRET_KEY?: string;
  // Hostnames que Siteverify debe informar (coma-separados), p. ej.
  // "losamigospadel.site,www.losamigospadel.site". Obligatorio: sin él la Function falla cerrada.
  TURNSTILE_ALLOWED_HOSTNAMES?: string;
  // `action` con la que el front renderiza el widget. Default "reservar".
  // Con las claves de TEST de Cloudflare Siteverify siempre devuelve action "test".
  TURNSTILE_EXPECTED_ACTION?: string;
  // Secreto compartido con gateway_reservar (su sha256 vive en gateway_credenciales). Secreto.
  GATEWAY_KEY?: string;
  // Pepper del HMAC con el que se hashea la IP antes de guardarla. Secreto.
  RATE_LIMIT_PEPPER?: string;
  // URL del proyecto Supabase y su anon/publishable key (la misma que ya es pública en el bundle).
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  // Orígenes extra (coma-separados) además del propio origen de la request.
  ALLOWED_ORIGINS?: string;
  // Solo desarrollo/preview local: permite usar las secret keys de TEST de Cloudflare
  // ("1x00…AA" aprueba CUALQUIER token). En producción NO debe existir.
  TURNSTILE_ALLOW_TEST_KEYS?: string;
}

export interface EnvValida {
  turnstileSecret: string;
  turnstileHostnames: string[];
  turnstileAction: string;
  gatewayKey: string;
  pepper: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  origenesExtra: string[];
}

// Secret keys de prueba de Cloudflare: 1x000…AA (pasa), 2x… (falla), 3x… (token ya usado).
const ES_CLAVE_DE_TEST = /^[123]x0{20,}/;

const lista = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Devuelve la config validada o la lista de NOMBRES de variables que faltan
// (nunca sus valores). Fail-closed: cualquier falta => la Function responde 503.
export function validarEnv(env: Env): { ok: true; valor: EnvValida } | { ok: false; faltan: string[] } {
  const faltan: string[] = [];
  const req = (nombre: keyof Env) => {
    const v = env[nombre]?.trim();
    if (!v) faltan.push(nombre);
    return v ?? "";
  };
  const turnstileSecret = req("TURNSTILE_SECRET_KEY");
  const gatewayKey = req("GATEWAY_KEY");
  const pepper = req("RATE_LIMIT_PEPPER");
  const supabaseUrl = req("SUPABASE_URL").replace(/\/+$/, "");
  const supabaseAnonKey = req("SUPABASE_ANON_KEY");
  const turnstileHostnames = lista(env.TURNSTILE_ALLOWED_HOSTNAMES);
  if (turnstileHostnames.length === 0) faltan.push("TURNSTILE_ALLOWED_HOSTNAMES");
  if (supabaseUrl && !/^https:\/\//i.test(supabaseUrl)) faltan.push("SUPABASE_URL(https)");
  // Una secret key de TEST aprobaría cualquier token: sería un bypass total del anti-bot.
  if (ES_CLAVE_DE_TEST.test(turnstileSecret) && env.TURNSTILE_ALLOW_TEST_KEYS?.trim() !== "true") {
    faltan.push("TURNSTILE_SECRET_KEY(es una clave de TEST)");
  }
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      turnstileSecret,
      turnstileHostnames,
      turnstileAction: env.TURNSTILE_EXPECTED_ACTION?.trim() || "reservar",
      gatewayKey,
      pepper,
      supabaseUrl,
      supabaseAnonKey,
      origenesExtra: lista(env.ALLOWED_ORIGINS),
    },
  };
}
