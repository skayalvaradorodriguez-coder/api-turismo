-- 003_sesiones.sql : permite cerrar todas las sesiones abiertas de un usuario (por ejemplo al cambiar su contrasena)
-- Se ejecuta con root. Es seguro ejecutarlo mas de una vez (ADD COLUMN IF NOT EXISTS es de MariaDB/XAMPP).
--
-- Las sesiones (JWT) emitidas hasta este instante dejan de valer. NULL = ninguna restriccion.

USE web_turismo;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sesiones_validas_desde DATETIME NULL AFTER ultimo_login_at;