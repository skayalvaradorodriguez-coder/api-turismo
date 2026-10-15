-- 008_permisos.sql : permisos minimos del usuario de la aplicacion (turismo_app)
-- Se ejecuta con un usuario administrador (root).
-- Es seguro ejecutarlo varias veces: primero quita todo y luego concede solo lo necesario.
-- Esta es la lista COMPLETA de lo que la API puede hacer: cada tabla nueva se agrega aqui.
-- Regla general: la API nunca borra filas ni crea/altera tablas.

-- ---------------------------------------------------------------
-- turismo_app@localhost
-- ---------------------------------------------------------------
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'turismo_app'@'localhost';

GRANT SELECT                 ON web_turismo.roles               TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.usuarios            TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.tokens_usuario      TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.fuentes             TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.estructuras         TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.cargas              TO 'turismo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON web_turismo.carga_metadatos     TO 'turismo_app'@'localhost';
-- Los originales no se modifican: solo se puede cambiar la marca "vigente"
GRANT SELECT, INSERT         ON web_turismo.archivos_originales TO 'turismo_app'@'localhost';
GRANT UPDATE (vigente)       ON web_turismo.archivos_originales TO 'turismo_app'@'localhost';
-- La bitacora solo se lee y se agrega
GRANT SELECT, INSERT         ON web_turismo.bitacora            TO 'turismo_app'@'localhost';

-- ---------------------------------------------------------------
-- turismo_app@127.0.0.1
-- ---------------------------------------------------------------
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'turismo_app'@'127.0.0.1';

GRANT SELECT                 ON web_turismo.roles               TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.usuarios            TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.tokens_usuario      TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.fuentes             TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.estructuras         TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.cargas              TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON web_turismo.carga_metadatos     TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT         ON web_turismo.archivos_originales TO 'turismo_app'@'127.0.0.1';
GRANT UPDATE (vigente)       ON web_turismo.archivos_originales TO 'turismo_app'@'127.0.0.1';
GRANT SELECT, INSERT         ON web_turismo.bitacora            TO 'turismo_app'@'127.0.0.1';

FLUSH PRIVILEGES;