// Tipos de la RPC crear_titular_turno_fijo (TF-R3.1). Args.p_horarios y
// Returns declaran `Json` en database.types.ts — Supabase no puede inferir
// la forma real de un parámetro/resultado jsonb — así que se tipan a mano
// acá, mismo criterio que baja.types.ts para las RPC de /baja/.

export interface HorarioAltaInput {
  dia_semana: number;
  hora_inicio: string; // "HH:MM"
  hora_fin: string;
  // Fechas "YYYY-MM-DD" que ya chocan con una reserva/bloqueo real
  // (calculadas client-side con buscarChoquesTurnoFijoConReservas, igual que
  // ya hacía el alta de 1 horario) — el servidor no recalcula choques, solo
  // inserta las que el cliente ya determinó.
  excepciones: string[];
}

export interface TurnoFijoCreado {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  excepciones: string[];
  // FINAL-F3 — turnos_fijos.creado tal como lo fijó el servidor. Opcional por
  // compatibilidad con una base que todavía no devuelve la clave.
  creado?: string;
}

export interface TitularTurnoFijoCreado {
  titular_id: string;
  nombre: string;
  telefono: string;
  turnos: TurnoFijoCreado[];
}
