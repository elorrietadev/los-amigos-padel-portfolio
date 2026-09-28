# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Este changelog arranca en la versión publicada del portfolio; no reconstruye el historial completo del desarrollo.

## [1.0.0]

### Reservas

- Flujo público de reserva en 3 pasos (día/horario, duración, datos de contacto), con cotización de precio en tiempo real contra el motor de tarifas del servidor.
- Verificación humana con Cloudflare Turnstile y gateway de reservas (clave compartida + rate limit) antes de escribir en la base: la única vía de escritura es una función de Postgres, sin acceso directo desde el cliente.
- Agenda semanal en el panel de administración con vista de solapamientos, turnos fijos y bloqueos.

### Turnos fijos

- Alta de un titular con múltiples horarios en una sola operación atómica.
- Autogestión: el titular puede cancelar una ocurrencia puntual de su turno mediante un enlace propio, sin intervención del administrador.

### Administración

- Panel de Reservas con búsqueda, filtros y detalle de pago/productos por reserva.
- Vender: venta suelta o atada a una reserva, con pago en efectivo, transferencia o mixto.
- Caja semanal con desglose por medio de pago, pagos de reservas vs. productos y devoluciones.
- Configuración de horarios operativos, duraciones, tarifas por duración y por franja horaria, y fechas especiales (feriados, promociones).

### Pagos y contabilidad

- Ledger de movimientos de pago (cobro, reintegro, corrección) en vez de columnas mutables: el saldo de cada reserva se calcula sumando movimientos.
- Idempotencia en las operaciones que mueven dinero, para que un reintento de red nunca duplique un cobro.
- Devoluciones parciales por ítem de venta.

### Seguridad

- Row Level Security en todas las tablas operativas; el rol anónimo solo ve vistas públicas explícitas y acotadas.
- Funciones `SECURITY DEFINER` con permisos revocados explícitamente a `anon`/`authenticated` donde no corresponden.
- Exclusion constraint a nivel de base de datos contra solapamiento de horarios, independiente de cualquier validación del cliente.
- Cabeceras de seguridad y Content Security Policy en el despliegue de Cloudflare Pages.

### Testing

- 1625 tests automatizados (Vitest) sobre la lógica de negocio, los adaptadores de datos y los componentes.
