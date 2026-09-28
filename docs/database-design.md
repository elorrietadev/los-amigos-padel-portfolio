# Diseño de datos

Explicación conceptual del modelo, sanitizada a propósito: no es un dump ni un esquema recuperable del proyecto en producción, sino una descripción de los dominios y las decisiones detrás de ellos. El detalle exacto de columnas, índices y funciones vive en la base real, fuera de este repositorio.

## Dominios principales

**Reservas.** Una reserva es una fila con fecha, hora de inicio y fin, datos del cliente y su estado (confirmada, jugada, bloqueada). Los horarios ocupados no se validan en el cliente: un *exclusion constraint* de PostgreSQL impide, a nivel de base, que dos reservas de la misma cancha se solapen — incluida la reserva concurrente desde dos pestañas a la vez.

**Turnos fijos.** Un titular puede tener uno o más horarios recurrentes por semana. Cada turno fijo "genera" una reserva real solo cuando ese día efectivamente se juega (materialización), y admite excepciones puntuales (el titular avisa que un día no va, sin dar de baja el turno completo). Dar de alta un titular con varios horarios a la vez es una operación atómica: si un horario nuevo choca con algo existente, se revierte todo el alta, titular incluido.

**Productos y ventas.** El catálogo de productos (bebidas, accesorios) tiene stock por lotes con costo unitario, lo que permite calcular margen real por venta, no solo ingreso. Una venta puede estar atada a una reserva (consumo durante el turno) o ser suelta (mostrador). Las devoluciones son parciales por ítem, con su propio motivo y medio de reembolso.

**Ledger de pagos.** El dinero no vive en columnas mutables (`pago_efectivo`, `pago_transferencia` sobre la reserva) actualizadas in place. Cada cobro, reintegro, corrección de medio de pago o devolución es un **movimiento** inmutable, con su fecha contable propia y su `idempotency key`. El saldo pendiente de una reserva, el total cobrado de una venta o el cierre de caja semanal son siempre una suma de movimientos, calculada al leer — nunca un acumulador de escritura que pueda desincronizarse. Esto es lo que hace posible reconciliar la caja contra el detalle línea por línea.

## Seguridad a nivel de fila (RLS)

Row Level Security está activo en todas las tablas con datos operativos. La regla general:

- Los datos **públicos** (horarios de la semana, catálogo visible, disponibilidad del día) se exponen a través de vistas o tablas específicas de solo lectura para el rol anónimo, con las columnas mínimas necesarias — nunca la tabla operativa completa.
- Los datos **administrativos** (montos, teléfonos de clientes, historial de pagos) requieren `is_admin()`, una función que valida la sesión contra la tabla de administradores. No hay ninguna tabla con lectura o escritura abierta al rol `anon` fuera de esas vistas públicas explícitas.
- Las funciones sensibles (crear una reserva, registrar un pago, materializar turnos fijos) son `SECURITY DEFINER`: corren con los privilegios de su dueño, no con los del que las invoca, y por eso cada una valida explícitamente lo que le corresponde — otorgar `SECURITY DEFINER` sin revocar el permiso de ejecución por defecto de `PUBLIC` habría anulado la protección.

## RPC como frontera

Casi toda escritura de negocio pasa por una función de Postgres (`crear_reserva`, `registrar_venta`, `registrar_movimiento_pago`, `registrar_devolucion`), no por un `INSERT`/`UPDATE` directo desde el cliente. Eso centraliza en un solo lugar las reglas que importan: anticipación mínima y máxima para reservar, límite de reservas activas por teléfono, plazo de cancelación de un turno fijo, motor de precios, control de stock al vender. El cliente nunca decide el precio final ni el estado resultante; los recibe de vuelta.

## Idempotencia

Las operaciones que mueven dinero (`registrar_venta`, `registrar_devolucion`, `registrar_movimiento_pago`) reciben una `idempotency key` generada por el cliente. Si una request se reintenta — por un timeout, un doble clic, o la app haciendo retry tras perder la respuesta — la función devuelve el resultado original en vez de duplicar el movimiento. Esto se decidió después de una auditoría contable que encontró justamente ese síntoma: pagos que no reconciliaban porque un reintento de red había registrado el mismo cobro dos veces.

## Concurrencia

Dos garantías cubren los casos donde dos operaciones pueden pisarse:

- **Solapamiento de horarios**: el exclusion constraint mencionado arriba es a nivel de base, así que ni una condición de carrera entre dos requests simultáneas puede crear dos reservas superpuestas.
- **Materialización de turnos fijos**: la función que "juega" las ocurrencias de la semana toma los locks en un orden fijo y explícito para evitar deadlocks cuando corre en paralelo con una cancelación o una edición del mismo turno.

## Auditoría

Los cambios a la configuración sensible (precio base, horarios operativos, tarifas por duración o franja, fechas especiales) quedan registrados en una tabla de auditoría genérica, con quién los hizo, cuándo y el valor anterior — no solo el nuevo.
