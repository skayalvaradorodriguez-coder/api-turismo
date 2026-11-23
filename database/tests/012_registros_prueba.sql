-- Prueba de 012: no deja datos (termina con ROLLBACK). Ejecutar con: mysql -u root --force < este_archivo
USE web_turismo;
START TRANSACTION;
SET @u = (SELECT id FROM usuarios ORDER BY id LIMIT 1);
INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES ('t012', 'T', 'X', @u);
SET @f = LAST_INSERT_ID();
INSERT INTO cargas (fuente_id, cargado_por) VALUES (@f, @u);
SET @c = LAST_INSERT_ID();
INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, subido_por) VALUES (@c, 'a.csv', 'z12.csv', 'text/csv', 1, REPEAT('b',64), @u);
SET @a = LAST_INSERT_ID();
INSERT INTO procesamientos (carga_id, archivo_id, tipo, ejecutado_por) VALUES (@c, @a, 'procesamiento', @u);
SET @p = LAST_INSERT_ID();
INSERT INTO hallazgos (procesamiento_id, fila, columna, regla, severidad, mensaje, valor_original, valor_corregido) VALUES (@p, 2, 'edad', 'cero_a_faltante', 'cambio', 'm', '0', NULL);
SELECT 'OK hallazgo tipo cambio' AS prueba;
INSERT INTO registros_procesados (procesamiento_id, carga_id, identificador, fila_origen, estructura, datos) VALUES (@p, @c, '1', 2, 'ots_turista_v1', '{"edad": null}');
SELECT 'OK registro' AS prueba, JSON_EXTRACT(datos, '$.edad') AS edad FROM registros_procesados WHERE procesamiento_id = @p;
-- Deben fallar (3 errores):
INSERT INTO registros_procesados (procesamiento_id, carga_id, identificador, fila_origen, estructura, datos) VALUES (@p, @c, '1', 3, 'ots_turista_v1', '{}');
INSERT INTO registros_procesados (procesamiento_id, carga_id, identificador, fila_origen, estructura, datos) VALUES (@p, @c, '2', 3, 'ots_turista_v1', 'no es json');
INSERT INTO hallazgos (procesamiento_id, regla, severidad, mensaje) VALUES (@p, 'r', 'grave', 'm');
ROLLBACK;
