// Presets de Motion del público (PUBLIC-R1) — reutiliza la librería motion/
// react ya instalada (misma que usa el admin, ver Sidebar.tsx), sin agregar
// dependencias nuevas. Define UNA sola curva/duraciones para todo el público
// (--pub-ease/--pub-duration-* en public-tokens.css tienen los mismos
// valores en CSS, para que las transiciones puramente CSS de los primitivos
// y las animaciones de Motion se sientan como el mismo sistema).
//
// Nada de esto está conectado todavía a ninguna pantalla real — eso es
// PUBLIC-R2+. Reglas del artifact aprobado que estos presets ya respetan:
// entradas de 220–240ms, sin bounce/overshoot grande, sin mover distancias
// grandes, reduced-motion siempre disponible (ver usarPubReducedMotion).
import { useReducedMotion, type Transition, type Variants } from "motion/react";

/** Cubic-bezier "premium decel" del público — igual valor que --pub-ease. */
export const PUB_EASE = [0.16, 1, 0.3, 1] as const;

export const PUB_TRANSITION = {
  instant: { duration: 0.12, ease: PUB_EASE } satisfies Transition,
  fast: { duration: 0.18, ease: PUB_EASE } satisfies Transition,
  base: { duration: 0.22, ease: PUB_EASE } satisfies Transition,
  slow: { duration: 0.24, ease: PUB_EASE } satisfies Transition,
};

/** Spring corto para cápsulas/indicadores animados con layoutId (nav activa,
 *  selección de chip) — mismo criterio que SPRING_CAPSULA del admin
 *  (Sidebar.tsx): corto, sin rebote perceptible. */
export const PUB_SELECTION_SPRING: Transition = { type: "spring", stiffness: 500, damping: 34, mass: 0.7 };

/** Entrada de pantalla completa (cambio de sección). Distancia chica a
 *  propósito (12px): nunca debe sentirse como que "vuela" contenido. */
export const pubScreenEnter: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: PUB_TRANSITION.slow },
  exit: { opacity: 0, y: -8, transition: PUB_TRANSITION.fast },
};

/** Entrada de una card individual (fuera de un stagger). */
export const pubCardEnter: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: PUB_TRANSITION.base },
};

/** Contenedor de stagger — usar junto con pubStaggerItem en los hijos
 *  directos (listas de horarios, productos, ocurrencias). */
export const pubStaggerContainer: Variants = {
  initial: {},
  animate: { transition: { delayChildren: (index: number) => Math.min(index, 4) * 0.025 } },
};

export const pubStaggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: PUB_TRANSITION.base },
};

/** Feedback de tap — pasar a `whileTap` de motion.*. Dos intensidades: la
 *  mayoría de los controles usa `press`; superficies grandes (cards) usan
 *  `pressSoft` para que el movimiento no se note exagerado. */
export const pubTap = {
  press: { scale: 0.96 },
  pressSoft: { scale: 0.985 },
};

/** Cambio de selección (precio, chip activo) — pop breve y controlado, sin
 *  overshoot mayor a 1.06. */
export const pubSelectionChange: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.3, ease: PUB_EASE },
  },
};

/** Wrapper del hook de Motion para dejar explícito, en el punto de uso, que
 *  el público siempre debe consultar reduced-motion antes de animar layout/
 *  transform (las transiciones CSS de los primitivos ya lo resuelven solo
 *  con `motion-reduce:`; esto es para el código que use motion.* directo). */
export function usarPubReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
