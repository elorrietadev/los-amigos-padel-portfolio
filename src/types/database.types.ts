export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          creado: string
          user_id: string
        }
        Insert: {
          creado?: string
          user_id: string
        }
        Update: {
          creado?: string
          user_id?: string
        }
        Relationships: []
      }
      backups_semanales: {
        Row: {
          contenido: Json
          creado: string
          id: number
          schema_version: number
        }
        Insert: {
          contenido: Json
          creado?: string
          id?: never
          schema_version?: number
        }
        Update: {
          contenido?: Json
          creado?: string
          id?: never
          schema_version?: number
        }
        Relationships: []
      }
      configuracion_auditoria: {
        Row: {
          actor: string | null
          campos_cambiados: string[]
          creado: string
          fila_pk: string
          id: number
          tabla: string
          valor_anterior: Json
          valor_nuevo: Json
        }
        Insert: {
          actor?: string | null
          campos_cambiados: string[]
          creado?: string
          fila_pk: string
          id?: never
          tabla: string
          valor_anterior: Json
          valor_nuevo: Json
        }
        Update: {
          actor?: string | null
          campos_cambiados?: string[]
          creado?: string
          fila_pk?: string
          id?: never
          tabla?: string
          valor_anterior?: Json
          valor_nuevo?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_auditoria_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      configuracion_cancha: {
        Row: {
          actualizado: string
          actualizado_por: string | null
          anticipacion_maxima_dias: number
          anticipacion_minima_minutos: number
          cancelacion_horas_minimas: number
          duracion_maxima_minutos: number
          duracion_minima_minutos: number
          id: number
          limite_reservas_activas_telefono: number
        }
        Insert: {
          actualizado?: string
          actualizado_por?: string | null
          anticipacion_maxima_dias: number
          anticipacion_minima_minutos: number
          cancelacion_horas_minimas: number
          duracion_maxima_minutos: number
          duracion_minima_minutos: number
          id?: number
          limite_reservas_activas_telefono: number
        }
        Update: {
          actualizado?: string
          actualizado_por?: string | null
          anticipacion_maxima_dias?: number
          anticipacion_minima_minutos?: number
          cancelacion_horas_minimas?: number
          duracion_maxima_minutos?: number
          duracion_minima_minutos?: number
          id?: number
          limite_reservas_activas_telefono?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_cancha_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      datos_publicos_cancha: {
        Row: {
          actualizado: string
          actualizado_por: string | null
          direccion: string
          id: number
          instagram_url: string | null
          mapa_lat: number
          mapa_lng: number
          nombre_cancha: string
          whatsapp_numero: string
        }
        Insert: {
          actualizado?: string
          actualizado_por?: string | null
          direccion: string
          id?: number
          instagram_url?: string | null
          mapa_lat: number
          mapa_lng: number
          nombre_cancha: string
          whatsapp_numero: string
        }
        Update: {
          actualizado?: string
          actualizado_por?: string | null
          direccion?: string
          id?: number
          instagram_url?: string | null
          mapa_lat?: number
          mapa_lng?: number
          nombre_cancha?: string
          whatsapp_numero?: string
        }
        Relationships: [
          {
            foreignKeyName: "datos_publicos_cancha_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      devolucion_lotes: {
        Row: {
          cantidad: number
          devolucion_id: string
          id: number
          lote_id: string | null
          venta_item_lote_id: number
        }
        Insert: {
          cantidad: number
          devolucion_id: string
          id?: never
          lote_id?: string | null
          venta_item_lote_id: number
        }
        Update: {
          cantidad?: number
          devolucion_id?: string
          id?: never
          lote_id?: string | null
          venta_item_lote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_lotes_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_lotes_venta_item_lote_id_fkey"
            columns: ["venta_item_lote_id"]
            isOneToOne: false
            referencedRelation: "venta_item_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          actor_id: string | null
          cantidad: number
          creado: string
          fecha: string | null
          id: string
          idempotency_key: string | null
          medio_reembolso: string
          motivo: string | null
          venta_item_id: string
        }
        Insert: {
          actor_id?: string | null
          cantidad: number
          creado?: string
          fecha?: string | null
          id?: string
          idempotency_key?: string | null
          medio_reembolso?: string
          motivo?: string | null
          venta_item_id: string
        }
        Update: {
          actor_id?: string | null
          cantidad?: number
          creado?: string
          fecha?: string | null
          id?: string
          idempotency_key?: string | null
          medio_reembolso?: string
          motivo?: string | null
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      excepciones_turno_fijo: {
        Row: {
          creado: string | null
          fecha: string
          id: string
          turno_fijo_id: string
        }
        Insert: {
          creado?: string | null
          fecha: string
          id?: string
          turno_fijo_id: string
        }
        Update: {
          creado?: string | null
          fecha?: string
          id?: string
          turno_fijo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "excepciones_turno_fijo_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excepciones_turno_fijo_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechas_especiales_historico: {
        Row: {
          activo: boolean
          cerrado: boolean | null
          creado_por: string | null
          fecha: string
          hora_apertura: string | null
          hora_cierre: string | null
          id: number
          nota: string | null
          tarifa_tipo: string | null
          tarifa_valor: number | null
          vigente_desde: string
        }
        Insert: {
          activo: boolean
          cerrado?: boolean | null
          creado_por?: string | null
          fecha: string
          hora_apertura?: string | null
          hora_cierre?: string | null
          id?: never
          nota?: string | null
          tarifa_tipo?: string | null
          tarifa_valor?: number | null
          vigente_desde?: string
        }
        Update: {
          activo?: boolean
          cerrado?: boolean | null
          creado_por?: string | null
          fecha?: string
          hora_apertura?: string | null
          hora_cierre?: string | null
          id?: never
          nota?: string | null
          tarifa_tipo?: string | null
          tarifa_valor?: number | null
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechas_especiales_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      horarios_semana_historico: {
        Row: {
          abierto: boolean
          creado: string
          creado_por: string | null
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          id: number
          vigente_desde_fecha: string
        }
        Insert: {
          abierto: boolean
          creado?: string
          creado_por?: string | null
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          id?: never
          vigente_desde_fecha: string
        }
        Update: {
          abierto?: boolean
          creado?: string
          creado_por?: string | null
          dia_semana?: number
          hora_apertura?: string
          hora_cierre?: string
          id?: never
          vigente_desde_fecha?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_semana_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lotes: {
        Row: {
          cantidad_inicial: number
          cantidad_restante: number
          costo_total: number
          costo_unitario: number | null
          creado: string
          id: string
          nota: string | null
          precio_venta_sugerido: number | null
          producto_id: string
        }
        Insert: {
          cantidad_inicial: number
          cantidad_restante: number
          costo_total: number
          costo_unitario?: number | null
          creado?: string
          id?: string
          nota?: string | null
          precio_venta_sugerido?: number | null
          producto_id: string
        }
        Update: {
          cantidad_inicial?: number
          cantidad_restante?: number
          costo_total?: number
          costo_unitario?: number | null
          creado?: string
          id?: string
          nota?: string | null
          precio_venta_sugerido?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      precio_base_historico: {
        Row: {
          creado_por: string | null
          id: number
          precio_hora: number
          vigente_desde: string
        }
        Insert: {
          creado_por?: string | null
          id?: never
          precio_hora: number
          vigente_desde?: string
        }
        Update: {
          creado_por?: string | null
          id?: never
          precio_hora?: number
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "precio_base_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_publica: string | null
          creado: string
          descripcion_publica: string | null
          destacado: boolean
          id: string
          imagen_path: string | null
          mostrar_en_catalogo: boolean
          nombre: string
          orden_publico: number | null
          precio_venta: number
          stock_actual: number
          stock_minimo: number
        }
        Insert: {
          activo?: boolean
          categoria_publica?: string | null
          creado?: string
          descripcion_publica?: string | null
          destacado?: boolean
          id?: string
          imagen_path?: string | null
          mostrar_en_catalogo?: boolean
          nombre: string
          orden_publico?: number | null
          precio_venta: number
          stock_actual?: number
          stock_minimo?: number
        }
        Update: {
          activo?: boolean
          categoria_publica?: string | null
          creado?: string
          descripcion_publica?: string | null
          destacado?: boolean
          id?: string
          imagen_path?: string | null
          mostrar_en_catalogo?: boolean
          nombre?: string
          orden_publico?: number | null
          precio_venta?: number
          stock_actual?: number
          stock_minimo?: number
        }
        Relationships: []
      }
      reserva_pago_movimientos: {
        Row: {
          actor_id: string | null
          creado: string
          fecha: string | null
          id: string
          importe: number
          medio: string
          motivo: string | null
          operacion_id: string
          reserva_fecha: string
          reserva_hora_fin: string
          reserva_hora_inicio: string
          reserva_id: string | null
          reserva_nombre: string
          reserva_turno_fijo: boolean
          tipo: string
        }
        Insert: {
          actor_id?: string | null
          creado?: string
          fecha?: string | null
          id?: string
          importe: number
          medio: string
          motivo?: string | null
          operacion_id: string
          reserva_fecha: string
          reserva_hora_fin: string
          reserva_hora_inicio: string
          reserva_id?: string | null
          reserva_nombre: string
          reserva_turno_fijo: boolean
          tipo: string
        }
        Update: {
          actor_id?: string | null
          creado?: string
          fecha?: string | null
          id?: string
          importe?: number
          medio?: string
          motivo?: string | null
          operacion_id?: string
          reserva_fecha?: string
          reserva_hora_fin?: string
          reserva_hora_inicio?: string
          reserva_id?: string | null
          reserva_nombre?: string
          reserva_turno_fijo?: boolean
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_pago_movimientos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          bloqueado: boolean
          confirmada: boolean
          creado: string | null
          fecha: string
          hora_apertura_vigente: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          nombre: string
          pago_efectivo: number
          pago_transferencia: number
          precio: number
          telefono: string
          telefono_normalizado: string | null
          turno_fijo_id: string | null
        }
        Insert: {
          bloqueado?: boolean
          confirmada?: boolean
          creado?: string | null
          fecha: string
          hora_apertura_vigente?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          nombre: string
          pago_efectivo?: number
          pago_transferencia?: number
          precio: number
          telefono: string
          telefono_normalizado?: string | null
          turno_fijo_id?: string | null
        }
        Update: {
          bloqueado?: boolean
          confirmada?: boolean
          creado?: string | null
          fecha?: string
          hora_apertura_vigente?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          nombre?: string
          pago_efectivo?: number
          pago_transferencia?: number
          precio?: number
          telefono?: string
          telefono_normalizado?: string | null
          turno_fijo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas_por_duracion_historico: {
        Row: {
          activo: boolean
          creado_por: string | null
          descuento_pct: number | null
          duracion_minutos: number
          id: number
          vigente_desde: string
        }
        Insert: {
          activo: boolean
          creado_por?: string | null
          descuento_pct?: number | null
          duracion_minutos: number
          id?: never
          vigente_desde?: string
        }
        Update: {
          activo?: boolean
          creado_por?: string | null
          descuento_pct?: number | null
          duracion_minutos?: number
          id?: never
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_por_duracion_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tarifas_por_franja_historico: {
        Row: {
          activo: boolean
          creado_por: string | null
          descuento_pct: number | null
          dias_semana: number[] | null
          franja_id: string
          hora_fin: string | null
          hora_inicio: string | null
          id: number
          vigente_desde: string
        }
        Insert: {
          activo: boolean
          creado_por?: string | null
          descuento_pct?: number | null
          dias_semana?: number[] | null
          franja_id: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: never
          vigente_desde?: string
        }
        Update: {
          activo?: boolean
          creado_por?: string | null
          descuento_pct?: number | null
          dias_semana?: number[] | null
          franja_id?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: never
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_por_franja_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telefonos_bloqueados: {
        Row: {
          creado: string | null
          motivo: string | null
          telefono: string
          telefono_normalizado: string | null
        }
        Insert: {
          creado?: string | null
          motivo?: string | null
          telefono: string
          telefono_normalizado?: string | null
        }
        Update: {
          creado?: string | null
          motivo?: string | null
          telefono?: string
          telefono_normalizado?: string | null
        }
        Relationships: []
      }
      titulares_turno_fijo: {
        Row: {
          creado: string
          id: string
          nombre: string
          telefono: string
          telefono_normalizado: string | null
        }
        Insert: {
          creado?: string
          id?: string
          nombre: string
          telefono: string
          telefono_normalizado?: string | null
        }
        Update: {
          creado?: string
          id?: string
          nombre?: string
          telefono?: string
          telefono_normalizado?: string | null
        }
        Relationships: []
      }
      titulares_turno_fijo_tokens: {
        Row: {
          titular_id: string
          token: string
        }
        Insert: {
          titular_id: string
          token?: string
        }
        Update: {
          titular_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "titulares_turno_fijo_tokens_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: true
            referencedRelation: "titulares_turno_fijo"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos_fijos: {
        Row: {
          creado: string | null
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          titular_id: string
        }
        Insert: {
          creado?: string | null
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          titular_id: string
        }
        Update: {
          creado?: string | null
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          titular_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_fijos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "titulares_turno_fijo"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_item_lotes: {
        Row: {
          cantidad: number
          costo_unitario: number
          creado: string
          id: number
          lote_id: string | null
          venta_item_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          creado?: string
          id?: never
          lote_id?: string | null
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          creado?: string
          id?: never
          lote_id?: string | null
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_item_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_item_lotes_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_item_lotes_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          cantidad: number
          costo_unitario_snapshot: number
          creado: string
          id: string
          precio_unitario_snapshot: number
          producto_id: string
          stock_insuficiente_forzado: boolean
          subtotal: number | null
          venta_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario_snapshot: number
          creado?: string
          id?: string
          precio_unitario_snapshot: number
          producto_id: string
          stock_insuficiente_forzado?: boolean
          subtotal?: number | null
          venta_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario_snapshot?: number
          creado?: string
          id?: string
          precio_unitario_snapshot?: number
          producto_id?: string
          stock_insuficiente_forzado?: boolean
          subtotal?: number | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          actor_id: string | null
          creado: string
          fecha: string
          id: string
          idempotency_key: string | null
          pago_efectivo: number
          pago_transferencia: number
          reserva_id: string | null
          total: number
        }
        Insert: {
          actor_id?: string | null
          creado?: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          pago_efectivo?: number
          pago_transferencia?: number
          reserva_id?: string | null
          total: number
        }
        Update: {
          actor_id?: string | null
          creado?: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          pago_efectivo?: number
          pago_transferencia?: number
          reserva_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas_publicas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      configuracion_cancha_publica: {
        Row: {
          anticipacion_maxima_dias: number | null
          anticipacion_minima_minutos: number | null
          cancelacion_horas_minimas: number | null
          duracion_maxima_minutos: number | null
          duracion_minima_minutos: number | null
          limite_reservas_activas_telefono: number | null
        }
        Insert: {
          anticipacion_maxima_dias?: number | null
          anticipacion_minima_minutos?: number | null
          cancelacion_horas_minimas?: number | null
          duracion_maxima_minutos?: number | null
          duracion_minima_minutos?: number | null
          limite_reservas_activas_telefono?: number | null
        }
        Update: {
          anticipacion_maxima_dias?: number | null
          anticipacion_minima_minutos?: number | null
          cancelacion_horas_minimas?: number | null
          duracion_maxima_minutos?: number | null
          duracion_minima_minutos?: number | null
          limite_reservas_activas_telefono?: number | null
        }
        Relationships: []
      }
      datos_publicos_cancha_publica: {
        Row: {
          direccion: string | null
          instagram_url: string | null
          mapa_lat: number | null
          mapa_lng: number | null
          nombre_cancha: string | null
          whatsapp_numero: string | null
        }
        Insert: {
          direccion?: string | null
          instagram_url?: string | null
          mapa_lat?: number | null
          mapa_lng?: number | null
          nombre_cancha?: string | null
          whatsapp_numero?: string | null
        }
        Update: {
          direccion?: string | null
          instagram_url?: string | null
          mapa_lat?: number | null
          mapa_lng?: number | null
          nombre_cancha?: string | null
          whatsapp_numero?: string | null
        }
        Relationships: []
      }
      excepciones_turno_fijo_publicas: {
        Row: {
          fecha: string | null
          turno_fijo_id: string | null
        }
        Insert: {
          fecha?: string | null
          turno_fijo_id?: string | null
        }
        Update: {
          fecha?: string | null
          turno_fijo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "excepciones_turno_fijo_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excepciones_turno_fijo_turno_fijo_id_fkey"
            columns: ["turno_fijo_id"]
            isOneToOne: false
            referencedRelation: "turnos_fijos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_semana_publica: {
        Row: {
          abierto: boolean | null
          dia_semana: number | null
          hora_apertura: string | null
          hora_cierre: string | null
        }
        Insert: {
          abierto?: boolean | null
          dia_semana?: number | null
          hora_apertura?: string | null
          hora_cierre?: string | null
        }
        Update: {
          abierto?: boolean | null
          dia_semana?: number | null
          hora_apertura?: string | null
          hora_cierre?: string | null
        }
        Relationships: []
      }
      productos_publicos: {
        Row: {
          categoria_publica: string | null
          descripcion_publica: string | null
          destacado: boolean | null
          en_stock: boolean | null
          id: string | null
          imagen_path: string | null
          nombre: string | null
          orden_publico: number | null
          precio_venta: number | null
        }
        Insert: {
          categoria_publica?: string | null
          descripcion_publica?: string | null
          destacado?: boolean | null
          en_stock?: never
          id?: string | null
          imagen_path?: string | null
          nombre?: string | null
          orden_publico?: number | null
          precio_venta?: number | null
        }
        Update: {
          categoria_publica?: string | null
          descripcion_publica?: string | null
          destacado?: boolean | null
          en_stock?: never
          id?: string | null
          imagen_path?: string | null
          nombre?: string | null
          orden_publico?: number | null
          precio_venta?: number | null
        }
        Relationships: []
      }
      reservas_publicas: {
        Row: {
          bloqueado: boolean | null
          confirmada: boolean | null
          creado: string | null
          fecha: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string | null
        }
        Insert: {
          bloqueado?: boolean | null
          confirmada?: boolean | null
          creado?: string | null
          fecha?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string | null
        }
        Update: {
          bloqueado?: boolean | null
          confirmada?: boolean | null
          creado?: string | null
          fecha?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string | null
        }
        Relationships: []
      }
      turnos_fijos_publicos: {
        Row: {
          dia_semana: number | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string | null
        }
        Insert: {
          dia_semana?: number | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string | null
        }
        Update: {
          dia_semana?: number | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string | null
        }
        Relationships: []
      }
      venta_items_detalle: {
        Row: {
          cantidad: number | null
          cantidad_devuelta: number | null
          cantidad_vigente: number | null
          costo_unitario_snapshot: number | null
          creado: string | null
          id: string | null
          precio_unitario_snapshot: number | null
          producto_id: string | null
          stock_insuficiente_forzado: boolean | null
          subtotal: number | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_eliminar_reserva: { Args: { p_reserva_id: string }; Returns: boolean }
      admin_eliminar_titular_turno_fijo: { Args: { p_titular_id: string }; Returns: number }
      admin_eliminar_turno_fijo: { Args: { p_turno_fijo_id: string }; Returns: number }
      admin_listar_fechas_especiales_vigentes: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          activo: boolean
          cerrado: boolean
          fecha: string
          hora_apertura: string
          hora_cierre: string
          id: number
          nota: string
          tarifa_tipo: string
          tarifa_valor: number
          vigente_desde: string
        }[]
      }
      admin_listar_horarios_semana: {
        Args: never
        Returns: {
          abierto: boolean
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          vigente_desde_fecha: string
        }[]
      }
      admin_listar_precio_base_vigente: {
        Args: never
        Returns: {
          id: number
          precio_hora: number
          vigente_desde: string
        }[]
      }
      admin_listar_tarifas_duracion_vigentes: {
        Args: never
        Returns: {
          activo: boolean
          descuento_pct: number
          duracion_minutos: number
          id: number
          vigente_desde: string
        }[]
      }
      admin_listar_tarifas_franja_vigentes: {
        Args: never
        Returns: {
          activo: boolean
          descuento_pct: number
          dias_semana: number[]
          franja_id: string
          hora_fin: string
          hora_inicio: string
          id: number
          vigente_desde: string
        }[]
      }
      admin_set_fecha_especial: {
        Args: {
          p_activo: boolean
          p_cerrado?: boolean
          p_fecha: string
          p_hora_apertura?: string
          p_hora_cierre?: string
          p_nota?: string
          p_tarifa_tipo?: string
          p_tarifa_valor?: number
        }
        Returns: {
          activo: boolean
          cerrado: boolean | null
          creado_por: string | null
          fecha: string
          hora_apertura: string | null
          hora_cierre: string | null
          id: number
          nota: string | null
          tarifa_tipo: string | null
          tarifa_valor: number | null
          vigente_desde: string
        }
        SetofOptions: {
          from: "*"
          to: "fechas_especiales_historico"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_horario_semana: {
        Args: {
          p_abierto: boolean
          p_dia_semana: number
          p_hora_apertura: string
          p_hora_cierre: string
          p_vigente_desde_fecha?: string
        }
        Returns: {
          abierto: boolean
          creado: string
          creado_por: string | null
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          id: number
          vigente_desde_fecha: string
        }
        SetofOptions: {
          from: "*"
          to: "horarios_semana_historico"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_precio_base: {
        Args: { p_precio_hora: number }
        Returns: {
          creado_por: string | null
          id: number
          precio_hora: number
          vigente_desde: string
        }
        SetofOptions: {
          from: "*"
          to: "precio_base_historico"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_tarifa_duracion: {
        Args: {
          p_activo: boolean
          p_descuento_pct?: number
          p_duracion_minutos: number
        }
        Returns: {
          activo: boolean
          creado_por: string | null
          descuento_pct: number | null
          duracion_minutos: number
          id: number
          vigente_desde: string
        }
        SetofOptions: {
          from: "*"
          to: "tarifas_por_duracion_historico"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_tarifa_franja: {
        Args: {
          p_activo: boolean
          p_descuento_pct?: number
          p_dias_semana: number[]
          p_franja_id: string
          p_hora_fin: string
          p_hora_inicio: string
        }
        Returns: {
          activo: boolean
          creado_por: string | null
          descuento_pct: number | null
          dias_semana: number[] | null
          franja_id: string
          hora_fin: string | null
          hora_inicio: string | null
          id: number
          vigente_desde: string
        }
        SetofOptions: {
          from: "*"
          to: "tarifas_por_franja_historico"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      baja_turno_fijo_publico: {
        Args: { p_fecha: string; p_token: string; p_turno_fijo_id: string }
        Returns: Json
      }
      calcular_precio_en_instante: {
        Args: {
          p_fecha: string
          p_hora_fin: string
          p_hora_inicio: string
          p_instante_inicio: string
        }
        Returns: number
      }
      cotizar_reserva: {
        Args: { p_fecha: string; p_hora_fin: string; p_hora_inicio: string }
        Returns: number
      }
      crear_reserva: {
        Args: {
          p_fecha: string
          p_hora_fin: string
          p_hora_inicio: string
          p_nombre: string
          p_telefono: string
        }
        Returns: {
          bloqueado: boolean
          confirmada: boolean
          creado: string | null
          fecha: string
          hora_apertura_vigente: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          nombre: string
          pago_efectivo: number
          pago_transferencia: number
          precio: number
          telefono: string
          telefono_normalizado: string | null
          turno_fijo_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_titular_turno_fijo: {
        Args: { p_horarios: Json; p_nombre: string; p_telefono: string }
        Returns: Json
      }
      fin_extendido: { Args: { fin: string; ini: string }; Returns: number }
      franja_operativa: {
        Args: { p_fecha: string }
        Returns: {
          cerrado: boolean
          hora_apertura: string
          hora_cierre: string
        }[]
      }
      generar_backup_semanal: { Args: never; Returns: undefined }
      instante_fin_real:
        | {
            Args: { p_fecha: string; p_hora_fin: string; p_hora_inicio: string }
            Returns: string
          }
        | {
            Args: {
              p_apertura: string
              p_fecha: string
              p_hora_fin: string
              p_hora_inicio: string
            }
            Returns: string
          }
      instante_inicio_real:
        | { Args: { p_fecha: string; p_hora_inicio: string }; Returns: string }
        | {
            Args: { p_apertura: string; p_fecha: string; p_hora_inicio: string }
            Returns: string
          }
      is_admin: { Args: never; Returns: boolean }
      materializacion_tomar_lock: { Args: never; Returns: undefined }
      materializar_turnos_fijos_jugados: { Args: never; Returns: number }
      materializar_turnos_fijos_jugados_core: {
        Args: { p_turno_fijo_ids?: string[] }
        Returns: number
      }
      minutos_de: { Args: { t: string }; Returns: number }
      normalize_phone: { Args: { p_telefono: string }; Returns: string }
      obtener_turnos_fijos_titular_publico: { Args: { p_token: string }; Returns: Json }
      obtener_ultimo_backup_admin: { Args: never; Returns: Json }
      precio_base_vigente: { Args: never; Returns: number }
      purgar_reservas_vencidas: { Args: never; Returns: number }
      registrar_devolucion: {
        Args: {
          p_cantidad: number
          p_idempotency_key: string
          p_medio_reembolso: string
          p_motivo: string | null
          p_venta_item_id: string
        }
        Returns: string
      }
      registrar_movimiento_pago: {
        Args: {
          p_efectivo: number
          p_esperado_efectivo: number
          p_esperado_transferencia: number
          p_motivo: string | null
          p_operacion_id: string
          p_reserva_id: string
          p_tipo: string
          p_transferencia: number
        }
        Returns: Json
      }
      registrar_venta: {
        Args: {
          p_forzar_stock_insuficiente: boolean
          p_idempotency_key: string
          p_items: Json
          p_pago_efectivo: number
          p_pago_transferencia: number
          p_reserva_id: string | null
        }
        Returns: string
      }
      reponer_stock: {
        Args: {
          p_actualizar_precio_venta?: boolean
          p_cantidad: number
          p_costo_total: number
          p_nota?: string
          p_precio_venta_simulado?: number
          p_producto_id: string
        }
        Returns: string
      }
      turno_fijo_rango_semana: {
        Args: {
          p_dia_semana: number
          p_hora_fin: string
          p_hora_inicio: string
        }
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
