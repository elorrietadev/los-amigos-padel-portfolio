// useEsDesktop — R3. A diferencia del corte sidebar/bottom-nav de AppShell
// (puramente CSS, `hidden lg:block` — ver comentario de cabecera de
// AppShell.tsx), la Agenda necesita saber el breakpoint en JS: desktop y
// mobile son dos árboles de contenido DISTINTOS (grilla semanal con bloques
// absolutos vs. vista de un solo día con selector), no una misma grilla
// escondida con CSS — renderizar los dos a la vez duplicaría cada
// reserva/turno fijo en el DOM. Mismo breakpoint que Tailwind `lg` (1024px),
// para que ambos criterios sigan coincidiendo visualmente.
//
// jsdom (entorno de tests) no implementa `window.matchMedia` — fallback a
// `window.innerWidth` (jsdom arranca en 1024px, exactamente el corte: cae del
// lado desktop, que es lo que ya esperan los tests existentes de AgendaView).

import { useEffect, useState } from "react";



function leerEsDesktop(minWidth: number): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia === "function") return window.matchMedia(`(min-width: ${minWidth}px)`).matches;
  return window.innerWidth >= minWidth;
}

export function useEsDesktop(minWidth = 1024): boolean {
  const [esDesktop, setEsDesktop] = useState(() => leerEsDesktop(minWidth));

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (typeof window.matchMedia === "function") {
      const mql = window.matchMedia(`(min-width: ${minWidth}px)`);
      const onChange = () => setEsDesktop(mql.matches);
      onChange();
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    const onResize = () => setEsDesktop(window.innerWidth >= minWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minWidth]);

  return esDesktop;
}
