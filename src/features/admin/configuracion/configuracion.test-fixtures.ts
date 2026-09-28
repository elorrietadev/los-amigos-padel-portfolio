// Fixtures exclusivos de tests. Nunca importar desde el entrypoint del admin.
import { DIAS, type ConfigData } from "./configuracion.types";
export function configuracionFixture(): ConfigData {
  return {
    general: [
      {
        id: "base",
        titulo: "Precio base",
        tipo: "precio",
        values: { valor: "20000" },
      },
    ],
    horarios: DIAS.map((titulo, index) => ({
      id: `dia-${index}`,
      titulo,
      tipo: "horario",
      values: { cerrado: index === 6, apertura: "08:00", cierre: "01:00" },
    })),
    duraciones: [
      {
        id: "duraciones",
        titulo: "Duraciones",
        tipo: "duraciones",
        values: { minimo: "60", maximo: "180" },
      },
    ],
    tarifas: [
      {
        id: "d90",
        titulo: "Descuento de 90 min",
        tipo: "duracion",
        values: { duracion: "90", descuento: "10", activo: true },
      },
      {
        id: "d120",
        titulo: "Descuento de 120 min",
        tipo: "duracion",
        values: { duracion: "120", descuento: "5", activo: false },
      },
      {
        id: "franja",
        titulo: "Franja de lunes a viernes",
        tipo: "franja",
        values: {
          dias: DIAS.slice(0, 5),
          apertura: "08:00",
          cierre: "16:00",
          descuento: "15",
          activo: true,
        },
      },
    ],
    reservas: [
      {
        id: "anticipacion-min",
        titulo: "Anticipación mínima",
        tipo: "reserva",
        unidad: "horas",
        values: { valor: "2" },
      },
      {
        id: "anticipacion-max",
        titulo: "Anticipación máxima",
        tipo: "reserva",
        unidad: "días",
        values: { valor: "14" },
      },
      {
        id: "telefono",
        titulo: "Reservas activas por teléfono",
        tipo: "reserva",
        unidad: "reservas",
        values: { valor: "3" },
      },
      {
        id: "cancelacion",
        titulo: "Cancelación mínima",
        tipo: "reserva",
        unidad: "horas antes",
        values: { valor: "4" },
      },
    ],
    fechas: [
      {
        id: "navidad",
        titulo: "25 de diciembre",
        tipo: "fecha",
        values: { fecha: "2026-12-25", cerrado: true, activo: true },
      },
      {
        id: "nochebuena",
        titulo: "24 de diciembre",
        tipo: "fecha",
        values: {
          fecha: "2026-12-24",
          cerrado: false,
          apertura: "08:00",
          cierre: "18:00",
          tarifa: "ninguna",
          activo: true,
        },
      },
      {
        id: "fin-anio",
        titulo: "31 de diciembre",
        tipo: "fecha",
        values: {
          fecha: "2026-12-31",
          cerrado: false,
          apertura: "08:00",
          cierre: "20:00",
          tarifa: "descuento",
          descuento: "10",
          activo: true,
        },
      },
      {
        id: "precio-fijo",
        titulo: "1 de enero",
        tipo: "fecha",
        values: {
          fecha: "2027-01-01",
          cerrado: false,
          apertura: "16:00",
          cierre: "02:00",
          tarifa: "precio",
          valor: "25000",
          activo: false,
        },
      },
    ],
    publico: [
      {
        id: "datos-publicos",
        titulo: "Datos públicos",
        tipo: "publico",
        values: {
          nombreCancha: "Los amigos padel",
          whatsappNumero: "5493775550100",
          instagramUrl: "https://www.instagram.com/losamigos_padel",
          direccion: "Monte Caseros, Corrientes",
          mapaLat: "-30.242812",
          mapaLng: "-57.655903",
        },
      },
    ],
  };
}
