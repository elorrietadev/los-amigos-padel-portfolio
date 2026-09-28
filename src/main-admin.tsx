import { useEffect, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { desbloquearAudio } from "./features/admin/audio";
import { AdminLogin } from "./features/admin/AdminLogin";
import { AdminShell } from "./features/admin/AdminShell";
import { useAdminAuth } from "./features/admin/useAdminAuth";
import { ThemeProvider } from "./lib/theme";
import "./styles/globals.css";

// Única instancia de useAdminAuth en todo el árbol del admin — AdminLogin y
// AdminShell reciben lo que necesitan por props en vez de llamar al hook cada
// uno por su cuenta, para no terminar con dos getSession()/onAuthStateChange
// compitiendo por el mismo estado.
function AdminApp() {
  const { estado, errorLogin, enviandoLogin, login, logout } = useAdminAuth();

  // Desbloqueo de audio en la primera interacción válida (pointer/teclado),
  // acá y no en AdminLogin: cubre tanto el login fresco (el mismo click en
  // "Entrar al panel" ya es un gesto directo válido) como una sesión
  // restaurada (sin login, primer click en cualquier parte del panel).
  useEffect(() => {
    function desbloquear() {
      desbloquearAudio();
    }
    document.addEventListener("pointerdown", desbloquear, { once: true });
    document.addEventListener("keydown", desbloquear, { once: true });
    return () => {
      document.removeEventListener("pointerdown", desbloquear);
      document.removeEventListener("keydown", desbloquear);
    };
  }, []);

  if (estado.fase === "autenticado") {
    return <AdminShell onLogout={logout} />;
  }

  // E4.2 — "verificando_autorizacion" (sesión encontrada, esperando is_admin())
  // se muestra como el mismo gate de carga que "cargando": fail closed, nunca
  // se renderiza el panel ni el form de login mientras no se confirmó
  // is_admin() === true.
  return (
    <AdminLogin
      cargando={estado.fase === "cargando" || estado.fase === "verificando_autorizacion"}
      noAutorizado={estado.fase === "no_autorizado"}
      errorLogin={errorLogin}
      enviandoLogin={enviandoLogin}
      onLogin={login}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {/* R2 — configuración global de Motion (sección 9): "user" respeta
          prefers-reduced-motion del sistema operativo, sin que cada uso de
          Motion (la cápsula de la Sidebar hoy, drawers/sheets más adelante)
          tenga que acordarse de chequearlo por su cuenta. */}
      <MotionConfig reducedMotion="user">
        <AdminApp />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
