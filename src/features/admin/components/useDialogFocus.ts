import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

interface FocusOptions { active?: boolean; modal?: boolean; trap?: boolean }
interface DialogEntry { element: HTMLDivElement; modal: boolean }
const dialogs: DialogEntry[] = [];
const inertBefore = new Map<HTMLElement, boolean>();
let bodyOverflow: string | null = null;

// Recompute isolation when a nested dialog opens/closes. Never leave its
// ancestor inert, and restore attributes owned by the page on final cleanup.
function isolateBackground() {
  inertBefore.forEach((value, element) => { element.toggleAttribute("inert", value); });
  inertBefore.clear();
  const modal = dialogs.some((entry) => entry.modal);
  if (modal && bodyOverflow === null) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (!modal && bodyOverflow !== null) {
    document.body.style.overflow = bodyOverflow;
    bodyOverflow = null;
  }
  if (!modal) return;
  let branch: HTMLElement | null = dialogs.at(-1)?.element ?? null;
  while (branch && branch !== document.body) {
    const parent: HTMLElement | null = branch.parentElement;
    for (const sibling of Array.from(parent?.children ?? [])) {
      if (sibling instanceof HTMLElement && sibling !== branch && !(branch === dialogs.at(-1)?.element && sibling === branch.previousElementSibling && sibling.hasAttribute("data-drawer-backdrop"))) {
        inertBefore.set(sibling, sibling.hasAttribute("inert"));
        sibling.setAttribute("inert", "");
      }
    }
    branch = parent;
  }
}

export function useDialogFocus(onClose: () => void, busy = false, {
  active = true, modal = false, trap = true,
}: FocusOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    // StrictMode repeats setup while focus is already inside the dialog.
    // Keep the original trigger across that replay.
    if (!element.contains(document.activeElement)) {
      opener.current = document.activeElement as HTMLElement | null;
    }
    const previous = opener.current;
    const entry = { element, modal };
    dialogs.push(entry);
    isolateBackground();
    element.focus({ preventScroll: true });
    function containFocus(event: FocusEvent) {
      if (trap && dialogs.at(-1) === entry && !element!.contains(event.target as Node)) {
        element!.focus({ preventScroll: true });
      }
    }
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      const wasTop = dialogs.at(-1) === entry;
      dialogs.splice(dialogs.indexOf(entry), 1);
      isolateBackground();
      const remainingTop = dialogs.at(-1);
      // React restores selection during the commit; restore the opener after it.
      queueMicrotask(() => {
        if (wasTop && dialogs.at(-1) === remainingTop && previous?.isConnected
          && !previous.closest("[inert], [hidden]")) previous.focus({ preventScroll: true });
      });
    };
  }, [active, modal, trap]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!active || dialogs.at(-1)?.element !== ref.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
    }
    if (event.key !== "Tab" || !trap) return;
    const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    ) ?? []).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
      && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
    const first = elements[0];
    const last = elements.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
      event.preventDefault(); first.focus();
    }
  }
  return { ref, tabIndex: -1, onKeyDown };
}
