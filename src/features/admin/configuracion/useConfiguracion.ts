// useConfiguracion (C10) — conecta ConfiguracionView (presentación pura, sin
// tocar) al backend real: carga las 6 fuentes involucradas (precio base,
// horarios_semana, configuracion_cancha -compartida por Duraciones y
// Reservas-, tarifas por duración, tarifas por franja, fechas especiales),
// arma el `ConfigData`/`estados` que la vista espera y despacha `onGuardar`
// al RPC o UPDATE que corresponda según `item.tipo`. Mismo patrón de guard
// anti-race (secuenciaRef) que useProductos.ts/useTelefonosBloqueados.ts.
//
// Después de cada guardado exitoso se recarga la fuente afectada desde el
// backend (nunca un patch optimista) — el backend sigue siendo la única
// fuente de verdad de "qué quedó vigente".

import { useCallback, useEffect, useRef, useState } from "react";
import { hoyISO } from "../../../lib/datetime";
import {
  actualizarConfiguracionCancha,
  actualizarDatosPublicosCancha,
  actualizarHorarioDia,
  obtenerConfiguracionCancha,
  obtenerDatosPublicosCancha,
  obtenerFechasEspecialesVigentes,
  obtenerHorariosSemanaConfiguracion,
  obtenerPrecioBaseVigente,
  obtenerTarifasDuracionVigentes,
  obtenerTarifasFranjaVigentes,
  setFechaEspecial,
  setPrecioBase,
  setTarifaDuracion,
  setTarifaFranja,
} from "./configuracion.api";
import {
  CAMPOS_RESERVA,
  configCanchaADuracionesItem,
  configCanchaAReservasItems,
  datosPublicosAItems,
  esMultiploDe30,
  fechasAItems,
  horarioValuesAPatch,
  horariosAItems,
  idAHorarioDow,
  labelsADiasSemana,
  mapearErrorConfiguracion,
  parseEntero,
  parseNumero,
  precioBaseAItems,
  tarifasDuracionAItems,
  tarifasFranjaAItems,
  type ConfigCanchaRow,
  type DatosPublicosRow,
  type FechaEspecialRow,
  type HorarioRow,
  type PrecioBaseRow,
  type TarifaDuracionRow,
  type TarifaFranjaRow,
} from "./configuracion.adapter";
import type { ConfigData, ConfigEdit, ConfigSection, ConfigSectionState } from "./configuracion.types";

type Cargador<T> = () => PromiseLike<{ data: T | null; error: { message: string } | null }>;

function useFuente<T>(cargador: Cargador<T>, valorInicial: T) {
  const [datos, setDatos] = useState<T>(valorInicial);
  const [estado, setEstado] = useState<ConfigSectionState>({ fase: "loading" });
  const secuenciaRef = useRef(0);

  const cargar = useCallback(async () => {
    const miSecuencia = ++secuenciaRef.current;
    setEstado({ fase: "loading" });
    const { data, error } = await cargador();
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta

    if (error) {
      setEstado({ fase: "error", mensaje: mapearErrorConfiguracion(error.message) });
      return;
    }
    setDatos(data ?? valorInicial);
    setEstado({ fase: "loaded" });
    // valorInicial es literal/estable en cada call site (array/objeto vacío o null) — no hace falta en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargador]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { datos, estado, cargar };
}

function combinarEstado(a: ConfigSectionState, b: ConfigSectionState): ConfigSectionState {
  if (a.fase === "loading" || b.fase === "loading") return { fase: "loading" };
  if (a.fase === "error") return a;
  if (b.fase === "error") return b;
  return { fase: "loaded" };
}

const SIN_FILAS: never[] = [];

export interface UseConfiguracionResult {
  data: ConfigData;
  estados: Partial<Record<ConfigSection, ConfigSectionState>>;
  guardar: (edit: ConfigEdit) => Promise<void>;
  reintentar: (section: ConfigSection) => void;
}

export function useConfiguracion(): UseConfiguracionResult {
  const precioBase = useFuente<PrecioBaseRow | null>(obtenerPrecioBaseVigente, null);
  const horarios = useFuente<HorarioRow[]>(obtenerHorariosSemanaConfiguracion, SIN_FILAS);
  const configCancha = useFuente<ConfigCanchaRow | null>(obtenerConfiguracionCancha, null);
  const tarifasDuracion = useFuente<TarifaDuracionRow[]>(obtenerTarifasDuracionVigentes, SIN_FILAS);
  const tarifasFranja = useFuente<TarifaFranjaRow[]>(obtenerTarifasFranjaVigentes, SIN_FILAS);
  const fechas = useFuente<FechaEspecialRow[]>(obtenerFechasEspecialesVigentes, SIN_FILAS);
  const datosPublicos = useFuente<DatosPublicosRow | null>(obtenerDatosPublicosCancha, null);

  const data: ConfigData = {
    general: precioBaseAItems(precioBase.datos),
    horarios: horariosAItems(horarios.datos, hoyISO()),
    duraciones: configCanchaADuracionesItem(configCancha.datos),
    tarifas: [...tarifasDuracionAItems(tarifasDuracion.datos), ...tarifasFranjaAItems(tarifasFranja.datos)],
    reservas: configCanchaAReservasItems(configCancha.datos),
    fechas: fechasAItems(fechas.datos),
    publico: datosPublicosAItems(datosPublicos.datos),
  };

  const estados: Partial<Record<ConfigSection, ConfigSectionState>> = {
    general: precioBase.estado,
    horarios: horarios.estado,
    duraciones: configCancha.estado,
    tarifas: combinarEstado(tarifasDuracion.estado, tarifasFranja.estado),
    reservas: configCancha.estado,
    fechas: fechas.estado,
    publico: datosPublicos.estado,
  };

  const reintentar = useCallback(
    (section: ConfigSection) => {
      switch (section) {
        case "general":
          precioBase.cargar();
          return;
        case "horarios":
          horarios.cargar();
          return;
        case "duraciones":
        case "reservas":
          configCancha.cargar();
          return;
        case "tarifas":
          tarifasDuracion.cargar();
          tarifasFranja.cargar();
          return;
        case "fechas":
          fechas.cargar();
          return;
        case "publico":
          datosPublicos.cargar();
          return;
      }
    },
    [precioBase, horarios, configCancha, tarifasDuracion, tarifasFranja, fechas, datosPublicos],
  );

  const guardar = useCallback(
    async (edit: ConfigEdit) => {
      const { item } = edit;
      switch (item.tipo) {
        case "precio": {
          const precio = parseNumero(item.values.valor);
          if (precio === null || precio < 0) {
            throw new Error("El precio debe ser un número mayor o igual a 0.");
          }
          const { error } = await setPrecioBase(precio);
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await precioBase.cargar();
          return;
        }
        case "horario": {
          const dow = idAHorarioDow(item.id);
          if (!item.values.cerrado && (!item.values.apertura || !item.values.cierre)) {
            throw new Error("Completá la hora de apertura y cierre.");
          }
          const { error } = await actualizarHorarioDia(dow, horarioValuesAPatch(item.values));
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await horarios.cargar();
          return;
        }
        case "duraciones": {
          const minimo = parseEntero(item.values.minimo);
          const maximo = parseEntero(item.values.maximo);
          if (minimo === null || maximo === null) {
            throw new Error("Completá la duración mínima y máxima.");
          }
          if (!esMultiploDe30(minimo) || !esMultiploDe30(maximo)) {
            throw new Error("La duración mínima y máxima deben ser múltiplos de 30 minutos.");
          }
          if (minimo <= 0) throw new Error("La duración mínima debe ser mayor a 0.");
          if (maximo < minimo) throw new Error("La duración máxima no puede ser menor a la mínima.");
          const { error } = await actualizarConfiguracionCancha({
            duracion_minima_minutos: minimo,
            duracion_maxima_minutos: maximo,
          });
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await configCancha.cargar();
          return;
        }
        case "reserva": {
          const campo = CAMPOS_RESERVA.find((c) => c.id === item.id);
          if (!campo) throw new Error("No se pudo guardar. Revisá los valores e intentá de nuevo.");
          const valor = parseEntero(item.values.valor);
          if (valor === null || valor < campo.minimo) {
            throw new Error(
              campo.minimo > 0
                ? `${campo.titulo} debe ser un número mayor a 0.`
                : `${campo.titulo} debe ser un número mayor o igual a 0.`,
            );
          }
          const { error } = await actualizarConfiguracionCancha({ [campo.campo]: valor });
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await configCancha.cargar();
          return;
        }
        case "duracion": {
          const duracionMinutos = parseEntero(item.values.duracion);
          const activo = item.values.activo ?? false;
          const descuento = activo ? parseNumero(item.values.descuento) : null;
          if (duracionMinutos === null || duracionMinutos <= 0) {
            throw new Error("La duración debe ser un número mayor a 0.");
          }
          if (activo && (descuento === null || descuento < 0 || descuento > 100)) {
            throw new Error("El descuento debe ser un número entre 0 y 100.");
          }
          const { error } = await setTarifaDuracion(duracionMinutos, activo, descuento);
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await tarifasDuracion.cargar();
          return;
        }
        case "franja": {
          const activo = item.values.activo ?? false;
          const dias = labelsADiasSemana(item.values.dias ?? []);
          const apertura = item.values.apertura || null;
          const cierre = item.values.cierre || null;
          const descuento = activo ? parseNumero(item.values.descuento) : null;
          if (activo) {
            if (dias.length === 0) throw new Error("Seleccioná al menos un día para esta franja.");
            if (!apertura || !cierre) throw new Error("Completá la hora de apertura y cierre.");
            if (descuento === null || descuento < 0 || descuento > 100) {
              throw new Error("El descuento debe ser un número entre 0 y 100.");
            }
          }
          const franjaId = edit.nuevo ? crypto.randomUUID() : item.id;
          const { error } = await setTarifaFranja(
            franjaId,
            dias,
            apertura ?? "00:00",
            cierre ?? "00:00",
            activo,
            descuento,
          );
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await tarifasFranja.cargar();
          return;
        }
        case "fecha": {
          const activo = item.values.activo ?? true;
          const cerrado = item.values.cerrado ?? false;
          const apertura = cerrado ? null : item.values.apertura || null;
          const cierre = cerrado ? null : item.values.cierre || null;
          const tarifaTipo =
            item.values.tarifa === "descuento" ? "descuento_pct" : item.values.tarifa === "precio" ? "precio_hora_fijo" : null;
          const tarifaValor =
            tarifaTipo === "descuento_pct"
              ? parseNumero(item.values.descuento)
              : tarifaTipo === "precio_hora_fijo"
                ? parseNumero(item.values.valor)
                : null;
          if (!item.values.fecha) throw new Error("Elegí una fecha.");
          if (activo && !cerrado && (!apertura || !cierre)) {
            throw new Error("Completá la hora de apertura y cierre, o marcá el día como cerrado.");
          }
          if (activo && tarifaTipo && (tarifaValor === null || tarifaValor < 0)) {
            throw new Error("El valor de la tarifa especial no es válido.");
          }
          const { error } = await setFechaEspecial(item.values.fecha, activo, cerrado, apertura, cierre, tarifaTipo, tarifaValor);
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await fechas.cargar();
          return;
        }
        case "publico": {
          const nombreCancha = (item.values.nombreCancha ?? "").trim();
          const whatsappNumero = (item.values.whatsappNumero ?? "").trim();
          const instagramUrl = (item.values.instagramUrl ?? "").trim();
          const direccion = (item.values.direccion ?? "").trim();
          const mapaLat = parseNumero(item.values.mapaLat);
          const mapaLng = parseNumero(item.values.mapaLng);
          if (!nombreCancha) throw new Error("Completá el nombre de la cancha.");
          if (!/^[0-9]{8,15}$/.test(whatsappNumero)) {
            throw new Error("El WhatsApp debe tener solo números, con código de país (8 a 15 dígitos).");
          }
          if (!direccion) throw new Error("Completá la dirección.");
          if (mapaLat === null || mapaLat < -90 || mapaLat > 90) {
            throw new Error("La latitud debe ser un número entre -90 y 90.");
          }
          if (mapaLng === null || mapaLng < -180 || mapaLng > 180) {
            throw new Error("La longitud debe ser un número entre -180 y 180.");
          }
          const { error } = await actualizarDatosPublicosCancha({
            nombre_cancha: nombreCancha,
            whatsapp_numero: whatsappNumero,
            instagram_url: instagramUrl || null,
            direccion,
            mapa_lat: mapaLat,
            mapa_lng: mapaLng,
          });
          if (error) throw new Error(mapearErrorConfiguracion(error.message));
          await datosPublicos.cargar();
          return;
        }
      }
    },
    [precioBase, horarios, configCancha, tarifasDuracion, tarifasFranja, fechas, datosPublicos],
  );

  return { data, estados, guardar, reintentar };
}
