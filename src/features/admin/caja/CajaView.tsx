// CajaView (R2) — "Caja semanal" + "Cierre de caja" como destino propio de
// navegación, movido tal cual desde ReservasView (D7): mismas fórmulas
// (caja.logic.ts, sin tocar), mismo hook (useCajaSemana), mismo modal de
// exportación. Ningún cálculo cambió.
//
// `jugadas` llega por prop en vez de crear su propia instancia de
// useReservasJugadas: la lift AdminShell (mismo criterio que turnosFijos en
// C3) para que ReservasView y CajaView compartan la MISMA data — pagar un
// turno en Reservas sigue reflejándose acá al instante, sin refetch, porque
// ambas vistas leen el mismo `jugadas.data` con el mismo patch local
// (aplicarPago). Si CajaView tuviera su propia instancia del hook, esa
// garantía se perdería (dos copias independientes de la misma semana). Ver
// AdminShell.tsx e informe de R2.
//
// A diferencia de Agenda/Reservas (B8), CajaView NO queda siempre montada:
// no tiene ningún estado propio que valga la pena preservar entre cambios de
// tab (a diferencia del carrito de VenderView), así que AdminShell la
// monta/desmonta como al resto de los placeholders — mismo criterio que
// TurnosFijosView/BloqueosView. Por esto tampoco necesita señales/activo: al
// montarse ya arranca "activa", y el toast de error de `jugadas`
// (error/errorAnterior) vive en AdminShell (dueño único de esa instancia) en
// vez de acá, para no duplicarlo con el que ya dispara ReservasView (que sí
// sigue siempre montada).
//
// El resto (ventas/devoluciones de la semana) SÍ es una instancia propia de
// useCajaSemana acá adentro — ese hook ya buscaba esos datos por su cuenta
// (no dependía de nada compartido con Reservas), así que no hace falta
// levantarlo también.
//
// Único cambio de comportamiento real (no de cálculo): el modal "Exportar"
// siempre abre en rango "semana" — antes tomaba el filtro de fecha que
// hubiera activo en el buscador de Reservas, que ya no existe en esta
// pantalla separada.
//
// FINAL-F6 — los importes salen EXCLUSIVAMENTE de movimientos reales
// (pagos de reservas, ventas, devoluciones) por su fecha contable en Buenos
// Aires (useCajaSemana, sin depender de `jugadas`). `jugadas` alimenta solo el
// bloque OPERATIVO (turnos jugados sin cobrar / con saldo), que se muestra
// aparte y rotulado como no-caja. Todos los importes están en centavos.
//
// R8 — rediseño puramente visual: los mismos 8 valores de siempre (Bruto,
// Devoluciones, Neto, Efectivo neto, Transferencia neta, Reservas, Productos,
// Sin registrar) dejan de vivir en 3 filas de cards idénticas y pasan a
// agruparse por sentido (método de pago / origen / devoluciones / sin
// registrar / discrepancias), con Neto como número hero arriba de todo — ver
// CajaTile/CajaGrupo más abajo. Cero cambios en caja.logic.ts/useCajaSemana:
// mismos campos de ResumenCaja, mismo aria-label "Cierre de caja" (lo
// consume CajaView.test.tsx), mismos textos condicionales.

import { useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Banknote, Clock, PieChart, Undo2, Wallet } from "lucide-react";
import { configCancha } from "../../../config/canchaConfig";
import { formatearCentavos } from "../../../lib/dinero";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { SegmentedControl, type SegmentedOption } from "../../../components/ui/SegmentedControl";
import { useCajaSemana } from "./useCajaSemana";
import { calcularOperativoCaja } from "./caja.logic";
import { ExportarReporteModal } from "../reportes/ExportarReporteModal";
import type { UseReservasJugadasResult } from "../reservas/useReservasJugadas";

export interface CajaViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  jugadas: UseReservasJugadasResult;
}

// R9.1 — reemplaza el par de Button ghost (uno de los dos siempre disabled
// para marcar "la semana activa") por el SegmentedControl genérico: misma
// selección de fondo (offsetSemanas 0/-1), presentación con cápsula animada
// en vez de "disabled = seleccionado", que quedaba poco visible.
type SemanaCaja = "actual" | "anterior";
const OPCIONES_SEMANA_CAJA: ReadonlyArray<SegmentedOption<SemanaCaja>> = [
  { value: "actual", label: "Actual" },
  { value: "anterior", label: "Anterior" },
];

export function CajaView({ mostrarToast, jugadas }: CajaViewProps) {
  const [exportarModalAbierto, setExportarModalAbierto] = useState(false);

  const ahora = Date.now();
  const cajaSemana = useCajaSemana(ahora);
  const r = cajaSemana.resumen;

  const [reintentando, setReintentando] = useState(false);
  const cargando = reintentando || cajaSemana.loading;
  const listo = !cargando && !cajaSemana.error;

  // Operativo (no-caja): necesita que `jugadas` cubra la semana mirada.
  const reservasCubrenSemana = !!jugadas.semanaMasAntiguaJugados
    && jugadas.semanaMasAntiguaJugados <= cajaSemana.semanaInicio;
  const operativoListo = reservasCubrenSemana && !jugadas.loading && !jugadas.cargandoAnterior && !jugadas.error;
  const operativo = calcularOperativoCaja(jugadas.data, cajaSemana.semanaInicio, cajaSemana.semanaFin, ahora);

  async function irSemanaAnteriorCaja() {
    if (cajaSemana.offsetSemanas === -1) return;
    cajaSemana.irSemanaAnterior();
    if (jugadas.semanaMasAntiguaJugados && jugadas.semanaMasAntiguaJugados >= cajaSemana.semanaInicio) {
      await jugadas.cargarAnterior();
    }
  }

  async function reintentar() {
    setReintentando(true);
    try {
      await cajaSemana.reintentar();
    } finally {
      setReintentando(false);
    }
  }

  function cambiarSemanaCaja(semana: SemanaCaja) {
    if (semana === "actual") {
      cajaSemana.irSemanaActual();
    } else {
      irSemanaAnteriorCaja();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Hero — Neto de la semana. Mismo campo de siempre (netoTotal), ahora
          con la jerarquía tipográfica reservada para esto (--text-display,
          ver tokens.css: "números hero (ej. neto de Caja)"). */}
      {listo && <Card className="relative overflow-hidden border-accent/30 p-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
            <Wallet size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="text-label font-bold tracking-wide text-muted uppercase">Caja semanal</div>
            <div className={`font-heading break-all text-[clamp(1.75rem,6vw,2.75rem)] font-bold tabular-nums ${r.netoTotal < 0 ? "text-error" : "text-accent"}`}>{formatearCentavos(r.netoTotal)}</div>
          </div>
        </div>
      </Card>}

      <section aria-label="Cierre de caja" aria-busy={cargando}>
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5">
            <div className="text-label font-bold tracking-wide text-muted uppercase">
              Cierre de caja · {cajaSemana.offsetSemanas === 0 ? "esta semana" : "semana anterior"}
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                ariaLabel="Semana de caja"
                size="sm"
                options={OPCIONES_SEMANA_CAJA}
                value={cajaSemana.offsetSemanas === 0 ? "actual" : "anterior"}
                onChange={cambiarSemanaCaja}
              />
              <Button type="button" variant="secondary" size="sm" disabled={!listo} onClick={() => setExportarModalAbierto(true)}>
                Exportar
              </Button>
            </div>
          </div>

          {cargando ? (
            <p role="status" className="py-6 text-sm text-muted">Cargando caja completa…</p>
          ) : !listo ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 py-6">
              <p className="text-sm text-error">No se pudo cargar la caja completa. Los importes no están disponibles.</p>
              <Button variant="secondary" onClick={reintentar}>Reintentar</Button>
            </div>
          ) : <>
          {/* Revalidación silenciosa de la semana actual: los importes de abajo
              son el último dato válido (caché) y no se ocultan ni se tapan con
              el "Cargando" grande. Sin role="status" a propósito — ese role es
              del estado de carga completa. */}
          {cajaSemana.revalidando && (
            <p aria-live="polite" className="mt-3 text-caption text-muted">Actualizando…</p>
          )}
          {cajaSemana.errorRevalidacion && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-warning">
              <span>No se pudo actualizar. Se muestran los últimos datos cargados.</span>
              <Button type="button" variant="secondary" size="sm" onClick={cajaSemana.reintentar}>Reintentar</Button>
            </div>
          )}
          {/* Totales — el contexto que arma el Neto de arriba: bruto de la
              semana y el mismo neto, uno al lado del otro para poder ver de
              un vistazo cuánto se restó por devoluciones. */}
          <div className="mt-3.5 flex gap-2.5">
            <CajaTile label="Bruto" value={r.bruto} />
            <CajaTile label="Neto" value={r.netoTotal} />
          </div>

          <CajaGrupo titulo="Efectivo / transferencia (neto)" Icon={Banknote}>
            <CajaTile label="Efectivo" value={r.netoEfectivo} />
            <CajaTile label="Transferencia" value={r.netoTransferencia} />
          </CajaGrupo>

          <CajaGrupo titulo="Pagos de reservas / productos" Icon={PieChart}>
            <CajaTile label="Pagos de reservas" value={r.reservasBruto} />
            <CajaTile label="Productos" value={r.productosBruto} />
          </CajaGrupo>
          {(r.reintegrosReservasEfectivo + r.reintegrosReservasTransferencia > 0 ||
            r.correccionesReservasEfectivo !== 0 || r.correccionesReservasTransferencia !== 0) && (
            <p className="mt-2 text-xs text-muted">
              Pagos de reservas = cobros {formatearCentavos(r.cobrosReservasEfectivo + r.cobrosReservasTransferencia)}
              {" − "}reintegros {formatearCentavos(r.reintegrosReservasEfectivo + r.reintegrosReservasTransferencia)}
              {" ± "}correcciones {formatearCentavos(r.correccionesReservasEfectivo + r.correccionesReservasTransferencia)}.
            </p>
          )}

          <CajaGrupo titulo="Devoluciones de productos" Icon={Undo2}>
            <CajaTile label="Devoluciones" value={r.devolucionesTotal} full warnIfPositive />
          </CajaGrupo>

          {r.saldoMigradoExcluido > 0 && (
            <p className="mt-2 text-xs text-warning">
              {formatearCentavos(r.saldoMigradoExcluido)} de pagos migrados sin fecha real de cobro no se cuentan en esta caja.
            </p>
          )}
          </>}
        </Card>
      </section>

      {/* Operativo — información de turnos jugados (por fecha del turno). NO
          forma parte del cierre de caja y nunca modifica el neto. */}
      <section aria-label="Turnos jugados (operativo)">
        <Card className="p-4">
          <div className="text-label font-bold tracking-wide text-muted uppercase">Turnos jugados · operativo (no es caja)</div>
          {!operativoListo ? (
            <p role="status" className="py-3 text-sm text-muted">{jugadas.error || jugadas.errorAnterior ? "No se pudieron cargar los turnos jugados." : "Cargando turnos jugados…"}</p>
          ) : (
            <>
              <CajaGrupo titulo="Sin registrar" Icon={Clock}>
                <CajaTile label="Sin registrar" value={operativo.montoSinRegistrarReservas} full warnIfPositive />
              </CajaGrupo>
              {operativo.sinRegistrarReservas.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {operativo.sinRegistrarReservas.length === 1
                    ? "Hay 1 turno jugado esta semana sin ningún pago cargado."
                    : `Hay ${operativo.sinRegistrarReservas.length} turnos jugados esta semana sin ningún pago cargado.`}{" "}
                  Si se cobraron, registralos en &quot;Jugadas&quot; (Reservas): entran en la caja del día en que se registran.
                </p>
              )}
              {operativo.turnosConSaldo > 0 && (
                <CajaGrupo titulo="Saldo pendiente" Icon={AlertTriangle} warn>
                  <ul className="w-full space-y-1 text-xs text-warning">
                    <li>
                      {operativo.turnosConSaldo === 1 ? "1 turno jugado" : `${operativo.turnosConSaldo} turnos jugados`} con saldo pendiente:{" "}
                      {formatearCentavos(operativo.saldoPendienteReservas)}
                    </li>
                  </ul>
                </CajaGrupo>
              )}
            </>
          )}
        </Card>
      </section>

      {exportarModalAbierto && (
        <ExportarReporteModal
          rangoInicial="semana"
          ahora={ahora}
          nombreCancha={configCancha.nombreCancha}
          onClose={() => setExportarModalAbierto(false)}
          onExito={() => mostrarToast("Excel generado.", "ok")}
        />
      )}
    </div>
  );
}

interface CajaTileProps {
  label: string;
  value: number; // centavos
  full?: boolean;
  warnIfPositive?: boolean;
}

// Tile compacta reusada por todos los grupos — mismo estilo base para todas
// (bg-surface-2/border-border), la única variación es el color del valor:
// warning si es un monto que llama la atención (devoluciones/sin registrar)
// y hay algo > 0, muted si ese mismo campo está en $0, accent en el resto.
function CajaTile({ label, value, full, warnIfPositive }: CajaTileProps) {
  const esWarn = warnIfPositive && value > 0;
  const colorValor = value < 0 ? "text-error" : esWarn ? "text-warning" : warnIfPositive ? "text-muted" : "text-accent";
  return (
    <div className={`${full ? "w-full" : "min-w-0 flex-1"} rounded-md border border-border bg-surface-2 p-2.5`}>
      <div className="text-caption text-muted">{label}</div>
      <div className={`font-heading break-all text-lg font-bold tabular-nums ${colorValor}`}>{formatearCentavos(value)}</div>
    </div>
  );
}

interface CajaGrupoProps {
  titulo: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  warn?: boolean;
  children: ReactNode;
}

// Encabezado chico + fila de tiles — separa visualmente cada grupo pedido
// (Efectivo/Transferencia, Reservas/Productos, Devoluciones, Sin registrar,
// Faltante/Exceso) sin repetir la misma card 9 veces seguidas.
function CajaGrupo({ titulo, Icon, warn, children }: CajaGrupoProps) {
  return (
    <div className="mt-3.5">
      <div className={`mb-1.5 flex items-center gap-1.5 text-caption font-bold tracking-wide uppercase ${warn ? "text-warning" : "text-muted"}`}>
        <Icon size={13} strokeWidth={2.25} />
        {titulo}
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}
