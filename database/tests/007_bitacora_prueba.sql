-- Prueba de 007_bitacora.sql. Todo se deshace al final (ROLLBACK).
-- Debe producir exactamente 3 errores.
USE web_turismo;
START TRANSACTION;

SET @u = (SELECT id FROM usuarios WHERE email = 'skayalvaradorodriguez@gmail.com');

-- OK: con usuario y detalle JSON
INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle, ip)
  VALUES (@u, 'carga.crear', 'carga', 1, '{"estado_nuevo":"recibida"}', '127.0.0.1');
-- OK: evento sin usuario
INSERT INTO bitacora (accion, entidad) VALUES ('login.fallido', 'usuario');

-- ERROR 1: editar (trg_bitacora_no_update)
UPDATE bitacora SET accion = 'otra' WHERE accion = 'carga.crear';
-- ERROR 2: borrar (trg_bitacora_no_delete)
DELETE FROM bitacora WHERE accion = 'login.fallido';
-- ERROR 3: JSON invalido
INSERT INTO bitacora (accion, entidad, detalle) VALUES ('x', 'x', 'esto no es json');

SELECT accion, entidad, usuario_id IS NOT NULL AS con_usuario FROM bitacora ORDER BY id;

ROLLBACK;
SELECT COUNT(*) AS bitacora_restante FROM bitacora;