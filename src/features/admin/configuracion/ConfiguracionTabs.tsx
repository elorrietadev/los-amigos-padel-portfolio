import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { CONFIG_SECTIONS, type ConfigSection } from "./configuracion.types";

export function ConfiguracionTabs({
  value,
  onChange,
}: {
  value: ConfigSection;
  onChange: (value: ConfigSection) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    function reveal() {
      const selected = container!.querySelector<HTMLElement>(
        '[aria-pressed="true"]',
      );
      if (!selected) return;
      const parent = container!.getBoundingClientRect();
      const child = selected.getBoundingClientRect();
      if (child.left < parent.left)
        container!.scrollLeft -= parent.left - child.left;
      if (child.right > parent.right)
        container!.scrollLeft += child.right - parent.right;
    }
    reveal();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [value]);
  return (
    <div ref={ref} className="config-tabs overflow-x-auto pb-2">
      <SegmentedControl
        options={CONFIG_SECTIONS}
        value={value}
        onChange={onChange}
        ariaLabel="Secciones de configuración"
        size="lg"
      />
    </div>
  );
}
import { useEffect, useRef } from "react";
