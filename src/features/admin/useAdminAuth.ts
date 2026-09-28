// Auth extraída de admin.html (líneas 378-383, 517-524, 822-830, 2107-2125).
// Reglas de autorización reales (quién puede loguearse, RLS, etc.) son
// autoritativas de Supabase Auth; este hook solo orquesta sesión/login/logout.
//
// E4.2 — gate estructural de admin: tener sesión (`authenticated`) ya no
// alcanza (ver auditoría E4). Toda sesión encontrada (login fresco o
// restaurada) pasa por `is_admin()` antes de considerarse "autenticado". Fail
// closed: mientras no podamos CONFIRMAR is_admin() === true (todavía
// verificando, error de red/RPC, o false), el panel no se renderiza.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

// Une los dos estados sueltos del legacy (sesion / cargandoSesion,
// admin.html:379-380) más el paso nuevo de autorización en una única unión
// discriminada: evita representar una combinación imposible (p.ej.
// "autenticado" sin haber confirmado is_admin() todavía).
export type EstadoAdminAuth =
  | { fase: "cargando" }
  | { fase: "sin_sesion" }
  | { fase: "verificando_autorizacion" }
  | { fase: "autenticado"; session: Session }
  | { fase: "no_autorizado" };

export interface UseAdminAuthResult {
  estado: EstadoAdminAuth;
  errorLogin: string | null;
  enviandoLogin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): UseAdminAuthResult {
  const [estado, setEstado] = useState<EstadoAdminAuth>({ fase: "cargando" });
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [enviandoLogin, setEnviandoLogin] = useState(false);

  const mountedRef = useRef(true);
  // Evita que el SIGNED_OUT que dispara nuestro propio signOut() (dentro de
  // resolverSesion, cuando is_admin() da false/error) pise el estado
  // "no_autorizado" con "sin_sesion" antes de que el usuario llegue a verlo.
  const forzandoSignOutPorNoAdminRef = useRef(false);
  // P5 — espejo de `estado`, actualizado post-render (efecto de abajo).
  // `resolverSesion` es un useCallback estable (deps `[]`, no puede depender
  // de `estado` directo sin resuscribir onAuthStateChange en cada cambio de
  // fase) pero necesita leer la fase ACTUAL para decidir si reabre el gate
  // visible o no — ver el comentario grande más abajo.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  // admin.html:517-524 — getSession() decide el gate de carga inicial;
  // onAuthStateChange es la fuente reactiva para todo lo que pase después
  // (login, logout, refresh de token). Ambos alimentan el mismo resolver.
  const resolverSesion = useCallback(async (session: Session | null) => {
    if (!mountedRef.current) return;

    if (!session) {
      if (forzandoSignOutPorNoAdminRef.current) {
        // Este SIGNED_OUT es el que nosotros mismos disparamos por no-admin:
        // "no_autorizado" ya está en pantalla, no lo pisamos con "sin_sesion".
        forzandoSignOutPorNoAdminRef.current = false;
        return;
      }
      setEstado({ fase: "sin_sesion" });
      return;
    }

    // P5 — supabase-js dispara onAuthStateChange (típicamente TOKEN_REFRESHED)
    // al volver a una pestaña en segundo plano, con la MISMA sesión ya
    // autenticada (auto-refresh de token ligado a visibilitychange). Sin este
    // atajo, cada uno de esos eventos reabría el gate completo
    // (verificando_autorizacion -> is_admin() -> autenticado) — y como
    // main-admin.tsx solo renderiza <AdminShell> mientras fase ===
    // "autenticado", ese parpadeo desmontaba TODO el panel (sección activa,
    // carrito de Vender, filtros — ver AdminShell.tsx/P5). El refetch de
    // is_admin() sigue ocurriendo igual (fail-closed intacto: si ahora da
    // false/error, sí se desloguea) — lo único que cambia es que no se
    // reabre el gate visible mientras se reconfirma un acceso que ya estaba
    // concedido para este mismo usuario.
    const yaAutenticadoMismoUsuario =
      estadoRef.current.fase === "autenticado" && estadoRef.current.session.user.id === session.user.id;
    if (!yaAutenticadoMismoUsuario) {
      setEstado({ fase: "verificando_autorizacion" });
    }

    const { data, error } = await supabase.rpc("is_admin");
    if (!mountedRef.current) return;

    // Fail closed: false Y error de red/RPC llevan al mismo desenlace. No hay
    // "conceder acceso por defecto" ante una falla de la verificación.
    if (error || data !== true) {
      forzandoSignOutPorNoAdminRef.current = true;
      setEstado({ fase: "no_autorizado" });
      await supabase.auth.signOut();
      return;
    }

    setEstado({ fase: "autenticado", session });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data }) => {
      resolverSesion(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolverSesion(session);
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [resolverSesion]);

  // admin.html:822-828 — el cambio a "autenticado" no lo hace este handler:
  // llega solo a través de onAuthStateChange -> resolverSesion (misma fuente
  // única del legacy, ahora con el paso de autorización adentro).
  const login = useCallback(async (email: string, password: string) => {
    setErrorLogin(null);
    setEnviandoLogin(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!mountedRef.current) return;
    setEnviandoLogin(false);
    if (error) setErrorLogin("Email o contraseña incorrectos.");
  }, []);

  // admin.html:830 — el legacy no maneja el error de signOut. Acá lo capturamos
  // para no dejarlo sin revisar, pero sin agregar UI/estado nuevo todavía:
  // si falla, la sesión simplemente queda como está.
  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // sin toast ni estado nuevo por ahora — la sesión queda como está.
    }
  }, []);

  return { estado, errorLogin, enviandoLogin, login, logout };
}
