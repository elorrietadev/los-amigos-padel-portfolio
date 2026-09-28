// Rediseño visual aprobado del login de admin.html (líneas 2107-2125): la
// funcionalidad es paridad estricta (email + password, error genérico, sin
// registro/recuperación), pero la UI no sigue el look legacy — decisión
// explícita del usuario ("la interfaz de login legacy me parece bastante
// fea"). Reutiliza tokens/utilities ya existentes (glass-blur, hover-lift,
// hover-glow-accent, .spinner, .anim-fadein) para mantener identidad con el
// index/baja nuevos sin copiar ninguna clase de admin.html.

import { useState, type FormEvent } from "react";
import { IconEye, IconEyeOff, IconLock, IconMail } from "./icons";

// R1 — compatibilidad mínima con el tema light (sección 15): el hex
// hardcodeado #CFE0D6 (mint claro) solo se pensó para fondo oscuro y queda
// prácticamente invisible sobre bg-surface-2 en light. Se cambia al token
// `text-muted`, que ya resuelve bien en los dos temas — sin rediseñar nada
// más de esta pantalla.
const labelClass =
  "mb-1 block text-[12px] font-bold tracking-wide text-muted uppercase [text-shadow:0_0_10px_rgba(215,242,109,0.08)]";
const inputClass =
  "state-fx w-full rounded-md border border-border bg-surface-2 py-3 pr-10 pl-10 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";

// Props en vez de llamar useAdminAuth acá adentro: main-admin.tsx es la única
// fuente de verdad de auth (un solo getSession/onAuthStateChange en todo el
// árbol) y decide qué renderizar según `estado.fase` — a este componente solo
// le pasa lo que necesita para pintar el gate de carga o el formulario.
// El caso "autenticado" ya no se maneja acá: lo resuelve AdminShell.
//
// E4.2 — `noAutorizado`: sesión válida pero is_admin() === false (o la
// verificación falló), ya deslogueada por el hook. Mismo formulario de login
// de siempre (por si el usuario se equivocó de cuenta), con un aviso extra
// explicando por qué volvió acá.
export interface AdminLoginProps {
  cargando: boolean;
  noAutorizado?: boolean;
  errorLogin: string | null;
  enviandoLogin: boolean;
  onLogin: (email: string, password: string) => void;
}

export function AdminLogin({ cargando, noAutorizado = false, errorLogin, enviandoLogin, onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Gate de carga inicial (paridad admin.html:2107) — nada de esto renderiza
  // ni el login ni el panel, así que no hay flicker de contenido protegido.
  if (cargando) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg" role="status" aria-live="polite">
        <span
          aria-hidden="true"
          className="spinner"
          style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(215,242,109,0.25)", borderTopColor: "#d7f26d" }}
        />
        <span className="text-[13px] text-muted">Cargando sesión...</span>
      </div>
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onLogin(email, password);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4">
      {/* Glows decorativos estáticos — mismos gradientes que GlowBackground
          (reservations-public), pero sin el parallax de scroll: acá no hay
          scroll que trackear, así que se simplifica a divs fijos. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="glow-respirar absolute -top-24 -right-20 h-80 w-80 rounded-full blur-[20px]"
          style={{ background: "radial-gradient(circle, rgba(215,242,109,0.28) 0%, rgba(215,242,109,0) 70%)" }}
        />
        <div
          className="glow-respirar absolute -bottom-20 -left-24 h-96 w-96 rounded-full blur-[20px]"
          style={{ background: "radial-gradient(circle, rgba(82,183,136,0.22) 0%, rgba(82,183,136,0) 70%)" }}
        />
      </div>

      <div
        className="anim-fadein glass-blur relative w-full max-w-[400px] rounded-lg border border-t-2 border-white/10 border-t-accent/50 bg-surface-glass p-8"
        style={{ boxShadow: "var(--shadow-card), var(--shadow-glow-accent)" }}
      >
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-wide text-text uppercase [text-shadow:0_0_18px_rgba(215,242,109,0.25)] sm:text-3xl">
            Los Amigos <span className="text-accent">Padel</span>
          </h1>
          <p className="mt-1 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase sm:text-[12px]">
            Panel de administración
          </p>
        </div>

        {noAutorizado && (
          <div
            role="alert"
            className="anim-fadein mb-3.5 rounded-md border border-error/40 bg-error/10 p-3 text-[14px] font-medium text-error"
          >
            Usuario no autorizado.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="admin-email" className={labelClass}>
              Email
            </label>
            <div className="relative">
              <IconMail size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                disabled={enviandoLogin}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@email.com"
              />
            </div>
          </div>

          <div className="mt-3.5">
            <label htmlFor="admin-password" className={labelClass}>
              Contraseña
            </label>
            <div className="relative">
              <IconLock size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={enviandoLogin}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="tap-fx absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {showPassword ? <IconEyeOff size={17} /> : <IconEye size={17} />}
              </button>
            </div>
          </div>

          {errorLogin && (
            <div role="alert" className="anim-shake mt-3.5 rounded-md border border-error/40 bg-error/10 p-3 text-[14px] font-medium text-error">
              {errorLogin}
            </div>
          )}

          <button
            type="submit"
            disabled={enviandoLogin}
            className="tap-fx state-fx hover-lift hover-glow-accent font-heading mt-5 min-h-[52px] w-full rounded-pill bg-accent text-[15px] font-bold tracking-wide text-on-accent uppercase shadow-[0_0_18px_rgba(215,242,109,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-70"
          >
            {enviandoLogin ? (
              <span className="anim-fadein inline-flex items-center justify-center gap-2">
                <span className="spinner" />
                Entrando...
              </span>
            ) : (
              <span className="anim-fadein inline-flex items-center justify-center gap-1.5">Entrar al panel</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
