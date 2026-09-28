import { useCambioEconomico } from "../economiaEvents";
// Hook de Caja — FINAL-F6. Caja se arma SOLO con movimientos reales (pagos de
// reservas, ventas, devoluciones) de la semana contable (lunes–domingo en
// Buenos Aires). No depende de las reservas cargadas en pantalla.
//
// Cache en memoria por semana (stale-while-revalidate): al volver a una
// semana ya vista se muestra el último dato válido y se revalida en segundo
// plano — también la anterior (un reintegro o una devolución de hoy puede
// referirse a algo de la semana pasada, pero su movimiento cae en HOY, y otro
// dispositivo pudo registrar algo). Guard anti-carrera por semana.

import { useCallback, useEffect, useRef, useState } from "react";
import { rangoSemanaContable } from "../../../lib/fechaContable";
import { obtenerDevolucionesParaCaja, obtenerMovimientosPagoParaCaja, obtenerVentasParaCaja } from "./caja.api";
import { calcularCajaRango, type DevolucionCaja, type MovimientoCaja, type ResumenCaja, type VentaCaja } from "./caja.logic";

export interface UseCajaSemanaResult {
  resumen: ResumenCaja;
  loading: boolean;
  error: boolean;
  revalidando: boolean;
  errorRevalidacion: boolean;
  offsetSemanas: number; // 0 = actual, -1 = anterior
  semanaInicio: string;
  semanaFin: string;
  irSemanaActual: () => void;
  irSemanaAnterior: () => void;
  reintentar: () => Promise<void>;
}

type EstadoCarga = "cargando" | "revalidando" | "error" | "error-revalidacion";

interface DatosSemana {
  movimientos: MovimientoCaja[];
  ventas: VentaCaja[];
  devoluciones: DevolucionCaja[];
}

export function useCajaSemana(ahora: number): UseCajaSemanaResult {
  const [offsetSemanas, setOffsetSemanas] = useState(0);
  const [estadoPorSemana, setEstadoPorSemana] = useState<Record<string, EstadoCarga>>({});
  const secuenciasRef = useRef<Map<string, number>>(new Map());
  const cacheRef = useRef<Map<string, DatosSemana>>(new Map());

  const { inicio: semanaInicio, fin: semanaFin } = rangoSemanaContable(ahora, offsetSemanas);
  const clave = `${semanaInicio}/${semanaFin}`;
  const cacheada = cacheRef.current.get(clave);
  const estado = estadoPorSemana[clave];

  const marcar = useCallback((claveSemana: string, valor: EstadoCarga | null) => {
    setEstadoPorSemana((prev) => {
      if (valor === null) {
        if (!(claveSemana in prev)) return prev;
        const { [claveSemana]: _descartado, ...resto } = prev;
        return resto;
      }
      return { ...prev, [claveSemana]: valor };
    });
  }, []);

  const cargar = useCallback(async () => {
    const miClave = `${semanaInicio}/${semanaFin}`;
    const teniaCache = cacheRef.current.has(miClave);
    const miSecuencia = (secuenciasRef.current.get(miClave) ?? 0) + 1;
    secuenciasRef.current.set(miClave, miSecuencia);
    marcar(miClave, teniaCache ? "revalidando" : "cargando");
    try {
      const [movsRes, ventasRes, devolucionesRes] = await Promise.all([
        obtenerMovimientosPagoParaCaja(semanaInicio, semanaFin),
        obtenerVentasParaCaja(semanaInicio, semanaFin),
        obtenerDevolucionesParaCaja(semanaInicio, semanaFin),
      ]);
      if (miSecuencia !== secuenciasRef.current.get(miClave)) return;
      if (movsRes.error || ventasRes.error || devolucionesRes.error) {
        marcar(miClave, teniaCache ? "error-revalidacion" : "error");
        return;
      }
      cacheRef.current.set(miClave, {
        movimientos: movsRes.data ?? [],
        ventas: ventasRes.data ?? [],
        devoluciones: devolucionesRes.data ?? [],
      });
      marcar(miClave, null);
    } catch {
      if (miSecuencia !== secuenciasRef.current.get(miClave)) return;
      marcar(miClave, teniaCache ? "error-revalidacion" : "error");
    }
  }, [semanaInicio, semanaFin, marcar]);

  useCambioEconomico(() => {
    secuenciasRef.current.forEach((seq, key) => secuenciasRef.current.set(key, seq + 1));
    cacheRef.current.clear();
    setEstadoPorSemana({});
    void cargar();
  });

  useEffect(() => {
    cargar();
  }, [cargar]);

  const resumen = calcularCajaRango(
    cacheada?.movimientos ?? [],
    cacheada?.ventas ?? [],
    cacheada?.devoluciones ?? [],
    semanaInicio,
    semanaFin,
  );

  return {
    resumen,
    loading: !cacheada && estado !== "error",
    error: !cacheada && estado === "error",
    revalidando: !!cacheada && estado === "revalidando",
    errorRevalidacion: !!cacheada && estado === "error-revalidacion",
    offsetSemanas,
    semanaInicio,
    semanaFin,
    irSemanaActual: () => setOffsetSemanas(0),
    irSemanaAnterior: () => setOffsetSemanas(-1),
    reintentar: cargar,
  };
}
