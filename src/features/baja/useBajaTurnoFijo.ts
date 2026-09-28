// Orquestación de la feature de baja, extraída de baja.html (líneas 123-176).
// El hook NO reimplementa ninguna regla de negocio: la ventana de cancelación
// (configurable desde C7, antes 4hs fijas), la validez del token y los
// códigos de error son autoritativos del servidor (baja.logic.ts solo
// interpreta el Json y formatea mensajes, baja.api.ts solo hace las 2
// llamadas RPC). Sin JSX.

import { useCallback, useEffect, useRef, useState } from "react";
import { darDeBajaTurnoFijo, obtenerTurnosFijosTitularPublico } from "./baja.api";
import { mapearErrorBajaTurnoFijo, parsearBajaTurnoFijoResultado, parsearTurnoFijoPublico } from "./baja.logic";
import type { TurnoFijoPublicoValido } from "./baja.types";

const CIERRE_MODAL_MS = 140; // baja.html:82

// Reemplaza los 3 useState sueltos del legacy (cargando/datos/error, baja.html:127-129)
// por una unión discriminada. token_invalido y error_carga quedan separados a
// propósito: el legacy los mezclaba en un solo string de error, pero acá se
// pide distinguir "el servidor dijo que el token no existe" de "la llamada RPC
// falló" (ej. red caída).
export type EstadoBajaTurnoFijo =
  | { fase: "sin_token" }
  | { fase: "cargando" }
  | { fase: "token_invalido" }
  | { fase: "error_carga" }
  | { fase: "datos"; datos: TurnoFijoPublicoValido };

// TF-R2 — antes alcanzaba con la fecha (1 solo horario por token); con varios
// turnos_fijos por titular hace falta saber también CUÁL horario se está
// confirmando/enviando, así que ambos viajan juntos.
export interface OcurrenciaSeleccionada {
  turnoFijoId: string;
  fecha: string;
}

export interface UseBajaTurnoFijoResult {
  estado: EstadoBajaTurnoFijo;
  confirmando: OcurrenciaSeleccionada | null; // ocurrencia en modal de confirmación (baja.html:130)
  cerrandoConfirmar: boolean;
  avisoFecha: string | null; // mensaje ya mapeado, listo para mostrar (baja.html:134)
  cerrandoAviso: boolean;
  enviando: boolean;
  exito: string | null; // fecha confirmada (baja.html:133)
  pedirBaja: (turnoFijoId: string, fecha: string) => void;
  cancelarConfirmacion: () => void;
  confirmarBaja: () => void;
  cerrarAviso: () => void;
  cerrarExito: () => void;
}

export function useBajaTurnoFijo(): UseBajaTurnoFijoResult {
  // baja.html:124-125 — leído una sola vez, nunca cambia durante la vida de la página.
  const [token] = useState(() => new URLSearchParams(window.location.search).get("t"));

  const [estado, setEstado] = useState<EstadoBajaTurnoFijo>(token ? { fase: "cargando" } : { fase: "sin_token" });
  const [confirmando, setConfirmando] = useState<OcurrenciaSeleccionada | null>(null);
  const [cerrandoConfirmar, setCerrandoConfirmar] = useState(false);
  const [avisoFecha, setAvisoFecha] = useState<string | null>(null);
  const [cerrandoAviso, setCerrandoAviso] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const confirmarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // baja.html:137-153
  const cargar = useCallback(async () => {
    if (!token) {
      setEstado({ fase: "sin_token" });
      return;
    }
    setEstado({ fase: "cargando" });
    const { data, error } = await obtenerTurnosFijosTitularPublico({ p_token: token });
    if (!mountedRef.current) return;
    if (error) {
      setEstado({ fase: "error_carga" });
      return;
    }
    const parsed = parsearTurnoFijoPublico(data);
    setEstado(parsed.valido ? { fase: "datos", datos: parsed } : { fase: "token_invalido" });
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    cargar();
    return () => {
      mountedRef.current = false;
    };
  }, [cargar]);

  useEffect(() => {
    return () => {
      if (confirmarTimeoutRef.current) clearTimeout(confirmarTimeoutRef.current);
      if (avisoTimeoutRef.current) clearTimeout(avisoTimeoutRef.current);
    };
  }, []);

  // baja.html:157-160 (pedirCierre) — instanciado una vez por modal en vez de
  // una función genérica parametrizada con setters, para no crear un hook
  // genérico de timers.
  const pedirCierreConfirmar = useCallback(() => {
    if (confirmarTimeoutRef.current) clearTimeout(confirmarTimeoutRef.current);
    setCerrandoConfirmar(true);
    confirmarTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setConfirmando(null);
      setCerrandoConfirmar(false);
    }, CIERRE_MODAL_MS);
  }, []);

  const pedirCierreAviso = useCallback(() => {
    if (avisoTimeoutRef.current) clearTimeout(avisoTimeoutRef.current);
    setCerrandoAviso(true);
    avisoTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setAvisoFecha(null);
      setCerrandoAviso(false);
    }, CIERRE_MODAL_MS);
  }, []);

  // baja.html:224 (botón "No voy" de cada ocurrencia)
  const pedirBaja = useCallback((turnoFijoId: string, fecha: string) => {
    setConfirmando({ turnoFijoId, fecha });
  }, []);

  // baja.html:239,248 — backdrop y botón "Volver" del modal de confirmación,
  // ambos con el mismo guard `!enviando` del legacy para no cerrar en medio de un envío.
  const cancelarConfirmacion = useCallback(() => {
    if (enviando) return;
    pedirCierreConfirmar();
  }, [enviando, pedirCierreConfirmar]);

  // baja.html:268,273 — backdrop y botón "Entendido" del modal de aviso.
  const cerrarAviso = useCallback(() => {
    pedirCierreAviso();
  }, [pedirCierreAviso]);

  // baja.html:287 — botón "Volver" del éxito. Sin timer de cierre: el legacy
  // hace `setExito(null)` directo, sin animación de salida para este overlay.
  const cerrarExito = useCallback(() => {
    setExito(null);
  }, []);

  // baja.html:162-176
  // C7 — guard `estado.fase === "datos"` (nuevo): `confirmando` solo puede
  // estar seteado en ese estado real (mismo motivo que el guard equivalente
  // en BajaPage), necesario para leer `estado.datos.cancelacion_horas_minimas`
  // con seguridad de tipos al armar el mensaje de `fuera_de_plazo`.
  const confirmarBaja = useCallback(async () => {
    if (enviando || !confirmando || !token || estado.fase !== "datos") return;
    const { turnoFijoId, fecha } = confirmando;
    setEnviando(true);
    const { data, error } = await darDeBajaTurnoFijo({ p_token: token, p_turno_fijo_id: turnoFijoId, p_fecha: fecha });
    if (!mountedRef.current) return;
    setEnviando(false);
    const resultado = error ? { ok: false as const, error: undefined } : parsearBajaTurnoFijoResultado(data);
    if (!resultado.ok) {
      setConfirmando(null);
      setAvisoFecha(mapearErrorBajaTurnoFijo(resultado.error, estado.datos.cancelacion_horas_minimas));
      return;
    }
    setConfirmando(null);
    setExito(fecha);
    cargar();
  }, [enviando, confirmando, token, estado, cargar]);

  return {
    estado,
    confirmando,
    cerrandoConfirmar,
    avisoFecha,
    cerrandoAviso,
    enviando,
    exito,
    pedirBaja,
    cancelarConfirmacion,
    confirmarBaja,
    cerrarAviso,
    cerrarExito,
  };
}
