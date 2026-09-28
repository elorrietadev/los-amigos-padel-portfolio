// CFG-F1 — nombre/WhatsApp/Instagram/dirección/mapa reales de la cancha
// (datos_publicos_cancha_publica), para Home e Información. Mismo criterio
// mínimo que useHorariosSemana: fetch único, sin caché ni refresco
// periódico — estos datos no cambian mientras el usuario mira la pantalla.
import { usePublicResource } from "../reservations-public/usePublicResource";
import { obtenerDatosPublicosCancha } from "../reservations-public/reservations.api";

export interface DatosPublicosCancha {
  nombreCancha: string;
  whatsappNumero: string;
  instagramUrl: string | null;
  direccion: string;
  mapaLat: number;
  mapaLng: number;
}

async function cargarDatos(): Promise<DatosPublicosCancha> {
  const { data, error } = await obtenerDatosPublicosCancha();
  if (error || !data || data.mapa_lat == null || data.mapa_lng == null) throw new Error("datos incompletos");
  return {
    nombreCancha: data.nombre_cancha ?? "",
    whatsappNumero: data.whatsapp_numero ?? "",
    instagramUrl: data.instagram_url,
    direccion: data.direccion ?? "",
    mapaLat: data.mapa_lat,
    mapaLng: data.mapa_lng,
  };
}
export function useDatosPublicosCancha() {
  const { data: datos, ...estado } = usePublicResource("datos-publicos", cargarDatos);
  return { datos, ...estado };
}
export type UseDatosPublicosCancha = ReturnType<typeof useDatosPublicosCancha>;
