// agenda.presentacion.tsx — R3. Formateo de UI puro para los bloques de la
// grilla (desktop y mobile comparten este mismo texto/estilo): a propósito
// vive separado de agenda.logic.ts (esa es la lógica de negocio de la
// grilla, fuera de alcance de R3) y de agenda.grid.ts (esa solo agrupa
// celdas en bloques, sin saber nada de texto/color).

import type { ReactNode } from "react";
import { Repeat2 } from "lucide-react";
import type { CeldaOcupada } from "./agenda.grid";

// Presentation identity only: materialized occurrences retain their origin.
// Blocked slots keep their neutral identity even if they carry a fixed ID.
export function esTurnoFijoVisual(celda: CeldaOcupada): boolean {
  return celda.estado === "fijo" || (celda.estado === "reserva" && Boolean(celda.reserva.turno_fijo_id));
}

function IndicadorTurnoFijo() {
  return <Repeat2 size={12} strokeWidth={1.75} className="shrink-0 text-secondary" role="img" aria-label="Turno fijo" />;
}

// Mismo texto que ya mostraba admin.html/B6 — solo se le agrega la nota de
// pago pendiente al final cuando corresponde (nueva, R3: "indicador
// discreto" también como texto para el tooltip nativo).
export function tituloCelda(celda: CeldaOcupada): string {
  if (celda.estado === "fijo") {
    return `Turno fijo: ${celda.turnoFijo.nombre} · ${celda.turnoFijo.telefono} · ${celda.turnoFijo.horaInicio}-${celda.turnoFijo.horaFin}`;
  }
  if (celda.estado === "bloqueado") return `Bloqueado (${celda.reserva.horaInicio}-${celda.reserva.horaFin})`;
  const base = `${esTurnoFijoVisual(celda) ? "Turno fijo: " : ""}${celda.reserva.nombre} · ${celda.reserva.telefono} · ${celda.reserva.horaInicio}-${celda.reserva.horaFin}`;
  return estaPagoPendiente(celda) ? `${base} · Pago pendiente` : base;
}

export function nombreCelda(celda: CeldaOcupada): string {
  if (celda.estado === "fijo") return celda.turnoFijo.nombre;
  if (celda.estado === "bloqueado") return "Bloqueado";
  return celda.reserva.nombre;
}

export function horaInicioCelda(celda: CeldaOcupada): string {
  return celda.estado === "fijo" ? celda.turnoFijo.horaInicio : celda.reserva.horaInicio;
}

// "Pago pendiente" = ningún monto registrado todavía — mismo criterio que ya
// usa JugadaItem en ReservasView.tsx (reservas.logic.ts no expone esto como
// función propia, es una comparación de una línea, no vale la pena importar
// nada de ahí para esto). Solo aplica a reservas reales (bloqueado/fijo no
// tienen concepto de pago).
export function estaPagoPendiente(celda: CeldaOcupada): boolean {
  if (celda.estado !== "reserva") return false;
  return Number(celda.reserva.pago_efectivo || 0) + Number(celda.reserva.pago_transferencia || 0) === 0;
}

// Estilos por estado — paleta Court Graphite (tokens.css): reserva=success,
// fijo=secondary (cian, "diferenciado con secundario/cian" del pedido),
// bloqueado=tratamiento neutro con rayado diagonal (repeating-linear-gradient
// en vez de una clase de Tailwind: no hay utility para stripes en este
// sistema, y es un solo uso puntual, no amerita agregar una).
//
// R3.1 — el fondo de reserva/fijo pasó de un token "-muted" (rgba
// translúcido) a un color-mix() OPACO (mezclado sobre --color-surface, que sí
// es sólido): con un fondo translúcido, las líneas de hora/media hora de la
// columna (dibujadas en el padre) se seguían viendo por transparencia
// *adentro* del bloque — justo el defecto reportado ("las líneas de la
// grilla no deben atravesar el interior del bloque"). Con el fondo opaco, el
// bloque tapa la grilla por completo sin necesitar trucos de z-index.
export function estiloBloque(celda: CeldaOcupada): { className: string; style?: React.CSSProperties } {
  if (esTurnoFijoVisual(celda)) {
    return {
      className: "border-l-[3px] border-secondary text-text",
      style: { backgroundColor: "color-mix(in srgb, var(--color-secondary) 22%, var(--color-surface))" },
    };
  }
  if (celda.estado === "bloqueado") {
    return {
      className: "border-l-[3px] border-border-strong text-muted",
      style: {
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--color-surface-2) 0px, var(--color-surface-2) 5px, var(--color-surface-hover) 5px, var(--color-surface-hover) 10px)",
      },
    };
  }
  return {
    className: "border-l-[3px] border-success text-text",
    style: { backgroundColor: "color-mix(in srgb, var(--color-success) 22%, var(--color-surface))" },
  };
}

// Badge "en juego" — reemplaza la antigua línea horizontal de "hora actual"
// (R9.1-fix): en vez de una línea atravesando toda la agenda, el bloque que
// está efectivamente en curso ahora mismo se marca desde adentro. Mismo cian
// (--color-secondary) que ya usaba esa línea — sigue sin ser un color de
// error/aviso, es solo referencia horaria.
function BadgeEnJuego() {
  return (
    <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-on-accent">
      En juego
    </span>
  );
}

// >=60min: hora + nombre en dos líneas. 30-45min: "10:00 · Nombre" en una
// sola línea (pedido explícito de R3, sección "OBJETIVO DESKTOP"). R3.1 —
// jerarquía hora/nombre más clara: la hora queda como dato principal (texto
// pleno), el nombre como secundario (levemente atenuado), en vez de que
// ambas líneas compitan con el mismo peso visual.
export function AgendaBloqueContenido({
  celda,
  duracionMin,
  enCurso = false,
  metadata,
}: {
  celda: CeldaOcupada;
  duracionMin: number;
  enCurso?: boolean;
  // Optional compact content supplied only when supported by real data.
  metadata?: ReactNode;
}) {
  const nombre = nombreCelda(celda);
  const hora = horaInicioCelda(celda);
  const esFijo = esTurnoFijoVisual(celda);
  if (duracionMin >= 60) {
    return (
      <span className="flex w-full min-w-0 flex-col items-start gap-0.5 leading-tight">
        <span className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
          <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-tight">{hora}</span>
          {enCurso && <BadgeEnJuego />}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 text-[11px] font-medium text-text-secondary">
          {esFijo && <IndicadorTurnoFijo />}
          <span className="truncate">{nombre}</span>
        </span>
        {duracionMin >= 90 && (
          <span className="text-[10px] tabular-nums text-muted">
            Hasta {celda.estado === "fijo" ? celda.turnoFijo.horaFin : celda.reserva.horaFin}
          </span>
        )}
        {metadata && <span className="flex w-full min-w-0 flex-wrap gap-1 text-[10px] text-muted">{metadata}</span>}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1 leading-tight">
      {esFijo && <IndicadorTurnoFijo />}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
        {hora} · {nombre}
      </span>
      {enCurso && <BadgeEnJuego />}
    </span>
  );
}
