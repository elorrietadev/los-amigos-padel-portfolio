/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useViewportDock } from "./useViewportDock";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Dock() {
  const ref = useViewportDock("--test-dock", 12);
  return <nav ref={ref} aria-label="Dock" />;
}

it("tracks the visible viewport, measures content clearance, and cleans up", () => {
  const viewport = Object.assign(new EventTarget(), { height: 600, offsetTop: 0, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 75 } as DOMRect);
  const { unmount } = render(<Dock />);
  const nav = screen.getByRole("navigation");
  expect(nav.style.marginBottom).toBe("200px");
  expect(document.documentElement.style.getPropertyValue("--test-dock")).toBe("299px");
  viewport.height = 720; viewport.offsetTop = 30;
  viewport.dispatchEvent(new Event("scroll"));
  expect(nav.style.marginBottom).toBe("50px");
  viewport.height = 800; viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event("resize"));
  expect(nav.style.marginBottom).toBe("0px");
  unmount();
  viewport.height = 400; viewport.dispatchEvent(new Event("resize"));
  expect(document.documentElement.style.getPropertyValue("--test-dock")).toBe("");
});

it("leaves pinch zoom panning to the browser", () => {
  vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { height: 300, offsetTop: 20, scale: 2 }));
  render(<Dock />);
  expect(screen.getByRole("navigation").style.marginBottom).toBe("0px");
});
