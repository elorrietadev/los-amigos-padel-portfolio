// Contenido público centralizado (PUBLIC-R2). `reglas` sigue siendo texto
// fijo (mismo orden que RulesCard.tsx, componente legacy sin usar — ver
// abajo) — no hay todavía una sección de Configuración para reglas.
//
// CFG-F1 — ubicación/Instagram DEJARON de vivir acá: se movieron a
// `datos_publicos_cancha` (Supabase, administrable desde Configuración →
// Datos públicos) y Home/Información los leen vía useDatosPublicosCancha.
// LocationCard.tsx/InstagramCard.tsx (reservations-public/components/) son
// componentes legacy sin montar en ningún lado (PublicBookingPage — ver su
// comment en PublicApp.tsx) — quedan intactos, sin tocar, fuera de alcance.
export const contenidoPublico = {
  // Mismo texto/orden que RulesCard.tsx.
  reglas: [
    "Cancelá con anticipación para liberar el horario a otros jugadores",
    "Llegá 10 minutos antes del horario reservado",
    "Respetá las instalaciones y mantené la cancha limpia",
  ],
} as const;

export function construirLinkComoLlegar(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
