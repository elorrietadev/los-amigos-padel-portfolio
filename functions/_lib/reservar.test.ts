// Tests de POST /api/reservar. Siteverify y Supabase están mockeados: no hay Internet.
import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { manejarReservar } from "./reservar";
import { SITEVERIFY_URL } from "./turnstile";

const SUPABASE = "https://proyecto.supabase.co";
const RPC_URL = `${SUPABASE}/rest/v1/rpc/gateway_reservar`;
const GATEWAY_KEY = "gw-secreto-de-prueba-0123456789abcdef";
const SERVICE_ROLE = "service-role-que-NO-debe-aparecer";

const ENV: Env = {
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAsecreto-de-prueba",
  TURNSTILE_ALLOWED_HOSTNAMES: "losamigospadel.site, www.losamigospadel.site",
  GATEWAY_KEY,
  RATE_LIMIT_PEPPER: "pepper-de-prueba",
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "anon-key-de-prueba",
};

const PAYLOAD = {
  fecha: "2026-10-05",
  horaInicio: "20:00",
  horaFin: "21:00",
  nombre: "Juan Perez",
  telefono: "1144441234",
  turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
};

const SITEVERIFY_OK = { success: true, hostname: "losamigospadel.site", action: "reservar", "error-codes": [] };

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
interface Llamada { url: string; init: RequestInit }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function montar(siteverify: Handler, supabase: Handler) {
  const llamadas: Llamada[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    llamadas.push({ url, init });
    if (url === SITEVERIFY_URL) return siteverify(url, init);
    if (url === RPC_URL) return supabase(url, init);
    throw new Error(`fetch inesperado: ${url}`);
  }) as unknown as typeof fetch;
  const logs: string[] = [];
  return {
    llamadas,
    logs,
    fetchImpl,
    sv: () => llamadas.filter((l) => l.url === SITEVERIFY_URL),
    rpc: () => llamadas.filter((l) => l.url === RPC_URL),
    correr: (req: Request, env: Env = ENV) => manejarReservar(req, env, { fetchImpl, log: (n, m) => logs.push(`${n}: ${m}`) }),
  };
}

function req(body: unknown, { headers = {}, method = "POST", raw }: { headers?: Record<string, string>; method?: string; raw?: string } = {}) {
  const init: RequestInit = { method, headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers } };
  if (method !== "GET" && method !== "HEAD") init.body = raw ?? JSON.stringify(body);
  return new Request("https://losamigospadel.site/api/reservar", init);
}

const okSupabase: Handler = () => json({ ok: true, precio: 10000 });
const okSiteverify: Handler = () => json(SITEVERIFY_OK);

describe("reserva legítima", () => {
  it("valida Turnstile, llama al gateway y devuelve solo ok+precio", async () => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, precio: 10000 });
    expect(m.sv()).toHaveLength(1);
    expect(m.rpc()).toHaveLength(1);
  });

  it("Siteverify recibe secret, token, remoteip (CF-Connecting-IP) e idempotency_key", async () => {
    const m = montar(okSiteverify, okSupabase);
    await m.correr(req(PAYLOAD));
    const body = new URLSearchParams(String(m.sv()[0]!.init.body));
    expect(body.get("secret")).toBe(ENV.TURNSTILE_SECRET_KEY);
    expect(body.get("response")).toBe(PAYLOAD.turnstileToken);
    expect(body.get("remoteip")).toBe("203.0.113.7");
    expect(body.get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("al gateway va la anon key + x-gateway-key, NUNCA service_role, y la IP solo como HMAC", async () => {
    const m = montar(okSiteverify, okSupabase);
    await m.correr(req(PAYLOAD));
    const { init } = m.rpc()[0]!;
    const h = init.headers as Record<string, string>;
    expect(h["x-gateway-key"]).toBe(GATEWAY_KEY);
    expect(h.apikey).toBe("anon-key-de-prueba");
    expect(h.Authorization).toBe("Bearer anon-key-de-prueba");
    expect(JSON.stringify(init)).not.toContain(SERVICE_ROLE);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ p_fecha: "2026-10-05", p_hora_inicio: "20:00", p_hora_fin: "21:00", p_nombre: "Juan Perez", p_telefono: "1144441234" });
    expect(body.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("203.0.113.7");
    expect(JSON.stringify(body)).not.toContain(PAYLOAD.turnstileToken);
  });

  it("los headers de la respuesta son no-store + nosniff (los _headers no aplican a Functions)", async () => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(PAYLOAD));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("hostname en mayúsculas o el alias www también valen", async () => {
    const m = montar(() => json({ ...SITEVERIFY_OK, hostname: "WWW.LosAmigosPadel.site" }), okSupabase);
    expect((await m.correr(req(PAYLOAD))).status).toBe(200);
  });
});

describe("Turnstile", () => {
  it("token ausente -> 403 TURNSTILE_FALLIDO, sin llamar a Siteverify ni a Supabase", async () => {
    const m = montar(okSiteverify, okSupabase);
    const { turnstileToken: _t, ...sinToken } = PAYLOAD;
    const res = await m.correr(req(sinToken));
    expect(res.status).toBe(403);
    expect((await res.json()).codigo).toBe("TURNSTILE_FALLIDO");
    expect(m.llamadas).toHaveLength(0);
  });

  it.each([["vacío", ""], ["no-string", 123], ["null", null]])("token %s -> 403", async (_n, token) => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req({ ...PAYLOAD, turnstileToken: token }));
    expect(res.status).toBe(403);
    expect(m.llamadas).toHaveLength(0);
  });

  it("token de más de 2048 caracteres -> 400 sin llamar a Siteverify", async () => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req({ ...PAYLOAD, turnstileToken: "a".repeat(2049) }, { headers: {} }));
    expect([400, 413]).toContain(res.status);
    expect(m.llamadas).toHaveLength(0);
  });

  it("token inválido -> 403 y NO se llama a Supabase", async () => {
    const m = montar(() => json({ success: false, "error-codes": ["invalid-input-response"] }), okSupabase);
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(403);
    expect((await res.json()).codigo).toBe("TURNSTILE_FALLIDO");
    expect(m.rpc()).toHaveLength(0);
  });

  it("token vencido / reutilizado (timeout-or-duplicate) -> 403", async () => {
    const m = montar(() => json({ success: false, "error-codes": ["timeout-or-duplicate"] }), okSupabase);
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(403);
    expect(m.rpc()).toHaveLength(0);
  });

  it("doble submit con el mismo token: el 2º lo rechaza Siteverify (single-use)", async () => {
    const usados = new Set<string>();
    const m = montar((_u, init) => {
      const t = new URLSearchParams(String(init.body)).get("response")!;
      if (usados.has(t)) return json({ success: false, "error-codes": ["timeout-or-duplicate"] });
      usados.add(t);
      return json(SITEVERIFY_OK);
    }, okSupabase);
    const r1 = await m.correr(req(PAYLOAD));
    const r2 = await m.correr(req(PAYLOAD));
    expect([r1.status, r2.status]).toEqual([200, 403]);
    expect(m.rpc()).toHaveLength(1);
  });

  it("hostname que no es el del sitio -> 403 (token emitido para otro dominio)", async () => {
    const m = montar(() => json({ ...SITEVERIFY_OK, hostname: "otro-sitio.com" }), okSupabase);
    expect((await m.correr(req(PAYLOAD))).status).toBe(403);
    expect(m.rpc()).toHaveLength(0);
  });

  it("hostname ausente -> 403", async () => {
    const m = montar(() => json({ success: true, action: "reservar" }), okSupabase);
    expect((await m.correr(req(PAYLOAD))).status).toBe(403);
  });

  it("action distinta -> 403", async () => {
    const m = montar(() => json({ ...SITEVERIFY_OK, action: "login" }), okSupabase);
    expect((await m.correr(req(PAYLOAD))).status).toBe(403);
    expect(m.rpc()).toHaveLength(0);
  });

  it("TURNSTILE_EXPECTED_ACTION configurable (claves de test devuelven action 'test' y hostname 'localhost')", async () => {
    const m = montar(() => json({ success: true, hostname: "localhost", action: "test" }), okSupabase);
    const res = await m.correr(req(PAYLOAD), { ...ENV, TURNSTILE_EXPECTED_ACTION: "test", TURNSTILE_ALLOWED_HOSTNAMES: "localhost" });
    expect(res.status).toBe(200);
  });

  describe("Siteverify caído (fail-closed)", () => {
    it("error de red en ambos intentos -> 503 ERROR_TEMPORAL, con 1 reintento, sin llamar a Supabase", async () => {
      const m = montar(() => { throw new TypeError("network"); }, okSupabase);
      const res = await m.correr(req(PAYLOAD));
      expect(res.status).toBe(503);
      expect((await res.json()).codigo).toBe("VERIFICACION_NO_DISPONIBLE");
      expect(m.sv()).toHaveLength(2);
      expect(m.rpc()).toHaveLength(0);
    });

    it("el reintento reusa el mismo idempotency_key", async () => {
      const m = montar(() => { throw new TypeError("network"); }, okSupabase);
      await m.correr(req(PAYLOAD));
      const keys = m.sv().map((l) => new URLSearchParams(String(l.init.body)).get("idempotency_key"));
      expect(keys[0]).toBe(keys[1]);
    });

    it("falla el 1º intento y el 2º responde bien -> reserva OK", async () => {
      let n = 0;
      const m = montar(() => (n++ === 0 ? new Response("boom", { status: 502 }) : json(SITEVERIFY_OK)), okSupabase);
      expect((await m.correr(req(PAYLOAD))).status).toBe(200);
    });

    it("Siteverify 500 -> 503", async () => {
      const m = montar(() => new Response("err", { status: 500 }), okSupabase);
      expect((await m.correr(req(PAYLOAD))).status).toBe(503);
      expect(m.rpc()).toHaveLength(0);
    });

    it("respuesta no-JSON -> 503", async () => {
      const m = montar(() => new Response("<html>", { status: 200 }), okSupabase);
      expect((await m.correr(req(PAYLOAD))).status).toBe(503);
    });

    it.each(["invalid-input-secret", "missing-input-secret", "internal-error"])(
      "error-code %s es un problema de config/CF, no del usuario -> 503 (y queda en el log)",
      async (code) => {
        const m = montar(() => json({ success: false, "error-codes": [code] }), okSupabase);
        const res = await m.correr(req(PAYLOAD));
        expect(res.status).toBe(503);
        expect(m.logs.join("\n")).toContain(code);
      },
    );
  });
});

describe("payload inválido", () => {
  const casos: Array<[string, unknown]> = [
    ["fecha imposible", { ...PAYLOAD, fecha: "2026-02-31" }],
    ["fecha con formato distinto", { ...PAYLOAD, fecha: "05/10/2026" }],
    ["hora inválida", { ...PAYLOAD, horaInicio: "25:00" }],
    ["hora fin inválida", { ...PAYLOAD, horaFin: "9pm" }],
    ["nombre no-string", { ...PAYLOAD, nombre: 42 }],
    ["nombre de 201 caracteres", { ...PAYLOAD, nombre: "a".repeat(201) }],
    ["teléfono no-string", { ...PAYLOAD, telefono: 1144441234 }],
    ["teléfono de 31 caracteres", { ...PAYLOAD, telefono: "1".repeat(31) }],
    ["campo faltante", { ...PAYLOAD, fecha: undefined }],
    ["array", [PAYLOAD]],
    ["null", null],
    ["string", "hola"],
  ];
  it.each(casos)("%s -> 400 PAYLOAD_INVALIDO sin tocar Siteverify ni Supabase", async (_n, body) => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(body));
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe("PAYLOAD_INVALIDO");
    expect(m.llamadas).toHaveLength(0);
  });

  it("JSON malformado -> 400", async () => {
    const m = montar(okSiteverify, okSupabase);
    expect((await m.correr(req(null, { raw: "{no-es-json" }))).status).toBe(400);
  });

  it("body de más de 4 KB -> 413 (sin content-length que lo delate)", async () => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(null, { raw: JSON.stringify({ ...PAYLOAD, relleno: "x".repeat(5000) }) }));
    expect(res.status).toBe(413);
    expect(m.llamadas).toHaveLength(0);
  });

  it("Content-Type distinto de application/json -> 415", async () => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(PAYLOAD, { headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });

  it("Content-Type con charset se acepta", async () => {
    const m = montar(okSiteverify, okSupabase);
    expect((await m.correr(req(PAYLOAD, { headers: { "content-type": "application/json; charset=utf-8" } }))).status).toBe(200);
  });

  it.each(["GET", "PUT", "DELETE", "PATCH", "OPTIONS"])("método %s -> 405 con Allow: POST", async (method) => {
    const m = montar(okSiteverify, okSupabase);
    const res = await m.correr(req(PAYLOAD, { method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(m.llamadas).toHaveLength(0);
  });

  it("Origin de otro sitio -> 403; el propio origen y ALLOWED_ORIGINS pasan", async () => {
    const m = montar(okSiteverify, okSupabase);
    expect((await m.correr(req(PAYLOAD, { headers: { origin: "https://malo.example" } }))).status).toBe(403);
    expect(m.llamadas).toHaveLength(0);
    expect((await m.correr(req(PAYLOAD, { headers: { origin: "https://losamigospadel.site" } }))).status).toBe(200);
    const m2 = montar(okSiteverify, okSupabase);
    const res = await m2.correr(req(PAYLOAD, { headers: { origin: "https://preview.pages.dev" } }), { ...ENV, ALLOWED_ORIGINS: "https://preview.pages.dev" });
    expect(res.status).toBe(200);
  });
});

describe("mapper de errores (Supabase -> respuesta pública)", () => {
  const esperados: Array<[string, number]> = [
    ["HORARIO_OCUPADO", 409],
    ["LIMITE_TELEFONO", 409],
    ["TELEFONO_BLOQUEADO", 403],
    ["TELEFONO_INVALIDO", 422],
    ["NOMBRE_INVALIDO", 422],
    ["FECHA_INVALIDA", 422],
    ["ANTICIPACION_MAXIMA_EXCEDIDA", 422],
    ["ANTICIPACION_MINIMA_NO_CUMPLIDA", 422],
    ["DURACION_INVALIDA", 422],
    ["FUERA_DE_HORARIO", 422],
    ["HORARIO_YA_PASO", 422],
    ["DIA_CERRADO", 422],
  ];
  it.each(esperados)("%s -> %i con el mismo código", async (codigo, status) => {
    const m = montar(okSiteverify, () => json({ ok: false, codigo }));
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, codigo });
  });

  it("DEMASIADOS_INTENTOS -> 429 con Retry-After y retryAfter", async () => {
    const m = montar(okSiteverify, () => json({ ok: false, codigo: "DEMASIADOS_INTENTOS", retry_after: 42 }));
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(await res.json()).toEqual({ ok: false, codigo: "DEMASIADOS_INTENTOS", retryAfter: 42 });
  });

  it("retry_after ausente o absurdo se acota", async () => {
    const m1 = montar(okSiteverify, () => json({ ok: false, codigo: "DEMASIADOS_INTENTOS" }));
    expect((await m1.correr(req(PAYLOAD))).headers.get("retry-after")).toBe("60");
    const m2 = montar(okSiteverify, () => json({ ok: false, codigo: "DEMASIADOS_INTENTOS", retry_after: 9e9 }));
    expect((await m2.correr(req(PAYLOAD))).headers.get("retry-after")).toBe("86400");
  });

  it.each([
    ["NO_AUTORIZADO (GATEWAY_KEY mal cargada)", { ok: false, codigo: "NO_AUTORIZADO" }],
    ["PAYLOAD_INVALIDO del SQL", { ok: false, codigo: "PAYLOAD_INVALIDO" }],
    ["ERROR_TEMPORAL del SQL", { ok: false, codigo: "ERROR_TEMPORAL" }],
    ["CONFIGURACION_NO_DISPONIBLE", { ok: false, codigo: "CONFIGURACION_NO_DISPONIBLE" }],
    ["código desconocido", { ok: false, codigo: "SELECT * FROM secretos" }],
    ["sin código", { ok: false }],
    ["ok sin precio", { ok: true }],
    ["precio no numérico", { ok: true, precio: "10000" }],
    ["array", []],
  ])("%s -> 503 RESERVA_INCIERTA genérico", async (_n, cuerpo) => {
    const m = montar(okSiteverify, () => json(cuerpo));
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, codigo: "RESERVA_INCIERTA" });
  });

  it("error SQL crudo / stack de PostgREST NO llega al cliente (solo el status al log)", async () => {
    const crudo = 'ERROR: relation "public.reservas" violates check constraint at pg_temp.stack\n    at Object.<anonymous> (/srv/app.js:1:1) SUPABASE_SERVICE_ROLE_KEY=abc';
    const m = montar(okSiteverify, () => new Response(JSON.stringify({ code: "42501", message: crudo, hint: "grant", details: crudo }), { status: 401 }));
    const res = await m.correr(req(PAYLOAD));
    const texto = await res.text();
    expect(res.status).toBe(503);
    for (const s of ["relation", "reservas", "stack", "SERVICE_ROLE", "42501", "grant", "supabase", "at Object"]) expect(texto).not.toContain(s);
    expect(m.logs.join("\n")).toContain("http 401");
    expect(m.logs.join("\n")).not.toContain("SERVICE_ROLE");
  });

  it("Supabase caído / timeout -> 503 sin detalle", async () => {
    const m = montar(okSiteverify, () => { throw new DOMException("timeout", "TimeoutError"); });
    const res = await m.correr(req(PAYLOAD));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, codigo: "RESERVA_INCIERTA" });
  });

  it("los logs nunca incluyen teléfono, nombre ni token", async () => {
    const m = montar(okSiteverify, () => json({ ok: false, codigo: "NO_AUTORIZADO" }));
    await m.correr(req(PAYLOAD));
    const logs = m.logs.join("\n");
    for (const s of [PAYLOAD.telefono, PAYLOAD.nombre, PAYLOAD.turnstileToken, GATEWAY_KEY]) expect(logs).not.toContain(s);
  });
});

describe("configuración (fail-closed)", () => {
  it.each(["TURNSTILE_SECRET_KEY", "GATEWAY_KEY", "RATE_LIMIT_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY", "TURNSTILE_ALLOWED_HOSTNAMES"] as const)(
    "falta %s -> 503, sin llamar a nadie, y el log nombra la variable pero no valores",
    async (nombre) => {
      const m = montar(okSiteverify, okSupabase);
      const res = await m.correr(req(PAYLOAD), { ...ENV, [nombre]: undefined });
      expect(res.status).toBe(503);
      expect(m.llamadas).toHaveLength(0);
      expect(m.logs.join("\n")).toContain(nombre);
      expect(m.logs.join("\n")).not.toContain(GATEWAY_KEY);
    },
  );

  it.each(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"])(
    "una secret key de TEST (%s) se rechaza salvo TURNSTILE_ALLOW_TEST_KEYS=true (aprobaría cualquier token)",
    async (clave) => {
      const m = montar(okSiteverify, okSupabase);
      const res = await m.correr(req(PAYLOAD), { ...ENV, TURNSTILE_SECRET_KEY: clave });
      expect(res.status).toBe(503);
      expect(m.llamadas).toHaveLength(0);
      expect(m.logs.join(" ")).toContain("clave de TEST");

      const permitido = montar(okSiteverify, okSupabase);
      const ok = await permitido.correr(req(PAYLOAD), { ...ENV, TURNSTILE_SECRET_KEY: clave, TURNSTILE_ALLOW_TEST_KEYS: "true" });
      expect(ok.status).toBe(200);
    },
  );

  it("SUPABASE_URL sin https -> 503", async () => {
    const m = montar(okSiteverify, okSupabase);
    expect((await m.correr(req(PAYLOAD), { ...ENV, SUPABASE_URL: "http://proyecto.supabase.co" })).status).toBe(503);
  });
});

describe("IP para el rate limit", () => {
  it("misma IP => mismo hash; IPv6 del mismo /64 => mismo hash; otro pepper => otro hash", async () => {
    const hashes: string[] = [];
    const correrCon = async (ip: string, pepper = "pepper-de-prueba") => {
      const m = montar(okSiteverify, okSupabase);
      await m.correr(req(PAYLOAD, { headers: { "cf-connecting-ip": ip } }), { ...ENV, RATE_LIMIT_PEPPER: pepper });
      return JSON.parse(String(m.rpc()[0]!.init.body)).p_ip_hash as string;
    };
    hashes.push(await correrCon("198.51.100.4"), await correrCon("198.51.100.4"));
    expect(hashes[0]).toBe(hashes[1]);
    expect(await correrCon("198.51.100.5")).not.toBe(hashes[0]);
    expect(await correrCon("2800:810:1:2:aaaa:bbbb:cccc:1")).toBe(await correrCon("2800:810:1:2:1111:2222:3333:4444"));
    expect(await correrCon("2800:810:1:3::1")).not.toBe(await correrCon("2800:810:1:2::1"));
    expect(await correrCon("198.51.100.4", "otro-pepper")).not.toBe(hashes[0]);
  });

  it("sin CF-Connecting-IP no falla: hash aleatorio (sin límite por IP) y deja un warning", async () => {
    const m = montar(okSiteverify, okSupabase);
    const r = new Request("https://losamigospadel.site/api/reservar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(PAYLOAD) });
    expect((await m.correr(r)).status).toBe(200);
    expect(m.logs.join("\n")).toContain("warn");
    expect(new URLSearchParams(String(m.sv()[0]!.init.body)).has("remoteip")).toBe(false);
  });
});

it("Siteverify timeout: dos intentos acotados, misma idempotency_key y ninguna reserva enviada", async () => {
  vi.useFakeTimers();
  const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController(); setTimeout(() => c.abort(new DOMException("timeout", "TimeoutError")), ms); return c.signal;
  });
  try {
    const m = montar((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
    }), okSupabase);
    const pendiente = m.correr(req(PAYLOAD));
    await vi.advanceTimersByTimeAsync(10000);
    const respuesta = await pendiente;
    expect(await respuesta.json()).toEqual({ ok: false, codigo: "VERIFICACION_NO_DISPONIBLE" });
    expect(m.sv()).toHaveLength(2);
    expect(m.rpc()).toHaveLength(0);
    expect(String(m.sv()[0].init.body)).toBe(String(m.sv()[1].init.body));
  } finally { spy.mockRestore(); vi.useRealTimers(); }
});
