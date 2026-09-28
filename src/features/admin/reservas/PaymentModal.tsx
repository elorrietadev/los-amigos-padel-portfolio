// PaymentModal — FINAL-F6. Registra MOVIMIENTOS de pago de una reserva
// (reserva_pago_movimientos), nunca sobrescribe un total:
//
//   Cobrar      dinero que entra. Selector Efectivo / Transferencia / Mixto
//               orientado a cobrar TODO EL SALDO pendiente: arranca en
//               Efectivo con el saldo precargado (no se escribe el importe);
//               Transferencia lo pasa a ese medio; Mixto muestra los dos
//               importes enlazados (siempre suman el saldo, ninguno lo
//               supera). Es solo UX: al guardar sigue siendo un movimiento
//               `cobro` común por registrar_movimiento_pago.
//   Reintegrar  dinero que se devuelve, por el MISMO medio en que se cobró
//               (cada medio <= lo cobrado en ese medio). Motivo obligatorio.
//   Corregir    ajuste administrativo de un error de carga: el usuario indica
//               el valor FINAL correcto por medio y se registran diferencias.
//               Motivo obligatorio + confirmación. No es un reintegro.
//
// Siempre muestra: cuánto está registrado, cuánto se agrega/corrige, por qué
// medio y el resultado final. Abajo, el historial inmutable de movimientos.
//
// Idempotencia: `operacionId` se genera al abrir el modal y se reusa en cada
// reintento (timeout, error de red, doble click): el servidor devuelve el
// resultado original en vez de registrar otro movimiento. `esperado*` viaja
// con lo que el modal mostró: si otra pestaña/otro admin registró algo en el
// medio, el servidor responde pago_desactualizado y no se pisa nada.

import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { SegmentedControl, type SegmentedOption } from "../../../components/ui/SegmentedControl";
import { aCentavos, formatearCentavos, type Centavos } from "../../../lib/dinero";
import { fechaContableDe, horaContableDe } from "../../../lib/fechaContable";
import { useClaveIdempotencia } from "../../../lib/idempotencia";
import { ConfirmModal } from "../components/ConfirmModal";
import { PaymentSegmented } from "../components/PaymentSegmented";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  LABEL_TIPO_MOVIMIENTO,
  estadoPagoActual,
  importesCobroPorMedio,
  mensajeErrorMovimientoPago,
  parametrosMovimiento,
  previsualizarPago,
  repartirCobroMixto,
  requiereRecargarPago,
  type MedioCobro,
  type MovimientoPagoRow,
  type ResultadoMovimientoPago,
  type TipoMovimientoPago,
  type TipoMovimientoRegistrado,
} from "./pagos.logic";
import { obtenerMovimientosPago, registrarMovimientoPago, type ParametrosMovimientoPago } from "./reservas.api";
import { formatearBadgeFecha } from "./reservas.logic";
import type { ReservaProcesada } from "./reservas.types";

export interface PaymentModalProps {
  reserva: ReservaProcesada;
  onClose: () => void;
  // Éxito confirmado por el servidor: el snapshot nuevo para patchear listas.
  onGuardado: (resultado: ResultadoMovimientoPago) => void;
  // El estado local quedó viejo (pago_desactualizado / key ya registrada /
  // reserva inexistente): el llamador recarga sus listas.
  onDesactualizado?: () => void;
  // Inyectables para tests (default: Supabase real).
  registrar?: (p: ParametrosMovimientoPago) => ReturnType<typeof registrarMovimientoPago>;
  cargarMovimientos?: (reservaId: string) => PromiseLike<{ data: MovimientoPagoRow[] | null; error: unknown }>;
}

const OPCIONES_TIPO: ReadonlyArray<SegmentedOption<TipoMovimientoPago>> = [
  { value: "cobro", label: "Cobrar" },
  { value: "reintegro", label: "Reintegrar" },
  { value: "correccion", label: "Corregir" },
];

const AYUDA_TIPO: Record<TipoMovimientoPago, string> = {
  cobro: "Registrá el dinero que recibiste ahora.",
  reintegro: "Dinero que devolvés al cliente, por el mismo medio en que se cobró. Sale de la caja de hoy.",
  correccion: "Solo para corregir un error de carga: indicá el valor correcto de cada medio. No usar para reintegros.",
};

const INPUT =
  "ui-transition mt-1 block w-full min-w-0 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums text-text placeholder:text-muted hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]";

function textoCentavos(c: Centavos): string {
  return c === 0 ? "" : (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
}

function signo(c: Centavos): string {
  return c > 0 ? `+${formatearCentavos(c)}` : c < 0 ? `−${formatearCentavos(-c)}` : formatearCentavos(0);
}

export function PaymentModal({
  reserva,
  onClose,
  onGuardado,
  onDesactualizado,
  registrar = registrarMovimientoPago,
  cargarMovimientos = obtenerMovimientosPago,
}: PaymentModalProps) {
  const estado = estadoPagoActual(reserva);
  const registradoTotal = estado.efectivo + estado.transferencia;
  const saldo = estado.precio - registradoTotal;

  const [tipo, setTipo] = useState<TipoMovimientoPago>("cobro");
  // Cobrar arranca en Efectivo con el saldo completo precargado (si hay saldo).
  const [medioCobro, setMedioCobro] = useState<MedioCobro>("efectivo");
  const [efectivo, setEfectivo] = useState(() => (saldo > 0 ? importesCobroPorMedio(saldo, "efectivo").efectivo : ""));
  const [transferencia, setTransferencia] = useState(() => (saldo > 0 ? importesCobroPorMedio(saldo, "efectivo").transferencia : ""));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false); // estado local viejo: solo cerrar
  const [confirmarCorreccion, setConfirmarCorreccion] = useState(false);
  const [movimientos, setMovimientos] = useState<MovimientoPagoRow[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState(false);
  const clave = useClaveIdempotencia();
  const enVueloRef = useRef(false);
  const dialogFocus = useDialogFocus(onClose, guardando || confirmarCorreccion);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve(cargarMovimientos(reserva.id)).then(
      ({ data, error }) => {
        if (cancelado) return;
        if (error) setErrorHistorial(true);
        else setMovimientos(data ?? []);
      },
      () => {
        if (!cancelado) setErrorHistorial(true);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [reserva.id, cargarMovimientos]);

  const preview = previsualizarPago(estado, tipo, efectivo, transferencia, motivo);
  const hayDatos = efectivo.trim() !== "" || transferencia.trim() !== "" || tipo === "correccion";

  function cambiarTipo(t: TipoMovimientoPago) {
    if (guardando) return;
    setTipo(t);
    setErrorServidor(null);
    // Cobrar: Efectivo con el saldo completo. Reintegrar: importes vacíos.
    // Corregir: valores finales, arrancan en lo registrado (Guardar sigue
    // deshabilitado hasta que algo cambie).
    if (t === "cobro") {
      aplicarMedioCobro("efectivo");
    } else if (t === "correccion") {
      setEfectivo(textoCentavos(estado.efectivo) || "0");
      setTransferencia(textoCentavos(estado.transferencia) || "0");
    } else {
      setEfectivo("");
      setTransferencia("");
    }
  }

  function aplicarMedioCobro(medio: MedioCobro) {
    setMedioCobro(medio);
    if (medio === "mixto") return; // conserva la división actual (ya suma el saldo)
    const importes = saldo > 0 ? importesCobroPorMedio(saldo, medio) : { efectivo: "", transferencia: "" };
    setEfectivo(importes.efectivo);
    setTransferencia(importes.transferencia);
  }

  function cambiarMedioCobro(medio: MedioCobro) {
    if (guardando || bloqueado) return;
    setErrorServidor(null);
    aplicarMedioCobro(medio);
  }

  function cambiarImporteMixto(campo: "efectivo" | "transferencia", texto: string) {
    const importes = repartirCobroMixto(saldo, campo, texto);
    if (!importes) return;
    setEfectivo(importes.efectivo);
    setTransferencia(importes.transferencia);
  }

  function cerrar() {
    if (guardando) return;
    onClose();
  }

  async function guardar() {
    if (enVueloRef.current || bloqueado || preview.error) return;
    enVueloRef.current = true;
    setGuardando(true);
    setErrorServidor(null);
    const params = parametrosMovimiento(estado, efectivo, transferencia);
    try {
      const { data, error } = await registrar({
        reservaId: reserva.id,
        operacionId: clave.actual(),
        tipo,
        efectivo: params.efectivo,
        transferencia: params.transferencia,
        motivo: tipo === "cobro" ? null : motivo.trim(),
        esperadoEfectivo: params.esperadoEfectivo,
        esperadoTransferencia: params.esperadoTransferencia,
      });
      if (error || !data) {
        setErrorServidor(mensajeErrorMovimientoPago(error));
        if (requiereRecargarPago(error)) {
          setBloqueado(true);
          onDesactualizado?.();
        }
        return;
      }
      clave.renovar();
      onGuardado(data);
    } catch {
      // Error de red / timeout: la operación pudo o no haber llegado. Se
      // conserva la clave: reintentar devuelve el resultado original si llegó.
      setErrorServidor("No hubo respuesta del servidor. Reintentá: si el movimiento ya se había registrado, no se duplica.");
    } finally {
      enVueloRef.current = false;
      setGuardando(false);
    }
  }

  function intentarGuardar() {
    if (preview.error || bloqueado) return;
    if (tipo === "correccion") {
      setConfirmarCorreccion(true);
      return;
    }
    void guardar();
  }

  const labelImporte = tipo === "correccion" ? "correcto" : tipo === "cobro" ? "recibido" : "devuelto";

  return (
    <>
      <div className="overlay-anim fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[3px]" onClick={cerrar}>
        <div
          {...dialogFocus}
          className="modal-pop max-h-[calc(100dvh-32px)] w-full max-w-[460px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-5 shadow-lg sm:p-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Pago del turno"
        >
          <h2 className="font-heading text-section-title font-bold text-text">Pago del turno</h2>
          <p className="mt-1 break-words text-body-sm text-muted">
            {reserva.nombre} · {formatearBadgeFecha(reserva.fecha)} {reserva.horaInicio}–{reserva.horaFin}
          </p>

          <dl className="my-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface-2 p-3 text-center" aria-label="Estado del pago">
            <div>
              <dt className="text-caption text-muted">Precio</dt>
              <dd className="font-heading text-base font-bold tabular-nums text-text">{formatearCentavos(estado.precio)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Registrado</dt>
              <dd className="font-heading text-base font-bold tabular-nums text-text" data-testid="pago-registrado">{formatearCentavos(registradoTotal)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Saldo</dt>
              <dd className={`font-heading text-base font-bold tabular-nums ${saldo > 0 ? "text-warning" : "text-success"}`}>{formatearCentavos(saldo)}</dd>
            </div>
            <p className="col-span-3 text-caption text-muted">
              Efectivo {formatearCentavos(estado.efectivo)} · Transferencia {formatearCentavos(estado.transferencia)}
            </p>
          </dl>

          <SegmentedControl ariaLabel="Tipo de movimiento" options={OPCIONES_TIPO} value={tipo} onChange={cambiarTipo} disabled={guardando || bloqueado} size="sm" />
          <p className="mt-2 text-xs text-muted">{AYUDA_TIPO[tipo]}</p>

          {tipo === "cobro" ? (
            saldo > 0 ? (
              <div className="mt-3">
                <PaymentSegmented
                  modo={medioCobro}
                  onModoChange={cambiarMedioCobro}
                  montoEfectivo={efectivo}
                  montoTransferencia={transferencia}
                  onMontoEfectivoChange={(v) => cambiarImporteMixto("efectivo", v)}
                  onMontoTransferenciaChange={(v) => cambiarImporteMixto("transferencia", v)}
                  disabled={guardando || bloqueado}
                  avisoMixto={<p className="text-xs text-muted">Suman el saldo: {formatearCentavos(saldo)}.</p>}
                />
                {medioCobro !== "mixto" && (
                  <p className="mt-2 text-sm font-semibold text-text" data-testid="cobro-resumen">
                    Cobro: {formatearCentavos(saldo)} {medioCobro === "efectivo" ? "en efectivo" : "por transferencia"}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">El turno no tiene saldo pendiente.</p>
            )
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <label className="flex min-w-0 flex-col text-xs text-muted">
                Efectivo {labelImporte}
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={efectivo}
                  onChange={(e) => setEfectivo(e.target.value)}
                  disabled={guardando || bloqueado || (tipo === "reintegro" && estado.efectivo === 0)}
                  className={INPUT}
                  aria-label={`Efectivo ${labelImporte}`}
                />
              </label>
              <label className="flex min-w-0 flex-col text-xs text-muted">
                Transferencia {labelImporte}
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={transferencia}
                  onChange={(e) => setTransferencia(e.target.value)}
                  disabled={guardando || bloqueado || (tipo === "reintegro" && estado.transferencia === 0)}
                  className={INPUT}
                  aria-label={`Transferencia ${labelImporte}`}
                />
              </label>
            </div>
          )}

          {tipo !== "cobro" && (
            <label className="mt-3 flex flex-col text-xs text-muted">
              Motivo (obligatorio)
              <input
                type="text"
                maxLength={200}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={guardando || bloqueado}
                className={INPUT}
                placeholder={tipo === "reintegro" ? "Ej.: cancelación, se devolvió el pago" : "Ej.: se cargó efectivo pero fue transferencia"}
              />
            </label>
          )}

          <div className="mt-4 rounded-lg border border-border p-3 text-xs" aria-live="polite" data-testid="pago-resultado">
            <div className="flex justify-between gap-2">
              <span className="text-muted">Movimiento</span>
              <span className="text-right tabular-nums text-text">
                {preview.deltaEfectivo === 0 && preview.deltaTransferencia === 0
                  ? "—"
                  : [
                      preview.deltaEfectivo !== 0 ? `${signo(preview.deltaEfectivo)} efectivo` : null,
                      preview.deltaTransferencia !== 0 ? `${signo(preview.deltaTransferencia)} transferencia` : null,
                    ].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-muted">Registrado</span>
              <span className="tabular-nums text-text">
                {formatearCentavos(registradoTotal)} → {formatearCentavos(preview.efectivoFinal + preview.transferenciaFinal)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-muted">Saldo</span>
              <span className="tabular-nums text-text">{formatearCentavos(preview.saldoFinal)}</span>
            </div>
          </div>

          {hayDatos && preview.error && <p role="alert" className="mt-2 text-xs font-semibold text-error">{preview.error}</p>}
          {errorServidor && <p role="alert" className="mt-2 text-xs font-semibold text-error">{errorServidor}</p>}

          <div className="sticky -bottom-5 mt-4 flex justify-end gap-2.5 border-t border-border bg-surface-elevated pt-4 pb-1 sm:-bottom-6">
            <Button variant="secondary" onClick={cerrar} disabled={guardando}>
              {bloqueado ? "Cerrar" : "Cancelar"}
            </Button>
            <Button onClick={intentarGuardar} loading={guardando} disabled={!!preview.error || bloqueado}>
              {guardando ? "Guardando..." : tipo === "cobro" ? "Registrar cobro" : tipo === "reintegro" ? "Registrar reintegro" : "Registrar corrección"}
            </Button>
          </div>

          <section className="mt-4 border-t border-border pt-3" aria-label="Historial de movimientos">
            <h3 className="text-caption font-bold tracking-wide text-muted uppercase">Historial de movimientos</h3>
            {errorHistorial ? (
              <p className="mt-2 text-xs text-warning">No se pudo cargar el historial.</p>
            ) : movimientos === null ? (
              <p className="mt-2 text-xs text-muted">Cargando historial…</p>
            ) : movimientos.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Sin movimientos.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {movimientos.map((m) => {
                  const c = aCentavos(m.importe);
                  return (
                    <li key={m.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 text-muted">
                        {fechaContableDe(m.creado).split("-").reverse().join("/")} {horaContableDe(m.creado)} ·{" "}
                        {LABEL_TIPO_MOVIMIENTO[m.tipo as TipoMovimientoRegistrado] ?? m.tipo} · {m.medio}
                        {m.motivo ? <span className="block break-words">{m.motivo}</span> : null}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${c < 0 ? "text-error" : "text-text"}`}>{signo(c)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {confirmarCorreccion && (
        <ConfirmModal
          ariaLabel="Confirmar corrección de pago"
          zIndexClassName="z-[51]"
          mensaje={`Vas a corregir lo registrado: ${[
            preview.deltaEfectivo !== 0 ? `${signo(preview.deltaEfectivo)} efectivo` : null,
            preview.deltaTransferencia !== 0 ? `${signo(preview.deltaTransferencia)} transferencia` : null,
          ].filter(Boolean).join(" y ")}. Una corrección es solo para errores de carga, no para devolver dinero. ¿Confirmás?`}
          confirmLabel="Registrar corrección"
          onClose={() => setConfirmarCorreccion(false)}
          onConfirm={() => {
            setConfirmarCorreccion(false);
            void guardar();
          }}
        />
      )}
    </>
  );
}
