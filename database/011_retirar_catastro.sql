-- 011_retirar_catastro.sql
-- El Catastro Turistico sale del proyecto: se elimina su tabla de registros procesados.
-- Se ejecuta con un usuario administrador (root). Se puede ejecutar mas de una vez sin problema.
-- ATENCION: borra los registros procesados del Catastro (no se pueden recuperar desde la base).
-- Los archivos originales y las cargas NO se tocan: la base impide borrarlos por diseño.

USE web_turismo;

DROP TABLE IF EXISTS catastro_establecimientos;

-- Despues de ejecutar este script, vuelve a ejecutar 008_permisos.sql para dejar los permisos al dia.
