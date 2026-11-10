USE web_turismo;
START TRANSACTION;
SET @u = (SELECT id FROM usuarios ORDER BY id LIMIT 1);
INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES ('t009', 'T', 'X', @u);
SET @f = LAST_INSERT_ID();
INSERT INTO cargas (fuente_id, cargado_por) VALUES (@f, @u);
SET @c = LAST_INSERT_ID();
INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, subido_por) VALUES (@c, 'a.csv', 'z.csv', 'text/csv', 1, REPEAT('a',64), @u);
SET @a = LAST_INSERT_ID();
INSERT INTO procesamientos (carga_id, archivo_id, tipo, ejecutado_por) VALUES (@c, @a, 'validacion', @u);
SET @p = LAST_INSERT_ID();
SELECT 'OK procesamiento' AS prueba, estado FROM procesamientos WHERE id = @p;
INSERT INTO hallazgos (procesamiento_id, fila, regla, severidad, mensaje) VALUES (@p, 2, 'r', 'alerta', 'm');
SELECT 'OK hallazgo' AS prueba;
-- Deben fallar:
INSERT INTO procesamientos (carga_id, archivo_id, tipo, ejecutado_por) VALUES (@c, @a, 'otro', @u);
INSERT INTO hallazgos (procesamiento_id, regla, severidad, mensaje) VALUES (@p, 'r', 'grave', 'm');
ROLLBACK;
