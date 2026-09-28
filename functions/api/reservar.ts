// POST /api/reservar — Cloudflare Pages Function (FINAL-F5-B).
// Único camino soportado para reservar desde el frontend público: valida Turnstile,
// aplica rate limit y recién ahí llama a Supabase (gateway_reservar -> crear_reserva).
// `onRequest` (y no `onRequestPost`) para responder 405 con nuestro JSON en otros métodos.
// Toda la lógica vive en _lib/reservar.ts para poder probarla sin el runtime de Pages.

import type { Env } from "../_lib/env";
import { manejarReservar } from "../_lib/reservar";

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  manejarReservar(request, env, { fetchImpl: (input, init) => fetch(input, init) });
