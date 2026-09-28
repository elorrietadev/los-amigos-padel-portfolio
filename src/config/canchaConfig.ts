// Valores de ejemplo de la cancha (el número de WhatsApp es ficticio en este
// repositorio de portfolio).
//
// Solución transitoria y deliberada: este objeto vive hardcodeado en el
// cliente, igual que el legacy. El problema de fondo (precio/horario
// centralizados, hoy duplicados a mano entre este archivo y la constante
// `v_precio_hora` de la RPC `crear_reserva`) queda pendiente para una etapa
// de backend/Supabase — no se resuelve acá.
//
// CFG-F1 — nombreCancha/whatsappNumero ya tienen respaldo real en
// `datos_publicos_cancha` (administrable desde Configuración → Datos
// públicos): Home/Información los leen de ahí (useDatosPublicosCancha), no
// de acá. Este objeto sigue siendo la fuente para el resto de los
// consumidores (BajaPage, mensajes de WhatsApp a jugadores en el admin, la
// grilla horaApertura/horaCierre) — migrarlos queda para una etapa
// siguiente, no forma parte de CFG-F1.

import type { ConfigReserva } from "../features/reservations-public/reservations.types";

export const configCancha: ConfigReserva = {
  nombreCancha: "Los amigos padel",
  precioHora: 20000,
  horaApertura: "08:00",
  horaCierre: "01:00", // cruza medianoche: abre 8am, cierra 1am del día siguiente
  whatsappNumero: "5493775550100",
};
