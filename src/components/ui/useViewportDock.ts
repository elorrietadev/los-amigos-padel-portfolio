import { useLayoutEffect, useRef } from "react";

/** Keep a fixed dock inside the visual viewport, including browser chrome
 * and the keyboard. Reserve its measured height rather than a guessed pad. */
export function useViewportDock(variable: `--${string}`, gap: number) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    const viewport = window.visualViewport;
    const update = () => {
      // Preserve native panning when the user pinch-zooms.
      const inset = viewport && viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      dock.style.marginBottom = `${inset}px`;
      const height = dock.getBoundingClientRect().height;
      document.documentElement.style.setProperty(variable, `${height + gap + 12 + inset}px`);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(dock);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer?.disconnect();
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty(variable);
    };
  }, [variable, gap]);
  return ref;
}
