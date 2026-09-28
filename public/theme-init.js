// Anti-flash de tema (R1) — script clásico (no type="module"), bloqueante,
// que corre ANTES del primer paint: pone data-theme en <html> leyendo
// localStorage, así el CSS de tokens.css ya sabe qué tema pintar desde el
// primer frame en vez de arrancar en dark y saltar a light un instante
// después de que React monte. Solo se referencia desde admin/index.html —
// index.html/baja.html no tienen todavía sistema de temas (fuera de alcance
// de R1) y se quedan siempre en el dark por defecto de :root.
//
// Es un archivo estático aparte (no un <script> inline) a propósito: la CSP
// actual es `script-src 'self'` sin 'unsafe-inline' y sin nonce — un inline
// quedaría bloqueado. Cargarlo como archivo same-origin no requiere tocar la
// CSP para nada.
//
// La clave "lap-theme" tiene que coincidir con STORAGE_KEY en
// src/lib/theme.tsx — es la misma fuente de verdad leída desde dos lugares
// (acá antes del mount, el ThemeProvider después).
(function () {
  var STORAGE_KEY = "lap-theme";
  var theme = "dark";
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "light") {
      theme = "light";
    }
  } catch (e) {
    // localStorage inaccesible (modo privado estricto, cuota, etc.) — se
    // queda en "dark", el valor por defecto del sistema de temas.
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
